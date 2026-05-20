## Goal

When a setter is assigned to a conversation (`conversations.assigned_setter_id`), automatically move that conversation's deal into the matching "Aktive Chats {Setter}" stage in the same pipeline. Mapping is explicit (per-stage dropdown), so it works for any client and survives renames.

## Schema change

Add one nullable column:

```
ALTER TABLE public.pipeline_stages
  ADD COLUMN assigned_setter_id uuid
    REFERENCES public.workspace_setters(id) ON DELETE SET NULL;

CREATE INDEX pipeline_stages_assigned_setter_idx
  ON public.pipeline_stages(assigned_setter_id)
  WHERE assigned_setter_id IS NOT NULL;
```

Sanity check at write time (trigger): if a row sets `assigned_setter_id`, the setter must belong to the same `workspace_id` as the stage. Reject otherwise.

## Trigger: conversation → deal stage

`AFTER UPDATE OF assigned_setter_id ON public.conversations` (and `AFTER INSERT` for completeness). When `NEW.assigned_setter_id IS DISTINCT FROM OLD.assigned_setter_id` and not null:

1. Look up the target stage:
   ```sql
   SELECT id FROM pipeline_stages
   WHERE pipeline_id = NEW.pipeline_id
     AND assigned_setter_id = NEW.assigned_setter_id
   LIMIT 1;
   ```
2. If found, update the deal linked to this conversation:
   ```sql
   UPDATE deals
      SET stage_id = <target>, updated_at = now()
    WHERE conversation_id = NEW.id
      AND stage_id <> <target>;
   ```
3. If no matching stage, do nothing silently (so pipelines without per-setter columns are unaffected).

The trigger is `SECURITY DEFINER` so it works regardless of which role updated the conversation (webhook, cron, UI).

No backfill on schema migration. After the admin maps the three FB Media stages in the UI, a one-shot `UPDATE conversations SET assigned_setter_id = assigned_setter_id WHERE assigned_setter_id IS NOT NULL AND pipeline_id IN (...)` re-fires the trigger to align existing chats. I'll run that as a data update once mapping is saved.

## UI: PipelineConfigSheet stage editor

In `src/components/workspace/PipelineConfigSheet.tsx`, in the stage row, add a small "Setter" dropdown next to the existing name/color controls:

- Source: `fetchSetters(workspace_id)` filtered to active.
- Options: "— none —" + each setter's `display_name`.
- Writes `pipeline_stages.assigned_setter_id` directly.
- Visual hint: when a stage has a setter mapped, show a tiny avatar/initial chip in the stage header on the Pipeline board too (so it's visible without opening config).

Validation in UI: a setter can be mapped to at most one stage per pipeline. If user picks a setter already used in this pipeline, swap it (clear the previous stage's mapping) and toast "Moved Andre's column from X to Y".

## What does NOT change

- `assigned_setter_id` selection UI (`SetterAssignSelect`) stays as-is.
- Manual drag of a card between columns still works; the trigger only fires on `assigned_setter_id` change, not on stage change.
- Stages without `assigned_setter_id` (e.g. "No Reply", "Reply") behave exactly like before.

## Edge cases handled

- Deal doesn't exist for the conversation yet → no-op (trigger skips silently).
- Setter unassigned (`NULL`) → don't touch the deal (leaves it where the user put it).
- Conversation moved to a different pipeline → trigger uses `NEW.pipeline_id`, so it looks up the stage in the right pipeline.
- Setter deleted → ON DELETE SET NULL clears the mapping; future assignments to that pipeline won't move anything.

## Files touched

- New migration: add column + trigger + workspace-consistency check.
- `src/components/workspace/PipelineConfigSheet.tsx`: setter dropdown per stage row.
- `src/lib/pipelines.ts` (or inline in the sheet): tiny helper `setStageSetter(stageId, setterId)`.
- `src/pages/Pipeline.tsx`: optional small avatar chip on stage header.
- `src/integrations/supabase/types.ts`: regenerated automatically.
- Data update after mapping is saved: re-trigger `assigned_setter_id` to align FB Media's existing conversations.

## Order of operations

1. Migration (column + trigger).
2. UI dropdown in PipelineConfigSheet.
3. You map the three FB Media stages to Andre/Katalin/Tobias.
4. I run the one-shot re-fire so existing assigned chats jump into their columns.
5. Optional: chip on stage header.
