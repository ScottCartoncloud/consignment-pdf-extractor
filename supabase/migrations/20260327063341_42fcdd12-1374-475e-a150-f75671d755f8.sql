
-- Create customer_profiles table
CREATE TABLE public.customer_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  cc_customer_id TEXT NOT NULL,
  inbound_email_slug TEXT NOT NULL UNIQUE,
  extraction_hints TEXT,
  sample_extraction JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

-- Permissive policy (single tenancy)
CREATE POLICY "Allow all access" ON public.customer_profiles FOR ALL TO public USING (true) WITH CHECK (true);

-- Add customer_profile_id to consignment_drafts
ALTER TABLE public.consignment_drafts ADD COLUMN customer_profile_id UUID REFERENCES public.customer_profiles(id);

-- Add customer_profile_id to email_customer_mappings
ALTER TABLE public.email_customer_mappings ADD COLUMN customer_profile_id UUID REFERENCES public.customer_profiles(id);
