-- Create email_customer_mappings table
CREATE TABLE public.email_customer_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_email TEXT NOT NULL UNIQUE,
  cc_customer_id TEXT NOT NULL,
  cc_customer_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create settings table (single row)
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cc_api_base_url TEXT NOT NULL DEFAULT '',
  cc_api_key TEXT NOT NULL DEFAULT '',
  claude_api_key TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create consignment_drafts table
CREATE TABLE public.consignment_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_extraction JSONB,
  mapped_payload JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'failed')),
  from_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default settings row
INSERT INTO public.settings (cc_api_base_url, cc_api_key, claude_api_key) VALUES ('', '', '');