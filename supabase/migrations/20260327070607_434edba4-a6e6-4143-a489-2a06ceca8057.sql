ALTER TABLE public.consignment_drafts 
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
ADD COLUMN IF NOT EXISTS cc_response jsonb,
ADD COLUMN IF NOT EXISTS error_message text;