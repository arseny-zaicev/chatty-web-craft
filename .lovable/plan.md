# Operational reliability fixes — campaign prep, variables, pipelines, visibility (v2)

## 1. Issue classification

| # | Issue | Class |
|---|------|------|
| 1 | App/number identifier hidden in template selection (only display_name) | UX gap |
| 2 | Utility upload only supports one variable-loading mode | Missing capability |
| 3 | Same static values reused across all batches of a preset | Missing capability |
| 4 | Static variables not recognized after upload | Bug |
| 5 | Launch blocks valid static-variable campaigns | Bug |
| 6 | Prep prompt targets Lovable Cloud (`xglfamaa…`) instead of personal Supabase (`pdoddfoy…`) | Config/environment mismatch |
| 7 | Snapshot/QA blocks scheduling several hours ahead | Bug |
| 8 | Pipeline stages: only rename works, no reorder/delete/color | Missing capability |
| 9 | Clients cannot manage their own quick replies (route is manager-gated) | Bug (permission) |
| 10 | Full sender number hidden in inbox / CRM | UX gap |
| 11 | Sender / template-variant readiness not obvious in launch routing | UX gap |

## 2. Implementation order

**P0** — #6 prep prompt target → #4 + #5 + #7 static recognition + snapshot validity → #3 per-batch static → #2 dual upload modes → #1 + #11 sender identifier visibility.
**P1** — #9 client quick-replies access → #8 pipeline stage management → #10 full sender number in inbox/CRM.

## 3. Required product/data changes

### A. Prep prompt target (issue 6)
`src/lib/prepPresets.ts` — remove `VITE_SUPABASE_URL` from INSERT TARGET; hard-code personal Supabase project ref `pdoddfoyrutakwemejpe` as the ingest URL; add an explicit "then call the `import-audience-from-personal` edge function on Lovable Cloud to pull the rows" step. No `xglfamaa` ref in the prompt.

### B. Variable modes (issue 2)
`SmartUploadDialog.tsx` — Tabs at top: **Manual variables** (current AI flow) / **From prepared batch** (new). The prepared-batch tab lists batches with `__static_values__` in `notes` and pre-fills static map without an AI call. Static values are editable per `var_N` in both tabs.

### C. Per-batch static values (issue 3) — no bleed-over
- Each new batch persists its own `__static_values__` JSON inside `audience_batches.notes`. Already supported; SmartUpload now always writes from the operator-supplied map (not from AI guess shared across batches).
- `WorkspaceData` lists each batch with a chip showing its own static map (tooltip with values). Verifies independence visually.
- `LaunchWizard` reads `expectedStaticValues` strictly from the **currently selected `dbBatch.notes`** (already does — verify no shared singleton/cache key collision between batches; query key must include `dbBatchId`).

### D. Static variable recognition + launch unblocking (issues 4 + 5)
`LaunchWizard.tsx`:
- When `audienceSource === "database"` and `derived_payload[var_N]` is present and equal across the sampled rows AND matches `expectedStaticValues[var_N]`, auto-seed `mapping[v] = "__static:<value>"` so the variable is recognised as resolved.
- Remove "Launch blocked" path for `sameForEveryoneVars` — they become amber warnings only.
- `staticQaIssues` only blocks launch when **every** sampled row mismatches (true preset bug); otherwise downgrade to warning.

### E. Snapshot validity model (issue 7) — explicit, not just "warnings"
Replace the "must re-prepare every launch" behaviour with a **snapshot fingerprint**:

1. When the operator opens Launch with a database batch, capture a `prepSnapshot` object the moment the QA passes:
   - `batch_id`
   - `batch_updated_at` (from `audience_batches.updated_at`)
   - `template_logical_key` + `template_version_hash` (concat of `template.id|status|body` for every selected number's variant)
   - `sender_set_hash` (sorted list of selected `whatsapp_number_id`s + their `is_active`)
   - `static_values_hash` (md5 of expected static map)
   - `captured_at`
2. Store it client-side keyed by `(campaign-draft-key)` while the wizard is open.
3. On Launch (immediate or scheduled), recompute the same fingerprint and compare:
   - **All hashes match → snapshot is valid, launch proceeds with no re-prepare regardless of how many hours have passed.**
   - **Any hash differs → show a precise diff** ("Template variant for +971… changed status: approved → paused", "Batch updated 12 min ago: 320 → 318 unused rows", "Sender set changed") and require operator to re-confirm; re-prepare is only forced if `static_values_hash` or `batch_updated_at` changed in a way that invalidates the per-row sample.
4. Server-side safety (already in place) stays: reservations are stale-released by `release_stale_reservations`, capacity is recalculated at launch, dispatcher re-validates each recipient.

Result: prep at 10:00, schedule for 18:00, launch fires without a forced re-prepare unless the batch, template, or senders actually changed in between.

### F. Template/sender visibility (issues 1 + 11) — full identifier, not a suffix
`src/lib/crmData.ts` — add:
```ts
senderFullLabel(n) = "+<E.164 phone> · <display_name> · app:<provider_app_id> · fleet:<label>"
```
Every field rendered in full (no truncation, no last-6 trick); the only fallback is omitting a field that is null. A small "copy" affordance per identifier so operators can paste it into Gupshup.

`TemplatesView.tsx` — replace the current footer `display_name ?? +phone` with a three-line block:
- `+<phone>` (monospace, full)
- `display_name` (when present)
- `app:<provider_app_id>` + `fleet:<label>` (when present)
Plus the per-template status pill stays.

`LaunchWizard.tsx` sender picker + resolution panel — use the same full identifier, and next to each show the chosen logical template's variant status for THAT sender (`Approved` / `Pending` / `Missing` / `Paused`).

### G. Client quick replies (issue 9) — route AND write-scope
`WorkspaceLayout.tsx` — remove `"library"` from `managerOnly`. Then validate end-to-end:

- **Route access**: `client` and `member` roles can navigate to `/ws/:slug/library` and see the page (verified after the gate removal).
- **Read scope**: `WorkspaceLibrary` already separates `workspace` (shared) and `personal` snippets. Verify the query returns both for non-managers (RLS check on `saved_replies`).
- **Write scope** (must be enforced in BOTH UI and DB):
  - non-manager can create / edit / delete their **own personal** snippets;
  - non-manager **cannot** create or edit `workspace`-scope (shared/global) snippets — the scope toggle in the editor is disabled for them (already partly in place via `canManageWorkspace`), and the save mutation forces `scope = "personal"` when the user is not a manager (already present at line 102 of `WorkspaceLibrary.tsx`, double-check it covers updates too, not just inserts);
  - RLS on `saved_replies`: confirm policy allows `auth.uid() = user_id` for write on personal rows and restricts workspace-scope writes to managers/owner (read existing policy; if missing, document as known gap — no schema migration done in this change).
- Add a one-time test: log in as a `member` user, open library, create a personal snippet (must succeed), attempt to edit a workspace snippet (UI must hide edit/delete; if a curl bypass attempt is made the DB policy must reject — verify by reading current RLS).

### H. Pipeline stage management (issue 8)
`PipelineConfigSheet.tsx` — new "Stages" section: drag-reorder writing `pipeline_stages.position`, inline color picker (8 presets), rename, delete with confirm (blocked if stage holds deals; offer "move deals to <other stage>"). No schema change.

### I. Full sender number in inbox/CRM (issue 10)
Replace `friendlySenderLabel` usages in CRM header and inbox list with `senderFullLabel` (always shows `+<full E.164>` even when a `display_name` exists). `friendlySenderLabel` is kept for outbound system text where the phone would be noise.

## 4. Acceptance criteria (concrete)

1. **Sender / template identifier (full, not truncated)** — every template card and every launch sender row shows: full E.164 phone, display_name (if any), full `provider_app_id`, fleet `label` (if any), all selectable/copyable. No `…` truncation on app_id or phone.
2. **Two upload modes** — Smart upload dialog has a Tabs control; "From prepared batch" lists prior batches and pre-fills static values with zero AI calls.
3. **Independent static values per batch — no bleed-over** *(explicit acceptance test)*:
   - Create Batch A from preset `marketing_static_3` with `var_2 = "AAA"`, `var_3 = "AAA-long"`.
   - Create Batch B from the SAME preset with `var_2 = "BBB"`, `var_3 = "BBB-long"`.
   - Open Launch wizard, pick Batch A → preview shows AAA values; switch to Batch B without leaving the page → preview shows BBB values.
   - Re-pick Batch A → AAA values reappear (no cache contamination).
   - Inspect both `audience_batches.notes` rows: each contains its own `__static_values__` JSON, independent.
4. **Static recognised + launch enabled** — DB batch with static vars in `derived_payload`: wizard shows each `{var_N}` slot as "same for everyone" with the actual value, no amber "unmapped", Launch button is enabled.
5. **Prep prompt** — generated Codex prompt contains `project: pdoddfoyrutakwemejpe` and the `import-audience-from-personal` step; contains no `xglfamaa` reference.
6. **Snapshot validity — explicit fingerprint model**:
   - Prepare a batch at T, schedule a campaign for T+5h.
   - **Path A (nothing changed)**: at T+5h launch fires automatically, no re-prepare prompt, no "Re-prepare the batch" toast.
   - **Path B (template paused at T+2h)**: at T+5h the operator sees a precise diff card listing the changed template/sender, and Launch is blocked until they re-confirm or pick another sender. Re-prepare is NOT forced.
   - **Path C (batch was re-imported with new static values at T+2h)**: re-prepare IS required because `static_values_hash` changed; the diff card states that explicitly.
7. **Stage management** — in Pipeline Config you can drag-reorder, change color, delete (with deal-protection), and rename stages; all changes persist.
8. **Client quick replies — route + write permissions** *(explicit acceptance test)*:
   - Sign in as a `client`/`member` user → `/ws/:slug/library` opens (no redirect).
   - Create a personal snippet → success.
   - Edit / delete that personal snippet → success.
   - Open a workspace (shared) snippet → edit/delete buttons are hidden; scope toggle is locked to "personal" in the editor.
   - Backend RLS verified: a direct API attempt by a non-manager to update a workspace-scope row is rejected by policy (or, if not enforced today, recorded as a known gap to fix in a follow-up migration; documented in the change notes).
9. **Full sender number in CRM/inbox** — header and conversation list always show `+<full E.164>`, even when `display_name` is set.
10. **Launch sender readiness** — sender picker shows per-number template-variant status for the chosen logical template; "Missing"/"Paused" senders are visually distinct.

## 5. Files to change

- `src/lib/prepPresets.ts`
- `src/components/workspace/SmartUploadDialog.tsx`
- `src/pages/workspace/WorkspaceData.tsx` (per-batch static chip)
- `src/pages/workspace/LaunchWizard.tsx` (static recognition, snapshot fingerprint, full sender identifier)
- `src/lib/crmData.ts` (`senderFullLabel`)
- `src/components/workspace/TemplatesView.tsx`
- `src/components/workspace/PipelineConfigSheet.tsx`
- `src/pages/workspace/WorkspaceLayout.tsx` (library role gate)
- `src/components/workspace/WorkspaceLibrary.tsx` (verify write-scope on updates, not only inserts)
- `src/pages/CRM.tsx` + inbox header components (full sender number)

No schema migrations, no edge-function changes. All UI / wizard-logic / config.

## 6. Out of scope

- No new tables or edge functions.
- No layout redesign.
- No dispatcher/template-group logic changes (already shipped).
- No changes to the personal Supabase project — only the prompt that points Codex at it.

After approval I implement in the order above and return: files changed, per-issue result, config-vs-code split, manual test checklist (matching the acceptance criteria), and any remaining limitations (notably the RLS check outcome for #8).