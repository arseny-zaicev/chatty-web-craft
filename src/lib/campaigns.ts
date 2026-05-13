// Single source of truth for sibling-campaign grouping.
// Sibling campaigns launched across multiple WhatsApp numbers share a base name
// in the form "<base> :: <numberLabel>". Clients should see them merged into
// a single launch row.

export const SIBLING_SEP = " :: ";

export const splitBase = (full: string): { base: string; numberLabel: string | null } => {
  const idx = full.indexOf(SIBLING_SEP);
  if (idx === -1) return { base: full, numberLabel: null };
  return {
    base: full.slice(0, idx).trim(),
    numberLabel: full.slice(idx + SIBLING_SEP.length).trim() || null,
  };
};

/** Convenience when only the base name is needed. */
export const baseName = (full: string | null | undefined): string => splitBase(full ?? "").base;

// Pick the "most active" status across siblings.
export const statusRank: Record<string, number> = {
  running: 6, scheduled: 5, paused: 4, failed: 3, completed: 2, draft: 1, cancelled: 0,
};

/** Statuses that should be EXCLUDED from sibling totals when at least one
 * non-dead sibling exists. A group whose siblings are *all* dead still
 * renders (history fallback) so that cancelled-only launches stay visible. */
const DEAD_STATUSES = new Set(["cancelled", "failed"]);

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  total_recipients: number | null;
  sent_count: number | null;
  failed_count: number | null;
  created_at: string;
  whatsapp_number_id: string | null;
  template_id: string | null;
  today_recipients_count?: number | null;
  first_scheduled_at?: string | null;
  recipient_country?: string | null;
  scheduled_dates?: string[] | null;
  scheduled_start_at?: string | null;
};

export type CampaignGroup = {
  key: string;
  displayName: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  today: number;
  firstScheduledAt: string | null;
  recipientCountry: string | null;
  scheduledDates: string[];
  created_at: string;
  template_id: string | null;
  whatsapp_number_ids: string[];
  campaigns: CampaignRow[];
};

export const groupCampaigns = (rows: CampaignRow[]): CampaignGroup[] => {
  // First, partition by base name.
  const byBase = new Map<string, CampaignRow[]>();
  for (const c of rows) {
    const { base } = splitBase(c.name);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(c);
  }

  const groups: CampaignGroup[] = [];
  for (const [base, siblings] of byBase) {
    const live = siblings.filter((c) => !DEAD_STATUSES.has(c.status));
    // History fallback: only-dead groups still render so cancelled launches stay visible.
    const effective = live.length > 0 ? live : siblings;

    const g: CampaignGroup = {
      key: base,
      displayName: base,
      status: effective[0].status,
      total: 0,
      sent: 0,
      failed: 0,
      today: 0,
      firstScheduledAt: null,
      recipientCountry: null,
      scheduledDates: [],
      created_at: effective[0].created_at,
      template_id: effective[0].template_id,
      whatsapp_number_ids: [],
      campaigns: [],
    };

    for (const c of effective) {
      g.total += c.total_recipients ?? 0;
      g.sent += c.sent_count ?? 0;
      g.failed += c.failed_count ?? 0;
      g.today += c.today_recipients_count ?? 0;
      if (c.first_scheduled_at) {
        if (!g.firstScheduledAt || c.first_scheduled_at < g.firstScheduledAt) g.firstScheduledAt = c.first_scheduled_at;
      }
      if (!g.recipientCountry && c.recipient_country) g.recipientCountry = c.recipient_country;
      for (const d of c.scheduled_dates ?? []) if (!g.scheduledDates.includes(d)) g.scheduledDates.push(d);
      if ((statusRank[c.status] ?? 0) > (statusRank[g.status] ?? 0)) g.status = c.status;
      if (c.created_at < g.created_at) g.created_at = c.created_at;
      if (c.whatsapp_number_id && !g.whatsapp_number_ids.includes(c.whatsapp_number_id)) {
        g.whatsapp_number_ids.push(c.whatsapp_number_id);
      }
      g.campaigns.push(c);
    }
    g.scheduledDates.sort();
    groups.push(g);
  }
  return groups.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
};
