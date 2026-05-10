ALTER TABLE public.lead_imports DROP CONSTRAINT lead_imports_status_check;
ALTER TABLE public.lead_imports ADD CONSTRAINT lead_imports_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'routed'::text, 'duplicate'::text, 'invalid'::text,
    'awaiting_manual'::text, 'contacted'::text, 'failed'::text,
    'queued'::text, 'sent'::text, 'replied'::text, 'skipped'::text
  ]));