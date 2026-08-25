-- Migration: 20260818000002_create_recipe_draft_lifecycle_rpcs.sql
-- Description: M1D Database RPCs for atomic draft creation, snapshot saving with stable IDs, and serialized publishing with timezone awareness.

-- Grant USAGE on private schema and security helper functions to authenticated for SECURITY INVOKER RPCs
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_business_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_business_member(uuid) TO authenticated;

-- 1. public.create_recipe_draft_from_version
CREATE OR REPLACE FUNCTION public.create_recipe_draft_from_version(
    p_source_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_business_id uuid;
    v_recipe_id uuid;
    v_source_status text;
    v_source_yield numeric(30,12);
    v_source_yield_unit_id uuid;
    v_source_portion numeric(30,12);
    v_source_portion_unit_id uuid;
    v_source_yield_desc text;
    v_source_notes text;
    v_existing_draft_id uuid;
    v_existing_version_num integer;
    v_draft_count integer;
    v_next_version_num integer;
    v_new_draft_id uuid;
    v_input_rec record;
    v_new_input_id uuid;
    v_mapping jsonb := '{}'::jsonb;
BEGIN
    -- 1. Identify source recipe version and its recipe & business
    SELECT rv.business_id, rv.recipe_id, rv.status,
           rv.reference_yield_quantity, rv.reference_yield_unit_id,
           rv.portion_quantity, rv.portion_unit_id,
           rv.yield_description, rv.notes
    INTO v_business_id, v_recipe_id, v_source_status,
         v_source_yield, v_source_yield_unit_id,
         v_source_portion, v_source_portion_unit_id,
         v_source_yield_desc, v_source_notes
    FROM public.recipe_versions rv
    WHERE rv.id = p_source_version_id;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Source recipe version % not found', p_source_version_id;
    END IF;

    -- 2. Authorization check
    IF NOT private.has_business_role(v_business_id, ARRAY['owner', 'admin']) THEN
        RAISE EXCEPTION 'Unauthorized: only owner or admin can create recipe drafts';
    END IF;

    -- 3. Source status validation: source version MUST be 'active' in M1D
    IF v_source_status <> 'active' THEN
        RAISE EXCEPTION 'Source version must be active to create a new draft. Status: %', v_source_status;
    END IF;

    -- 4. Lock the parent recipe row to serialize draft operations
    PERFORM 1 FROM public.recipes WHERE id = v_recipe_id FOR UPDATE;

    -- 5. Check existing drafts count for this recipe
    SELECT count(*), min(version_number)
    INTO v_draft_count, v_existing_version_num
    FROM public.recipe_versions
    WHERE recipe_id = v_recipe_id AND status = 'draft';

    IF v_draft_count > 1 THEN
        RAISE EXCEPTION 'Inconsistent state: multiple draft versions exist for recipe %', v_recipe_id;
    END IF;

    IF v_draft_count = 1 THEN
        SELECT id INTO v_existing_draft_id
        FROM public.recipe_versions
        WHERE recipe_id = v_recipe_id AND status = 'draft'
        LIMIT 1;

        -- Return existing draft idempotently
        RETURN jsonb_build_object(
            'draft_version_id', v_existing_draft_id,
            'is_new', false,
            'version_number', v_existing_version_num
        );
    END IF;

    -- 6. Calculate next version number
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_version_num
    FROM public.recipe_versions
    WHERE recipe_id = v_recipe_id;

    -- 7. Insert new draft version
    v_new_draft_id := gen_random_uuid();
    INSERT INTO public.recipe_versions (
        id,
        business_id,
        recipe_id,
        version_number,
        status,
        reference_yield_quantity,
        reference_yield_unit_id,
        portion_quantity,
        portion_unit_id,
        yield_description,
        change_reason,
        notes,
        effective_from,
        created_by
    ) VALUES (
        v_new_draft_id,
        v_business_id,
        v_recipe_id,
        v_next_version_num,
        'draft',
        v_source_yield,
        v_source_yield_unit_id,
        v_source_portion,
        v_source_portion_unit_id,
        v_source_yield_desc,
        NULL,
        v_source_notes,
        NULL,
        auth.uid()
    );

    -- 8. Clone recipe_inputs and build id mapping old_input_id -> new_input_id
    FOR v_input_rec IN
        SELECT id, item_id, position, quantity_mode, quantity, unit_id, percentage, costing_source, notes
        FROM public.recipe_inputs
        WHERE recipe_version_id = p_source_version_id
        ORDER BY position ASC
    LOOP
        v_new_input_id := gen_random_uuid();
        v_mapping := v_mapping || jsonb_build_object(v_input_rec.id::text, v_new_input_id::text);

        INSERT INTO public.recipe_inputs (
            id,
            business_id,
            recipe_version_id,
            item_id,
            position,
            quantity_mode,
            quantity,
            unit_id,
            percentage,
            costing_source,
            notes
        ) VALUES (
            v_new_input_id,
            v_business_id,
            v_new_draft_id,
            v_input_rec.item_id,
            v_input_rec.position,
            v_input_rec.quantity_mode,
            v_input_rec.quantity,
            v_input_rec.unit_id,
            v_input_rec.percentage,
            v_input_rec.costing_source,
            v_input_rec.notes
        );
    END LOOP;

    -- 9. Clone recipe_input_percentage_bases using mapping
    INSERT INTO public.recipe_input_percentage_bases (
        business_id,
        recipe_version_id,
        percentage_input_id,
        basis_input_id
    )
    SELECT
        v_business_id,
        v_new_draft_id,
        (v_mapping->>pb.percentage_input_id::text)::uuid,
        (v_mapping->>pb.basis_input_id::text)::uuid
    FROM public.recipe_input_percentage_bases pb
    WHERE pb.recipe_version_id = p_source_version_id;

    RETURN jsonb_build_object(
        'draft_version_id', v_new_draft_id,
        'is_new', true,
        'version_number', v_next_version_num
    );
END;
$$;

-- 2. public.save_recipe_draft
CREATE OR REPLACE FUNCTION public.save_recipe_draft(
    p_recipe_version_id uuid,
    p_yield_data jsonb,
    p_inputs jsonb,
    p_percentage_bases jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_business_id uuid;
    v_recipe_id uuid;
    v_status text;
    v_ref_yield numeric(30,12);
    v_ref_yield_unit_id uuid;
    v_portion numeric(30,12);
    v_portion_unit_id uuid;
    v_yield_desc text;
    v_notes text;
    v_input jsonb;
    v_input_id uuid;
    v_item_id uuid;
    v_pos integer;
    v_mode text;
    v_qty numeric(30,12);
    v_unit_id uuid;
    v_pct numeric(30,12);
    v_cost_src text;
    v_inp_notes text;
    v_pb jsonb;
    v_pct_input_id uuid;
    v_basis_input_id uuid;
    v_existing_input_ids uuid[];
    v_sent_input_ids uuid[] := '{}';
BEGIN
    -- 1. Identify draft version and tenant
    SELECT rv.business_id, rv.recipe_id, rv.status
    INTO v_business_id, v_recipe_id, v_status
    FROM public.recipe_versions rv
    WHERE rv.id = p_recipe_version_id;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Recipe version % not found', p_recipe_version_id;
    END IF;

    -- 2. Authorization check
    IF NOT private.has_business_role(v_business_id, ARRAY['owner', 'admin']) THEN
        RAISE EXCEPTION 'Unauthorized: only owner or admin can save recipe drafts';
    END IF;

    -- 3. Validate draft status
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'Cannot save: recipe version % is not in draft status (status=%)', p_recipe_version_id, v_status;
    END IF;

    -- 4. Lock the draft version row
    PERFORM 1 FROM public.recipe_versions WHERE id = p_recipe_version_id FOR UPDATE;

    -- 5. Extract and validate yield parameters
    BEGIN
        v_ref_yield := (p_yield_data->>'reference_yield_quantity')::numeric(30,12);
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid reference_yield_quantity numeric format';
    END;

    IF v_ref_yield IS NULL OR v_ref_yield <= 0 THEN
        RAISE EXCEPTION 'reference_yield_quantity must be strictly greater than zero';
    END IF;

    v_ref_yield_unit_id := (p_yield_data->>'reference_yield_unit_id')::uuid;
    IF v_ref_yield_unit_id IS NULL THEN
        RAISE EXCEPTION 'reference_yield_unit_id is required';
    END IF;

    IF (p_yield_data->>'portion_quantity') IS NOT NULL AND trim(p_yield_data->>'portion_quantity') <> '' THEN
        BEGIN
            v_portion := (p_yield_data->>'portion_quantity')::numeric(30,12);
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid portion_quantity numeric format';
        END;
        IF v_portion <= 0 THEN
            RAISE EXCEPTION 'portion_quantity must be strictly greater than zero';
        END IF;
        v_portion_unit_id := (p_yield_data->>'portion_unit_id')::uuid;
        IF v_portion_unit_id IS NULL THEN
            RAISE EXCEPTION 'portion_unit_id is required when portion_quantity is set';
        END IF;
    ELSE
        v_portion := NULL;
        v_portion_unit_id := NULL;
    END IF;

    v_yield_desc := p_yield_data->>'yield_description';
    v_notes := p_yield_data->>'notes';

    -- Update recipe_versions editable fields
    UPDATE public.recipe_versions
    SET reference_yield_quantity = v_ref_yield,
        reference_yield_unit_id = v_ref_yield_unit_id,
        portion_quantity = v_portion,
        portion_unit_id = v_portion_unit_id,
        yield_description = v_yield_desc,
        notes = v_notes,
        updated_at = now()
    WHERE id = p_recipe_version_id;

    -- 6. Temporarily delete all percentage bases for this draft
    DELETE FROM public.recipe_input_percentage_bases
    WHERE recipe_version_id = p_recipe_version_id;

    -- 7. Collect all existing input IDs currently in DB for this draft
    SELECT COALESCE(array_agg(id), '{}') INTO v_existing_input_ids
    FROM public.recipe_inputs
    WHERE recipe_version_id = p_recipe_version_id;

    -- 8. Reconcile recipe_inputs from p_inputs JSONB array
    IF p_inputs IS NOT NULL AND jsonb_typeof(p_inputs) = 'array' THEN
        FOR v_input IN SELECT * FROM jsonb_array_elements(p_inputs)
        LOOP
            v_input_id := (v_input->>'id')::uuid;
            IF v_input_id IS NULL THEN
                v_input_id := gen_random_uuid();
            END IF;

            v_item_id := (v_input->>'item_id')::uuid;
            IF v_item_id IS NULL THEN
                RAISE EXCEPTION 'item_id is required for recipe input';
            END IF;

            -- Validate item belongs to this business
            IF NOT EXISTS (SELECT 1 FROM public.items WHERE id = v_item_id AND business_id = v_business_id) THEN
                RAISE EXCEPTION 'Item % does not belong to business %', v_item_id, v_business_id;
            END IF;

            v_pos := COALESCE((v_input->>'position')::integer, 0);
            v_mode := v_input->>'quantity_mode';
            IF v_mode NOT IN ('absolute', 'percentage') THEN
                RAISE EXCEPTION 'Invalid quantity_mode % for input %', v_mode, v_input_id;
            END IF;

            IF v_mode = 'absolute' THEN
                BEGIN
                    v_qty := (v_input->>'quantity')::numeric(30,12);
                EXCEPTION WHEN OTHERS THEN
                    RAISE EXCEPTION 'Invalid input quantity numeric format';
                END;
                IF v_qty IS NULL OR v_qty <= 0 THEN
                    RAISE EXCEPTION 'Quantity must be greater than zero for absolute input %', v_input_id;
                END IF;
                v_unit_id := (v_input->>'unit_id')::uuid;
                IF v_unit_id IS NULL THEN
                    RAISE EXCEPTION 'unit_id is required for absolute input %', v_input_id;
                END IF;
                v_pct := NULL;
            ELSE
                BEGIN
                    v_pct := (v_input->>'percentage')::numeric(30,12);
                EXCEPTION WHEN OTHERS THEN
                    RAISE EXCEPTION 'Invalid input percentage numeric format';
                END;
                IF v_pct IS NULL OR v_pct <= 0 THEN
                    RAISE EXCEPTION 'Percentage must be greater than zero for percentage input %', v_input_id;
                END IF;
                v_qty := NULL;
                v_unit_id := NULL;
            END IF;

            v_cost_src := v_input->>'costing_source';
            IF v_cost_src IS NOT NULL AND v_cost_src NOT IN ('purchased', 'produced') THEN
                RAISE EXCEPTION 'Invalid costing_source %', v_cost_src;
            END IF;

            v_inp_notes := v_input->>'notes';

            v_sent_input_ids := array_append(v_sent_input_ids, v_input_id);

            IF v_input_id = ANY(v_existing_input_ids) THEN
                -- UPDATE existing input
                UPDATE public.recipe_inputs
                SET item_id = v_item_id,
                    position = v_pos,
                    quantity_mode = v_mode,
                    quantity = v_qty,
                    unit_id = v_unit_id,
                    percentage = v_pct,
                    costing_source = v_cost_src,
                    notes = v_inp_notes,
                    updated_at = now()
                WHERE id = v_input_id AND recipe_version_id = p_recipe_version_id;
            ELSE
                -- Validate that this new v_input_id is not already taken by another version or business
                IF EXISTS (SELECT 1 FROM public.recipe_inputs WHERE id = v_input_id) THEN
                    RAISE EXCEPTION 'Input UUID % is already used in another record', v_input_id;
                END IF;

                -- INSERT new input with stable UUID
                INSERT INTO public.recipe_inputs (
                    id,
                    business_id,
                    recipe_version_id,
                    item_id,
                    position,
                    quantity_mode,
                    quantity,
                    unit_id,
                    percentage,
                    costing_source,
                    notes
                ) VALUES (
                    v_input_id,
                    v_business_id,
                    p_recipe_version_id,
                    v_item_id,
                    v_pos,
                    v_mode,
                    v_qty,
                    v_unit_id,
                    v_pct,
                    v_cost_src,
                    v_inp_notes
                );
            END IF;
        END LOOP;
    END IF;

    -- Delete inputs that exist in DB but were not included in p_inputs
    DELETE FROM public.recipe_inputs
    WHERE recipe_version_id = p_recipe_version_id
      AND NOT (id = ANY(v_sent_input_ids));

    -- 9. Recreate recipe_input_percentage_bases from p_percentage_bases JSONB array
    IF p_percentage_bases IS NOT NULL AND jsonb_typeof(p_percentage_bases) = 'array' THEN
        FOR v_pb IN SELECT * FROM jsonb_array_elements(p_percentage_bases)
        LOOP
            v_pct_input_id := (v_pb->>'percentage_input_id')::uuid;
            v_basis_input_id := (v_pb->>'basis_input_id')::uuid;

            IF v_pct_input_id IS NULL OR v_basis_input_id IS NULL THEN
                RAISE EXCEPTION 'percentage_input_id and basis_input_id are required in percentage_bases';
            END IF;

            -- Validate both inputs belong to this recipe draft
            IF NOT (v_pct_input_id = ANY(v_sent_input_ids)) OR NOT (v_basis_input_id = ANY(v_sent_input_ids)) THEN
                RAISE EXCEPTION 'Percentage base inputs (% -> %) must exist in the saved draft inputs', v_pct_input_id, v_basis_input_id;
            END IF;

            INSERT INTO public.recipe_input_percentage_bases (
                business_id,
                recipe_version_id,
                percentage_input_id,
                basis_input_id
            ) VALUES (
                v_business_id,
                p_recipe_version_id,
                v_pct_input_id,
                v_basis_input_id
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'recipe_version_id', p_recipe_version_id,
        'saved', true
    );
END;
$$;

-- 3. public.publish_recipe_version
CREATE OR REPLACE FUNCTION public.publish_recipe_version(
    p_recipe_version_id uuid,
    p_effective_from_local timestamp without time zone,
    p_change_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_business_id uuid;
    v_recipe_id uuid;
    v_status text;
    v_version_number integer;
    v_timezone text;
    v_effective_from timestamptz;
    v_current_active_id uuid;
BEGIN
    -- 1. Identify draft version, recipe, business, and business timezone
    SELECT rv.business_id, rv.recipe_id, rv.status, rv.version_number, b.timezone
    INTO v_business_id, v_recipe_id, v_status, v_version_number, v_timezone
    FROM public.recipe_versions rv
    JOIN public.recipes r ON r.id = rv.recipe_id
    JOIN public.businesses b ON b.id = r.business_id
    WHERE rv.id = p_recipe_version_id;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Recipe version % not found', p_recipe_version_id;
    END IF;

    -- 2. Authorization check
    IF NOT private.has_business_role(v_business_id, ARRAY['owner', 'admin']) THEN
        RAISE EXCEPTION 'Unauthorized: only owner or admin can publish recipe versions';
    END IF;

    -- 3. Validate status
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'Only versions in draft status can be published. Current status: %', v_status;
    END IF;

    -- 4. Validate effective_from parameter
    IF p_effective_from_local IS NULL THEN
        RAISE EXCEPTION 'p_effective_from_local is required';
    END IF;

    -- 5. Convert local timestamp to timestamptz using business timezone
    v_effective_from := p_effective_from_local AT TIME ZONE v_timezone;

    -- 6. Reject future publication date
    IF v_effective_from > clock_timestamp() THEN
        RAISE EXCEPTION 'Cannot publish recipe version with future effective_from date (effective_from: %, now: %)', v_effective_from, clock_timestamp();
    END IF;

    -- 7. Lock parent recipe row to serialize publication
    PERFORM 1 FROM public.recipes WHERE id = v_recipe_id FOR UPDATE;

    -- 8. Locate current active version
    SELECT id INTO v_current_active_id
    FROM public.recipe_versions
    WHERE recipe_id = v_recipe_id AND status = 'active';

    -- 9. Atomic transition: archive active version and activate draft
    IF v_current_active_id IS NOT NULL THEN
        UPDATE public.recipe_versions
        SET status = 'archived'
        WHERE id = v_current_active_id;
    END IF;

    -- Update draft to active with converted effective_from and change_reason
    UPDATE public.recipe_versions
    SET status = 'active',
        effective_from = v_effective_from,
        change_reason = p_change_reason
    WHERE id = p_recipe_version_id;

    RETURN jsonb_build_object(
        'recipe_version_id', p_recipe_version_id,
        'archived_version_id', v_current_active_id,
        'published', true,
        'effective_from', v_effective_from
    );
END;
$$;

-- 4. Permissions & Grants
REVOKE ALL ON FUNCTION public.create_recipe_draft_from_version(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_recipe_draft(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_recipe_version(uuid, timestamp without time zone, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_recipe_draft_from_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_recipe_draft(uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_recipe_version(uuid, timestamp without time zone, text) TO authenticated;
