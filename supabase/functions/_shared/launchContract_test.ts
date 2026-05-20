import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveLaunchContract } from "./launchContract.ts";

// Stub Supabase client: returns canned data via .from().select().in().maybeSingle().
function stubAdmin(opts: { numbers: any[]; templates: any[]; backoff?: any[]; sentToday?: Record<string, number>; flag?: any }) {
  return {
    from(table: string) {
      const api: any = {
        _filters: {} as Record<string, any>,
        select(_cols: string, _opts?: any) {
          return api;
        },
        in(_col: string, _vals: string[]) {
          if (table === "whatsapp_numbers") return Promise.resolve({ data: opts.numbers });
          if (table === "message_templates") return Promise.resolve({ data: opts.templates });
          if (table === "provider_backoff") return Promise.resolve({ data: opts.backoff ?? [] });
          return Promise.resolve({ data: [] });
        },
        eq(col: string, val: any) {
          api._filters[col] = val;
          return api;
        },
        gte(_col: string, _val: any) {
          return api;
        },
        maybeSingle() {
          if (table === "system_flags") return Promise.resolve({ data: opts.flag ?? null });
          return Promise.resolve({ data: null });
        },
        then(resolve: any) {
          if (table === "campaign_recipients") {
            const nid = api._filters["whatsapp_number_id"];
            return Promise.resolve({ count: (opts.sentToday ?? {})[nid] ?? 0 }).then(resolve);
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

Deno.test("resolver: prepare & launch agree on capacity for same inputs (instant)", async () => {
  const admin = stubAdmin({ numbers: numbersFixture, templates: templatesFixture });
  const input = {
    numbers: [
      { number_id: "n1", template_id: "t1" },
      { number_id: "n2", template_id: "t1" },
    ],
    audienceCount: 500,
    perNumberQuota: 200,
    windowStart: "09:00",
    windowEnd: "18:00",
    scheduledDates: [],
    dispatchMode: "marketing_instant" as const,
    minDelaySeconds: 0,
    maxInflightPerNumber: 5,
    maxInflightPerCampaign: 50,
    respectRecipientTz: true,
  };
  const a = await resolveLaunchContract(admin as any, input);
  const b = await resolveLaunchContract(admin as any, input);
  assertEquals(a.signature, b.signature);
  assertEquals(a.allocatedCapacity, 400);            // 2 × 200 × 1 day
  assertEquals(a.truncatedCount, 100);
  assertEquals(a.audienceAllocated, 400);
  // Even allocation between two equally-capped numbers.
  assertEquals(a.allocByNumber["n1"], 200);
  assertEquals(a.allocByNumber["n2"], 200);
});

Deno.test("resolver: window-fit cap clamps per-number capacity in paced mode", async () => {
  const admin = stubAdmin({ numbers: numbersFixture, templates: templatesFixture });
  const r = await resolveLaunchContract(admin as any, {
    numbers: [{ number_id: "n1", template_id: "t1" }],
    audienceCount: 1000,
    perNumberQuota: 1000,
    windowStart: "09:00",
    windowEnd: "09:30",                  // 1800s window
    scheduledDates: [],
    dispatchMode: "paced",
    minDelaySeconds: 60,                 // -> windowFitCap = 30
    maxInflightPerNumber: 5,
    maxInflightPerCampaign: 50,
    respectRecipientTz: true,
  });
  assertEquals(r.windowFitCapPerNumber, 30);
  assertEquals(r.perNumberCaps["n1"], 30);
  assertEquals(r.allocatedCapacity, 30);
});

Deno.test("resolver: signature changes when scheduled days change", async () => {
  const admin = stubAdmin({ numbers: numbersFixture, templates: templatesFixture });
  const base = {
    numbers: [{ number_id: "n1", template_id: "t1" }],
    audienceCount: 100,
    perNumberQuota: 200,
    windowStart: "09:00",
    windowEnd: "18:00",
    scheduledDates: [] as string[],
    dispatchMode: "paced" as const,
    minDelaySeconds: 30,
    maxInflightPerNumber: 5,
    maxInflightPerCampaign: 50,
    respectRecipientTz: true,
  };
  const a = await resolveLaunchContract(admin as any, base);
  const b = await resolveLaunchContract(admin as any, { ...base, scheduledDates: ["2026-05-21", "2026-05-22"] });
  assert(a.signature !== b.signature);
  assertEquals(b.daysCount, 2);
});

Deno.test("resolver: instant kill switch becomes a blocker", async () => {
  const admin = stubAdmin({ numbers: numbersFixture, templates: templatesFixture, flag: { value: false } });
  const r = await resolveLaunchContract(admin as any, {
    numbers: [{ number_id: "n1", template_id: "t1" }],
    audienceCount: 10,
    perNumberQuota: 200,
    windowStart: "09:00",
    windowEnd: "18:00",
    scheduledDates: [],
    dispatchMode: "marketing_instant",
    minDelaySeconds: 0,
    maxInflightPerNumber: 5,
    maxInflightPerCampaign: 50,
    respectRecipientTz: true,
  }, { includeKillSwitch: true });
  assert(r.killSwitchEngaged);
  assert(r.blockers.some((b) => b.includes("kill switch")));
});
