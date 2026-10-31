-- ==============================================================================
-- TIRA Belle - Supabase Production Database Hardening & Row Level Security (RLS)
-- Migration: 20261030000000_supabase_security_and_rls.sql
-- Goal: Stop unauthorized users from reading or changing database records.
-- ==============================================================================

-- 0. Ensure all required columns exist
ALTER TABLE IF EXISTS public.settings ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(255) DEFAULT 'https://instagram.com/tirabelle.desserts?obrf=MzhsZG04Ymc3NXBj';
ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'flat';
ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS discount_value FLOAT DEFAULT 0.0;
ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS eligible_cups_count INTEGER DEFAULT 0;

-- 1. Enable Row Level Security (RLS) on all tables (Standard RLS permits superuser/table owner postgres to bypass)
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings NO FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories NO FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products NO FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers NO FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales NO FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sale_items NO FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.redemptions NO FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews NO FORCE ROW LEVEL SECURITY;

-- 2. Drop legacy / overly permissive policies
DROP POLICY IF EXISTS "Public can view settings" ON public.settings;
DROP POLICY IF EXISTS "Service role full access settings" ON public.settings;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.settings;
DROP POLICY IF EXISTS "settings_service_role_all" ON public.settings;

DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
DROP POLICY IF EXISTS "Service role full access categories" ON public.categories;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.categories;
DROP POLICY IF EXISTS "categories_public_select_active" ON public.categories;
DROP POLICY IF EXISTS "categories_service_role_all" ON public.categories;

DROP POLICY IF EXISTS "Public can view active products" ON public.products;
DROP POLICY IF EXISTS "Service role full access products" ON public.products;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.products;
DROP POLICY IF EXISTS "products_public_select_active" ON public.products;
DROP POLICY IF EXISTS "products_service_role_all" ON public.products;

DROP POLICY IF EXISTS "Public access customers" ON public.customers;
DROP POLICY IF EXISTS "Service role full access customers" ON public.customers;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.customers;
DROP POLICY IF EXISTS "customers_service_role_all" ON public.customers;
DROP POLICY IF EXISTS "customers_owner_select" ON public.customers;

DROP POLICY IF EXISTS "Public access sales" ON public.sales;
DROP POLICY IF EXISTS "Service role full access sales" ON public.sales;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.sales;
DROP POLICY IF EXISTS "sales_service_role_all" ON public.sales;
DROP POLICY IF EXISTS "sales_owner_select" ON public.sales;

DROP POLICY IF EXISTS "Public access sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Service role full access sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_service_role_all" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_owner_select" ON public.sale_items;

DROP POLICY IF EXISTS "Public access redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "Service role full access redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.redemptions;
DROP POLICY IF EXISTS "redemptions_service_role_all" ON public.redemptions;
DROP POLICY IF EXISTS "redemptions_owner_select" ON public.redemptions;

DROP POLICY IF EXISTS "Public can view reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public can insert reviews" ON public.reviews;
DROP POLICY IF EXISTS "Service role full access reviews" ON public.reviews;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.reviews;
DROP POLICY IF EXISTS "reviews_public_select" ON public.reviews;
DROP POLICY IF EXISTS "reviews_public_insert" ON public.reviews;
DROP POLICY IF EXISTS "reviews_service_role_all" ON public.reviews;

-- 3. Revoke excessive default public schema permissions
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM public, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM public, anon;

-- Grant minimal necessary schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Service role receives full management access for server-side API operations
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 4. Store Settings Table
-- Deny direct anon/public table access. Trusted backend handles settings sanitization.
CREATE POLICY "settings_service_role_all"
    ON public.settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. Categories Table
-- Public users (anon & authenticated) can only SELECT active categories.
CREATE POLICY "categories_public_select_active"
    ON public.categories
    FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "categories_service_role_all"
    ON public.categories
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT ON public.categories TO anon, authenticated;

-- 6. Products Table
-- Public users (anon & authenticated) can only SELECT active products.
CREATE POLICY "products_public_select_active"
    ON public.products
    FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "products_service_role_all"
    ON public.products
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT ON public.products TO anon, authenticated;

-- 7. Customers Table (PII Protection)
-- Direct access denied to anon. Customer can only read their own profile if authenticated via phone.
CREATE POLICY "customers_service_role_all"
    ON public.customers
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "customers_owner_select"
    ON public.customers
    FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'phone') IS NOT NULL AND
        (auth.jwt() ->> 'phone') = phone
    );

GRANT SELECT ON public.customers TO authenticated;

-- 8. Sales Table (Financial Records)
-- Direct access denied to anon. Customer can only view their own sales if authenticated.
CREATE POLICY "sales_service_role_all"
    ON public.sales
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "sales_owner_select"
    ON public.sales
    FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'phone') IS NOT NULL AND
        (auth.jwt() ->> 'phone') = customer_phone
    );

GRANT SELECT ON public.sales TO authenticated;

-- 9. Sale Items Table
-- Direct access denied to anon. Owner can only view items linked to their own sales.
CREATE POLICY "sale_items_service_role_all"
    ON public.sale_items
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "sale_items_owner_select"
    ON public.sale_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.sales s
            WHERE s.id = sale_items.sale_id
              AND (auth.jwt() ->> 'phone') IS NOT NULL
              AND s.customer_phone = (auth.jwt() ->> 'phone')
        )
    );

GRANT SELECT ON public.sale_items TO authenticated;

-- 10. Redemptions Table
-- Direct access denied to anon. Owner can only view their own redemptions if authenticated.
CREATE POLICY "redemptions_service_role_all"
    ON public.redemptions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "redemptions_owner_select"
    ON public.redemptions
    FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'phone') IS NOT NULL AND
        (auth.jwt() ->> 'phone') = customer_phone
    );

GRANT SELECT ON public.redemptions TO authenticated;

-- 11. Reviews Table
-- Public can view reviews. Public can insert with validation. Deletion/Update restricted to service_role.
CREATE POLICY "reviews_public_select"
    ON public.reviews
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "reviews_public_insert"
    ON public.reviews
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        length(name) >= 2 AND length(name) <= 100 AND
        rating >= 1 AND rating <= 5 AND
        length(comment) >= 3 AND length(comment) <= 1000
    );

CREATE POLICY "reviews_service_role_all"
    ON public.reviews
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT, INSERT ON public.reviews TO anon, authenticated;

-- 12. Supabase Storage Policies ('tiramisu-uploads')
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'tiramisu-uploads',
    'tiramisu-uploads',
    true,
    5242880, -- 5 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS "Public can view tiramisu-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated/service_role can upload" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated/service_role can delete" ON storage.objects;

CREATE POLICY "Public can view tiramisu-uploads"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'tiramisu-uploads');

CREATE POLICY "Only service_role can upload"
    ON storage.objects
    FOR INSERT
    TO service_role
    WITH CHECK (bucket_id = 'tiramisu-uploads');

CREATE POLICY "Only service_role can update or delete"
    ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'tiramisu-uploads');

