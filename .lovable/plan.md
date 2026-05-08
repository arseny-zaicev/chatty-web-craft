## Launch + Campaigns Workflow Cleanup

Refactor the internal Launch wizard and Campaigns monitoring screens so they match real operator logic, with proper performance, scrolling, naming, audience handling, variable mapping, logical templates, and Utility/Marketing defaults.

### 1. Separation of concerns

- **Launch** (`/ws/:slug/launch`) — only campaign creation. No history list, no monitoring. Wizard-style with sticky review sidebar and a scrollable form column.
- **Campaigns** (`/ws/:slug/campaigns`) — only history + monitoring. Lightweight list, detail loads on demand. Already mostly correct; ensure no launch UI remains.

### 2. Campaign type as Step 1

Two presets, picked first. Selection drives all defaults downstream:

| | Marketing Blast | Utility Paced |
|--|--|--|
| Delay min/max | 0 / 0 | 30 / 90 |
| Auto-routing | off (single number default) | on (distribute across selected numbers) |
| Per-number quota | high (1000) | 200 |
| Template filter | category = marketing | category = utility |
| Mode label | "Blast" | "Utility" |

Operator can still override fields manually, but the type sets sensible defaults instantly.

### 3. Auto campaign naming

Default name auto-generated in a tracking-friendly format:
`YYYY-MM-DD | GEO | ICP | TEMPLATE/INTENT | CTA | MODE | N`

- `GEO` derived from selected number's country code (E.164 prefix → ISO2), fallback `--`
- `ICP` editable free-text (default `Audience`)
- `TEMPLATE/INTENT` from logical template name
- `CTA` editable free-text (default from template buttons or `CTA`)
- `MODE` = Blast | Utility
- `N` = recipient count
- Re-derives whenever type/template/number/recipients change UNLESS the operator has manually edited the name (dirty flag).

### 4. Audience sources

Tabbed source picker inside Step "Audience":
- **Paste CSV** (current behavior)
- **Upload CSV** (file input → parsed in browser)
- **Current chats** (lazy-loaded only when tab opened)
- **Saved audience** (from existing saved-audience store; new lightweight `localStorage` per-workspace persistence — no DB schema changes in this phase, keeps the change frontend-only)
- **Supabase segment** (placeholder — wired to current chats query for now, marked "coming soon" if no segments exist)

All sources funnel into the same parsed `Recipient[]` array with `phone`, `name`, and arbitrary extra columns kept as `variables`.

### 5. Variable mapping

After audience parsed, show a mapping table:
- Each template variable (`{{1}}`, `{{name}}`, etc.) → dropdown of detected CSV columns or static value
- Auto-detect by name match (`name` → `{{name}}`, `1` → `{{1}}`)
- Save mapping to `localStorage` keyed by `workspace_id + logical_template_key` so it auto-applies next time

### 6. Logical templates

A logical template is a label that groups one or more provider templates that share intent (e.g. "Main Marketing" → `iskra_main_marketing_v3` on number A and `iskra_main_v2` on number B).

Implementation in this phase (pragmatic, no schema migration):
- Auto-derive logical templates client-side by grouping `message_templates` by a normalized key — strip trailing version suffixes (`_v\d+`, `_\d+`) and lowercased name → that's the logical key.
- Display logical templates in the picker; when operator picks one + selects sending numbers, resolver picks the matching provider template per number.
- If a selected number has no approved variant for the logical template, show a clear inline error and disable Launch.
- Backend `campaigns` edge function already accepts `template_id`. For multi-number we extend the launch payload to accept `template_ids: { [whatsapp_number_id]: template_id }` and the function picks per recipient based on assigned number. (Small backend change.)

### 7. Rendered preview

Before launch, show a "Preview" panel rendering 1-3 sample recipients with variables substituted into the template body. Reuses existing `renderTemplateBody` logic in the edge function — duplicated client-side as a small util.

### 8. Scrolling fix

`WorkspaceLayout` wraps section in a fixed-height flex container; the wizard currently overflows. Fix by:
- Wizard root: `h-full overflow-y-auto`
- Sidebar: `lg:sticky lg:top-4` inside an `lg:self-start` column (already there but parent doesn't scroll)
- Use a single scrollable column on mobile (sidebar moves below)

### 9. Performance

Launch page:
- Split queries: `fetchLaunchEssentials(workspace_id)` returns only `numbers` (active) + `templates` (approved/paused only) + saved mappings. Skips campaigns and conversations.
- `fetchConversationsForCsv` only invoked when "Current chats" tab opened.
- Use `staleTime: 60_000` on essentials.

Campaigns page:
- Replace `fetchCampaignBase` with `fetchCampaignSummaries` that selects only campaigns + minimal number/template lookups (id, name, label). Don't fetch all conversations.
- Recipient detail query already lazy (only on row expand) — keep.

### Technical changes (files)

**New:**
- `src/lib/launchData.ts` — `fetchLaunchEssentials`, `fetchCampaignSummaries`, helpers: `groupLogicalTemplates`, `renderTemplateBody`, `buildCampaignName`, `geoFromPhone`, mapping persistence (localStorage).
- `src/components/workspace/launch/CampaignTypeStep.tsx`
- `src/components/workspace/launch/AudienceStep.tsx` (tabs: paste / upload / chats / saved)
- `src/components/workspace/launch/VariableMappingStep.tsx`
- `src/components/workspace/launch/LogicalTemplateStep.tsx`
- `src/components/workspace/launch/PreviewPanel.tsx`

**Edited:**
- `src/pages/workspace/LaunchWizard.tsx` — full rewrite using the new step components, fixes scroll/layout.
- `src/pages/workspace/WorkspaceCampaigns.tsx` — switch to lightweight `fetchCampaignSummaries`.
- `src/lib/crmData.ts` — keep existing functions, no breakage.
- `supabase/functions/campaigns/index.ts` — accept optional `template_overrides: Record<whatsapp_number_id, template_id>` in `launch` action; pick correct template per recipient based on assigned number.

### Out of scope (for this phase)

- New DB tables for saved audiences / saved mappings / logical templates (kept in localStorage for now; can be migrated to Supabase in a follow-up).
- Visual redesign.
- Scheduling / recurrence UI.
- Real Supabase segments.
