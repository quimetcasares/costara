-- Migration: 20260909000001_create_production_and_inventory_schema.sql
-- Description: M2B Production and Inventory Schema. Implements item densities,
-- recurring plan templates, dated production plans, targets, execution runs,
-- run inputs with operational deviations, and Kardex ledger inventory movements.

-- 0. Ensure item_unit_conversions has tenant-safe unique constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_item_unit_conversions_id_business'
    ) THEN
        ALTER TABLE public.item_unit_conversions
            ADD CONSTRAINT unique_item_unit_conversions_id_business UNIQUE (id, business_id);
    END IF;
END $$;

-- ============================================================================
-- 1. item_densities (ADR-031)
-- ============================================================================
CREATE TABLE public.item_densities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    item_id uuid NOT NULL,
    mass_unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    volume_unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    density_factor numeric(30,12) NOT NULL CHECK (density_factor > 0),
    is_approximate boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_item_densities_id_business UNIQUE (id, business_id),
    CONSTRAINT fk_item_densities_item_business
        FOREIGN KEY (item_id, business_id)
        REFERENCES public.items (id, business_id)
        ON DELETE CASCADE
);

CREATE TRIGGER trg_item_densities_updated_at
    BEFORE UPDATE ON public.item_densities
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- Only one active density per item
CREATE UNIQUE INDEX idx_item_densities_active_unique
    ON public.item_densities (item_id)
    WHERE (is_active IS TRUE);

-- Dimension check: mass_unit_id must be mass, volume_unit_id must be volume,
-- and item base_unit must be mass or volume
CREATE OR REPLACE FUNCTION private.check_item_density_dimensions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_mass_dim_code text;
    v_vol_dim_code text;
    v_item_dim_code text;
BEGIN
    SELECT d.code INTO v_mass_dim_code
    FROM public.units u
    JOIN public.unit_dimensions d ON d.id = u.dimension_id
    WHERE u.id = NEW.mass_unit_id;

    SELECT d.code INTO v_vol_dim_code
    FROM public.units u
    JOIN public.unit_dimensions d ON d.id = u.dimension_id
    WHERE u.id = NEW.volume_unit_id;

    IF v_mass_dim_code <> 'mass' THEN
        RAISE EXCEPTION 'Invalid mass unit: unit % does not belong to mass dimension', NEW.mass_unit_id
            USING ERRCODE = 'P0001';
    END IF;

    IF v_vol_dim_code <> 'volume' THEN
        RAISE EXCEPTION 'Invalid volume unit: unit % does not belong to volume dimension', NEW.volume_unit_id
            USING ERRCODE = 'P0001';
    END IF;

    SELECT d.code INTO v_item_dim_code
    FROM public.items i
    JOIN public.units u ON u.id = i.base_unit_id
    JOIN public.unit_dimensions d ON d.id = u.dimension_id
    WHERE i.id = NEW.item_id;

    IF v_item_dim_code NOT IN ('mass', 'volume') THEN
        RAISE EXCEPTION 'Item base unit must belong to mass or volume dimension to define density factor'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_item_density_dimensions
    BEFORE INSERT OR UPDATE OF mass_unit_id, volume_unit_id, item_id ON public.item_densities
    FOR EACH ROW
    EXECUTE FUNCTION private.check_item_density_dimensions();


-- ============================================================================
-- 2. production_plan_templates (ADR-024)
-- ============================================================================
CREATE TABLE public.production_plan_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(trim(name)) > 0),
    description text NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_production_plan_templates_id_business UNIQUE (id, business_id)
);

CREATE TRIGGER trg_production_plan_templates_updated_at
    BEFORE UPDATE ON public.production_plan_templates
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


-- ============================================================================
-- 3. production_plan_template_items (ADR-024)
-- ============================================================================
CREATE TABLE public.production_plan_template_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    template_id uuid NOT NULL,
    day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    item_id uuid NOT NULL,
    target_quantity numeric(30,12) NOT NULL CHECK (target_quantity > 0),
    unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    position integer NOT NULL DEFAULT 0,
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_production_plan_template_items_id_business UNIQUE (id, business_id),
    CONSTRAINT fk_template_items_template_business
        FOREIGN KEY (template_id, business_id)
        REFERENCES public.production_plan_templates (id, business_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_template_items_item_business
        FOREIGN KEY (item_id, business_id)
        REFERENCES public.items (id, business_id)
        ON DELETE RESTRICT
);

CREATE TRIGGER trg_production_plan_template_items_updated_at
    BEFORE UPDATE ON public.production_plan_template_items
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- Dimension check: unit_id must match item base unit dimension
CREATE OR REPLACE FUNCTION private.check_template_item_dimension()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_item_dim uuid;
    v_unit_dim uuid;
BEGIN
    SELECT u.dimension_id INTO v_item_dim
    FROM public.items i
    JOIN public.units u ON u.id = i.base_unit_id
    WHERE i.id = NEW.item_id;

    SELECT dimension_id INTO v_unit_dim
    FROM public.units
    WHERE id = NEW.unit_id;

    IF v_item_dim IS NULL OR v_unit_dim IS NULL OR v_item_dim <> v_unit_dim THEN
        RAISE EXCEPTION 'Unit dimension mismatch: template item unit must match item base unit dimension'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_template_item_dimension
    BEFORE INSERT OR UPDATE OF item_id, unit_id ON public.production_plan_template_items
    FOR EACH ROW
    EXECUTE FUNCTION private.check_template_item_dimension();


-- ============================================================================
-- 4. production_plans (ADR-024)
-- ============================================================================
CREATE TABLE public.production_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    template_id uuid NULL,
    name text NOT NULL CHECK (length(trim(name)) > 0),
    start_date date NOT NULL,
    end_date date NOT NULL,
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_production_plans_id_business UNIQUE (id, business_id),
    CONSTRAINT check_production_plans_dates CHECK (end_date >= start_date),
    CONSTRAINT fk_production_plans_template_business
        FOREIGN KEY (template_id, business_id)
        REFERENCES public.production_plan_templates (id, business_id)
        ON DELETE SET NULL
);

CREATE TRIGGER trg_production_plans_updated_at
    BEFORE UPDATE ON public.production_plans
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


-- ============================================================================
-- 5. production_targets (ADR-024, ADR-030)
-- ============================================================================
CREATE TABLE public.production_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    production_plan_id uuid NOT NULL,
    target_date date NOT NULL,
    item_id uuid NOT NULL,
    recipe_version_id uuid NULL,
    target_quantity numeric(30,12) NOT NULL CHECK (target_quantity > 0),
    unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    position integer NOT NULL DEFAULT 0,
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_production_targets_id_business UNIQUE (id, business_id),
    CONSTRAINT fk_production_targets_plan_business
        FOREIGN KEY (production_plan_id, business_id)
        REFERENCES public.production_plans (id, business_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_production_targets_item_business
        FOREIGN KEY (item_id, business_id)
        REFERENCES public.items (id, business_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_production_targets_recipe_version_business
        FOREIGN KEY (recipe_version_id, business_id)
        REFERENCES public.recipe_versions (id, business_id)
        ON DELETE SET NULL
);

CREATE TRIGGER trg_production_targets_updated_at
    BEFORE UPDATE ON public.production_targets
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- Trigger: Validate target_date in plan range & dimension match
CREATE OR REPLACE FUNCTION private.check_production_target_validity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_start_date date;
    v_end_date date;
    v_item_dim uuid;
    v_unit_dim uuid;
BEGIN
    SELECT start_date, end_date INTO v_start_date, v_end_date
    FROM public.production_plans
    WHERE id = NEW.production_plan_id;

    IF NEW.target_date < v_start_date OR NEW.target_date > v_end_date THEN
        RAISE EXCEPTION 'Target date % is outside production plan range [%, %]',
            NEW.target_date, v_start_date, v_end_date USING ERRCODE = 'P0001';
    END IF;

    SELECT u.dimension_id INTO v_item_dim
    FROM public.items i
    JOIN public.units u ON u.id = i.base_unit_id
    WHERE i.id = NEW.item_id;

    SELECT dimension_id INTO v_unit_dim
    FROM public.units
    WHERE id = NEW.unit_id;

    IF v_item_dim IS NULL OR v_unit_dim IS NULL OR v_item_dim <> v_unit_dim THEN
        RAISE EXCEPTION 'Unit dimension mismatch: target unit must match item base unit dimension'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_production_target_validity
    BEFORE INSERT OR UPDATE ON public.production_targets
    FOR EACH ROW
    EXECUTE FUNCTION private.check_production_target_validity();


-- ============================================================================
-- 6. production_runs (ADR-026, ADR-028, ADR-030)
-- ============================================================================
CREATE TABLE public.production_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    recipe_version_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    planned_yield_quantity numeric(30,12) NOT NULL CHECK (planned_yield_quantity > 0),
    planned_yield_unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    actual_yield_quantity numeric(30,12) NULL CHECK (actual_yield_quantity IS NULL OR actual_yield_quantity >= 0),
    actual_yield_unit_id uuid NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
    started_at timestamptz NULL,
    completed_at timestamptz NULL,
    created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_production_runs_id_business UNIQUE (id, business_id),
    CONSTRAINT fk_production_runs_recipe_version_business
        FOREIGN KEY (recipe_version_id, business_id)
        REFERENCES public.recipe_versions (id, business_id)
        ON DELETE RESTRICT,
    CONSTRAINT check_production_runs_completed_state CHECK (
        (status = 'completed' AND actual_yield_quantity IS NOT NULL AND actual_yield_unit_id IS NOT NULL AND completed_at IS NOT NULL) OR
        (status <> 'completed' AND completed_at IS NULL)
    )
);

CREATE TRIGGER trg_production_runs_updated_at
    BEFORE UPDATE ON public.production_runs
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- Production Run Lifecycle Trigger
CREATE OR REPLACE FUNCTION private.check_production_run_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_version_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT status INTO v_version_status
        FROM public.recipe_versions
        WHERE id = NEW.recipe_version_id;

        IF v_version_status IS NULL THEN
            RAISE EXCEPTION 'Recipe version % not found', NEW.recipe_version_id USING ERRCODE = 'P0002';
        END IF;

        IF v_version_status = 'draft' THEN
            RAISE EXCEPTION 'Cannot execute production run with draft recipe version. Version must be active or archived'
                USING ERRCODE = 'P0001';
        END IF;

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- recipe_version_id is strictly immutable once run is created (ADR-030)
        IF NEW.recipe_version_id <> OLD.recipe_version_id THEN
            RAISE EXCEPTION 'recipe_version_id is immutable once production run is created'
                USING ERRCODE = 'P0001';
        END IF;

        -- Terminal states: completed and cancelled cannot transition to other statuses
        IF OLD.status IN ('completed', 'cancelled') THEN
            IF NEW.status <> OLD.status THEN
                RAISE EXCEPTION 'Cannot change status of a % production run', OLD.status
                    USING ERRCODE = 'P0001';
            END IF;

            -- In completed state, physical execution data is frozen
            IF OLD.status = 'completed' AND (
                NEW.actual_yield_quantity <> OLD.actual_yield_quantity OR
                NEW.actual_yield_unit_id <> OLD.actual_yield_unit_id OR
                NEW.completed_at <> OLD.completed_at
            ) THEN
                RAISE EXCEPTION 'Completed production run data is immutable'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;

        -- Ajuste 3: Cancelled cannot hide physical consumption
        IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
            IF EXISTS (
                SELECT 1 FROM public.production_run_inputs
                WHERE production_run_id = OLD.id AND actual_quantity > 0
            ) THEN
                RAISE EXCEPTION 'Cannot cancel production run with existing physical consumptions'
                    USING ERRCODE = 'P0001';
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.inventory_movements
                WHERE production_run_id = OLD.id
            ) THEN
                RAISE EXCEPTION 'Cannot cancel production run with existing inventory movements'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('completed', 'cancelled') THEN
            RAISE EXCEPTION 'Cannot delete a % production run', OLD.status
                USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_production_run_lifecycle
    BEFORE INSERT OR UPDATE OR DELETE ON public.production_runs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_production_run_lifecycle();


-- ============================================================================
-- 7. production_run_inputs (ADR-026, ADR-028)
-- ============================================================================
CREATE TABLE public.production_run_inputs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    production_run_id uuid NOT NULL,
    recipe_input_id uuid NULL,
    item_id uuid NOT NULL,
    position integer NOT NULL DEFAULT 0,
    planned_quantity numeric(30,12) NOT NULL DEFAULT 0 CHECK (planned_quantity >= 0),
    planned_unit_id uuid NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    actual_quantity numeric(30,12) NULL CHECK (actual_quantity IS NULL OR actual_quantity >= 0),
    actual_unit_id uuid NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_production_run_inputs_id_business UNIQUE (id, business_id),
    CONSTRAINT fk_run_inputs_run_business
        FOREIGN KEY (production_run_id, business_id)
        REFERENCES public.production_runs (id, business_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_run_inputs_item_business
        FOREIGN KEY (item_id, business_id)
        REFERENCES public.items (id, business_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_run_inputs_recipe_input_business
        FOREIGN KEY (recipe_input_id, business_id)
        REFERENCES public.recipe_inputs (id, business_id)
        ON DELETE RESTRICT,
    -- Ajuste 1: Planned unit and quantity origin check
    CONSTRAINT check_production_run_input_origin CHECK (
        (recipe_input_id IS NOT NULL AND planned_quantity > 0 AND planned_unit_id IS NOT NULL) OR
        (recipe_input_id IS NULL AND planned_quantity = 0 AND planned_unit_id IS NULL)
    ),
    -- Actual unit and quantity pair check
    CONSTRAINT check_production_run_input_actual CHECK (
        (actual_quantity IS NULL AND actual_unit_id IS NULL) OR
        (actual_quantity IS NOT NULL AND actual_quantity >= 0 AND actual_unit_id IS NOT NULL)
    )
);

CREATE TRIGGER trg_production_run_inputs_updated_at
    BEFORE UPDATE ON public.production_run_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- Unique constraint per recipe line mapped in the run
CREATE UNIQUE INDEX idx_run_inputs_unique_recipe_line
    ON public.production_run_inputs (production_run_id, recipe_input_id)
    WHERE (recipe_input_id IS NOT NULL);

-- Ajuste 2: NO partial unique constraint on unplanned items; each unplanned input has own ID.

-- Trigger: Lock inputs when parent run is completed or cancelled, using FOR SHARE for concurrency protection
CREATE OR REPLACE FUNCTION private.check_production_run_inputs_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_parent_id uuid;
    v_status text;
BEGIN
    v_parent_id := COALESCE(NEW.production_run_id, OLD.production_run_id);

    SELECT status INTO v_status
    FROM public.production_runs
    WHERE id = v_parent_id
    FOR SHARE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Production run % not found', v_parent_id USING ERRCODE = 'P0002';
    END IF;

    IF v_status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot modify inputs of a % production run', v_status
            USING ERRCODE = 'P0001';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_check_production_run_inputs_lock
    BEFORE INSERT OR UPDATE OR DELETE ON public.production_run_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_production_run_inputs_lock();

-- Provenance Trigger: Recipe input integrity
-- If recipe_input_id IS NOT NULL:
-- 1. recipe_input must belong to the exact same recipe_version_id of the parent run
-- 2. recipe_input.item_id must be exactly equal to production_run_inputs.item_id
-- 3. recipe_input.business_id must equal production_run_inputs.business_id
CREATE OR REPLACE FUNCTION private.check_production_run_input_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_run_version_id uuid;
    v_input_version_id uuid;
    v_input_item_id uuid;
    v_input_biz_id uuid;
BEGIN
    IF NEW.recipe_input_id IS NOT NULL THEN
        SELECT recipe_version_id INTO v_run_version_id
        FROM public.production_runs
        WHERE id = NEW.production_run_id;

        SELECT recipe_version_id, item_id, business_id
        INTO v_input_version_id, v_input_item_id, v_input_biz_id
        FROM public.recipe_inputs
        WHERE id = NEW.recipe_input_id;

        IF v_input_version_id IS NULL THEN
            RAISE EXCEPTION 'Recipe input % not found', NEW.recipe_input_id USING ERRCODE = 'P0002';
        END IF;

        IF v_input_biz_id <> NEW.business_id THEN
            RAISE EXCEPTION 'Recipe input business % does not match input business %', v_input_biz_id, NEW.business_id
                USING ERRCODE = 'P0001';
        END IF;

        IF v_input_version_id <> v_run_version_id THEN
            RAISE EXCEPTION 'Recipe input % belongs to recipe version %, which does not match production run recipe version %',
                NEW.recipe_input_id, v_input_version_id, v_run_version_id
                USING ERRCODE = 'P0001';
        END IF;

        IF v_input_item_id <> NEW.item_id THEN
            RAISE EXCEPTION 'Recipe input % item % does not match production run input item %',
                NEW.recipe_input_id, v_input_item_id, NEW.item_id
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_production_run_input_provenance
    BEFORE INSERT OR UPDATE OF recipe_input_id, item_id, production_run_id ON public.production_run_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_production_run_input_provenance();


-- ============================================================================
-- 8. inventory_movements (ADR-002, ADR-003, ADR-010, ADR-027, ADR-029, ADR-031)
-- ============================================================================
CREATE TABLE public.inventory_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    item_id uuid NOT NULL,
    movement_type text NOT NULL CHECK (
        movement_type IN (
            'initial_balance',
            'purchase_receipt',
            'production_input',
            'production_output',
            'inventory_adjustment',
            'reversal'
        )
    ),
    quantity_captured numeric(30,12) NOT NULL,
    captured_unit_id uuid NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    item_unit_conversion_id uuid NULL REFERENCES public.item_unit_conversions(id) ON DELETE RESTRICT,
    quantity_base numeric(30,12) NOT NULL,
    base_unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    conversion_factor numeric(30,12) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
    is_approximate boolean NOT NULL DEFAULT false,
    production_run_id uuid NULL,
    production_run_input_id uuid NULL REFERENCES public.production_run_inputs(id) ON DELETE RESTRICT,
    reversal_of_movement_id uuid NULL REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
    movement_date timestamptz NOT NULL DEFAULT now(),
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT unique_inventory_movements_id_business UNIQUE (id, business_id),
    CONSTRAINT fk_inventory_movements_item_business
        FOREIGN KEY (item_id, business_id)
        REFERENCES public.items (id, business_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_movements_run_business
        FOREIGN KEY (production_run_id, business_id)
        REFERENCES public.production_runs (id, business_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_movements_run_input_business
        FOREIGN KEY (production_run_input_id, business_id)
        REFERENCES public.production_run_inputs (id, business_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_movements_reversal_business
        FOREIGN KEY (reversal_of_movement_id, business_id)
        REFERENCES public.inventory_movements (id, business_id)
        ON DELETE RESTRICT,
    -- Captured unit or item conversion must be provided
    CONSTRAINT check_inventory_movements_captured_unit CHECK (
        (captured_unit_id IS NOT NULL) OR (item_unit_conversion_id IS NOT NULL)
    ),
    -- Quantities sign check
    CONSTRAINT check_inventory_movements_quantities CHECK (
        (movement_type IN ('initial_balance', 'purchase_receipt', 'production_output') AND quantity_base > 0 AND quantity_captured > 0) OR
        (movement_type = 'production_input' AND quantity_base < 0 AND quantity_captured < 0) OR
        (movement_type IN ('inventory_adjustment', 'reversal') AND quantity_base <> 0 AND quantity_captured <> 0)
    ),
    -- Movement type origin linkages check
    CONSTRAINT check_inventory_movements_origin_links CHECK (
        (movement_type = 'production_input' AND production_run_id IS NOT NULL AND production_run_input_id IS NOT NULL AND reversal_of_movement_id IS NULL) OR
        (movement_type = 'production_output' AND production_run_id IS NOT NULL AND production_run_input_id IS NULL AND reversal_of_movement_id IS NULL) OR
        (movement_type IN ('purchase_receipt', 'initial_balance', 'inventory_adjustment') AND production_run_id IS NULL AND production_run_input_id IS NULL AND reversal_of_movement_id IS NULL) OR
        (movement_type = 'reversal' AND reversal_of_movement_id IS NOT NULL AND production_run_id IS NULL AND production_run_input_id IS NULL)
    )
);

-- Unique index to prevent reversing the same movement multiple times
CREATE UNIQUE INDEX idx_inventory_movements_unique_reversal
    ON public.inventory_movements (reversal_of_movement_id)
    WHERE (reversal_of_movement_id IS NOT NULL);

-- Unique index: exactly one production_input movement per production_run_input_id
CREATE UNIQUE INDEX idx_inventory_movements_unique_run_input
    ON public.inventory_movements (business_id, production_run_input_id)
    WHERE (movement_type = 'production_input');

-- Unique index: exactly one production_output movement per production_run
CREATE UNIQUE INDEX idx_inventory_movements_unique_run_output
    ON public.inventory_movements (business_id, production_run_id)
    WHERE (movement_type = 'production_output');

-- Query indexes
CREATE INDEX idx_inventory_movements_business_item_date
    ON public.inventory_movements (business_id, item_id, movement_date);

CREATE INDEX idx_inventory_movements_run
    ON public.inventory_movements (business_id, production_run_id)
    WHERE (production_run_id IS NOT NULL);

-- Absolute ledger immutability trigger
CREATE OR REPLACE FUNCTION private.enforce_inventory_movement_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Inventory movements are strictly immutable and cannot be updated or deleted'
        USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_enforce_inventory_movement_immutability
    BEFORE UPDATE OR DELETE ON public.inventory_movements
    FOR EACH ROW
    EXECUTE FUNCTION private.enforce_inventory_movement_immutability();


-- ============================================================================
-- 9. Row Level Security Policies
-- ============================================================================
ALTER TABLE public.item_densities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plan_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_run_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 9.1 item_densities
CREATE POLICY item_densities_select_member ON public.item_densities
    FOR SELECT TO authenticated USING (private.is_business_member(business_id));
CREATE POLICY item_densities_insert_admin ON public.item_densities
    FOR INSERT TO authenticated WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));
CREATE POLICY item_densities_update_admin ON public.item_densities
    FOR UPDATE TO authenticated
    USING (private.has_business_role(business_id, ARRAY['owner', 'admin']))
    WITH CHECK (private.has_business_role(business_id, ARRAY['owner', 'admin']));
CREATE POLICY item_densities_delete_admin ON public.item_densities
    FOR DELETE TO authenticated USING (private.has_business_role(business_id, ARRAY['owner', 'admin']));

-- 9.2 production_plan_templates
CREATE POLICY plan_templates_select_member ON public.production_plan_templates
    FOR SELECT TO authenticated USING (private.is_business_member(business_id));
CREATE POLICY plan_templates_insert_member ON public.production_plan_templates
    FOR INSERT TO authenticated WITH CHECK (private.is_business_member(business_id));
CREATE POLICY plan_templates_update_member ON public.production_plan_templates
    FOR UPDATE TO authenticated
    USING (private.is_business_member(business_id))
    WITH CHECK (private.is_business_member(business_id));
CREATE POLICY plan_templates_delete_member ON public.production_plan_templates
    FOR DELETE TO authenticated USING (private.is_business_member(business_id));

-- 9.3 production_plan_template_items
CREATE POLICY template_items_select_member ON public.production_plan_template_items
    FOR SELECT TO authenticated USING (private.is_business_member(business_id));
CREATE POLICY template_items_insert_member ON public.production_plan_template_items
    FOR INSERT TO authenticated WITH CHECK (private.is_business_member(business_id));
CREATE POLICY template_items_update_member ON public.production_plan_template_items
    FOR UPDATE TO authenticated
    USING (private.is_business_member(business_id))
    WITH CHECK (private.is_business_member(business_id));
CREATE POLICY template_items_delete_member ON public.production_plan_template_items
    FOR DELETE TO authenticated USING (private.is_business_member(business_id));

-- 9.4 production_plans
CREATE POLICY plans_select_member ON public.production_plans
    FOR SELECT TO authenticated USING (private.is_business_member(business_id));
CREATE POLICY plans_insert_member ON public.production_plans
    FOR INSERT TO authenticated WITH CHECK (private.is_business_member(business_id));
CREATE POLICY plans_update_member ON public.production_plans
    FOR UPDATE TO authenticated
    USING (private.is_business_member(business_id))
    WITH CHECK (private.is_business_member(business_id));
CREATE POLICY plans_delete_member ON public.production_plans
    FOR DELETE TO authenticated USING (private.is_business_member(business_id));

-- 9.5 production_targets
CREATE POLICY targets_select_member ON public.production_targets
    FOR SELECT TO authenticated USING (private.is_business_member(business_id));
CREATE POLICY targets_insert_member ON public.production_targets
    FOR INSERT TO authenticated WITH CHECK (private.is_business_member(business_id));
CREATE POLICY targets_update_member ON public.production_targets
    FOR UPDATE TO authenticated
    USING (private.is_business_member(business_id))
    WITH CHECK (private.is_business_member(business_id));
CREATE POLICY targets_delete_member ON public.production_targets
    FOR DELETE TO authenticated USING (private.is_business_member(business_id));

-- 9.6 production_runs
CREATE POLICY runs_select_member ON public.production_runs
    FOR SELECT TO authenticated USING (private.is_business_member(business_id));
CREATE POLICY runs_insert_member ON public.production_runs
    FOR INSERT TO authenticated WITH CHECK (private.is_business_member(business_id));
CREATE POLICY runs_update_member ON public.production_runs
    FOR UPDATE TO authenticated
    USING (private.is_business_member(business_id))
    WITH CHECK (private.is_business_member(business_id));
CREATE POLICY runs_delete_member ON public.production_runs
    FOR DELETE TO authenticated USING (private.is_business_member(business_id));

-- 9.7 production_run_inputs
CREATE POLICY run_inputs_select_member ON public.production_run_inputs
    FOR SELECT TO authenticated USING (private.is_business_member(business_id));
CREATE POLICY run_inputs_insert_member ON public.production_run_inputs
    FOR INSERT TO authenticated WITH CHECK (private.is_business_member(business_id));
CREATE POLICY run_inputs_update_member ON public.production_run_inputs
    FOR UPDATE TO authenticated
    USING (private.is_business_member(business_id))
    WITH CHECK (private.is_business_member(business_id));
CREATE POLICY run_inputs_delete_member ON public.production_run_inputs
    FOR DELETE TO authenticated USING (private.is_business_member(business_id));

-- 9.8 inventory_movements (Strict SELECT only, modifications through SECURITY DEFINER RPCs)
CREATE POLICY inv_movements_select_member ON public.inventory_movements
    FOR SELECT TO authenticated USING (private.is_business_member(business_id));

REVOKE INSERT, UPDATE, DELETE ON public.inventory_movements FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.inventory_movements TO authenticated;
