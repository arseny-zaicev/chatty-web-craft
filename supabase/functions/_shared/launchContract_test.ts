import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveLaunchContract } from "./launchContract.ts";

// Stub Supabase client. Supports the minimal fluent chain used by the resolver
// across whatsapp_numbers, message_templates, provider_backoff, system_flags,
// workspace_send_guards, and per-number / per-workspace campaign_recipients
// counts (including .not() for workspace pending/sent queries).
function stubAdmin(opts: {
  numbers: any[];
  templates: any[];
  backoff?: any[];
  sentToday?: Record<string, number>;
  flag?: any;
  workspaceGuard?: any;
  workspaceSentToday?: number;
  workspacePending?: number;
}) {
  return {
    from(table: string) {
      const api: any = {
        _filters: {} as Record<string, any>,
        _notNullCol: null as string | null,
        select(_cols: string, _opts?: any) {
          return api;
        },
        in(col: string, _vals: string[]) {
          if (table === "whatsapp_numbers") return Promise.resolve({ data: opts.numbers });
          if (table === "message_templates") return Promise.resolve({ data: opts.templates });
          if (table === "provider_backoff") return Promise.resolve({ data: opts.backoff ?? [] });
          if (table === "campaign_recipients" && col === "status") {
            // workspace_pending query: .eq(workspace_id).in(status, [...])
            return Promise.resolve({ count: opts.workspacePending ?? 0 });
          }
          return Promise.resolve({ data: [] });
        },
        eq(col: string, val: any) {
          api._filters[col] = val;
          return api;
        },
        gte(_col: string, _val: any) {
          return api;
        },
        not(col: string, _op: string, _val: any) {
          api._notNullCol = col;
          return api;
        },
        maybeSingle() {
          if (table === "system_flags") return Promise.resolve({ data: opts.flag ?? null });
          if (table === "workspace_send_guards") return Promise.resolve({ data: opts.workspaceGuard ?? null });
          return Promise.resolve({ data: null });
        },
        then(resolve: any) {
          if (table === "campaign_recipients") {
            const nid = api._filters["whatsapp_number_id"];
            if (nid) {
              return Promise.resolve({ count: (opts.sentToday ?? {})[nid] ?? 0 }).then(resolve);
            }
            // workspace_sent_today: .eq(workspace_id).gte(sent_at).not(sent_at, is, null)
            if (api._filters["workspace_id"] && api._notNullCol === "sent_at") {
              return Promise.resolve({ count: opts.workspaceSentToday ?? 0 }).then(resolve);
            }
            return Promise.resolve({ count: 0 }).then(resolve);
          }
          return Promise.resolve({ data: [] }).then(resolve);
        },
      };
      return api;
    },
  };
}

const numbersFixture = [
  { id: "n1", user_id: "u", workspace_id: "w", phone_number: "+1", status: "active", webhook_connected: true, paused_at: null, paused_reason: null, daily_send_limit: 0, provider_api_key: "k" },
  { id: "n2", user_id: "u", workspace_id: "w", phone_number: "+2", status: "active", webhook_connected: true, paused_at: null, paused_reason: null, daily_send_limit: 0, provider_api_key: "k" },
];
const templatesFixture = [{ id: "t1", name: "tpl", status: "approved" }];

const baseInput = {
  numbers: [
    { number_id: "n1", template_id: "t1" },
    { number_id: "n2", template_id: "t1" },
  ],
  audienceCount: 500,
  perNumberQuota: 200,
  windowStart: "09:00",
  windowEnd: "18:00",
  scheduledDates: [] as string[],
  dispatchMode: "marketing_instant" as const,
  minDelaySeconds: 0,
  maxInflightPerNumber: 5,
  maxInflightPerCampaign: 50,
  respectRecipientTz: true,
};

Deno.test("resolver: prepare & launch agree on capacity for same inputs (instant)", async () => {
  const admin = stubAdmin({ numbers: numbersFixture, templates: templatesFixture });
  const a = await resolveLaunchContract(admin as any, baseInput);
  const b = await resolveLaunchContract(admin as any, baseInput);
  assertEquals(a.signature, b.signature);
  assertEquals(a.allocatedCapacity, 400);
  assertEquals(a.truncatedCount, 100);
  assertEquals(a.audienceAllocated, 400);
  assertEquals(a.allocByNumber["n1"], 200);
  assertEquals(a.allocByNumber["n2"], 200);
  // Slice 2: no workspaceId => no guard snapshot.
  assertEquals(a.workspaceGuard, null);
});

Deno.test("resolver: window-fit cap clamps per-number capacity in paced mode", async () => {
  const admin = stubAdmin({ numbers: numbersFixture, templates: templatesFixture });
  const r = await resolveLaunchContract(admin as any, {
    ...baseInput,
    numbers: [{ number_id: "n1", template_id: "t1" }],
    audienceCount: 1000,
    perNumberQuota: 1000,
    windowEnd: "09:30",
    dispatchMode: "paced",
    minDelaySeconds: 60,
  });
  assertEquals(r.windowFitCapPerNumber, 30);
  assertEquals(r.perNumberCaps["n1"], 30);
  assertEquals(r.allocatedCapacity, 30);
});

Deno.test("resolver: signature changes when scheduled days change", async () => {
  const admin = stubAdmin({ numbers: numbersFixture, templates: templatesFixture });
  const base = { ...baseInput, numbers: [{ number_id: "n1", template_id: "t1" }], audienceCount: 100, dispatchMode: "paced" as const, minDelaySeconds: 30 };
  const a = await resolveLaunchContract(admin as any, base);
  const b = await resolveLaunchContract(admin as any, { ...base, scheduledDates: ["2026-05-21", "2026-05-22"] });
  assert(a.signature !== b.signature);
  assertEquals(b.daysCount, 2);
});

Deno.test("resolver: instant kill switch becomes a blocker", async () => {
  const admin = stubAdmin({ numbers: numbersFixture, templates: templatesFixture, flag: { value: false } });
  const r = await resolveLaunchContract(admin as any, {
    ...baseInput,
    numbers: [{ number_id: "n1", template_id: "t1" }],
    audienceCount: 10,
  }, { includeKillSwitch: true });
  assert(r.killSwitchEngaged);
  assert(r.structuredBlockers.some((b) => b.code === "instant_mode_disabled"));
});

// ----- Slice 2 -----

Deno.test("resolver: workspace guard force_paced blocks instant launch", async () => {
  const admin = stubAdmin({
    numbers: numbersFixture,
    templates: templatesFixture,
    workspaceGuard: { hard_daily_cap: null, hard_per_campaign_cap: null, force_paced: true, enabled: true },
  });
  const r = await resolveLaunchContract(admin as any, { ...baseInput, workspaceId: "w" });
  assertEquals(r.workspaceGuard?.force_paced, true);
  assert(r.structuredBlockers.some((b) => b.code === "workspace_guard_force_paced"));
  assertEquals(r.ok, false);
});

Deno.test("resolver: workspace guard per-campaign cap blocks oversize campaign", async () => {
  const admin = stubAdmin({
    numbers: numbersFixture,
    templates: templatesFixture,
    workspaceGuard: { hard_daily_cap: null, hard_per_campaign_cap: 100, force_paced: false, enabled: true },
  });
  const r = await resolveLaunchContract(admin as any, { ...baseInput, audienceCount: 250, workspaceId: "w" });
  assert(r.structuredBlockers.some((b) => b.code === "workspace_guard_per_campaign_cap"));
});

Deno.test("resolver: workspace guard hard daily cap counts sent + pending + new", async () => {
  const admin = stubAdmin({
    numbers: numbersFixture,
    templates: templatesFixture,
    workspaceGuard: { hard_daily_cap: 500, hard_per_campaign_cap: null, force_paced: false, enabled: true },
    workspaceSentToday: 200,
    workspacePending: 150,
  });
  const r = await resolveLaunchContract(admin as any, { ...baseInput, audienceCount: 400, workspaceId: "w" });
  assertEquals(r.workspaceGuard?.workspace_sent_today, 200);
  assertEquals(r.workspaceGuard?.workspace_pending, 150);
  // planned = 200 + 150 + audienceAllocated(min(400,400)=400) = 750 > 500
  assert(r.structuredBlockers.some((b) => b.code === "workspace_guard_daily_cap"));
});

Deno.test("resolver: wouldDeferToNextDay flips when same-day overflows today's quota", async () => {
  // Single number with quota 200 but already sent 150 today => capacityToday = 50.
  // Allocating 200 recipients to a single day will exceed today's headroom.
  const admin = stubAdmin({
    numbers: [numbersFixture[0]],
    templates: templatesFixture,
    sentToday: { n1: 150 },
  });
  const r = await resolveLaunchContract(admin as any, {
    ...baseInput,
    numbers: [{ number_id: "n1", template_id: "t1" }],
    audienceCount: 200,
  });
  assertEquals(r.capacityToday, 50);
  assertEquals(r.audienceAllocated, 200);
  assertEquals(r.wouldDeferToNextDay, true);
});

Deno.test("resolver: prepare and launch produce identical contract for same workspace input", async () => {
  const admin = stubAdmin({
    numbers: numbersFixture,
    templates: templatesFixture,
    workspaceGuard: { hard_daily_cap: 10000, hard_per_campaign_cap: 5000, force_paced: false, enabled: true },
    workspaceSentToday: 100,
    workspacePending: 50,
  });
  const input = { ...baseInput, audienceCount: 300, workspaceId: "w" };
  const prepare = await resolveLaunchContract(admin as any, input, { includeKillSwitch: true });
  const launch = await resolveLaunchContract(admin as any, input, { includeKillSwitch: true });
  assertEquals(prepare.signature, launch.signature);
  assertEquals(prepare.workspaceGuard, launch.workspaceGuard);
  assertEquals(prepare.wouldDeferToNextDay, launch.wouldDeferToNextDay);
  assertEquals(prepare.structuredBlockers.map((b) => b.code), launch.structuredBlockers.map((b) => b.code));
});
