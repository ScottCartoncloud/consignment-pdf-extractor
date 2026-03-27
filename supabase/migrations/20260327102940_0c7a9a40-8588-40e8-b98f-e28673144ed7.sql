
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cc_tenant_id TEXT NOT NULL,
  cc_api_base_url TEXT NOT NULL DEFAULT 'https://api.cartoncloud.com',
  cc_client_id TEXT NOT NULL DEFAULT '',
  cc_client_secret TEXT NOT NULL DEFAULT '',
  custom_field_schema JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON public.tenants FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.customer_profiles ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
