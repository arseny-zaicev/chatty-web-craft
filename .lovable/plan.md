## Quick answer about +1 603 750 3256

I checked the database directly. This number (`BigZ Hyprmrkt`) is genuinely unassigned and safe to leave in stock:

- `workspace_id`: **NULL** (not allocated to any client)
- `status`: `stock`, `is_active`: true
- Campaigns referencing it: **0**
- Campaign recipients referencing it: **0**
- Allocation rows in `campaign_number_allocations`: **0**

So no client is using it right now. It's truly idle.

## The real issue you're raising

Today there is **no automatic sync** between "this number is in a workspace" and "this number is being used in a campaign". Allocation is purely manual in Fleet → Numbers Registry. The Fleet UI also has no warning if you try to unassign or reassign a number that has active/recent campaign activity. That's the gap to close.

## Plan

### 1. Show usage right in Fleet Registry
For every row in `/admin/fleet`, fetch and display:
- Last campaign that used the number (name + workspace + last sent date)
- Count of running/scheduled campaigns currently bound to it
- A "Currently in use" red badge when there is a running/scheduled/paused campaign on it
- A "Recently used" amber badge when last_sent within the last 30 days but no active campaign

This makes "is this number really free?" answerable at a glance.

### 2. Guard reassign / unassign / delete
Before changing `workspace_id` or deleting a number, check `campaigns` for non-terminal statuses (`scheduled`, `running`, `paused`) bound to it. If any exist:
- Block the action with a clear modal listing the blocking campaigns + their workspace
- Offer two explicit choices: "Cancel" or "Force - I know what I'm doing" (force still allowed for admin, but logged)

Same guard runs when reassigning to a different workspace, since that would orphan the campaign.

### 3. Detail drawer "Usage history" tab
Inside the Fleet edit drawer, add a small section listing the last ~10 campaigns that ever used this number, grouped by workspace, with status + sent_count. Pure read-only, helps audit "where has this number been".

### 4. Sanity SQL view (no UI)
A simple SQL view `whatsapp_number_usage_summary` that joins numbers ↔ campaigns ↔ recipients and exposes: `number_id`, `active_campaign_count`, `last_used_at`, `last_workspace_id`, `last_campaign_id`. Both Fleet list and the drawer query this view so we don't repeat aggregation logic in the client.

### Out of scope (on purpose)
- Automatically moving `workspace_id` based on campaign activity. That would mask mistakes - if a campaign is running on a wrongly-assigned number, we want a warning, not silent reassignment.
- Changing how the workspace UI picks numbers - that already only sees numbers with `workspace_id = current workspace`.

### Technical notes
- New view in a migration; RLS via `is_admin(auth.uid())`.
- `FleetRegistry.tsx`: extend the query in `fetchData` to join the view; add badges in the row renderer; wrap `reassign` and `remove` mutations with a pre-check that opens an `AlertDialog` if blocking campaigns exist.
- No changes to campaign send logic, no changes to client-facing pages.
