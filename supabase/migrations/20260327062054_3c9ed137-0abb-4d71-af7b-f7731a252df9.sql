-- Enable RLS on all tables with permissive policies (single tenancy, no auth)
ALTER TABLE public.email_customer_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignment_drafts ENABLE ROW LEVEL SECURITY;

-- Allow all access (single tenancy)
CREATE POLICY "Allow all access" ON public.email_customer_mappings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.consignment_drafts FOR ALL USING (true) WITH CHECK (true);