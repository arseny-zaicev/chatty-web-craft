## Goal

Stop the noise (verification / onboarding / generic emails) and only ping Slack for **real status changes**. Route billing/recharge to a separate finance channel. Make every Slack message look premium-minimal: one line headline + 2-3 fields, no excerpt wall.

## What gets through (allowlist, not keyword soup)

Every incoming Gupshup email is matched against an explicit subject pattern set. **Anything that doesn't match → logged as `info` and dropped (no Slack).**

| Pattern (case-insensitive on subject) | Category | Severity | Channel |
|---|---|---|---|
| `Phone number and Display name approved` | `number_approved` | info → **send** | OPS_NUMBERS |
| `Display name approved` (without "Rejected") | `display_name_approved` | info → **send** | OPS_NUMBERS |
| `Display name Rejected` | `display_name_rejected` | warning | OPS_NUMBERS |
| `Update in your WABA status` + body contains `restrict` / `flagged` / `messaging limit` | `waba_restricted` | critical | OPS_NUMBERS |
| `Update in your WABA status` + body contains `ban` / `disable` / `terminat` | `waba_blocked` | critical | OPS_NUMBERS |
| `Update in your WABA status` + body contains `quality` (low/medium/high) | `quality_changed` | warning | OPS_NUMBERS |
| `Update in your WABA status` (other) | `waba_status_other` | warning | OPS_NUMBERS |
| `Tier upgrade` / `messaging limit` upgrade | `tier_upgraded` | info → **send** | OPS_NUMBERS |
| `Template … Approved` | `template_approved` | info → **send** | OPS_NUMBERS |
| `Template … Rejected` / `Paused` / `Disabled` | `template_rejected` | warning | OPS_NUMBERS |
| `Recharge successful` / `Payment received` / `Invoice` / `Low balance` | `billing` | info / warning | **OPS_FINANCE** |
| `Email … verification`, `Email Verified`, `Welcome`, `Getting started`, `Onboarding`, `OTP`, `password`, `Webinar`, `Newsletter` | — | **dropped** | — |

Anything not matched and not in the dropped list → stored in `gupshup_mail_log` with `category='other'`, `severity='info'`, no Slack post. We can review later.

After 30 days post-approval the spec mentions "warmup" — out of scope for this batch (no automation triggered), but we'll store `received_at` so a future job can compute the 30-day mark.

## Routing

- New secret/env: `SLACK_OPS_FINANCE_CHANNEL_ID` (need from you).
- `billing` category → finance channel only.
- All other status events → `SLACK_OPS_NUMBERS_CHANNEL_ID` + workspace channel (if matched).

## Slack message redesign — premium minimal

One header line. Two-field row. No giant excerpt unless severity = critical.

```text
🟢  ISKRA · NitishUS01     Number approved
+14155551234 · WABA 1234567890

🔴  ISKRA · NitishUS01     WABA restricted
+14155551234 · Quality: medium → low

🟠  Unmatched              Display name rejected
"NitishShowtime2Num1" · open in Gmail
```

Block layout:
- `header` (plain text, ~50 chars max).
- One `section` with mrkdwn: `*+phone* · *<contextual second field>*` (template name, quality, WABA id, or display name).
- `context` row: `tag · time · Open in Gmail · Open number` (linked text, no big buttons).
- For `critical` only: small `section` with 1-line excerpt.

Contextual second field per category:
- `number_approved` / `display_name_approved`: `Approved`
- `display_name_rejected`: `Display name: <name>`
- `waba_restricted` / `waba_blocked`: `Reason: <short extracted phrase>`
- `quality_changed`: `Quality: <new>`
- `template_*`: `Template: <name>`
- `tier_upgraded`: `Tier: <new>`
- `billing`: `Amount: <if parsed> · <type>`

## Code changes

1. **`supabase/functions/gupshup-mail-poll/index.ts`**
   - Replace `classify()` with a strict allowlist returning `{ category, severity, action: "send"|"drop"|"log_only" }` plus extracted secondary field (quality, template, reason snippet).
   - Add a `DROP_PATTERNS` regex (verification, onboarding, OTP, newsletter…) checked first.
   - Extend `parsed` jsonb with `secondary_field` and `channel` ('numbers' | 'finance').
   - When enqueuing `slack_event_queue`, include `routing: 'finance'|'numbers'` in payload.

2. **DB migration**
   - Extend `gupshup_mail_category` enum with: `number_approved`, `display_name_approved`, `display_name_rejected`, `waba_restricted`, `waba_blocked`, `quality_changed`, `tier_upgraded`, `waba_status_other`. Keep old values for back-compat.

3. **`supabase/functions/_shared/slackBlocks.ts`**
   - Rewrite `buildGupshupMailAlertBlocks` for the minimal layout above.
   - New `catLabels` covering the new categories.
   - Move "Open in Gmail" / "Open numbers" into a single `context` line as links, drop the actions block.

4. **`supabase/functions/slack-dispatch/index.ts`**
   - Read `SLACK_OPS_FINANCE_CHANNEL_ID`.
   - For `gupshup_mail_alert`: route by `payload.routing` (`finance` → finance channel; else numbers channel + workspace channel).

5. **Backfill**
   - Optional one-shot: re-classify last 7 days of `gupshup_mail_log` to update categories. **Skipped** unless you want it (would re-fire Slack noise).

## Out of scope (call out, do later)

- 30-day post-approval warmup automation (separate task; needs warmup engine).
- Auto-pausing campaigns when a number gets `waba_restricted` (separate workflow).
- Pulling structured fields from Gupshup HTML (we extract by regex from text — good enough; HTML parser later if needed).

## Question before I build

I need the **Slack channel ID for `SLACK_OPS_FINANCE_CHANNEL_ID`** (Recharge / billing alerts). Two options:
- **(a)** Use the existing `SLACK_OPS_NUMBERS_CHANNEL_ID` for billing too (no new secret).
- **(b)** Give me a channel ID (e.g. `C0XXXXXXX`) and I'll add the secret.
