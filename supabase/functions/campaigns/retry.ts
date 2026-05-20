// Retry / redistribute / rebalance for existing campaigns. Extracted verbatim
// from campaigns/index.ts (stage 1 split). No behavior change.

import { canAccessUser, json, uuidRegex } from "./_helpers.ts";
import {
  COUNTRY_TZ,
  dateAtTzToUTC,
  hhmmToMin,
  normalizePerNumberQuota,
  randomDelay,
  tzFromPhone,
} from "./time.ts";

// ===== Redistribute: re-schedule pending recipients with current quota / window =====
// Body: { campaign_ids: string[], skip_dates?: string[], extra_dates?: string[],
//         per_number_quota?: number, window_start?: "HH:MM", window_end?: "HH:MM" }
export async function redistributeCampaign(admin: any, requesterId: string, body: any) {
  const ids: string[] = Array.isArray(body.campaign_ids) ? body.campaign_ids.filter((x: any) => uuidRegex.test(x)) : [];
  if (body.campaign_id && uuidRegex.test(body.campaign_id)) ids.push(body.campaign_id);
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return json({ error: "campaign_id required" }, 400);

  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id, user_id, workspace_id, whatsapp_number_id, schedule_window_start, schedule_window_end, scheduled_dates, per_number_quota, delay_min_seconds, delay_max_seconds, recipient_country, respect_recipient_tz, first_scheduled_at, status, dispatch_mode")
    .in("id", uniq);
  if (!campaigns || campaigns.length === 0) return json({ error: "Not found" }, 404);
  for (const c of campaigns) {
    if (!(await canAccessUser(admin, requesterId, c.user_id))) return json({ error: "Forbidden" }, 403);
  }

  const skipSet = new Set<string>(Array.isArray(body.skip_dates) ? body.skip_dates.filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : []);
  const extraDates: string[] = Array.isArray(body.extra_dates) ? body.extra_dates.filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  const overrideQuota = body.per_number_quota != null
    ? normalizePerNumberQuota(body.per_number_quota)
    : null;
  const overrideWindowStart = typeof body.window_start === "string" && /^\d{2}:\d{2}$/.test(body.window_start) ? body.window_start : null;
  const overrideWindowEnd = typeof body.window_end === "string" && /^\d{2}:\d{2}$/.test(body.window_end) ? body.window_end : null;

  const todayKeyTz = (tz: string) => {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  };
  const nextDateStr = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, day || 1));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  };

  let totalUpdated = 0;
  const newFirstByCampaign: Record<string, string> = {};
  const newTodayByCampaign: Record<string, number> = {};

  for (const c of campaigns) {
    // P0.6: marketing_instant must NEVER be re-spread across the window.
    // Stamp every pending recipient as due now (or campaign start if future).
    if (String((c as any).dispatch_mode || "paced") === "marketing_instant") {
      const startAtMs = Date.now();
      const startIso = new Date(startAtMs).toISOString();
      const tzMain = c.recipient_country ? (COUNTRY_TZ[String(c.recipient_country).toUpperCase()] ?? "UTC") : "UTC";
      let todayKeyMain: string;
      try { todayKeyMain = new Intl.DateTimeFormat("en-CA", { timeZone: tzMain }).format(new Date(startAtMs)); }
      catch { todayKeyMain = startIso.slice(0, 10); }

      // Load all pending recipient ids (paged) and bulk-stamp scheduled_at=now.
      const ids: string[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await admin
          .from("campaign_recipients")
          .select("id")
          .eq("campaign_id", c.id)
          .eq("status", "scheduled")
          .is("sent_at", null)
          .range(from, from + PAGE - 1);
        if (error) return json({ error: error.message }, 500);
        const rows = data ?? [];
        ids.push(...rows.map((r: any) => r.id));
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      if (ids.length === 0) continue;
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { error } = await admin
          .from("campaign_recipients")
          .update({ scheduled_at: startIso })
          .in("id", chunk);
        if (error) return json({ error: error.message }, 500);
      }
      totalUpdated += ids.length;
      newFirstByCampaign[c.id] = startIso;
      newTodayByCampaign[c.id] = ids.length;
      await admin.from("campaigns").update({
        first_scheduled_at: startIso,
        scheduled_start_at: startIso,
        today_recipients_count: ids.length,
        scheduled_dates: [todayKeyMain],
      }).eq("id", c.id);
      continue;
    }

    const quota = overrideQuota ?? normalizePerNumberQuota(c.per_number_quota);
    const winStart = overrideWindowStart ?? String(c.schedule_window_start || "09:00:00").slice(0, 5);
    const winEnd = overrideWindowEnd ?? String(c.schedule_window_end || "18:00:00").slice(0, 5);
    // P0.4 (2026-05-20): honor delay_min_seconds VERBATIM. Previously this
    // forced `max(60, ...)`, which silently re-paced 0-delay / blast / 30s
    // campaigns to 60s gaps on every redistribute — the same field had a
    // different meaning at launch (0 allowed) vs here (>=60 forced).
    const minDelay = Math.max(0, Number(c.delay_min_seconds ?? 30));
    const wsMin = hhmmToMin(winStart);
    const wsMax = hhmmToMin(winEnd);
    const windowSeconds = Math.max(60, (wsMax - wsMin) * 60);
    // minDelay=0 (blast) means no per-message floor, so the window doesn't
    // bound capacity — only the operator-provided quota does.
    const windowFitCap = minDelay > 0
      ? Math.max(1, Math.floor(windowSeconds / minDelay))
      : Number.MAX_SAFE_INTEGER;
    const effectiveQuota = Math.max(1, Math.min(quota, windowFitCap));
    const recipientTz = c.recipient_country ? (COUNTRY_TZ[String(c.recipient_country).toUpperCase()] ?? "UTC") : "UTC";
    const todayKeyMain = todayKeyTz(recipientTz);

    // Load all PENDING recipients for this campaign (status=scheduled, no sent_at)
    const pending: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await admin
        .from("campaign_recipients")
        .select("id, contact_phone, scheduled_at")
        .eq("campaign_id", c.id)
        .eq("status", "scheduled")
        .is("sent_at", null)
        .order("scheduled_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return json({ error: error.message }, 500);
      const rows = data ?? [];
      pending.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    if (pending.length === 0) continue;

    // Group by tz
    const respectTz = c.respect_recipient_tz !== false;
    const perTz = new Map<string, any[]>();
    for (const r of pending) {
      const tz = respectTz ? tzFromPhone(r.contact_phone) : recipientTz;
      if (!perTz.has(tz)) perTz.set(tz, []);
      perTz.get(tz)!.push(r);
    }

    // Build base date list. Honor existing scheduled_dates (minus skipped, plus extra),
    // ensure today is included if status is running/scheduled.
    const baseDates = (() => {
      const set = new Set<string>([
        ...(Array.isArray(c.scheduled_dates) ? c.scheduled_dates as string[] : []),
        ...extraDates,
      ]);
      const out = [...set].filter((d) => d >= todayKeyMain && !skipSet.has(d)).sort();
      if (out.length === 0) out.push(todayKeyMain);
      return out;
    })();

    const newScheduledAt = new Map<string, string>();
    let firstIso: string | null = null;
    let todayCount = 0;

    for (const [tz, list] of perTz) {
      const dates = [...baseDates];
      const need = Math.ceil(list.length / effectiveQuota);
      while (dates.length < need) dates.push(nextDateStr(dates[dates.length - 1]));

      let cursor = 0;
      for (const date of dates) {
        if (cursor >= list.length) break;
        const slice = list.slice(cursor, cursor + effectiveQuota);
        cursor += slice.length;
        if (slice.length === 0) continue;

        const startUtc = dateAtTzToUTC(date, winStart, tz).getTime();
        const endUtc = dateAtTzToUTC(date, winEnd, tz).getTime();
        const earliest = Math.max(startUtc, Date.now() + 5_000);
        const span = Math.max(60_000, endUtc - earliest);
        const step = Math.max(minDelay * 1000, span / Math.max(1, slice.length));

        for (let i = 0; i < slice.length; i++) {
          const jitter = (Math.random() - 0.5) * step * 0.4;
          const ts = Math.min(endUtc, Math.max(earliest, earliest + i * step + jitter));
          const iso = new Date(ts).toISOString();
          newScheduledAt.set(slice[i].id, iso);
          if (!firstIso || iso < firstIso) firstIso = iso;
          // Count today (recipient main tz)
          let key: string;
          try { key = new Intl.DateTimeFormat("en-CA", { timeZone: recipientTz }).format(new Date(ts)); }
          catch { key = iso.slice(0, 10); }
          if (key === todayKeyMain) todayCount++;
        }
      }
    }

    // Bulk update — chunk by 500 ids using upsert via individual updates
    const entries = [...newScheduledAt.entries()];
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500);
      // Use update one-by-one in parallel for simplicity (modest sizes)
      await Promise.all(chunk.map(([id, iso]) =>
        admin.from("campaign_recipients").update({ scheduled_at: iso }).eq("id", id)
      ));
    }
    totalUpdated += entries.length;
    if (firstIso) newFirstByCampaign[c.id] = firstIso;
    newTodayByCampaign[c.id] = todayCount;

    // Patch campaign metadata
    const patch: any = {
      per_number_quota: effectiveQuota,
      schedule_window_start: winStart + ":00",
      schedule_window_end: winEnd + ":00",
      scheduled_dates: baseDates,
      today_recipients_count: todayCount,
    };
    if (firstIso) {
      patch.first_scheduled_at = firstIso;
      patch.scheduled_start_at = firstIso;
    }
    await admin.from("campaigns").update(patch).eq("id", c.id);
  }

  return json({ ok: true, updated: totalUpdated, campaigns: uniq.length, first_scheduled_at: newFirstByCampaign, today_recipients_count: newTodayByCampaign });
}

// ===== Retry failed recipients with the campaign's own pacing rules =====
// Body: { campaign_id }. Resets all `failed` recipients to `scheduled`,
// rebuilds scheduled_at per (whatsapp_number_id) honoring delay_min_seconds /
// delay_max_seconds and the schedule window. Re-opens the campaign.
//
// This exists so re-queuing failures never has to be done with hand-written
// SQL again (Nov 2025: ad-hoc retry blasted at 10x intended pace).
export async function retryFailedRecipients(admin: any, requesterId: string, body: any) {
  const campaignId = String(body.campaign_id || "");
  if (!uuidRegex.test(campaignId)) return json({ error: "campaign_id required" }, 400);

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, workspace_id, status, delay_min_seconds, delay_max_seconds, schedule_window_start, schedule_window_end, recipient_country, respect_recipient_tz")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return json({ error: "Not found" }, 404);
  if (!(await canAccessUser(admin, requesterId, campaign.user_id))) return json({ error: "Forbidden" }, 403);

  // P0.4 (2026-05-20): honor delay_min_seconds VERBATIM. Previously this
  // forced `max(60, ...)`, so a 0-delay/blast campaign's retried failures
  // were silently re-paced to 60s gaps — different contract than launch.
  const minDelay = Math.max(0, Number(campaign.delay_min_seconds ?? 30));
  const maxDelay = Math.max(minDelay, Number(campaign.delay_max_seconds ?? Math.max(minDelay, 90)));
  const winStart = String(campaign.schedule_window_start || "09:00:00").slice(0, 5);
  const winEnd = String(campaign.schedule_window_end || "18:00:00").slice(0, 5);
  const respectTz = campaign.respect_recipient_tz !== false;
  const recipientTz = campaign.recipient_country
    ? (COUNTRY_TZ[String(campaign.recipient_country).toUpperCase()] ?? "UTC")
    : "UTC";

  const failed: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("campaign_recipients")
      .select("id, contact_phone, whatsapp_number_id")
      .eq("campaign_id", campaignId)
      .eq("status", "failed")
      .range(from, from + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    const rows = data ?? [];
    failed.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  if (failed.length === 0) return json({ ok: true, retried: 0 });

  const byNumber = new Map<string, any[]>();
  for (const r of failed) {
    const k = r.whatsapp_number_id || "__none__";
    if (!byNumber.has(k)) byNumber.set(k, []);
    byNumber.get(k)!.push(r);
  }

  const todayKeyTz = (tz: string) => {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  };
  const nextDateStr = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, day || 1));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  };

  const updates: Array<{ id: string; iso: string }> = [];
  for (const list of byNumber.values()) {
    const tz = respectTz && list[0]?.contact_phone ? tzFromPhone(list[0].contact_phone) : recipientTz;
    let date = todayKeyTz(tz);
    let cursor = Math.max(Date.now() + 5_000, dateAtTzToUTC(date, winStart, tz).getTime());
    let endOfDay = dateAtTzToUTC(date, winEnd, tz).getTime();
    if (cursor >= endOfDay) {
      date = nextDateStr(date);
      cursor = dateAtTzToUTC(date, winStart, tz).getTime();
      endOfDay = dateAtTzToUTC(date, winEnd, tz).getTime();
    }
    for (const r of list) {
      if (cursor >= endOfDay) {
        date = nextDateStr(date);
        cursor = dateAtTzToUTC(date, winStart, tz).getTime();
        endOfDay = dateAtTzToUTC(date, winEnd, tz).getTime();
      }
      updates.push({ id: r.id, iso: new Date(cursor).toISOString() });
      cursor += randomDelay(minDelay, maxDelay) * 1000;
    }
  }

  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    await Promise.all(chunk.map((u) =>
      admin.from("campaign_recipients").update({
        status: "scheduled",
        scheduled_at: u.iso,
        error_message: null,
        provider_message_id: null,
      }).eq("id", u.id)
    ));
  }

  const firstIso = updates.length > 0 ? updates[0].iso : new Date().toISOString();
  const initialStatus = new Date(firstIso).getTime() <= Date.now() + 120_000 ? "running" : "scheduled";
  await admin.from("campaigns").update({
    status: initialStatus,
    failed_count: 0,
    first_scheduled_at: firstIso,
    scheduled_start_at: firstIso,
  }).eq("id", campaignId);

  return json({ ok: true, retried: updates.length, first_scheduled_at: firstIso, status: initialStatus });
}
