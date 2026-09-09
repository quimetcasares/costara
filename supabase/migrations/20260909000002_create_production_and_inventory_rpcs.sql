-- Migration: 20260909000002_create_production_and_inventory_rpcs.sql
-- Description: M2B Database RPCs for unit conversion with item densities,
-- minimal purchase receipts, inventory adjustments, explicit reversals,
-- and atomic completion/cancellation of production runs.

-- ============================================================================
-- 1. private.convert_to_base_unit
-- ============================================================================
CREATE OR REPLACE FUNCTION private.convert_to_base_unit(
    p_business_id uuid,
    p_item_id uuid,
    p_quantity numeric,
    p_unit_id uuid,
    p_item_unit_conversion_id uuid DEFAULT NULL
)
RETURNS TABLE (
    quantity_base numeric(30,12),
    base_unit_id uuid,
    conversion_factor numeric(30,12),
    is_approximate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_base_unit_id uuid;
    v_item_dim_id uuid;
    v_unit_dim_id uuid;
    v_unit_factor numeric(30,12);
    v_base_factor numeric(30,12);
    v_qty_in_unit numeric(30,12);
    v_effective_unit_id uuid;
    v_conv_qty numeric(30,12);
    v_conv_unit_id uuid;
    v_density_rec record;
    v_from_dim_code text;
    v_to_dim_code text;
    v_calc_base numeric(30,12);
    v_is_approx boolean := false;
    v_calc_factor numeric(30,12);
    v_den_vol_factor numeric(30,12);
    v_den_mass_factor numeric(30,12);
    v_qty_in_den_vol numeric(30,12);
    v_qty_in_den_mass numeric(30,12);
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Conversion quantity must be positive' USING ERRCODE = 'P0001';
    END IF;

    -- Look up item and its canonical base unit
    SELECT i.base_unit_id, u.dimension_id, u.factor_to_base
    INTO v_base_unit_id, v_item_dim_id, v_base_factor
    FROM public.items i
    JOIN public.units u ON u.id = i.base_unit_id
    WHERE i.id = p_item_id AND i.business_id = p_business_id;

    IF v_base_unit_id IS NULL THEN
        RAISE EXCEPTION 'Item % not found in business %', p_item_id, p_business_id USING ERRCODE = 'P0002';
    END IF;

    -- Case A: item_unit_conversion_id provided (e.g. 2 costales -> intermediate unit)
    IF p_item_unit_conversion_id IS NOT NULL THEN
        SELECT iuc.quantity, iuc.unit_id
        INTO v_conv_qty, v_conv_unit_id
        FROM public.item_unit_conversions iuc
        WHERE iuc.id = p_item_unit_conversion_id
          AND iuc.item_id = p_item_id
          AND iuc.business_id = p_business_id
          AND iuc.is_active IS TRUE;

        IF v_conv_qty IS NULL THEN
            RAISE EXCEPTION 'Active item unit conversion % not found for item %', p_item_unit_conversion_id, p_item_id
                USING ERRCODE = 'P0002';
        END IF;

        v_qty_in_unit := p_quantity * v_conv_qty;
        v_effective_unit_id := v_conv_unit_id;
    ELSE
        IF p_unit_id IS NULL THEN
            RAISE EXCEPTION 'Unit must be specified when no item conversion is provided' USING ERRCODE = 'P0001';
        END IF;
        v_qty_in_unit := p_quantity;
        v_effective_unit_id := p_unit_id;
    END IF;

    -- Look up dimension and factor_to_base of effective unit
    SELECT u.dimension_id, u.factor_to_base, d.code
    INTO v_unit_dim_id, v_unit_factor, v_from_dim_code
    FROM public.units u
    JOIN public.unit_dimensions d ON d.id = u.dimension_id
    WHERE u.id = v_effective_unit_id;

    IF v_unit_dim_id IS NULL THEN
        RAISE EXCEPTION 'Unit % not found', v_effective_unit_id USING ERRCODE = 'P0002';
    END IF;

    SELECT d.code INTO v_to_dim_code
    FROM public.unit_dimensions d
    WHERE d.id = v_item_dim_id;

    -- Case B: Same dimension -> Universal conversion
    IF v_unit_dim_id = v_item_dim_id THEN
        v_calc_base := (v_qty_in_unit * v_unit_factor) / v_base_factor;
        v_is_approx := false;
    ELSE
        -- Case C: Cross-dimensional mass <-> volume conversion via item_densities (ADR-031)
        IF (v_from_dim_code = 'volume' AND v_to_dim_code = 'mass') OR
           (v_from_dim_code = 'mass' AND v_to_dim_code = 'volume') THEN

            SELECT den.id, den.mass_unit_id, den.volume_unit_id, den.density_factor, den.is_approximate
            INTO v_density_rec
            FROM public.item_densities den
            WHERE den.item_id = p_item_id
              AND den.business_id = p_business_id
              AND den.is_active IS TRUE
            LIMIT 1;

            IF v_density_rec.id IS NULL THEN
                RAISE EXCEPTION 'Unit dimension mismatch: item % has no active density factor to convert between % and %',
                    p_item_id, v_from_dim_code, v_to_dim_code USING ERRCODE = 'P0003';
            END IF;

            v_is_approx := v_density_rec.is_approximate;

            SELECT factor_to_base INTO v_den_vol_factor
            FROM public.units WHERE id = v_density_rec.volume_unit_id;

            SELECT factor_to_base INTO v_den_mass_factor
            FROM public.units WHERE id = v_density_rec.mass_unit_id;

            IF v_from_dim_code = 'volume' AND v_to_dim_code = 'mass' THEN
                -- Volume -> Mass
                v_qty_in_den_vol := (v_qty_in_unit * v_unit_factor) / v_den_vol_factor;
                v_qty_in_den_mass := v_qty_in_den_vol * v_density_rec.density_factor;
                v_calc_base := (v_qty_in_den_mass * v_den_mass_factor) / v_base_factor;
            ELSE
                -- Mass -> Volume
                v_qty_in_den_mass := (v_qty_in_unit * v_unit_factor) / v_den_mass_factor;
                v_qty_in_den_vol := v_qty_in_den_mass / v_density_rec.density_factor;
                v_calc_base := (v_qty_in_den_vol * v_den_vol_factor) / v_base_factor;
            END IF;
        ELSE
            RAISE EXCEPTION 'Unit dimension mismatch: cannot convert between % and %', v_from_dim_code, v_to_dim_code
                USING ERRCODE = 'P0003';
        END IF;
    END IF;

    v_calc_factor := v_calc_base / p_quantity;

    RETURN QUERY SELECT v_calc_base, v_base_unit_id, v_calc_factor, v_is_approx;
END;
$$;


-- ============================================================================
-- 2. public.create_purchase_receipt (ADR-029)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_purchase_receipt(
    p_business_id uuid,
    p_item_id uuid,
    p_quantity numeric,
    p_unit_id uuid DEFAULT NULL,
    p_item_unit_conversion_id uuid DEFAULT NULL,
    p_movement_date timestamptz DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_purchasable boolean;
    v_track_inv boolean;
    v_conv record;
    v_movement_id uuid;
    v_date timestamptz;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: user is not authenticated' USING ERRCODE = '28000';
    END IF;

    IF NOT private.is_business_member(p_business_id) THEN
        RAISE EXCEPTION 'Forbidden: user is not a member of business %', p_business_id USING ERRCODE = '42501';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Purchase receipt quantity must be positive' USING ERRCODE = 'P0001';
    END IF;

    SELECT purchasable, track_inventory
    INTO v_purchasable, v_track_inv
    FROM public.items
    WHERE id = p_item_id AND business_id = p_business_id;

    IF v_purchasable IS NULL THEN
        RAISE EXCEPTION 'Item % not found in business %', p_item_id, p_business_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_purchasable THEN
        RAISE EXCEPTION 'Item % is not purchasable', p_item_id USING ERRCODE = 'P0001';
    END IF;

    -- Calculate base quantity and conversion factor
    SELECT * INTO v_conv
    FROM private.convert_to_base_unit(
        p_business_id,
        p_item_id,
        p_quantity,
        p_unit_id,
        p_item_unit_conversion_id
    );

    v_movement_id := gen_random_uuid();
    v_date := COALESCE(p_movement_date, pg_catalog.now());

    INSERT INTO public.inventory_movements (
        id,
        business_id,
        item_id,
        movement_type,
        quantity_captured,
        captured_unit_id,
        item_unit_conversion_id,
        quantity_base,
        base_unit_id,
        conversion_factor,
        is_approximate,
        movement_date,
        notes,
        created_at,
        created_by
    ) VALUES (
        v_movement_id,
        p_business_id,
        p_item_id,
        'purchase_receipt',
        p_quantity,
        p_unit_id,
        p_item_unit_conversion_id,
        v_conv.quantity_base,
        v_conv.base_unit_id,
        v_conv.conversion_factor,
        v_conv.is_approximate,
        v_date,
        p_notes,
        pg_catalog.now(),
        v_user_id
    );

    RETURN v_movement_id;
END;
$$;


-- ============================================================================
-- 3. public.create_inventory_adjustment (ADR-002, ADR-003)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_inventory_adjustment(
    p_business_id uuid,
    p_item_id uuid,
    p_quantity numeric,
    p_unit_id uuid DEFAULT NULL,
    p_item_unit_conversion_id uuid DEFAULT NULL,
    p_movement_date timestamptz DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_item_exists boolean;
    v_conv record;
    v_movement_id uuid;
    v_date timestamptz;
    v_sign numeric := 1;
    v_abs_qty numeric;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: user is not authenticated' USING ERRCODE = '28000';
    END IF;

    IF NOT private.is_business_member(p_business_id) THEN
        RAISE EXCEPTION 'Forbidden: user is not a member of business %', p_business_id USING ERRCODE = '42501';
    END IF;

    IF p_quantity = 0 THEN
        RAISE EXCEPTION 'Inventory adjustment quantity cannot be zero' USING ERRCODE = 'P0001';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.items WHERE id = p_item_id AND business_id = p_business_id
    ) INTO v_item_exists;

    IF NOT v_item_exists THEN
        RAISE EXCEPTION 'Item % not found in business %', p_item_id, p_business_id USING ERRCODE = 'P0002';
    END IF;

    IF p_quantity < 0 THEN
        v_sign := -1;
        v_abs_qty := -1 * p_quantity;
    ELSE
        v_abs_qty := p_quantity;
    END IF;

    SELECT * INTO v_conv
    FROM private.convert_to_base_unit(
        p_business_id,
        p_item_id,
        v_abs_qty,
        p_unit_id,
        p_item_unit_conversion_id
    );

    v_movement_id := gen_random_uuid();
    v_date := COALESCE(p_movement_date, pg_catalog.now());

    INSERT INTO public.inventory_movements (
        id,
        business_id,
        item_id,
        movement_type,
        quantity_captured,
        captured_unit_id,
        item_unit_conversion_id,
        quantity_base,
        base_unit_id,
        conversion_factor,
        is_approximate,
        movement_date,
        notes,
        created_at,
        created_by
    ) VALUES (
        v_movement_id,
        p_business_id,
        p_item_id,
        'inventory_adjustment',
        p_quantity,
        p_unit_id,
        p_item_unit_conversion_id,
        v_sign * v_conv.quantity_base,
        v_conv.base_unit_id,
        v_conv.conversion_factor,
        v_conv.is_approximate,
        v_date,
        p_notes,
        pg_catalog.now(),
        v_user_id
    );

    RETURN v_movement_id;
END;
$$;


-- ============================================================================
-- 3b. public.create_initial_inventory_balance (ADR-003, ADR-010)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_initial_inventory_balance(
    p_business_id uuid,
    p_item_id uuid,
    p_quantity numeric,
    p_unit_id uuid DEFAULT NULL,
    p_item_unit_conversion_id uuid DEFAULT NULL,
    p_movement_date timestamptz DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_track_inv boolean;
    v_conv record;
    v_movement_id uuid;
    v_date timestamptz;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: user is not authenticated' USING ERRCODE = '28000';
    END IF;

    IF NOT private.is_business_member(p_business_id) THEN
        RAISE EXCEPTION 'Forbidden: user is not a member of business %', p_business_id USING ERRCODE = '42501';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Initial balance quantity must be positive' USING ERRCODE = 'P0001';
    END IF;

    SELECT i.track_inventory
    INTO v_track_inv
    FROM public.items i
    WHERE i.id = p_item_id AND i.business_id = p_business_id;

    IF v_track_inv IS NULL THEN
        RAISE EXCEPTION 'Item % not found in business %', p_item_id, p_business_id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_conv
    FROM private.convert_to_base_unit(
        p_business_id,
        p_item_id,
        p_quantity,
        p_unit_id,
        p_item_unit_conversion_id
    );

    v_movement_id := gen_random_uuid();
    v_date := COALESCE(p_movement_date, pg_catalog.now());

    INSERT INTO public.inventory_movements (
        id,
        business_id,
        item_id,
        movement_type,
        quantity_captured,
        captured_unit_id,
        item_unit_conversion_id,
        quantity_base,
        base_unit_id,
        conversion_factor,
        is_approximate,
        movement_date,
        notes,
        created_at,
        created_by
    ) VALUES (
        v_movement_id,
        p_business_id,
        p_item_id,
        'initial_balance',
        p_quantity,
        p_unit_id,
        p_item_unit_conversion_id,
        v_conv.quantity_base,
        v_conv.base_unit_id,
        v_conv.conversion_factor,
        v_conv.is_approximate,
        v_date,
        COALESCE(p_notes, 'Initial inventory balance'),
        pg_catalog.now(),
        v_user_id
    );

    RETURN v_movement_id;
END;
$$;


-- ============================================================================
-- 4. public.reverse_inventory_movement (ADR-002, ADR-003)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reverse_inventory_movement(
    p_movement_id uuid,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_orig record;
    v_reversal_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: user is not authenticated' USING ERRCODE = '28000';
    END IF;

    -- Lock original movement row
    SELECT * INTO v_orig
    FROM public.inventory_movements
    WHERE id = p_movement_id
    FOR UPDATE;

    IF v_orig.id IS NULL THEN
        RAISE EXCEPTION 'Inventory movement % not found', p_movement_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT private.is_business_member(v_orig.business_id) THEN
        RAISE EXCEPTION 'Forbidden: user is not a member of business %', v_orig.business_id USING ERRCODE = '42501';
    END IF;

    -- Cannot reverse a reversal
    IF v_orig.movement_type = 'reversal' THEN
        RAISE EXCEPTION 'Cannot reverse a reversal movement' USING ERRCODE = 'P0001';
    END IF;

    -- Cannot reverse if already reversed
    IF EXISTS (
        SELECT 1 FROM public.inventory_movements
        WHERE reversal_of_movement_id = p_movement_id
    ) THEN
        RAISE EXCEPTION 'Movement % has already been reversed', p_movement_id USING ERRCODE = 'P0001';
    END IF;

    v_reversal_id := gen_random_uuid();

    INSERT INTO public.inventory_movements (
        id,
        business_id,
        item_id,
        movement_type,
        quantity_captured,
        captured_unit_id,
        item_unit_conversion_id,
        quantity_base,
        base_unit_id,
        conversion_factor,
        is_approximate,
        reversal_of_movement_id,
        movement_date,
        notes,
        created_at,
        created_by
    ) VALUES (
        v_reversal_id,
        v_orig.business_id,
        v_orig.item_id,
        'reversal',
        -1 * v_orig.quantity_captured,
        v_orig.captured_unit_id,
        v_orig.item_unit_conversion_id,
        -1 * v_orig.quantity_base,
        v_orig.base_unit_id,
        v_orig.conversion_factor,
        v_orig.is_approximate,
        p_movement_id,
        pg_catalog.now(),
        COALESCE(p_notes, 'Reversal of movement ' || p_movement_id::text),
        pg_catalog.now(),
        v_user_id
    );

    RETURN v_reversal_id;
END;
$$;


-- ============================================================================
-- 5. public.complete_production_run (ADR-026, ADR-027, ADR-030)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_production_run(
    p_run_id uuid,
    p_actual_yield_quantity numeric,
    p_actual_yield_unit_id uuid,
    p_completed_at timestamptz DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_run record;
    v_output_item_id uuid;
    v_input_rec record;
    v_conv record;
    v_yield_conv record;
    v_movements_count integer := 0;
    v_completed_time timestamptz;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: user is not authenticated' USING ERRCODE = '28000';
    END IF;

    -- Lock parent run to serialize completion and input changes
    SELECT * INTO v_run
    FROM public.production_runs
    WHERE id = p_run_id
    FOR UPDATE;

    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Production run % not found', p_run_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT private.is_business_member(v_run.business_id) THEN
        RAISE EXCEPTION 'Forbidden: user is not a member of business %', v_run.business_id USING ERRCODE = '42501';
    END IF;

    -- Idempotent check
    IF v_run.status = 'completed' THEN
        RETURN jsonb_build_object(
            'status', 'completed',
            'run_id', p_run_id,
            'idempotent', true,
            'message', 'Production run is already completed'
        );
    END IF;

    IF v_run.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot complete a cancelled production run' USING ERRCODE = 'P0001';
    END IF;

    IF p_actual_yield_quantity < 0 THEN
        RAISE EXCEPTION 'Actual yield quantity must be non-negative' USING ERRCODE = 'P0001';
    END IF;

    IF p_actual_yield_unit_id IS NULL THEN
        RAISE EXCEPTION 'Actual yield unit must be specified' USING ERRCODE = 'P0001';
    END IF;

    -- Invariant: All inputs must have actual_quantity resolved before completing
    IF EXISTS (
        SELECT 1 FROM public.production_run_inputs
        WHERE production_run_id = p_run_id AND actual_quantity IS NULL
    ) THEN
        RAISE EXCEPTION 'All production run inputs must have actual_quantity resolved before completing the run'
            USING ERRCODE = 'P0001';
    END IF;

    -- Look up recipe output item
    SELECT r.output_item_id INTO v_output_item_id
    FROM public.recipes r
    JOIN public.recipe_versions rv ON rv.recipe_id = r.id
    WHERE rv.id = v_run.recipe_version_id;

    IF v_output_item_id IS NULL THEN
        RAISE EXCEPTION 'Output item not found for recipe version %', v_run.recipe_version_id USING ERRCODE = 'P0002';
    END IF;

    v_completed_time := COALESCE(p_completed_at, pg_catalog.now());

    -- 1. Generate Kardex inputs for all production_run_inputs with actual_quantity > 0
    FOR v_input_rec IN
        SELECT id, item_id, actual_quantity, actual_unit_id
        FROM public.production_run_inputs
        WHERE production_run_id = p_run_id
          AND actual_quantity > 0
        ORDER BY position ASC, id ASC
    LOOP
        SELECT * INTO v_conv
        FROM private.convert_to_base_unit(
            v_run.business_id,
            v_input_rec.item_id,
            v_input_rec.actual_quantity,
            v_input_rec.actual_unit_id,
            NULL
        );

        INSERT INTO public.inventory_movements (
            business_id,
            item_id,
            movement_type,
            quantity_captured,
            captured_unit_id,
            item_unit_conversion_id,
            quantity_base,
            base_unit_id,
            conversion_factor,
            is_approximate,
            production_run_id,
            production_run_input_id,
            movement_date,
            notes,
            created_at,
            created_by
        ) VALUES (
            v_run.business_id,
            v_input_rec.item_id,
            'production_input',
            -1 * v_input_rec.actual_quantity,
            v_input_rec.actual_unit_id,
            NULL,
            -1 * v_conv.quantity_base,
            v_conv.base_unit_id,
            v_conv.conversion_factor,
            v_conv.is_approximate,
            p_run_id,
            v_input_rec.id,
            v_completed_time,
            'Input consumption for production run ' || p_run_id::text,
            pg_catalog.now(),
            v_user_id
        );

        v_movements_count := v_movements_count + 1;
    END LOOP;

    -- 2. Generate Kardex output if actual_yield_quantity > 0 (can be 0 for failed batch)
    IF p_actual_yield_quantity > 0 THEN
        SELECT * INTO v_yield_conv
        FROM private.convert_to_base_unit(
            v_run.business_id,
            v_output_item_id,
            p_actual_yield_quantity,
            p_actual_yield_unit_id,
            NULL
        );

        INSERT INTO public.inventory_movements (
            business_id,
            item_id,
            movement_type,
            quantity_captured,
            captured_unit_id,
            item_unit_conversion_id,
            quantity_base,
            base_unit_id,
            conversion_factor,
            is_approximate,
            production_run_id,
            movement_date,
            notes,
            created_at,
            created_by
        ) VALUES (
            v_run.business_id,
            v_output_item_id,
            'production_output',
            p_actual_yield_quantity,
            p_actual_yield_unit_id,
            NULL,
            v_yield_conv.quantity_base,
            v_yield_conv.base_unit_id,
            v_yield_conv.conversion_factor,
            v_yield_conv.is_approximate,
            p_run_id,
            v_completed_time,
            'Production output for run ' || p_run_id::text,
            pg_catalog.now(),
            v_user_id
        );

        v_movements_count := v_movements_count + 1;
    END IF;

    -- 3. Update production_run status and yield
    UPDATE public.production_runs
    SET status = 'completed',
        actual_yield_quantity = p_actual_yield_quantity,
        actual_yield_unit_id = p_actual_yield_unit_id,
        completed_at = v_completed_time,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'status', 'completed',
        'run_id', p_run_id,
        'movements_count', v_movements_count,
        'actual_yield_quantity', p_actual_yield_quantity,
        'idempotent', false
    );
END;
$$;


-- ============================================================================
-- 6. public.cancel_production_run (Ajuste 3)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_production_run(
    p_run_id uuid,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
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
    WHERE id = p_run_id
    FOR UPDATE;

    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Production run % not found', p_run_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT private.is_business_member(v_run.business_id) THEN
        RAISE EXCEPTION 'Forbidden: user is not a member of business %', v_run.business_id USING ERRCODE = '42501';
    END IF;

    -- Idempotent check
    IF v_run.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'status', 'cancelled',
            'run_id', p_run_id,
            'idempotent', true,
            'message', 'Production run is already cancelled'
        );
    END IF;

    IF v_run.status = 'completed' THEN
        RAISE EXCEPTION 'Cannot cancel a completed production run' USING ERRCODE = 'P0001';
    END IF;

    -- Invariant Ajuste 3: Cancelled cannot hide physical consumption
    IF EXISTS (
        SELECT 1 FROM public.production_run_inputs
        WHERE production_run_id = p_run_id AND actual_quantity > 0
    ) THEN
        RAISE EXCEPTION 'Cannot cancel production run with existing physical consumptions' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.inventory_movements
        WHERE production_run_id = p_run_id
    ) THEN
        RAISE EXCEPTION 'Cannot cancel production run with existing inventory movements' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.production_runs
    SET status = 'cancelled',
        notes = COALESCE(p_notes, notes)
    WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'status', 'cancelled',
        'run_id', p_run_id,
        'idempotent', false
    );
END;
$$;

-- Security hardening on RPC executions
REVOKE ALL ON FUNCTION public.create_purchase_receipt FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_inventory_adjustment FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_initial_inventory_balance FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_inventory_movement FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_production_run FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_production_run FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_purchase_receipt TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_inventory_adjustment TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_initial_inventory_balance TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_inventory_movement TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_production_run TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_production_run TO authenticated;
