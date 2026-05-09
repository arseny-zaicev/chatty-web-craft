# Prep Profiles for Audience Data

Internal-only system that enforces a defined "shape" on every audience batch before it can be launched. Clients never see any of this.

## 1. Database schema (migration)

New tables (all RLS: `is_workspace_manager` only):

**`audience_prep_profiles`**
- `workspace_id`, `user_id`
- `name`, `description`
- `campaign_type` ('marketing' | 'utility')
- `template_label` (logical name, e.g. "demo_booking_v2") - free text
- `required_fields` jsonb (string[]) - source columns that MUST exist & be non-empty
- `optional_fields` jsonb (string[])
- `derived_variables` jsonb - array of `{ key: "var_1", strategy: "field"|"template"|"static", source?: string, template?: string, fallback?: string }` where `template` supports `{field_name}` placeholders
- `invalid_rules` jsonb - array of `{ field, rule: "non_empty"|"min_length"|"regex"|"phone", value? }`
- `fallback_rules` jsonb - per-field fallback values
- `quick_replies` jsonb (string[]) - optional button set
- `sample_payload` jsonb - one example source row for preview

**`audience_batches`** - add columns:
- `prep_profile_id uuid` (nullable for legacy)
- `is_launch_ready boolean default false`
- `derived_variables_preview jsonb` - first 3 rendered samples

**`audience_rows`** - add column:
- `derived_payload jsonb default '{}'` - rendered var_1..var_N for that row

## 2. Library (`src/lib/prepProfiles.ts`)

- CRUD for profiles
- `applyProfile(profile, row)` → `{ derivedPayload, errors[] }`
- `renderTemplate(tpl, row, fallbacks)` - replaces `{field}` tokens, applies fallbacks
- `validateRow(profile, row)` - returns invalid/valid + reason

## 3. UI - Prep Profiles manager

New page `/ws/:slug/data/profiles` (manager-only, restricted segment):
- List profiles per workspace
- Create/Edit dialog with sections:
  - Basic (name, campaign type, template label)
  - Required & optional source fields (chip input)
  - Derived variables editor (rows with key + strategy + template/source + fallback)
  - Invalid rules + fallback rules
  - Quick replies (optional)
  - Sample payload (key/value editor) + live "Sample rendered output" panel

Add tab/link from `WorkspaceData.tsx` header.

## 4. Refactor `WorkspaceData.tsx` upload flow

Upload dialog becomes 3-step:
1. **Pick Prep Profile** (required) + upload file
2. **Mapping & Preview**: show detected phone column, mapped source fields, sample of 5 derived rows, totals (valid/invalid/duplicates), sample rendered message using profile.template_label + derived vars
3. **Confirm & Save** - only saves if `validRows > 0`; sets `is_launch_ready = true` when 100% required fields present in valid rows

Update `audienceData.ts.uploadBatch` to:
- Accept `prepProfileId`
- For each row, run `validateRow` + `applyProfile` and store `derived_payload` per row
- Compute and store `derived_variables_preview` (first 3 samples)
- Mark batch `is_launch_ready` based on validation

## 5. Launch wizard integration

In `LaunchWizard.tsx` Database tab:
- Filter `dbBatchesQ` to `is_launch_ready = true`
- For selected batch, show: Prep Profile name, template label, derived variable list with coverage % (rows where derived var resolved non-empty)
- Auto-fill variable mapping from profile's `derived_variables` keys (skip manual mapping step)
- Block "Launch" button if any required derived var has <100% coverage; show which one

## 6. Visibility / access

Already covered: `data` segment is restricted to manager-like roles. New `/data/profiles` route reuses the same guard. No client exposure anywhere.

## 7. Out of scope for this pass

- "Pull from Supabase" source - leave Upload as the only ingestion method, but design the profile layer so a future pull source can plug in
- AI-suggested derived variables

## Files

- migration: new SQL
- create: `src/lib/prepProfiles.ts`, `src/pages/workspace/WorkspacePrepProfiles.tsx`, `src/components/workspace/PrepProfileDialog.tsx`, `src/components/workspace/UploadAudienceDialog.tsx` (extracted multi-step)
- edit: `src/lib/audienceData.ts`, `src/pages/workspace/WorkspaceData.tsx`, `src/pages/workspace/LaunchWizard.tsx`, `src/pages/workspace/WorkspaceLayout.tsx` (route/restriction), `src/App.tsx` (route)

Migration runs first; after approval I'll write the code in one pass.
