ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_starred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_conversations_pinned_at ON public.conversations (pinned_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_is_starred ON public.conversations (is_starred) WHERE is_starred = true;