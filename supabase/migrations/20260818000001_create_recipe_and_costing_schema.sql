-- Migration: 20260818000001_create_recipe_and_costing_schema.sql
-- Description: M1B Schema definition for recipes, formulation versions, inputs, percentage bases, and item cost history.

-- 1. Extend item_unit_conversions with is_approximate
ALTER TABLE public.item_unit_conversions
ADD COLUMN is_approximate boolean NOT NULL DEFAULT false;

-- 2. recipes
CREATE TABLE public.recipes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (length(trim(name)) > 0),
    output_item_id uuid NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_recipes_id_business_id UNIQUE (id, business_id),
    CONSTRAINT unique_recipes_business_output_item UNIQUE (business_id, output_item_id),
    CONSTRAINT fk_recipes_output_item_business
        FOREIGN KEY (output_item_id, business_id)
        REFERENCES public.items (id, business_id)
        ON DELETE RESTRICT
);

CREATE TRIGGER trg_recipes_updated_at
    BEFORE UPDATE ON public.recipes
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- 3. recipe_versions
CREATE TABLE public.recipe_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL,
    recipe_id uuid NOT NULL,
    version_number integer NOT NULL CHECK (version_number > 0),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    reference_yield_quantity numeric(30,12) NOT NULL CHECK (reference_yield_quantity > 0),
    reference_yield_unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    portion_quantity numeric(30,12) NULL CHECK (portion_quantity IS NULL OR portion_quantity > 0),
    portion_unit_id uuid NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    yield_description text NULL CHECK (yield_description IS NULL OR length(trim(yield_description)) > 0),
    change_reason text NULL CHECK (change_reason IS NULL OR length(trim(change_reason)) > 0),
    notes text NULL,
    effective_from timestamptz NULL,
    created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_recipe_versions_id_business_id UNIQUE (id, business_id),
    CONSTRAINT unique_recipe_versions_recipe_version_number UNIQUE (recipe_id, version_number),
    CONSTRAINT check_recipe_version_status_effective_from CHECK ((status = 'draft') OR (effective_from IS NOT NULL)),
    CONSTRAINT check_recipe_version_portion_pair CHECK (
        (portion_quantity IS NULL AND portion_unit_id IS NULL) OR
        (portion_quantity IS NOT NULL AND portion_unit_id IS NOT NULL)
    ),
    CONSTRAINT fk_recipe_versions_recipe_business
        FOREIGN KEY (recipe_id, business_id)
        REFERENCES public.recipes (id, business_id)
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_recipe_versions_published_effective_from_unique
    ON public.recipe_versions (recipe_id, effective_from)
    WHERE (status IN ('active', 'archived'));

CREATE UNIQUE INDEX idx_recipe_versions_single_active
    ON public.recipe_versions (recipe_id)
    WHERE (status = 'active');

CREATE INDEX idx_recipe_versions_published_temporal_lookup
    ON public.recipe_versions (recipe_id, effective_from DESC)
    WHERE (status IN ('active', 'archived'));

CREATE TRIGGER trg_recipe_versions_updated_at
    BEFORE UPDATE ON public.recipe_versions
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- 4. recipe_inputs
CREATE TABLE public.recipe_inputs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL,
    recipe_version_id uuid NOT NULL,
    item_id uuid NOT NULL,
    position integer NOT NULL DEFAULT 0,
    quantity_mode text NOT NULL CHECK (quantity_mode IN ('absolute', 'percentage')),
    quantity numeric(30,12) NULL,
    unit_id uuid NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    percentage numeric(30,12) NULL,
    costing_source text NULL CHECK (costing_source IS NULL OR costing_source IN ('purchased', 'produced')),
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_recipe_inputs_id_business_id UNIQUE (id, business_id),
    CONSTRAINT unique_recipe_inputs_id_version_business UNIQUE (id, recipe_version_id, business_id),
    CONSTRAINT check_recipe_inputs_quantity_mode CHECK (
        (quantity_mode = 'absolute' AND quantity IS NOT NULL AND quantity > 0 AND unit_id IS NOT NULL AND percentage IS NULL) OR
        (quantity_mode = 'percentage' AND percentage IS NOT NULL AND percentage > 0 AND quantity IS NULL AND unit_id IS NULL)
    ),
    CONSTRAINT fk_recipe_inputs_version_business
        FOREIGN KEY (recipe_version_id, business_id)
        REFERENCES public.recipe_versions (id, business_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_recipe_inputs_item_business
        FOREIGN KEY (item_id, business_id)
        REFERENCES public.items (id, business_id)
        ON DELETE RESTRICT
);

CREATE TRIGGER trg_recipe_inputs_updated_at
    BEFORE UPDATE ON public.recipe_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- 5. recipe_input_percentage_bases
CREATE TABLE public.recipe_input_percentage_bases (
    business_id uuid NOT NULL,
    recipe_version_id uuid NOT NULL,
    percentage_input_id uuid NOT NULL,
    basis_input_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (percentage_input_id, basis_input_id),
    CONSTRAINT check_percentage_base_no_direct_self_ref CHECK (percentage_input_id <> basis_input_id),
    CONSTRAINT fk_percentage_bases_percentage_input
        FOREIGN KEY (percentage_input_id, recipe_version_id, business_id)
        REFERENCES public.recipe_inputs (id, recipe_version_id, business_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_percentage_bases_basis_input
        FOREIGN KEY (basis_input_id, recipe_version_id, business_id)
        REFERENCES public.recipe_inputs (id, recipe_version_id, business_id)
        ON DELETE RESTRICT
);

-- 6. item_cost_versions
CREATE TABLE public.item_cost_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL,
    item_id uuid NOT NULL,
    cost_amount numeric(30,12) NOT NULL CHECK (cost_amount >= 0),
    cost_quantity numeric(30,12) NOT NULL CHECK (cost_quantity > 0),
    unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    effective_from timestamptz NOT NULL DEFAULT now(),
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_item_cost_version_item_effective_from UNIQUE (item_id, effective_from),
    CONSTRAINT fk_item_cost_versions_item_business
        FOREIGN KEY (item_id, business_id)
        REFERENCES public.items (id, business_id)
        ON DELETE RESTRICT
);

-- 7. Indexes for foreign keys, queries, and RLS
CREATE INDEX idx_recipes_output_item_id ON public.recipes (output_item_id);

CREATE INDEX idx_recipe_versions_business_id ON public.recipe_versions (business_id);
CREATE INDEX idx_recipe_versions_recipe_id ON public.recipe_versions (recipe_id);
CREATE INDEX idx_recipe_versions_reference_yield_unit_id ON public.recipe_versions (reference_yield_unit_id);
CREATE INDEX idx_recipe_versions_portion_unit_id ON public.recipe_versions (portion_unit_id);

CREATE INDEX idx_recipe_inputs_business_id ON public.recipe_inputs (business_id);
CREATE INDEX idx_recipe_inputs_recipe_version_id ON public.recipe_inputs (recipe_version_id);
CREATE INDEX idx_recipe_inputs_item_id ON public.recipe_inputs (item_id);
CREATE INDEX idx_recipe_inputs_unit_id ON public.recipe_inputs (unit_id);

CREATE INDEX idx_percentage_bases_business_id ON public.recipe_input_percentage_bases (business_id);
CREATE INDEX idx_percentage_bases_recipe_version_id ON public.recipe_input_percentage_bases (recipe_version_id);
CREATE INDEX idx_percentage_bases_basis_input_id ON public.recipe_input_percentage_bases (basis_input_id);

CREATE INDEX idx_item_cost_versions_business_id ON public.item_cost_versions (business_id);
CREATE INDEX idx_item_cost_versions_unit_id ON public.item_cost_versions (unit_id);

-- 8. Triggers and Validation Functions in private Schema

-- 8.1 Recipe Immutability and Output Item Freeze
CREATE OR REPLACE FUNCTION private.check_recipe_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.business_id <> NEW.business_id THEN
        RAISE EXCEPTION 'business_id is immutable';
    END IF;

    IF OLD.output_item_id <> NEW.output_item_id THEN
        IF EXISTS (
            SELECT 1 FROM public.recipe_versions
            WHERE recipe_id = OLD.id AND status IN ('active', 'archived')
        ) THEN
            RAISE EXCEPTION 'output_item_id cannot be changed once a published version exists for this recipe';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_recipe_immutability
    BEFORE UPDATE ON public.recipes
    FOR EACH ROW
    EXECUTE FUNCTION private.check_recipe_immutability();

-- 8.2 Recipe Version Insert Initial Status Check
CREATE OR REPLACE FUNCTION private.check_recipe_version_insert_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'New recipe versions must be created with status "draft"';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_recipe_version_insert_status
    BEFORE INSERT ON public.recipe_versions
    FOR EACH ROW
    EXECUTE FUNCTION private.check_recipe_version_insert_status();

-- 8.3 Recipe Version Yield vs Portion Dimension Compatibility
CREATE OR REPLACE FUNCTION private.check_recipe_version_yield_portion_dim()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_yield_dim uuid;
    v_portion_dim uuid;
BEGIN
    IF NEW.portion_unit_id IS NOT NULL THEN
        SELECT dimension_id INTO v_yield_dim FROM public.units WHERE id = NEW.reference_yield_unit_id;
        SELECT dimension_id INTO v_portion_dim FROM public.units WHERE id = NEW.portion_unit_id;

        IF v_yield_dim IS NULL OR v_portion_dim IS NULL OR v_yield_dim <> v_portion_dim THEN
            RAISE EXCEPTION 'Unit dimension mismatch: portion unit dimension does not match reference yield unit dimension';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_recipe_version_yield_portion_dim
    BEFORE INSERT OR UPDATE OF reference_yield_unit_id, portion_unit_id ON public.recipe_versions
    FOR EACH ROW
    EXECUTE FUNCTION private.check_recipe_version_yield_portion_dim();

-- 8.4 Recipe Version Lifecycle and Immutability Enforcement
CREATE OR REPLACE FUNCTION private.enforce_recipe_version_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_max_eff timestamptz;
BEGIN
    -- Structural identity columns frozen after insert
    IF OLD.business_id <> NEW.business_id THEN
        RAISE EXCEPTION 'business_id is immutable';
    END IF;
    IF OLD.recipe_id <> NEW.recipe_id THEN
        RAISE EXCEPTION 'recipe_id is immutable';
    END IF;
    IF OLD.version_number <> NEW.version_number THEN
        RAISE EXCEPTION 'version_number is immutable';
    END IF;
    IF OLD.created_at <> NEW.created_at THEN
        RAISE EXCEPTION 'created_at is immutable';
    END IF;

    -- created_by frozen, but allows ON DELETE SET NULL transition when auth user is deleted
    IF OLD.created_by IS NOT NULL AND NEW.created_by IS NOT NULL AND OLD.created_by <> NEW.created_by THEN
        RAISE EXCEPTION 'created_by cannot be changed';
    END IF;
    IF OLD.created_by IS NULL AND NEW.created_by IS NOT NULL THEN
        RAISE EXCEPTION 'created_by cannot be changed';
    END IF;
    IF OLD.created_by IS NOT NULL AND NEW.created_by IS NULL THEN
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.created_by) THEN
            RAISE EXCEPTION 'created_by cannot be manually cleared';
        END IF;
    END IF;

    -- Lifecycle state machine and formulation freezing
    IF OLD.status = 'draft' THEN
        IF NEW.status = 'archived' THEN
            RAISE EXCEPTION 'Invalid status transition: draft cannot transition directly to archived';
        END IF;

        IF NEW.status = 'active' THEN
            -- Publication Gate A: Percentage inputs must have at least one base
            IF EXISTS (
                SELECT 1
                FROM public.recipe_inputs ri
                WHERE ri.recipe_version_id = NEW.id
                  AND ri.quantity_mode = 'percentage'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.recipe_input_percentage_bases pb
                      WHERE pb.percentage_input_id = ri.id
                  )
            ) THEN
                RAISE EXCEPTION 'Cannot publish recipe version: percentage inputs must have at least one percentage base';
            END IF;

            -- Publication Gate B: Dual capability items (purchasable AND producible) must have explicit costing_source
            IF EXISTS (
                SELECT 1
                FROM public.recipe_inputs ri
                JOIN public.items i ON i.id = ri.item_id
                WHERE ri.recipe_version_id = NEW.id
                  AND i.purchasable IS TRUE
                  AND i.producible IS TRUE
                  AND ri.costing_source IS NULL
            ) THEN
                RAISE EXCEPTION 'Cannot publish recipe version: hybrid items (purchasable and producible) must have explicit costing_source';
            END IF;

            -- Publication Gate C: effective_from must be strictly later than all previously published versions
            SELECT max(effective_from) INTO v_max_eff
            FROM public.recipe_versions
            WHERE recipe_id = NEW.recipe_id
              AND status IN ('active', 'archived')
              AND id <> NEW.id;

            IF v_max_eff IS NOT NULL AND NEW.effective_from <= v_max_eff THEN
                RAISE EXCEPTION 'Cannot publish recipe version: effective_from must be later than all existing published versions of this recipe';
            END IF;
        END IF;

    ELSIF OLD.status = 'active' THEN
        IF NEW.status = 'draft' THEN
            RAISE EXCEPTION 'Invalid status transition: active cannot transition back to draft';
        END IF;

        -- In active status, formulation is strictly immutable. Only transition to archived is allowed.
        IF OLD.reference_yield_quantity IS DISTINCT FROM NEW.reference_yield_quantity
           OR OLD.reference_yield_unit_id IS DISTINCT FROM NEW.reference_yield_unit_id
           OR OLD.portion_quantity IS DISTINCT FROM NEW.portion_quantity
           OR OLD.portion_unit_id IS DISTINCT FROM NEW.portion_unit_id
           OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
           OR OLD.yield_description IS DISTINCT FROM NEW.yield_description
           OR OLD.change_reason IS DISTINCT FROM NEW.change_reason
           OR OLD.notes IS DISTINCT FROM NEW.notes THEN
            RAISE EXCEPTION 'Active recipe versions are immutable. To make changes, create a new version.';
        END IF;

    ELSIF OLD.status = 'archived' THEN
        RAISE EXCEPTION 'Archived recipe versions are 100%% immutable and cannot be updated.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_recipe_version_immutability
    BEFORE UPDATE ON public.recipe_versions
    FOR EACH ROW
    EXECUTE FUNCTION private.enforce_recipe_version_immutability();

-- 8.5 Recipe Inputs Identity Immutability
CREATE OR REPLACE FUNCTION private.check_recipe_input_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.business_id <> NEW.business_id THEN
        RAISE EXCEPTION 'business_id is immutable';
    END IF;
    IF OLD.recipe_version_id <> NEW.recipe_version_id THEN
        RAISE EXCEPTION 'recipe_version_id is immutable';
    END IF;
    IF OLD.created_at <> NEW.created_at THEN
        RAISE EXCEPTION 'created_at is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_recipe_input_immutability
    BEFORE UPDATE ON public.recipe_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_recipe_input_immutability();

-- 8.6 Recipe Inputs Draft Status Enforcement (Freeze on Published Versions)
CREATE OR REPLACE FUNCTION private.enforce_recipe_input_version_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_status text;
    v_version_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_version_id := OLD.recipe_version_id;
    ELSE
        v_version_id := NEW.recipe_version_id;
    END IF;

    SELECT status INTO v_status
    FROM public.recipe_versions
    WHERE id = v_version_id;

    IF v_status IS NULL OR v_status <> 'draft' THEN
        RAISE EXCEPTION 'Cannot modify recipe inputs for a published (active or archived) recipe version';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER trg_enforce_recipe_input_version_draft
    BEFORE INSERT OR UPDATE OR DELETE ON public.recipe_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.enforce_recipe_input_version_draft();

-- 8.7 Recipe Inputs Dimension Match
CREATE OR REPLACE FUNCTION private.check_recipe_input_dimension_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_item_dim uuid;
    v_target_dim uuid;
BEGIN
    IF NEW.quantity_mode = 'absolute' THEN
        SELECT u.dimension_id INTO v_item_dim
        FROM public.items i
        JOIN public.units u ON u.id = i.base_unit_id
        WHERE i.id = NEW.item_id;

        SELECT dimension_id INTO v_target_dim
        FROM public.units
        WHERE id = NEW.unit_id;

        IF v_item_dim IS NULL OR v_target_dim IS NULL OR v_item_dim <> v_target_dim THEN
            RAISE EXCEPTION 'Unit dimension mismatch: recipe input unit dimension does not match item base unit dimension';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_recipe_input_dimension_match
    BEFORE INSERT OR UPDATE OF item_id, unit_id, quantity_mode ON public.recipe_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_recipe_input_dimension_match();

-- 8.8 Recipe Inputs Costing Source Capability Validation
CREATE OR REPLACE FUNCTION private.check_recipe_input_costing_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_purchasable boolean;
    v_producible boolean;
BEGIN
    IF NEW.costing_source IS NOT NULL THEN
        SELECT purchasable, producible INTO v_purchasable, v_producible
        FROM public.items
        WHERE id = NEW.item_id;

        IF NEW.costing_source = 'purchased' AND v_purchasable IS NOT TRUE THEN
            RAISE EXCEPTION 'Item is not purchasable and cannot have costing_source = purchased';
        END IF;

        IF NEW.costing_source = 'produced' AND v_producible IS NOT TRUE THEN
            RAISE EXCEPTION 'Item is not producible and cannot have costing_source = produced';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_recipe_input_costing_source
    BEFORE INSERT OR UPDATE OF item_id, costing_source ON public.recipe_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_recipe_input_costing_source();

-- 8.9 Recipe Inputs No Direct Self-Consumption
CREATE OR REPLACE FUNCTION private.check_recipe_input_no_direct_self_consumption()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_output_item_id uuid;
BEGIN
    SELECT r.output_item_id INTO v_output_item_id
    FROM public.recipe_versions rv
    JOIN public.recipes r ON r.id = rv.recipe_id
    WHERE rv.id = NEW.recipe_version_id;

    IF v_output_item_id IS NOT NULL AND v_output_item_id = NEW.item_id THEN
        RAISE EXCEPTION 'Direct self-consumption rejected: recipe cannot consume its own output item as an input';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_recipe_input_no_direct_self_consumption
    BEFORE INSERT OR UPDATE OF item_id, recipe_version_id ON public.recipe_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_recipe_input_no_direct_self_consumption();

-- 8.10 Recipe Inputs Bidirectional Quantity Mode Protection
CREATE OR REPLACE FUNCTION private.check_recipe_input_mode_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.quantity_mode = 'percentage' AND NEW.quantity_mode = 'absolute' THEN
        IF EXISTS (
            SELECT 1 FROM public.recipe_input_percentage_bases
            WHERE percentage_input_id = OLD.id
        ) THEN
            RAISE EXCEPTION 'Cannot change quantity_mode to absolute while percentage bases exist for this input. Delete percentage bases first.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_recipe_input_mode_change
    BEFORE UPDATE OF quantity_mode ON public.recipe_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_recipe_input_mode_change();

-- 8.11 Recipe Input Percentage Bases Structural Update Rejection
CREATE OR REPLACE FUNCTION private.prevent_percentage_base_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'recipe_input_percentage_bases does not support UPDATE. Modify dependencies via DELETE and INSERT.';
END;
$$;

CREATE TRIGGER trg_prevent_percentage_base_update
    BEFORE UPDATE ON public.recipe_input_percentage_bases
    FOR EACH ROW
    EXECUTE FUNCTION private.prevent_percentage_base_update();

-- 8.12 Recipe Input Percentage Bases Draft Status Enforcement
CREATE OR REPLACE FUNCTION private.enforce_percentage_base_version_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_status text;
    v_version_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_version_id := OLD.recipe_version_id;
    ELSE
        v_version_id := NEW.recipe_version_id;
    END IF;

    SELECT status INTO v_status
    FROM public.recipe_versions
    WHERE id = v_version_id;

    IF v_status IS NULL OR v_status <> 'draft' THEN
        RAISE EXCEPTION 'Cannot modify percentage bases for a published (active or archived) recipe version';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER trg_enforce_percentage_base_version_draft
    BEFORE INSERT OR DELETE ON public.recipe_input_percentage_bases
    FOR EACH ROW
    EXECUTE FUNCTION private.enforce_percentage_base_version_draft();

-- 8.13 Recipe Input Percentage Bases Mode Validation
CREATE OR REPLACE FUNCTION private.check_percentage_base_input_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_mode text;
BEGIN
    SELECT quantity_mode INTO v_mode
    FROM public.recipe_inputs
    WHERE id = NEW.percentage_input_id;

    IF v_mode IS NULL OR v_mode <> 'percentage' THEN
        RAISE EXCEPTION 'percentage_input_id must have quantity_mode = percentage';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_percentage_base_input_mode
    BEFORE INSERT ON public.recipe_input_percentage_bases
    FOR EACH ROW
    EXECUTE FUNCTION private.check_percentage_base_input_mode();

-- 8.14 Item Cost Versions Append-Only Structural Enforcement
CREATE OR REPLACE FUNCTION private.prevent_item_cost_version_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'item_cost_versions is an append-only historical table: UPDATE and DELETE are strictly forbidden';
END;
$$;

CREATE TRIGGER trg_prevent_item_cost_version_mutation
    BEFORE UPDATE OR DELETE ON public.item_cost_versions
    FOR EACH ROW
    EXECUTE FUNCTION private.prevent_item_cost_version_mutation();

-- 8.15 Item Cost Versions Dimension & Purchasable Validation
CREATE OR REPLACE FUNCTION private.check_item_cost_purchasable_and_dim()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_purchasable boolean;
    v_item_dim uuid;
    v_cost_dim uuid;
BEGIN
    SELECT i.purchasable, u.dimension_id INTO v_purchasable, v_item_dim
    FROM public.items i
    JOIN public.units u ON u.id = i.base_unit_id
    WHERE i.id = NEW.item_id;

    IF v_purchasable IS NOT TRUE THEN
        RAISE EXCEPTION 'Item is not purchasable: cost versions cannot be defined for non-purchasable items';
    END IF;

    SELECT dimension_id INTO v_cost_dim
    FROM public.units
    WHERE id = NEW.unit_id;

    IF v_item_dim IS NULL OR v_cost_dim IS NULL OR v_item_dim <> v_cost_dim THEN
        RAISE EXCEPTION 'Unit dimension mismatch: cost unit dimension does not match item base unit dimension';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_item_cost_purchasable_and_dim
    BEFORE INSERT ON public.item_cost_versions
    FOR EACH ROW
    EXECUTE FUNCTION private.check_item_cost_purchasable_and_dim();

-- 9. Permissions & Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

-- 10. Row Level Security (RLS)
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_input_percentage_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_cost_versions ENABLE ROW LEVEL SECURITY;

-- 10.1 recipes
CREATE POLICY recipes_select_member ON public.recipes
    FOR SELECT TO authenticated
    USING (private.is_business_member(business_id));

CREATE POLICY recipes_insert_admin ON public.recipes
    FOR INSERT TO authenticated
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY recipes_update_admin ON public.recipes
    FOR UPDATE TO authenticated
    USING (private.has_business_role(business_id, ARRAY['owner', 'admin']))
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));

-- 10.2 recipe_versions
CREATE POLICY recipe_versions_select_member ON public.recipe_versions
    FOR SELECT TO authenticated
    USING (private.is_business_member(business_id));

CREATE POLICY recipe_versions_insert_admin ON public.recipe_versions
    FOR INSERT TO authenticated
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY recipe_versions_update_admin ON public.recipe_versions
    FOR UPDATE TO authenticated
    USING (private.has_business_role(business_id, ARRAY['owner', 'admin']))
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));

-- 10.3 recipe_inputs
CREATE POLICY recipe_inputs_select_member ON public.recipe_inputs
    FOR SELECT TO authenticated
    USING (private.is_business_member(business_id));

CREATE POLICY recipe_inputs_insert_admin ON public.recipe_inputs
    FOR INSERT TO authenticated
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY recipe_inputs_update_admin ON public.recipe_inputs
    FOR UPDATE TO authenticated
    USING (private.has_business_role(business_id, ARRAY['owner', 'admin']))
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY recipe_inputs_delete_admin ON public.recipe_inputs
    FOR DELETE TO authenticated
    USING (private.has_business_role(business_id, ARRAY['owner', 'admin']));

-- 10.4 recipe_input_percentage_bases (No UPDATE policy)
CREATE POLICY percentage_bases_select_member ON public.recipe_input_percentage_bases
    FOR SELECT TO authenticated
    USING (private.is_business_member(business_id));

CREATE POLICY percentage_bases_insert_admin ON public.recipe_input_percentage_bases
    FOR INSERT TO authenticated
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY percentage_bases_delete_admin ON public.recipe_input_percentage_bases
    FOR DELETE TO authenticated
    USING (private.has_business_role(business_id, ARRAY['owner', 'admin']));

-- 10.5 item_cost_versions (Append-only: Select and Insert only)
CREATE POLICY item_cost_versions_select_member ON public.item_cost_versions
    FOR SELECT TO authenticated
    USING (private.is_business_member(business_id));

CREATE POLICY item_cost_versions_insert_admin ON public.item_cost_versions
    FOR INSERT TO authenticated
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));
