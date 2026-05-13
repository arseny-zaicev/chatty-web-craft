## Findings

This was my mistake. You asked to check one missing positive lead, and the implemented recovery path was too broad.

### What happened

1. A new `campaign_recipients -> lead.first_reply` trigger was added to catch missed campaign replies.
2. A backfill/watchdog was also added to recover replies that had no Slack event.
3. Both paths treated `status = replied` as enough to notify Slack.
4. That is wrong for this product. `replied` includes block buttons, not relevant, auto-replies, location questions, and random inbound noise.
5. The first negative filter only caught obvious words like `Block` and `Stop`. It did not catch `Not relevant`, `Not for me`, `Where are you located`, auto-replies, or neutral/non-qualified messages.
6. The watchdog still had no negative/qualification filter, so it reintroduced bad events even after the trigger was partly filtered.

### Scope of bad Slack events

From `13 May 2026 23:00 GST` onward:

- `65` `lead.first_reply` events were sent.
- At least `21` were obvious bad/noise notifications.
- `320` backfill events were skipped/halted before sending individually.
- For goswyft specifically:
  - `16` `lead.first_reply` events were sent.
  - `6` were `Block` via watchdog digest.
  - `4` were `Not relevant` direct notifications.
  - Several were auto-replies like “Thank you for contacting...”

There are no currently pending bad `lead.first_reply` Slack events.

## The Moran Group - goswyft

Found it.

- Workspace: `goswyft-GS`
- Contact: `The Moran Group`
- Phone: `+12167749816`
- Campaign: `2026-05-13 | US | 2026-05-11 | US | SMB Owners with D&B Profile | GoSwyft Main | Call`
- Pipeline: `US / Main`
- First inbound reply: `Where are you located`
- Received: `13 May 2026, 20:30 GST`
- Current stage: `Message sent`
- AI classification: `neutral / info`
- Slack event status: `skipped`
- Why skipped: it was created by the one-off recovery backfill at `13 May 2026, 23:44 GST`, then halted at `23:48 GST` to stop the mass spam.

Important: The Moran Group was not classified as a positive lead by the current classifier. It is an engaged info/location question, not a block. If you consider this a client-worthy lead notification, the rule should be “positive or engaged buyer question”, not only strictly positive.

## Fix plan

### 1. Stop broad `lead.first_reply` client notifications

Change Slack routing so client/pipeline notifications only go out when the reply is qualified:

- allow: positive sentiment, meeting request, pricing question, clear info request, “learn more”, “send details”, location/availability questions
- block: `Block`, `Stop`, `Spam`, `Not relevant`, `Not for me`, `Not interested`, unsubscribe, wrong person, hostile replies, auto-replies
- if no classification exists yet, do not notify client immediately from `lead.first_reply`

### 2. Move qualification to one shared database function

Create one canonical function such as `should_notify_lead_reply(conversation_id, reply_text)` used by:

- `campaign_recipients` trigger
- `lead_imports` trigger
- `reply-notification-watchdog`
- any backfill/recovery logic

This prevents the watchdog and trigger from drifting again.

### 3. Make watchdog recovery safe

Update `reply-notification-watchdog` so it only recovers qualified lead replies and never posts raw `status = replied` rows.

It should skip:

- lost-stage conversations
- obvious negative text
- auto-replies
- unclassified neutral/noise
- rows already covered by `positive_lead`

### 4. Clean current queue state

Mark any remaining pending or future-created bad `lead.first_reply` events as skipped before they can dispatch.

Also mark already-sent bad events with a clear `error` note for audit, without deleting history.

### 5. Recover The Moran Group correctly

After the filter is fixed, enqueue one safe qualified notification for The Moran Group only if we decide that `Where are you located` counts as an engaged lead.

Recommended message type: “Engaged reply” rather than “positive lead”, because the classifier marked it neutral/info.

### 6. Add a no-spam guardrail

Add a hard dispatcher-level safety check before posting Slack:

If event is `lead.first_reply` and it fails qualification, mark it `skipped` even if a buggy trigger/watchdog created it.

This is the last line of defense so this cannot happen again from another source.

## Technical notes

- The broken paths are in:
  - `enqueue_recipient_first_reply_event()`
  - `enqueue_lead_first_reply_event()`
  - `reply-notification-watchdog`
  - `slack-dispatch`
- Current negative SQL regex returns:
  - `Block` -> blocked
  - `Stop` -> blocked
  - `Not relevant` -> not blocked
  - `Not for me` -> not blocked
  - `Where are you located` -> not blocked
- The Moran Group event exists in `slack_event_queue` but is `skipped`, not `sent`.