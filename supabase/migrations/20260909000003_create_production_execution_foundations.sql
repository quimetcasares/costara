-- Migration: 20260909000003_create_production_execution_foundations.sql
-- Description: M2C.0 - Foundations for Production Run Execution, Permissions, and Snapshot Ingestion

-- ============================================================================
-- 1. production_runs: Add nullable production_target_id with tenant-safe FK
-- ============================================================================
ALTER TABLE public.production_runs
    ADD COLUMN production_target_id uuid NULL;

ALTER TABLE public.production_runs
    ADD CONSTRAINT fk_production_runs_target_business
    FOREIGN KEY (production_target_id, business_id)
    REFERENCES public.production_targets (id, business_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_production_runs_target
    ON public.production_runs (production_target_id)
    WHERE production_target_id IS NOT NULL;


-- ============================================================================
-- 2. production_targets: Freeze planning intent once any production run is linked
-- ============================================================================
CREATE OR REPLACE FUNCTION private.check_production_target_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF EXISTS (
            SELECT 1 FROM public.production_runs
            WHERE production_target_id = OLD.id
        ) THEN
            IF NEW.production_plan_id <> OLD.production_plan_id OR
               NEW.target_date <> OLD.target_date OR
               NEW.item_id <> OLD.item_id OR
               NEW.recipe_version_id IS DISTINCT FROM OLD.recipe_version_id OR
               NEW.target_quantity <> OLD.target_quantity OR
               NEW.unit_id <> OLD.unit_id OR
               NEW.notes IS DISTINCT FROM OLD.notes THEN
                RAISE EXCEPTION 'Cannot modify planning intention of target % because production runs already exist', OLD.id
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1 FROM public.production_runs
            WHERE production_target_id = OLD.id
        ) THEN
            RAISE EXCEPTION 'Cannot delete target % because production runs already exist', OLD.id
                USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_production_target_immutability
    BEFORE UPDATE OR DELETE ON public.production_targets
    FOR EACH ROW
    EXECUTE FUNCTION private.check_production_target_immutability();


-- ============================================================================
-- 3. production_runs: Restrict direct DML from client roles
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON public.production_runs FROM authenticated, anon, PUBLIC;


-- ============================================================================
-- 4. production_run_inputs: Permissions and immutability of planned snapshot
-- ============================================================================
REVOKE INSERT, DELETE ON public.production_run_inputs FROM authenticated, anon, PUBLIC;
REVOKE UPDATE ON public.production_run_inputs FROM authenticated, anon, PUBLIC;
GRANT UPDATE (actual_quantity, actual_unit_id, notes) ON public.production_run_inputs TO authenticated;

-- Ensure check_production_run_inputs_lock runs with SECURITY DEFINER so FOR SHARE does not fail for authenticated
CREATE OR REPLACE FUNCTION private.check_production_run_inputs_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION private.check_production_run_input_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_parent_id uuid;
    v_run_status text;
BEGIN
    v_parent_id := COALESCE(NEW.production_run_id, OLD.production_run_id);

    SELECT status INTO v_run_status
    FROM public.production_runs
    WHERE id = v_parent_id
    FOR SHARE;

    IF v_run_status IS NULL THEN
        RAISE EXCEPTION 'Production run % not found', v_parent_id USING ERRCODE = 'P0002';
    END IF;

    IF v_run_status <> 'in_progress' THEN
        RAISE EXCEPTION 'Cannot modify inputs of a % production run', v_run_status
            USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.recipe_input_id IS NOT NULL THEN
            RAISE EXCEPTION 'Cannot delete nominal recipe input line from production run'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Nominal lines protection
        IF OLD.recipe_input_id IS NOT NULL THEN
            IF NEW.production_run_id <> OLD.production_run_id OR
               NEW.business_id <> OLD.business_id OR
               NEW.recipe_input_id <> OLD.recipe_input_id OR
               NEW.item_id <> OLD.item_id OR
               NEW.planned_quantity <> OLD.planned_quantity OR
               NEW.planned_unit_id <> OLD.planned_unit_id OR
               NEW.position <> OLD.position THEN
                RAISE EXCEPTION 'Planned nominal input fields are immutable'
                    USING ERRCODE = 'P0001';
            END IF;
        ELSE
            -- Unplanned lines protection
            IF NEW.production_run_id <> OLD.production_run_id OR
               NEW.business_id <> OLD.business_id OR
               NEW.recipe_input_id IS NOT NULL OR
               NEW.item_id <> OLD.item_id OR
               NEW.planned_quantity <> OLD.planned_quantity OR
               NEW.planned_unit_id IS NOT NULL OR
               NEW.position <> OLD.position THEN
                RAISE EXCEPTION 'Unplanned input core fields are immutable'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;

        -- Validate actual quantity and unit pair
        IF NEW.actual_quantity IS NOT NULL THEN
            IF NEW.actual_quantity < 0 THEN
                RAISE EXCEPTION 'Actual quantity must be non-negative' USING ERRCODE = 'P0001';
            END IF;
            IF NEW.actual_unit_id IS NULL THEN
                RAISE EXCEPTION 'Actual unit must be specified when actual quantity is set' USING ERRCODE = 'P0001';
            END IF;
        ELSE
            IF NEW.actual_unit_id IS NOT NULL THEN
                RAISE EXCEPTION 'Actual unit must be null when actual quantity is null' USING ERRCODE = 'P0001';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_production_run_input_mutation
    BEFORE UPDATE OR DELETE ON public.production_run_inputs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_production_run_input_mutation();


-- ============================================================================
-- 5. RPC: public.add_unplanned_production_run_input (Idempotent)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.add_unplanned_production_run_input(
    p_input_id uuid,
    p_run_id uuid,
    p_item_id uuid,
    p_actual_quantity numeric DEFAULT NULL,
    p_actual_unit_id uuid DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_run record;
    v_item record;
    v_existing record;
    v_unit_dim uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: user is not authenticated' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_run
    FROM public.production_runs
    WHERE id = p_run_id;

    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Production run % not found', p_run_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT private.is_business_member(v_run.business_id) THEN
        RAISE EXCEPTION 'Forbidden: user is not a member of business %', v_run.business_id USING ERRCODE = '42501';
    END IF;

    IF v_run.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Cannot add unplanned input to a % production run', v_run.status USING ERRCODE = 'P0001';
    END IF;

    -- Idempotency check on p_input_id
    SELECT * INTO v_existing
    FROM public.production_run_inputs
    WHERE id = p_input_id;

    IF v_existing.id IS NOT NULL THEN
        IF v_existing.production_run_id = p_run_id AND
           v_existing.item_id = p_item_id AND
           v_existing.recipe_input_id IS NULL AND
           v_existing.planned_quantity = 0 AND
           v_existing.planned_unit_id IS NULL THEN
            RETURN p_input_id;
        ELSE
            RAISE EXCEPTION 'Idempotency conflict: production_run_input % already exists with different parameters', p_input_id
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Verify item exists in same business
    SELECT i.id, i.base_unit_id, u.dimension_id INTO v_item
    FROM public.items i
    JOIN public.units u ON u.id = i.base_unit_id
    WHERE i.id = p_item_id AND i.business_id = v_run.business_id;

    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'Item % not found in business %', p_item_id, v_run.business_id USING ERRCODE = 'P0002';
    END IF;

    -- Verify actual quantity and unit pair
    IF p_actual_quantity IS NOT NULL THEN
        IF p_actual_quantity < 0 THEN
            RAISE EXCEPTION 'Actual quantity must be non-negative' USING ERRCODE = 'P0001';
        END IF;
        IF p_actual_unit_id IS NULL THEN
            RAISE EXCEPTION 'Actual unit must be specified when actual quantity is provided' USING ERRCODE = 'P0001';
        END IF;

        SELECT dimension_id INTO v_unit_dim
        FROM public.units
        WHERE id = p_actual_unit_id;

        IF v_unit_dim IS NULL OR v_unit_dim <> v_item.dimension_id THEN
            RAISE EXCEPTION 'Unit dimension mismatch: actual unit must match item base unit dimension' USING ERRCODE = 'P0001';
        END IF;
    ELSE
        IF p_actual_unit_id IS NOT NULL THEN
            RAISE EXCEPTION 'Actual unit must be null when actual quantity is null' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    INSERT INTO public.production_run_inputs (
        id,
        business_id,
        production_run_id,
        recipe_input_id,
        item_id,
        position,
        planned_quantity,
        planned_unit_id,
        actual_quantity,
        actual_unit_id,
        notes
    ) VALUES (
        p_input_id,
        v_run.business_id,
        p_run_id,
        NULL,
        p_item_id,
        COALESCE((SELECT MAX(position) + 1 FROM public.production_run_inputs WHERE production_run_id = p_run_id), 0),
        0,
        NULL,
        p_actual_quantity,
        p_actual_unit_id,
        p_notes
    );

    RETURN p_input_id;
END;
$$;


-- ============================================================================
-- 6. RPC: public.delete_unplanned_production_run_input
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_unplanned_production_run_input(
    p_input_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_input record;
    v_run record;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: user is not authenticated' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_input
    FROM public.production_run_inputs
    WHERE id = p_input_id;

    IF v_input.id IS NULL THEN
        -- Idempotent delete
        RETURN;
    END IF;

    IF NOT private.is_business_member(v_input.business_id) THEN
        RAISE EXCEPTION 'Forbidden: user is not a member of business %', v_input.business_id USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_run
    FROM public.production_runs
    WHERE id = v_input.production_run_id;

    IF v_run.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Cannot delete input of a % production run', v_run.status USING ERRCODE = 'P0001';
    END IF;

    IF v_input.recipe_input_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot delete nominal recipe input line from production run' USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.production_run_inputs
    WHERE id = p_input_id;
END;
$$;


-- ============================================================================
-- 7. RPC: public.update_production_run_notes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_production_run_notes(
    p_run_id uuid,
    p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_run record;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: user is not authenticated' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_run
    FROM public.production_runs
    WHERE id = p_run_id;

    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Production run % not found', p_run_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT private.is_business_member(v_run.business_id) THEN
        RAISE EXCEPTION 'Forbidden: user is not a member of business %', v_run.business_id USING ERRCODE = '42501';
    END IF;

    IF v_run.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Cannot edit notes of a % production run', v_run.status USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.production_runs
    SET notes = p_notes
    WHERE id = p_run_id;
END;
$$;


-- ============================================================================
-- 8. RPC: public.get_current_inventory_stock
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_current_inventory_stock(
    p_business_id uuid
)
RETURNS TABLE (
    item_id uuid,
    item_name text,
    base_unit_id uuid,
    base_unit_code text,
    current_stock numeric(30,12),
    is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: user is not authenticated' USING ERRCODE = '28000';
    END IF;

    IF NOT private.is_business_member(p_business_id) THEN
        RAISE EXCEPTION 'Forbidden: user is not a member of business %', p_business_id USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        i.id AS item_id,
        i.name AS item_name,
        u.id AS base_unit_id,
        u.code AS base_unit_code,
        COALESCE(SUM(m.quantity_base), 0)::numeric(30,12) AS current_stock,
        i.is_active
    FROM public.items i
    JOIN public.units u ON u.id = i.base_unit_id
    LEFT JOIN public.inventory_movements m
        ON m.item_id = i.id
       AND m.business_id = p_business_id
    WHERE i.business_id = p_business_id
      AND i.track_inventory = true
    GROUP BY i.id, i.name, u.id, u.code, i.is_active
    ORDER BY i.name ASC;
END;
$$;


-- ============================================================================
-- 9. RPC: public.start_production_run_from_snapshot (Service Role Only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.start_production_run_from_snapshot(
    p_run_id uuid,
    p_business_id uuid,
    p_production_target_id uuid,
    p_recipe_version_id uuid,
    p_planned_yield_quantity numeric,
    p_planned_yield_unit_id uuid,
    p_scheduled_date date,
    p_created_by uuid,
    p_notes text,
    p_inputs jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_version record;
    v_target record;
    v_existing_run record;
    v_version_inputs_count integer;
    v_snapshot_inputs_count integer;
    v_input_elem jsonb;
    v_elem_recipe_input_id uuid;
    v_elem_item_id uuid;
    v_elem_planned_qty numeric;
    v_elem_planned_unit_id uuid;
    v_recipe_input record;
BEGIN
    -- A. Validate p_created_by membership using public.business_members
    IF NOT EXISTS (
        SELECT 1 FROM public.business_members
        WHERE business_id = p_business_id AND user_id = p_created_by
    ) THEN
        RAISE EXCEPTION 'Forbidden: user % is not a member of business %', p_created_by, p_business_id
            USING ERRCODE = '42501';
    END IF;

    -- B. Validate recipe_version belongs to business and is not draft
    SELECT rv.id, rv.recipe_id, rv.status, r.output_item_id, i.base_unit_id
    INTO v_version
    FROM public.recipe_versions rv
    JOIN public.recipes r ON r.id = rv.recipe_id
    JOIN public.items i ON i.id = r.output_item_id
    WHERE rv.id = p_recipe_version_id AND rv.business_id = p_business_id;

    IF v_version.id IS NULL THEN
        RAISE EXCEPTION 'Recipe version % not found in business %', p_recipe_version_id, p_business_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_version.status = 'draft' THEN
        RAISE EXCEPTION 'Cannot execute production run with draft recipe version'
            USING ERRCODE = 'P0001';
    END IF;

    -- D & E. Validate planned_yield
    IF p_planned_yield_quantity <= 0 THEN
        RAISE EXCEPTION 'Planned yield quantity must be positive' USING ERRCODE = 'P0001';
    END IF;

    IF p_planned_yield_unit_id <> v_version.base_unit_id THEN
        RAISE EXCEPTION 'Planned yield unit % must match recipe output item base unit %',
            p_planned_yield_unit_id, v_version.base_unit_id USING ERRCODE = 'P0001';
    END IF;

    -- F. Validate target if provided
    IF p_production_target_id IS NOT NULL THEN
        SELECT * INTO v_target
        FROM public.production_targets
        WHERE id = p_production_target_id AND business_id = p_business_id
        FOR SHARE;

        IF v_target.id IS NULL THEN
            RAISE EXCEPTION 'Production target % not found in business %', p_production_target_id, p_business_id
                USING ERRCODE = 'P0002';
        END IF;

        IF v_target.item_id <> v_version.output_item_id THEN
            RAISE EXCEPTION 'Target item % does not match recipe output item %', v_target.item_id, v_version.output_item_id
                USING ERRCODE = 'P0001';
        END IF;

        IF p_scheduled_date <> v_target.target_date THEN
            RAISE EXCEPTION 'Run scheduled date % must match target date %', p_scheduled_date, v_target.target_date
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- G. Idempotency check on p_run_id
    SELECT * INTO v_existing_run
    FROM public.production_runs
    WHERE id = p_run_id;

    IF v_existing_run.id IS NOT NULL THEN
        IF v_existing_run.business_id = p_business_id AND
           v_existing_run.production_target_id IS NOT DISTINCT FROM p_production_target_id AND
           v_existing_run.recipe_version_id = p_recipe_version_id AND
           v_existing_run.planned_yield_quantity = p_planned_yield_quantity AND
           v_existing_run.planned_yield_unit_id = p_planned_yield_unit_id AND
           v_existing_run.scheduled_date = p_scheduled_date THEN
            RETURN jsonb_build_object(
                'status', v_existing_run.status,
                'run_id', p_run_id,
                'idempotent', true,
                'message', 'Production run already exists'
            );
        ELSE
            RAISE EXCEPTION 'Idempotency conflict: production run % already exists with different parameters', p_run_id
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- H. Structural validation of p_inputs
    IF jsonb_typeof(p_inputs) <> 'array' THEN
        RAISE EXCEPTION 'p_inputs must be a jsonb array' USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_version_inputs_count
    FROM public.recipe_inputs
    WHERE recipe_version_id = p_recipe_version_id;

    SELECT count(*) INTO v_snapshot_inputs_count
    FROM jsonb_array_elements(p_inputs);

    IF v_snapshot_inputs_count <> v_version_inputs_count THEN
        RAISE EXCEPTION 'Snapshot input count mismatch: expected %, got %',
            v_version_inputs_count, v_snapshot_inputs_count USING ERRCODE = 'P0001';
    END IF;

    -- Validate no duplicates in snapshot
    IF (
        SELECT count(DISTINCT (elem->>'recipe_input_id')::uuid)
        FROM jsonb_array_elements(p_inputs) elem
    ) <> v_snapshot_inputs_count THEN
        RAISE EXCEPTION 'Duplicate recipe_input_id found in snapshot inputs' USING ERRCODE = 'P0001';
    END IF;

    -- Validate each snapshot input against recipe_inputs
    FOR v_input_elem IN SELECT * FROM jsonb_array_elements(p_inputs) LOOP
        v_elem_recipe_input_id := (v_input_elem->>'recipe_input_id')::uuid;
        v_elem_item_id := (v_input_elem->>'item_id')::uuid;
        v_elem_planned_qty := (v_input_elem->>'planned_quantity')::numeric;
        v_elem_planned_unit_id := (v_input_elem->>'planned_unit_id')::uuid;

        IF v_elem_recipe_input_id IS NULL THEN
            RAISE EXCEPTION 'Nominal snapshot input cannot have null recipe_input_id' USING ERRCODE = 'P0001';
        END IF;

        IF v_elem_planned_qty IS NULL OR v_elem_planned_qty <= 0 THEN
            RAISE EXCEPTION 'Planned quantity for nominal input % must be positive, underflow detected',
                v_elem_recipe_input_id USING ERRCODE = 'P0001';
        END IF;

        SELECT ri.id, ri.item_id, itm.base_unit_id
        INTO v_recipe_input
        FROM public.recipe_inputs ri
        JOIN public.items itm ON itm.id = ri.item_id
        WHERE ri.id = v_elem_recipe_input_id AND ri.recipe_version_id = p_recipe_version_id;

        IF v_recipe_input.id IS NULL THEN
            RAISE EXCEPTION 'Recipe input % does not belong to recipe version %',
                v_elem_recipe_input_id, p_recipe_version_id USING ERRCODE = 'P0001';
        END IF;

        IF v_recipe_input.item_id <> v_elem_item_id THEN
            RAISE EXCEPTION 'Snapshot item % does not match recipe input item %',
                v_elem_item_id, v_recipe_input.item_id USING ERRCODE = 'P0001';
        END IF;

        IF v_recipe_input.base_unit_id <> v_elem_planned_unit_id THEN
            RAISE EXCEPTION 'Snapshot unit % does not match item base unit %',
                v_elem_planned_unit_id, v_recipe_input.base_unit_id USING ERRCODE = 'P0001';
        END IF;
    END LOOP;

    -- I. Atomic insert
    INSERT INTO public.production_runs (
        id,
        business_id,
        production_target_id,
        recipe_version_id,
        status,
        planned_yield_quantity,
        planned_yield_unit_id,
        scheduled_date,
        started_at,
        created_by,
        notes
    ) VALUES (
        p_run_id,
        p_business_id,
        p_production_target_id,
        p_recipe_version_id,
        'in_progress',
        p_planned_yield_quantity,
        p_planned_yield_unit_id,
        p_scheduled_date,
        clock_timestamp(),
        p_created_by,
        p_notes
    );

    INSERT INTO public.production_run_inputs (
        business_id,
        production_run_id,
        recipe_input_id,
        item_id,
        position,
        planned_quantity,
        planned_unit_id,
        actual_quantity,
        actual_unit_id,
        notes
    )
    SELECT
        p_business_id,
        p_run_id,
        (elem->>'recipe_input_id')::uuid,
        (elem->>'item_id')::uuid,
        COALESCE((elem->>'position')::integer, 0),
        (elem->>'planned_quantity')::numeric,
        (elem->>'planned_unit_id')::uuid,
        NULL,
        NULL,
        elem->>'notes'
    FROM jsonb_array_elements(p_inputs) elem;

    RETURN jsonb_build_object(
        'status', 'in_progress',
        'run_id', p_run_id,
        'idempotent', false
    );
END;
$$;

-- Restrict execution to service_role only
REVOKE ALL ON FUNCTION public.start_production_run_from_snapshot FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_production_run_from_snapshot FROM authenticated;
REVOKE ALL ON FUNCTION public.start_production_run_from_snapshot FROM anon;
GRANT EXECUTE ON FUNCTION public.start_production_run_from_snapshot TO service_role;
