
-- Drop all permissive "Allow all access" policies
DROP POLICY IF EXISTS "Allow all access" ON public.tenants;
DROP POLICY IF EXISTS "Allow all access" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow all access" ON public.consignment_drafts;
DROP POLICY IF EXISTS "Allow all access" ON public.email_customer_mappings;
DROP POLICY IF EXISTS "Allow all access" ON public.settings;

-- Tenants: authenticated users only (contains API credentials - hide client_secret via view later if needed)
CREATE POLICY "Authenticated users can select tenants"
  ON public.tenants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert tenants"
  ON public.tenants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update tenants"
  ON public.tenants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete tenants"
  ON public.tenants FOR DELETE TO authenticated USING (true);

-- Customer profiles: authenticated users only
CREATE POLICY "Authenticated users can select customer_profiles"
  ON public.customer_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customer_profiles"
  ON public.customer_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customer_profiles"
  ON public.customer_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete customer_profiles"
  ON public.customer_profiles FOR DELETE TO authenticated USING (true);

-- Consignment drafts: authenticated users only
CREATE POLICY "Authenticated users can select consignment_drafts"
  ON public.consignment_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert consignment_drafts"
  ON public.consignment_drafts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update consignment_drafts"
  ON public.consignment_drafts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete consignment_drafts"
  ON public.consignment_drafts FOR DELETE TO authenticated USING (true);

-- Email customer mappings: authenticated users only
CREATE POLICY "Authenticated users can select email_customer_mappings"
  ON public.email_customer_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert email_customer_mappings"
  ON public.email_customer_mappings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update email_customer_mappings"
  ON public.email_customer_mappings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete email_customer_mappings"
  ON public.email_customer_mappings FOR DELETE TO authenticated USING (true);

-- Settings (legacy): authenticated users only
CREATE POLICY "Authenticated users can select settings"
  ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert settings"
  ON public.settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update settings"
  ON public.settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete settings"
  ON public.settings FOR DELETE TO authenticated USING (true);
