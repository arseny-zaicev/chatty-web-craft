# Fitpreneur 2-pipeline setup — mirror Launch wizard UX + first-name normalization

## What you actually said

1. *"Сделай как в Launch — одно поле, где выбираю либо группу либо одиночный шаблон, и сразу видно к какому аккаунту шаблон."*
2. *"Нормализуй имя — брать только первое нормальное имя, без рандомных букв и мусора."* (screenshot: `Jessi` cursive, `halil aslan` gothic, `St`, `lukas`, `memo`, `No Gi Judo & Sambo`, etc.)

That's it. Nothing else changes.

---

## Root cause of confusion (verified in DB)

Fitpreneur has 3 senders, 3 logical templates each, all named differently per sender:

```
PramodElemOrgNum2  →  fe_daily        fe_reactivation   8hrs_followup
Yasim              →  dail_leads_fe   rea_fe            8hrsfe
Yasin              →  daily_fe        reactiv_fe        followup8hrs
template_groups for this workspace: 0
```

PipelineConfigSheet currently shows two separate dropdowns ("Single template" vs "Template group") side by side, with a flat list of template names and no sender attribution. Operator can't tell what belongs where, and the groups dropdown is empty because no groups were ever created for this workspace.

LaunchWizard already solved this exact problem with `groupLogicalTemplates(templates, templateGroups)` → one unified "logical template" dropdown that lists groups + singles together, with a group icon, variant count, and a `Manage groups` button next to it. The plan is to port that pattern into PipelineConfigSheet.

---

## Plan

### 1. Mirror the Launch wizard template UX in `PipelineConfigSheet.tsx`

Replace the current two-column "Single template / Template group" block (both first-touch and follow-up) with the same component pattern used in `LaunchWizard.tsx`:

- One **"Logical template"** dropdown that lists:
  - all template groups (with a `<Layers />` icon and `(N variants · group)` suffix)
  - all single approved templates not covered by a group, each rendered as `template_name — SenderDisplayName` so it's instantly obvious which account owns it
- A **`Manage groups`** button next to it, opening the existing `TemplateGroupsDialog` (already imported from `LaunchWizard.tsx`, just needs to be mounted in this component too).
- A small per-sender readiness strip below the dropdown (reuse the existing `SenderVariantMatrix` already in this file) showing ✓/⨯ for each selected sender against the chosen logical template — so before clicking Save you see "all 3 senders have a variant" or "Yasin is missing".
- When a group is chosen, persist `first_touch_template_group_id`; when a single template is chosen, persist `first_touch_template_id`. Same for follow-up. (Schema already supports both, mutation logic already in place — only the UI changes.)

Wiring details:
- Reuse `groupLogicalTemplates`, `Template`, and the existing `templateGroups` query that's already in `PipelineConfigSheet.tsx`.
- Extend the `templates` query to also fetch `whatsapp_number_id`, then join client-side against `numbers` to render `name — senderLabel` for singles.
- No backend changes. No schema changes.

### 2. First-name normalization at import time

Add a shared helper `supabase/functions/_shared/name.ts` with one function:

```
normalizeFirstName(raw: string | null): {
  value: string | null,      // clean first name, Title-Case
  raw: string | null,        // original cell as received
  outcome: "ok" | "empty" | "unusable"
}
```

Rules (deterministic, no AI):

- Unicode-normalise with NFKD → strip combining marks → re-compose → maps cursive/script/gothic/fullwidth letters back to plain ASCII-ish (so `𝓙𝓮𝓼𝓼𝓲` → `Jessi`, `𝔥𝔞𝔩𝔦𝔩` → `halil`).
- Strip emoji and zero-width characters.
- Trim, collapse whitespace, take the **first token** only (so `Kevin Bo Grundmann` → `Kevin`, `No Gi Judo & Sambo` → `No` → rejected by next rule).
- Reject as `unusable` if any of:
  - length < 2 after cleanup (`St`, single letters, `E.`)
  - contains digits
  - is in a small banned list of obvious non-names (`gmbh`, `ug`, `kg`, `team`, `info`, `admin`, `test`, `no`, `kein`, `xxx`, common business words). List lives in the same file so it's easy to extend.
  - whole token is lowercase **and** length ≤ 4 (catches `memo`, `lukas` is borderline → keep, see next rule)
- Title-case the result (`lukas` → `Lukas`, `philipe` → `Philipe`).
- Always preserve the original in `payload._first_name_raw` for audit.

Wire it into both:
- `supabase/functions/google-sheets-sync/index.ts` — replace the current `String(nameRawCell).slice(0, 200)` block.
- `supabase/functions/lead-intake/index.ts` — same.

Behaviour on `unusable`:
- The lead is **still imported** (we don't want to lose a phone number), but `name` is stored as `NULL` and `payload._first_name_outcome = "unusable"`.
- `lead-dispatch` already falls back to a neutral greeting when the WhatsApp template variable for first name is empty, so the first message just won't address the person by name instead of saying "Hi memo" or "Hi 𝓙𝓮𝓼𝓼𝓲".
- Import counters returned by both functions get a new bucket: `name_unusable: N` alongside the existing `normalized / invalid / ambiguous / duplicate / test_lead` counts. Surface in `WorkspaceData.tsx` next to the other counts.

### 3. (Tiny) Make the "Auto-send first message" toggle copy literal

One-line label change in `PipelineConfigSheet.tsx`:
`Auto first-touch` → `Auto-send first message when a lead is imported`.

No behaviour change — the readiness checklist already blocks the toggle until everything is ready.

---

## Files that will actually change

- `supabase/functions/_shared/name.ts` — **NEW**, ~60 LOC.
- `supabase/functions/google-sheets-sync/index.ts` — use the helper, add `name_unusable` counter.
- `supabase/functions/lead-intake/index.ts` — use the helper, add `name_unusable` counter.
- `src/components/workspace/PipelineConfigSheet.tsx` — swap the template block for the Launch-wizard-style logical-template dropdown + Manage groups button + mount `TemplateGroupsDialog`; tiny label tweak.
- `src/pages/workspace/WorkspaceData.tsx` — add the `Name unusable: N` count alongside existing counters.

No SQL migration. No changes to dispatch/follow-up/Slack/phone-normalisation runtime.

---

## Out of scope

- No new admin pages, no redesign, no wizard changes.
- No "auto-create groups for me" magic — operator clicks `Manage groups` once, sets them up, never thinks about it again per pipeline.
- No name-normalisation backfill of existing rows. Only applies to new imports going forward. (If you want a one-off backfill SQL after testing, say so and I'll write it separately.)

---

## What to manually test after I ship this

1. Open Warm Leads pipeline for Fitpreneur → confirm the new single "Logical template" dropdown shows groups + singles, with `— senderLabel` suffix on singles.
2. Click `Manage groups`, create `Daily leads` covering `fe_daily / dail_leads_fe / daily_fe`. Confirm it appears in the dropdown immediately with `(3 variants · group)`.
3. Repeat for `Reactivation` and `8h follow-up`.
4. Pick `Daily leads` as first-touch group, all 3 senders selected → sender readiness strip shows ✓✓✓.
5. Toggle "Auto-send first message when a lead is imported" → save.
6. Add a row to the Warm Sheet with name `𝓙𝓮𝓼𝓼𝓲` → confirm imported as `Jessi`. Add `memo` → confirm imported with `name = NULL` and `_first_name_raw = "memo"`. Add `Kevin Bo Grundmann` → confirm imported as `Kevin`.
7. Confirm round-robin: 3 new leads → 3 different senders dispatched.
8. Repeat the template-group step for the Reactivation pipeline with the `Reactivation` group.