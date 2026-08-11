-- Migration: 20260811000001_create_schema_and_domain.sql
-- Description: M0.2B Initial schema definition for Costara foundation domain.

-- 1. Private schema for internal functions & security helpers
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

-- Grant schema permissions for public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. Timestamp update trigger function
CREATE OR REPLACE FUNCTION private.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = STATEMENT_TIMESTAMP();
    RETURN NEW;
END;
$$;

-- 3. businesses
CREATE TABLE public.businesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(trim(name)) > 0),
    currency_code text NOT NULL DEFAULT 'MXN' CHECK (currency_code ~ '^[A-Z]{3}$'),
    timezone text NOT NULL DEFAULT 'America/Mexico_City' CHECK (length(trim(timezone)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_businesses_updated_at
    BEFORE UPDATE ON public.businesses
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- 4. business_members
CREATE TABLE public.business_members (
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (business_id, user_id)
);

-- 5. unit_dimensions
CREATE TABLE public.unit_dimensions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL CHECK (code = lower(code) AND length(trim(code)) > 0),
    name text NOT NULL CHECK (length(trim(name)) > 0)
);

-- 6. units
CREATE TABLE public.units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dimension_id uuid NOT NULL REFERENCES public.unit_dimensions(id) ON DELETE RESTRICT,
    code text UNIQUE NOT NULL CHECK (code = lower(code) AND length(trim(code)) > 0),
    name_singular text NOT NULL CHECK (length(trim(name_singular)) > 0),
    name_plural text NOT NULL CHECK (length(trim(name_plural)) > 0),
    symbol text NOT NULL CHECK (length(trim(symbol)) > 0),
    factor_to_base numeric(30,12) NOT NULL CHECK (factor_to_base > 0),
    is_base boolean NOT NULL DEFAULT false,
    CONSTRAINT check_unit_base_factor CHECK (NOT is_base OR factor_to_base = 1)
);

CREATE UNIQUE INDEX idx_units_one_base_per_dimension
    ON public.units (dimension_id)
    WHERE (is_base IS TRUE);

-- 7. unit_aliases
CREATE TABLE public.unit_aliases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    alias text NOT NULL CHECK (length(trim(alias)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Unicidad case-insensitive para aliases
CREATE UNIQUE INDEX idx_unit_aliases_global_unique
    ON public.unit_aliases (lower(alias))
    WHERE (business_id IS NULL);

CREATE UNIQUE INDEX idx_unit_aliases_tenant_unique
    ON public.unit_aliases (business_id, lower(alias))
    WHERE (business_id IS NOT NULL);

-- Trigger bidireccional para proteger códigos canónicos vs aliases
CREATE OR REPLACE FUNCTION private.check_alias_not_canonical_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.units WHERE lower(code) = lower(NEW.alias)
    ) THEN
        RAISE EXCEPTION 'Alias "%" conflicts with canonical unit code', NEW.alias;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_alias_not_canonical_code
    BEFORE INSERT OR UPDATE OF alias ON public.unit_aliases
    FOR EACH ROW
    EXECUTE FUNCTION private.check_alias_not_canonical_code();

CREATE OR REPLACE FUNCTION private.check_canonical_code_not_alias()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.unit_aliases WHERE lower(alias) = lower(NEW.code)
    ) THEN
        RAISE EXCEPTION 'Canonical code "%" conflicts with existing unit alias', NEW.code;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_canonical_code_not_alias
    BEFORE INSERT OR UPDATE OF code ON public.units
    FOR EACH ROW
    EXECUTE FUNCTION private.check_canonical_code_not_alias();

-- 8. items
CREATE TABLE public.items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(trim(name)) > 0),
    kind text NOT NULL CHECK (kind IN ('raw_material', 'intermediate', 'finished_product', 'packaging')),
    base_unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    purchasable boolean NOT NULL DEFAULT false,
    producible boolean NOT NULL DEFAULT false,
    sellable boolean NOT NULL DEFAULT false,
    track_inventory boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_items_id_business_id UNIQUE (id, business_id)
);

CREATE TRIGGER trg_items_updated_at
    BEFORE UPDATE ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- 9. item_unit_conversions
CREATE TABLE public.item_unit_conversions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL,
    item_id uuid NOT NULL,
    name_singular text NOT NULL CHECK (length(trim(name_singular)) > 0),
    name_plural text NULL CHECK (name_plural IS NULL OR length(trim(name_plural)) > 0),
    quantity numeric(30,12) NOT NULL CHECK (quantity > 0),
    unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_item_unit_conversions_item_business
        FOREIGN KEY (item_id, business_id)
        REFERENCES public.items (id, business_id)
        ON DELETE RESTRICT
);

CREATE TRIGGER trg_item_unit_conversions_updated_at
    BEFORE UPDATE ON public.item_unit_conversions
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- Partial unique index: Unicidad case-insensitive de conversiones ACTIVAS por item
CREATE UNIQUE INDEX idx_item_unit_conversions_active_unique_name
    ON public.item_unit_conversions (item_id, lower(name_singular))
    WHERE (is_active IS TRUE);

-- Trigger de compatibilidad dimensional entre unit_id y item.base_unit_id
CREATE OR REPLACE FUNCTION private.check_conversion_dimension_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_item_dim uuid;
    v_target_dim uuid;
BEGIN
    SELECT u.dimension_id INTO v_item_dim
    FROM public.items i
    JOIN public.units u ON u.id = i.base_unit_id
    WHERE i.id = NEW.item_id;

    SELECT dimension_id INTO v_target_dim
    FROM public.units
    WHERE id = NEW.unit_id;

    IF v_item_dim IS NULL OR v_target_dim IS NULL OR v_item_dim <> v_target_dim THEN
        RAISE EXCEPTION 'Unit dimension mismatch: conversion unit dimension does not match item base unit dimension';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_conversion_dimension_match
    BEFORE INSERT OR UPDATE OF item_id, unit_id ON public.item_unit_conversions
    FOR EACH ROW
    EXECUTE FUNCTION private.check_conversion_dimension_match();

-- 10. Indexes for foreign keys, queries, and RLS
CREATE INDEX idx_business_members_user_id ON public.business_members (user_id);
CREATE INDEX idx_business_members_business_id ON public.business_members (business_id);
CREATE INDEX idx_items_business_id ON public.items (business_id);
CREATE INDEX idx_items_base_unit_id ON public.items (base_unit_id);
CREATE INDEX idx_item_unit_conversions_business_id ON public.item_unit_conversions (business_id);
CREATE INDEX idx_item_unit_conversions_item_id ON public.item_unit_conversions (item_id);
CREATE INDEX idx_item_unit_conversions_unit_id ON public.item_unit_conversions (unit_id);
CREATE INDEX idx_unit_aliases_business_id ON public.unit_aliases (business_id);
CREATE INDEX idx_unit_aliases_unit_id ON public.unit_aliases (unit_id);
CREATE INDEX idx_units_dimension_id ON public.units (dimension_id);

-- 11. Security Helpers in private schema
CREATE OR REPLACE FUNCTION private.is_business_member(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.business_members
        WHERE business_id = p_business_id
          AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION private.has_business_role(p_business_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.business_members
        WHERE business_id = p_business_id
          AND user_id = auth.uid()
          AND role = ANY(p_roles)
    );
$$;

-- Grant privileges on public schema tables to client roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

-- 12. Row Level Security (RLS)
ALTER TABLE public.unit_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_unit_conversions ENABLE ROW LEVEL SECURITY;

-- unit_dimensions & units: SELECT for authenticated
CREATE POLICY unit_dimensions_select_authenticated ON public.unit_dimensions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY units_select_authenticated ON public.units
    FOR SELECT TO authenticated USING (true);

-- businesses
CREATE POLICY businesses_select_member ON public.businesses
    FOR SELECT TO authenticated
    USING (private.is_business_member(id));

CREATE POLICY businesses_update_admin ON public.businesses
    FOR UPDATE TO authenticated
    USING (private.has_business_role(id, ARRAY['owner', 'admin']));

-- business_members
CREATE POLICY business_members_select_member ON public.business_members
    FOR SELECT TO authenticated
    USING (private.is_business_member(business_id));

CREATE POLICY business_members_modify_owner ON public.business_members
    FOR ALL TO authenticated
    USING (private.has_business_role(business_id, ARRAY['owner']))
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner']));

-- unit_aliases
CREATE POLICY unit_aliases_select ON public.unit_aliases
    FOR SELECT TO authenticated
    USING (business_id IS NULL OR private.is_business_member(business_id));

CREATE POLICY unit_aliases_insert_tenant ON public.unit_aliases
    FOR INSERT TO authenticated
    WITH CHECK (business_id IS NOT NULL AND private.has_business_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY unit_aliases_update_tenant ON public.unit_aliases
    FOR UPDATE TO authenticated
    USING (business_id IS NOT NULL AND private.has_business_role(business_id, ARRAY['owner', 'admin']))
    WITH CHECK (business_id IS NOT NULL AND private.has_business_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY unit_aliases_delete_tenant ON public.unit_aliases
    FOR DELETE TO authenticated
    USING (business_id IS NOT NULL AND private.has_business_role(business_id, ARRAY['owner', 'admin']));

-- items
CREATE POLICY items_select_member ON public.items
    FOR SELECT TO authenticated
    USING (private.is_business_member(business_id));

CREATE POLICY items_insert_admin ON public.items
    FOR INSERT TO authenticated
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY items_update_admin ON public.items
    FOR UPDATE TO authenticated
    USING (private.has_business_role(business_id, ARRAY['owner', 'admin']))
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));

-- item_unit_conversions
CREATE POLICY conversions_select_member ON public.item_unit_conversions
    FOR SELECT TO authenticated
    USING (private.is_business_member(business_id));

CREATE POLICY conversions_insert_admin ON public.item_unit_conversions
    FOR INSERT TO authenticated
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY conversions_update_admin ON public.item_unit_conversions
    FOR UPDATE TO authenticated
    USING (private.has_business_role(business_id, ARRAY['owner', 'admin']))
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));
