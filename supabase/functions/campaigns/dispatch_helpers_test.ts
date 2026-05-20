import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeSnapshotSignature,
  decidePerNumberFloorSec,
  decideLaunchAllowed,
  decideCanDispatch,
  decideBackoffSec,
} from "./dispatch_helpers.ts";

const NOW = Date.parse("2026-05-15T12:00:00Z");
const FUTURE = new Date(NOW + 10 * 60_000).toISOString();
const PAST = new Date(NOW - 10 * 60_000).toISOString();

const baseSnap = {
  numberIds: ["n2", "n1"],
  templateIds: ["t1"],
  audienceCount: 1000,
  windowStart: "09:00",
  windowEnd: "18:00",
  perNumberQuota: 200,
  maxInflightPerNumber: 5,
  maxInflightPerCampaign: 50,
};

Deno.test("snapshot signature is deterministic and order-independent", async () => {
  const a = await computeSnapshotSignature(baseSnap);
  const b = await computeSnapshotSignature({ ...baseSnap, numberIds: ["n1", "n2"] });
  assertEquals(a, b);
});

Deno.test("snapshot signature changes when sender pool changes", async () => {
  const a = await computeSnapshotSignature(baseSnap);
  const b = await computeSnapshotSignature({ ...baseSnap, numberIds: ["n1", "n2", "n3"] });
  assertNotEquals(a, b);
});

Deno.test("snapshot signature changes when caps change", async () => {
  const a = await computeSnapshotSignature(baseSnap);
  const b = await computeSnapshotSignature({ ...baseSnap, maxInflightPerNumber: 10 });
  assertNotEquals(a, b);
});

Deno.test("marketing_instant has no artificial pacing floor", () => {
  assertEquals(decidePerNumberFloorSec("marketing_instant", false), 0);
  assertEquals(decidePerNumberFloorSec("marketing_instant", true), 0);
});

Deno.test("paced mode keeps existing floors (utility 90s, marketing 1s)", () => {
  assertEquals(decidePerNumberFloorSec("paced", false), 1);
  assertEquals(decidePerNumberFloorSec("paced", true), 90);
});

Deno.test("launch blocked when snapshot is missing", () => {
  const d = decideLaunchAllowed({
    mode: "marketing_instant", killSwitchAt: null,
    preparedAt: null, preparedExpiresAt: null, preparedSignature: null,
    requestedSignature: "sha256:x", instantGlobalEnabled: true, now: NOW,
  });
  assertEquals(d, { ok: false, code: "must_prepare" });
});

Deno.test("launch blocked when snapshot expired (stale)", () => {
  const d = decideLaunchAllowed({
    mode: "marketing_instant", killSwitchAt: null,
    preparedAt: PAST, preparedExpiresAt: PAST, preparedSignature: "sha256:a",
    requestedSignature: "sha256:a", instantGlobalEnabled: true, now: NOW,
  });
  assertEquals(d, { ok: false, code: "stale_snapshot" });
});

Deno.test("launch blocked when signature differs (sender pool changed after prepare)", () => {
  const d = decideLaunchAllowed({
    mode: "marketing_instant", killSwitchAt: null,
    preparedAt: PAST, preparedExpiresAt: FUTURE, preparedSignature: "sha256:a",
    requestedSignature: "sha256:b", instantGlobalEnabled: true, now: NOW,
  });
  assertEquals(d, { ok: false, code: "signature_mismatch" });
});

Deno.test("launch blocked by campaign kill switch", () => {
  const d = decideLaunchAllowed({
    mode: "marketing_instant", killSwitchAt: PAST,
    preparedAt: PAST, preparedExpiresAt: FUTURE, preparedSignature: "sha256:a",
    requestedSignature: "sha256:a", instantGlobalEnabled: true, now: NOW,
  });
  assertEquals(d, { ok: false, code: "kill_switch_on" });
});

Deno.test("launch blocked when global instant mode is disabled", () => {
  const d = decideLaunchAllowed({
    mode: "marketing_instant", killSwitchAt: null,
    preparedAt: PAST, preparedExpiresAt: FUTURE, preparedSignature: "sha256:a",
    requestedSignature: "sha256:a", instantGlobalEnabled: false, now: NOW,
  });
  assertEquals(d, { ok: false, code: "instant_mode_disabled" });
});

Deno.test("paced launch ignores global instant kill switch", () => {
  const d = decideLaunchAllowed({
    mode: "paced", killSwitchAt: null,
    preparedAt: PAST, preparedExpiresAt: FUTURE, preparedSignature: "sha256:a",
    requestedSignature: "sha256:a", instantGlobalEnabled: false, now: NOW,
  });
  assertEquals(d, { ok: true });
});

Deno.test("launch allowed when fresh + signature matches + no kill switch", () => {
  const d = decideLaunchAllowed({
    mode: "marketing_instant", killSwitchAt: null,
    preparedAt: PAST, preparedExpiresAt: FUTURE, preparedSignature: "sha256:a",
    requestedSignature: "sha256:a", instantGlobalEnabled: true, now: NOW,
  });
  assertEquals(d, { ok: true });
});

const baseDisp = {
  mode: "marketing_instant" as const,
  pausedAt: null, backoffUntil: null,
  dailySent: 0, dailyCap: 200,
  inflight: 0, maxInflight: 5,
  campaignInflight: 0, campaignMaxInflight: 50,
  inWindow: true, killSwitchAt: null, instantGlobalEnabled: true, now: NOW,
};

Deno.test("instant mode dispatches with no pacing when caps + window are fine", () => {
  assertEquals(decideCanDispatch(baseDisp), { ok: true });
});

Deno.test("local-window enforcement still works in instant mode", () => {
  const d = decideCanDispatch({ ...baseDisp, inWindow: false });
  assertEquals(d, { ok: false, reason: "outside_window" });
});

Deno.test("daily cap still blocks in instant mode", () => {
  const d = decideCanDispatch({ ...baseDisp, dailySent: 200, dailyCap: 200 });
  assertEquals(d, { ok: false, reason: "daily_cap_reached" });
});

Deno.test("per-number inflight cap blocks", () => {
  const d = decideCanDispatch({ ...baseDisp, inflight: 5, maxInflight: 5 });
  assertEquals(d, { ok: false, reason: "inflight_cap_number" });
});

Deno.test("per-campaign inflight cap blocks", () => {
  const d = decideCanDispatch({ ...baseDisp, campaignInflight: 50, campaignMaxInflight: 50 });
  assertEquals(d, { ok: false, reason: "inflight_cap_campaign" });
});

Deno.test("provider backoff blocks until expiry, then unblocks", () => {
  const blocked = decideCanDispatch({ ...baseDisp, backoffUntil: FUTURE });
  assertEquals(blocked, { ok: false, reason: "in_provider_backoff" });
  const released = decideCanDispatch({ ...baseDisp, backoffUntil: PAST });
  assertEquals(released, { ok: true });
});

Deno.test("sender-level kill switch (paused_at) surfaces 'sender_paused'", () => {
  const d = decideCanDispatch({ ...baseDisp, pausedAt: PAST });
  assertEquals(d, { ok: false, reason: "sender_paused" });
});

Deno.test("campaign kill switch surfaces 'killed'", () => {
  const d = decideCanDispatch({ ...baseDisp, killSwitchAt: PAST });
  assertEquals(d, { ok: false, reason: "killed" });
});

Deno.test("global instant kill switch surfaces 'instant_globally_disabled' for instant mode only", () => {
  const instant = decideCanDispatch({ ...baseDisp, instantGlobalEnabled: false });
  assertEquals(instant, { ok: false, reason: "instant_globally_disabled" });
  const paced = decideCanDispatch({ ...baseDisp, mode: "paced", instantGlobalEnabled: false });
  assertEquals(paced, { ok: true });
});

Deno.test("paced mode unchanged: same gating, just different floor", () => {
  const ok = decideCanDispatch({ ...baseDisp, mode: "paced" });
  assertEquals(ok, { ok: true });
  const off = decideCanDispatch({ ...baseDisp, mode: "paced", inWindow: false });
  assertEquals(off, { ok: false, reason: "outside_window" });
});

Deno.test("backoff: 429 with Retry-After uses provided value (capped at 1h)", () => {
  assertEquals(decideBackoffSec(429, 30, 0), 30);
  assertEquals(decideBackoffSec(429, 99999, 0), 3600);
});

Deno.test("backoff: 5xx uses exponential when no Retry-After", () => {
  assertEquals(decideBackoffSec(503, null, 0), 1);
  assertEquals(decideBackoffSec(503, null, 3), 8);
  assertEquals(decideBackoffSec(503, null, 20), 3600); // capped
});

Deno.test("backoff: 2xx and 4xx (non-429) do NOT trigger backoff", () => {
  assertEquals(decideBackoffSec(200, null, 0), null);
  assertEquals(decideBackoffSec(400, 30, 0), null);
  assertEquals(decideBackoffSec(404, null, 5), null);
});
