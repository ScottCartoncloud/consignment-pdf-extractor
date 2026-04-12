
ALTER TABLE public.customer_profiles
ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'consignment'
CHECK (entity_type IN ('consignment', 'sale_order', 'purchase_order'));

ALTER TABLE public.consignment_drafts
ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'consignment'
CHECK (entity_type IN ('consignment', 'sale_order', 'purchase_order'));
