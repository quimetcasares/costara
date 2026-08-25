BEGIN;

SELECT plan(28);

-- ============================================================================
-- 0. SETUP: Test Data (Businesses, Users, Units, Items, Recipe)
-- ============================================================================
DO $$
DECLARE
    v_user_owner uuid := '00000000-0000-0000-0000-0000000000a1';
    v_user_member uuid := '00000000-0000-0000-0000-0000000000a2';
    v_user_other uuid := '00000000-0000-0000-0000-0000000000b1';
    v_biz_a uuid := '11111111-1111-1111-1111-111111111111';
    v_biz_b uuid := '22222222-2222-2222-2222-222222222222';
    v_unit_g uuid;
    v_unit_kg uuid;
    v_unit_pza uuid;
    v_item_flour uuid := 'aaaaaaaa-1111-0000-0000-000000000001';
    v_item_water uuid := 'aaaaaaaa-1111-0000-0000-000000000002';
    v_item_bread uuid := 'aaaaaaaa-1111-0000-0000-000000000003';
    v_item_other uuid := 'bbbbbbbb-2222-0000-0000-000000000001';
    v_recipe_id uuid := 'aaaaaaaa-2222-0000-0000-000000000001';
    v_v1_id uuid := 'aaaaaaaa-3333-0000-0000-000000000001';
    v_inp_flour_id uuid := 'aaaaaaaa-4444-0000-0000-000000000001';
    v_inp_water_id uuid := 'aaaaaaaa-4444-0000-0000-000000000002';
BEGIN
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';
    SELECT id INTO v_unit_kg FROM public.units WHERE code = 'kg';
    SELECT id INTO v_unit_pza FROM public.units WHERE code = 'piece';

    -- Create test users in auth.users
    INSERT INTO auth.users (id, email) VALUES
        (v_user_owner, 'owner_a@test.com'),
        (v_user_member, 'member_a@test.com'),
        (v_user_other, 'owner_b@test.com')
    ON CONFLICT (id) DO NOTHING;

    -- Create test businesses
    INSERT INTO public.businesses (id, name, currency_code, timezone)
    VALUES
        (v_biz_a, 'Panadería Test A', 'MXN', 'America/Mexico_City'),
        (v_biz_b, 'Panadería Test B', 'MXN', 'America/Mexico_City')
    ON CONFLICT (id) DO NOTHING;

    -- Create memberships
    INSERT INTO public.business_members (business_id, user_id, role)
    VALUES
        (v_biz_a, v_user_owner, 'owner'),
        (v_biz_a, v_user_member, 'member'),
        (v_biz_b, v_user_other, 'owner')
    ON CONFLICT (business_id, user_id) DO NOTHING;

    -- Create items for Biz A
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable, producible, sellable)
    VALUES
        (v_item_flour, v_biz_a, 'Harina Test', 'raw_material', v_unit_g, true, false, false),
        (v_item_water, v_biz_a, 'Agua Test', 'raw_material', v_unit_g, true, false, false),
        (v_item_bread, v_biz_a, 'Pan Test', 'finished_product', v_unit_pza, false, true, true),
        (v_item_other, v_biz_b, 'Item Biz B', 'raw_material', v_unit_g, true, false, false)
    ON CONFLICT (id) DO NOTHING;

    -- Create recipe and draft v1
    INSERT INTO public.recipes (id, business_id, name, output_item_id, is_active)
    VALUES (v_recipe_id, v_biz_a, 'Receta Pan Test', v_item_bread, true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.recipe_versions (
        id, business_id, recipe_id, version_number, status,
        reference_yield_quantity, reference_yield_unit_id,
        portion_quantity, portion_unit_id, yield_description,
        notes
    ) VALUES (
        v_v1_id, v_biz_a, v_recipe_id, 1, 'draft',
        10000.0, v_unit_g,
        1000.0, v_unit_g, 'Masa cruda',
        'Notas iniciales v1'
    ) ON CONFLICT (id) DO NOTHING;

    -- Inputs for v1: Flour (absolute 10000g) and Water (percentage 70% on flour)
    INSERT INTO public.recipe_inputs (
        id, business_id, recipe_version_id, item_id, position,
        quantity_mode, quantity, unit_id, percentage, costing_source
    ) VALUES
        (v_inp_flour_id, v_biz_a, v_v1_id, v_item_flour, 1, 'absolute', 10000.0, v_unit_g, NULL, 'purchased'),
        (v_inp_water_id, v_biz_a, v_v1_id, v_item_water, 2, 'percentage', NULL, NULL, 70.0, 'purchased')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.recipe_input_percentage_bases (
        business_id, recipe_version_id, percentage_input_id, basis_input_id
    ) VALUES (
        v_biz_a, v_v1_id, v_inp_water_id, v_inp_flour_id
    ) ON CONFLICT DO NOTHING;

    -- Publish v1 to active status
    UPDATE public.recipe_versions
    SET status = 'active',
        effective_from = '2026-01-01 00:00:00+00'::timestamptz
    WHERE id = v_v1_id;
END $$;

-- ============================================================================
-- 1. Tests for create_recipe_draft_from_version
-- ============================================================================

-- 1.1 Member cannot create draft (Permission rejection)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000a2'; -- member

SELECT throws_ok(
    $$SELECT public.create_recipe_draft_from_version('aaaaaaaa-3333-0000-0000-000000000001'::uuid)$$,
    'Unauthorized: only owner or admin can create recipe drafts',
    '1.1 Member role cannot create draft'
);

-- 1.2 Non-existent version throws error
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000a1'; -- owner

SELECT throws_ok(
    $$SELECT public.create_recipe_draft_from_version('99999999-9999-9999-9999-999999999999'::uuid)$$,
    'Source recipe version 99999999-9999-9999-9999-999999999999 not found',
    '1.2 Non-existent source version throws error'
);

-- 1.3 Owner can create draft successfully
SELECT lives_ok(
    $$SELECT public.create_recipe_draft_from_version('aaaaaaaa-3333-0000-0000-000000000001'::uuid)$$,
    '1.3 Owner creates draft successfully'
);

-- 1.4 Verify draft version metadata (status='draft', version_number=2, created_by=owner, effective_from NULL)
SELECT results_eq(
    $$SELECT version_number, status, effective_from IS NULL, change_reason IS NULL, created_by
      FROM public.recipe_versions
      WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'$$,
    $$VALUES (2, 'draft'::text, true, true, '00000000-0000-0000-0000-0000000000a1'::uuid)$$,
    '1.4 Draft created with version_number=2, status=draft, effective_from NULL and creator'
);

-- 1.5 Source version remains unchanged and active
SELECT results_eq(
    $$SELECT version_number, status FROM public.recipe_versions WHERE id = 'aaaaaaaa-3333-0000-0000-000000000001'$$,
    $$VALUES (1, 'active'::text)$$,
    '1.5 Source version remains untouched in active status'
);

-- 1.6 Draft inputs have new distinct UUIDs
SELECT is_empty(
    $$SELECT ri.id FROM public.recipe_inputs ri
      JOIN public.recipe_versions rv ON rv.id = ri.recipe_version_id
      WHERE rv.recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND rv.status = 'draft'
        AND ri.id IN ('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000002')$$,
    '1.6 Draft inputs received new unique UUIDs'
);

-- 1.7 Percentage bases are properly re-linked to the new draft input IDs
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.recipe_input_percentage_bases pb
      JOIN public.recipe_versions rv ON rv.id = pb.recipe_version_id
      WHERE rv.recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND rv.status = 'draft'$$,
    ARRAY[1],
    '1.7 Draft percentage bases copied and re-linked'
);

-- 1.8 Idempotency: Calling create_recipe_draft_from_version again returns the existing draft
SELECT results_eq(
    $$SELECT (public.create_recipe_draft_from_version('aaaaaaaa-3333-0000-0000-000000000001'::uuid)->>'is_new')::boolean$$,
    ARRAY[false],
    '1.8 Subsequent create call returns existing draft (is_new=false)'
);

-- 1.9 Still exactly 1 draft version exists
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'$$,
    ARRAY[1],
    '1.9 Only 1 draft version exists for the recipe'
);

-- ============================================================================
-- 2. Tests for save_recipe_draft
-- ============================================================================

-- 2.1 Member cannot save draft
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000a2'; -- member

SELECT throws_ok(
    $$SELECT public.save_recipe_draft(
        (SELECT id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'),
        jsonb_build_object('reference_yield_quantity', '12000', 'reference_yield_unit_id', (SELECT id FROM public.units WHERE code = 'g')),
        '[]'::jsonb,
        '[]'::jsonb
    )$$,
    'Unauthorized: only owner or admin can save recipe drafts',
    '2.1 Member cannot save draft'
);

-- 2.2 Owner saves draft with updated yield and high precision numeric (write-side precision test)
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000a1'; -- owner

DO $$
DECLARE
    v_draft_id uuid;
    v_unit_g uuid;
    v_flour_id uuid := 'aaaaaaaa-1111-0000-0000-000000000001';
    v_water_id uuid := 'aaaaaaaa-1111-0000-0000-000000000002';
    v_inp_flour_new uuid := 'cccccccc-0000-0000-0000-000000000001';
    v_inp_water_new uuid := 'cccccccc-0000-0000-0000-000000000002';
    v_inputs jsonb;
    v_bases jsonb;
BEGIN
    SELECT id INTO v_draft_id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft';
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';

    v_inputs := jsonb_build_array(
        jsonb_build_object(
            'id', v_inp_flour_new,
            'item_id', v_flour_id,
            'position', 1,
            'quantity_mode', 'absolute',
            'quantity', '123456789012345.123456789012',
            'unit_id', v_unit_g,
            'costing_source', 'purchased'
        ),
        jsonb_build_object(
            'id', v_inp_water_new,
            'item_id', v_water_id,
            'position', 2,
            'quantity_mode', 'percentage',
            'percentage', '72.5',
            'costing_source', 'purchased'
        )
    );

    v_bases := jsonb_build_array(
        jsonb_build_object(
            'percentage_input_id', v_inp_water_new,
            'basis_input_id', v_inp_flour_new
        )
    );

    PERFORM public.save_recipe_draft(
        v_draft_id,
        jsonb_build_object(
            'reference_yield_quantity', '15000.5',
            'reference_yield_unit_id', v_unit_g,
            'portion_quantity', '1500.0',
            'portion_unit_id', v_unit_g,
            'yield_description', 'Masa ajustada v2 draft',
            'notes', 'Notas de guardado'
        ),
        v_inputs,
        v_bases
    );
END $$;

-- 2.3 Verify high-precision numeric was saved exactly without Number loss
SELECT results_eq(
    $$SELECT ri.quantity::text FROM public.recipe_inputs ri
      JOIN public.recipe_versions rv ON rv.id = ri.recipe_version_id
      WHERE rv.recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND rv.status = 'draft'
        AND ri.quantity_mode = 'absolute'$$,
    ARRAY['123456789012345.123456789012'::text],
    '2.3 High-precision numeric(30,12) string exact round-trip in save_recipe_draft'
);

-- 2.4 Verify yield fields updated
SELECT results_eq(
    $$SELECT reference_yield_quantity::text, portion_quantity::text, yield_description
      FROM public.recipe_versions
      WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'$$,
    $$VALUES ('15000.500000000000'::text, '1500.000000000000'::text, 'Masa ajustada v2 draft'::text)$$,
    '2.4 Yield fields updated in draft'
);

-- 2.5 Verify stable IDs on second save (updating existing input without re-inserting)
DO $$
DECLARE
    v_draft_id uuid;
    v_unit_g uuid;
    v_flour_id uuid := 'aaaaaaaa-1111-0000-0000-000000000001';
    v_water_id uuid := 'aaaaaaaa-1111-0000-0000-000000000002';
    v_inp_flour_new uuid := 'cccccccc-0000-0000-0000-000000000001';
    v_inp_water_new uuid := 'cccccccc-0000-0000-0000-000000000002';
    v_inputs jsonb;
    v_bases jsonb;
BEGIN
    SELECT id INTO v_draft_id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft';
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';

    -- Update flour to 10000 and water to 72%
    v_inputs := jsonb_build_array(
        jsonb_build_object(
            'id', v_inp_flour_new,
            'item_id', v_flour_id,
            'position', 1,
            'quantity_mode', 'absolute',
            'quantity', '10000',
            'unit_id', v_unit_g,
            'costing_source', 'purchased'
        ),
        jsonb_build_object(
            'id', v_inp_water_new,
            'item_id', v_water_id,
            'position', 2,
            'quantity_mode', 'percentage',
            'percentage', '72',
            'costing_source', 'purchased'
        )
    );

    v_bases := jsonb_build_array(
        jsonb_build_object(
            'percentage_input_id', v_inp_water_new,
            'basis_input_id', v_inp_flour_new
        )
    );

    PERFORM public.save_recipe_draft(
        v_draft_id,
        jsonb_build_object(
            'reference_yield_quantity', '14000',
            'reference_yield_unit_id', v_unit_g
        ),
        v_inputs,
        v_bases
    );
END $$;

SELECT results_eq(
    $$SELECT count(*)::integer FROM public.recipe_inputs ri
      JOIN public.recipe_versions rv ON rv.id = ri.recipe_version_id
      WHERE rv.recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND rv.status = 'draft'$$,
    ARRAY[2],
    '2.5 Stable IDs preserved count=2 without duplicate inputs'
);

-- 2.6 Reject cross-tenant item injection in save_recipe_draft
SELECT throws_ok(
    $$SELECT public.save_recipe_draft(
        (SELECT id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'),
        jsonb_build_object('reference_yield_quantity', '14000', 'reference_yield_unit_id', (SELECT id FROM public.units WHERE code = 'g')),
        jsonb_build_array(
            jsonb_build_object(
                'id', gen_random_uuid(),
                'item_id', 'bbbbbbbb-2222-0000-0000-000000000001'::uuid,
                'position', 1,
                'quantity_mode', 'absolute',
                'quantity', '1000',
                'unit_id', (SELECT id FROM public.units WHERE code = 'g'),
                'costing_source', 'purchased'
            )
        ),
        '[]'::jsonb
    )$$,
    'Item bbbbbbbb-2222-0000-0000-000000000001 does not belong to business 11111111-1111-1111-1111-111111111111',
    '2.6 Cross-tenant item ID in save_recipe_draft is rejected'
);

-- 2.7 Reject foreign input UUID (existing input UUID belonging to another version of same business)
SELECT throws_ok(
    $$SELECT public.save_recipe_draft(
        (SELECT id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'),
        jsonb_build_object('reference_yield_quantity', '14000', 'reference_yield_unit_id', (SELECT id FROM public.units WHERE code = 'g')),
        jsonb_build_array(
            jsonb_build_object(
                'id', 'aaaaaaaa-4444-0000-0000-000000000001'::uuid, -- belongs to v1!
                'item_id', 'aaaaaaaa-1111-0000-0000-000000000001'::uuid,
                'position', 1,
                'quantity_mode', 'absolute',
                'quantity', '10000',
                'unit_id', (SELECT id FROM public.units WHERE code = 'g'),
                'costing_source', 'purchased'
            )
        ),
        '[]'::jsonb
    )$$,
    'Input UUID aaaaaaaa-4444-0000-0000-000000000001 is already used in another record',
    '2.7 Foreign input UUID from another version is rejected with full rollback'
);

-- 2.8 New input with stable client-generated UUID + percentage base linkage
DO $$
DECLARE
    v_draft_id uuid;
    v_unit_g uuid;
    v_flour_id uuid := 'aaaaaaaa-1111-0000-0000-000000000001';
    v_water_id uuid := 'aaaaaaaa-1111-0000-0000-000000000002';
    v_new_inp_flour uuid := 'eeeeeeee-0000-0000-0000-000000000001';
    v_new_inp_water uuid := 'eeeeeeee-0000-0000-0000-000000000002';
BEGIN
    SELECT id INTO v_draft_id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft';
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';

    PERFORM public.save_recipe_draft(
        v_draft_id,
        jsonb_build_object('reference_yield_quantity', '16000', 'reference_yield_unit_id', v_unit_g),
        jsonb_build_array(
            jsonb_build_object('id', v_new_inp_flour, 'item_id', v_flour_id, 'position', 1, 'quantity_mode', 'absolute', 'quantity', '10000', 'unit_id', v_unit_g, 'costing_source', 'purchased'),
            jsonb_build_object('id', v_new_inp_water, 'item_id', v_water_id, 'position', 2, 'quantity_mode', 'percentage', 'percentage', '75', 'costing_source', 'purchased')
        ),
        jsonb_build_array(
            jsonb_build_object('percentage_input_id', v_new_inp_water, 'basis_input_id', v_new_inp_flour)
        )
    );
END $$;

-- 2.8a Check exact client-provided UUIDs were inserted and preserved
SELECT results_eq(
    $$SELECT id, position, quantity_mode FROM public.recipe_inputs
      WHERE recipe_version_id = (SELECT id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft')
      ORDER BY position ASC$$,
    $$VALUES
        ('eeeeeeee-0000-0000-0000-000000000001'::uuid, 1, 'absolute'::text),
        ('eeeeeeee-0000-0000-0000-000000000002'::uuid, 2, 'percentage'::text)$$,
    '2.8a Client-generated UUIDs inserted and preserved exactly'
);

-- 2.8b Check percentage base references the exact new input UUIDs
SELECT results_eq(
    $$SELECT percentage_input_id, basis_input_id FROM public.recipe_input_percentage_bases
      WHERE recipe_version_id = (SELECT id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft')$$,
    $$VALUES ('eeeeeeee-0000-0000-0000-000000000002'::uuid, 'eeeeeeee-0000-0000-0000-000000000001'::uuid)$$,
    '2.8b Percentage base properly created between new stable input UUIDs'
);

-- ============================================================================
-- 3. Tests for publish_recipe_version
-- ============================================================================

-- 3.1 Member cannot publish
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000a2'; -- member

SELECT throws_ok(
    $$SELECT public.publish_recipe_version(
        (SELECT id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'),
        '2026-06-01 10:00:00'::timestamp
    )$$,
    'Unauthorized: only owner or admin can publish recipe versions',
    '3.1 Member cannot publish recipe version'
);

-- 3.2 Reject future effective_from (e.g. year 2099)
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000a1'; -- owner

SELECT throws_ok(
    $$SELECT public.publish_recipe_version(
        (SELECT id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'),
        '2099-01-01 10:00:00'::timestamp
    )$$,
    'P0001',
    NULL,
    '3.2 Future publication local time is rejected'
);

-- 3.3 Reject effective_from prior to existing published version (e.g. 2025-01-01 when v1 is 2026-01-01)
SELECT throws_ok(
    $$SELECT public.publish_recipe_version(
        (SELECT id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'),
        '2025-01-01 10:00:00'::timestamp
    )$$,
    'Cannot publish recipe version: effective_from must be later than all existing published versions of this recipe',
    '3.3 Effective_from earlier than existing published version is rejected'
);

-- 3.4 Rollback on publication gate failure: remove percentage base and attempt publish
DO $$
DECLARE
    v_draft_id uuid;
    v_unit_g uuid;
    v_flour_id uuid := 'aaaaaaaa-1111-0000-0000-000000000001';
    v_water_id uuid := 'aaaaaaaa-1111-0000-0000-000000000002';
BEGIN
    SELECT id INTO v_draft_id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft';
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';

    -- Save draft with percentage input without base (Gate A violation)
    PERFORM public.save_recipe_draft(
        v_draft_id,
        jsonb_build_object('reference_yield_quantity', '14000', 'reference_yield_unit_id', v_unit_g),
        jsonb_build_array(
            jsonb_build_object('item_id', v_flour_id, 'position', 1, 'quantity_mode', 'absolute', 'quantity', '10000', 'unit_id', v_unit_g, 'costing_source', 'purchased'),
            jsonb_build_object('item_id', v_water_id, 'position', 2, 'quantity_mode', 'percentage', 'percentage', '72', 'costing_source', 'purchased')
        ),
        '[]'::jsonb -- No bases!
    );
END $$;

SELECT throws_ok(
    $$SELECT public.publish_recipe_version(
        (SELECT id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'),
        '2026-06-01 10:00:00'::timestamp
    )$$,
    'Cannot publish recipe version: percentage inputs must have at least one percentage base',
    '3.4 Publication gate A failure rolls back'
);

-- 3.5 Previous version remains active after gate failure
SELECT results_eq(
    $$SELECT version_number, status FROM public.recipe_versions WHERE id = 'aaaaaaaa-3333-0000-0000-000000000001'$$,
    $$VALUES (1, 'active'::text)$$,
    '3.5 v1 remains active after failed publication attempt'
);

-- 3.6 Fix draft with bases and publish successfully
DO $$
DECLARE
    v_draft_id uuid;
    v_unit_g uuid;
    v_flour_id uuid := 'aaaaaaaa-1111-0000-0000-000000000001';
    v_water_id uuid := 'aaaaaaaa-1111-0000-0000-000000000002';
    v_inp_flour uuid := 'dddddddd-0000-0000-0000-000000000001';
    v_inp_water uuid := 'dddddddd-0000-0000-0000-000000000002';
BEGIN
    SELECT id INTO v_draft_id FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft';
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';

    PERFORM public.save_recipe_draft(
        v_draft_id,
        jsonb_build_object('reference_yield_quantity', '14000', 'reference_yield_unit_id', v_unit_g),
        jsonb_build_array(
            jsonb_build_object('id', v_inp_flour, 'item_id', v_flour_id, 'position', 1, 'quantity_mode', 'absolute', 'quantity', '10000', 'unit_id', v_unit_g, 'costing_source', 'purchased'),
            jsonb_build_object('id', v_inp_water, 'item_id', v_water_id, 'position', 2, 'quantity_mode', 'percentage', 'percentage', '72', 'costing_source', 'purchased')
        ),
        jsonb_build_array(
            jsonb_build_object('percentage_input_id', v_inp_water, 'basis_input_id', v_inp_flour)
        )
    );

    PERFORM public.publish_recipe_version(
        v_draft_id,
        '2026-06-01 10:00:00'::timestamp,
        'Ajuste de hidratación a 72%'
    );
END $$;

-- 3.7 Verify v1 is now archived
SELECT results_eq(
    $$SELECT version_number, status FROM public.recipe_versions WHERE id = 'aaaaaaaa-3333-0000-0000-000000000001'$$,
    $$VALUES (1, 'archived'::text)$$,
    '3.7 v1 transitioned to archived status'
);

-- 3.8 Verify v2 is now active
SELECT results_eq(
    $$SELECT version_number, status, change_reason FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND version_number = 2$$,
    $$VALUES (2, 'active'::text, 'Ajuste de hidratación a 72%'::text)$$,
    '3.8 v2 transitioned to active status with change_reason'
);

-- 3.9 Verify timezone conversion for America/Mexico_City (10:00 AM local -> 16:00:00 UTC)
SELECT results_eq(
    $$SELECT to_char(effective_from AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
      FROM public.recipe_versions
      WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND version_number = 2$$,
    ARRAY['2026-06-01 16:00:00'::text],
    '3.9 effective_from converted accurately from America/Mexico_City (10:00 AM) to UTC (16:00)'
);

-- 3.10 Exactly 1 active version exists after publication
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'active'$$,
    ARRAY[1],
    '3.10 Exactly 1 active version exists after publication'
);

-- 3.11 0 draft versions exist after publication
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.recipe_versions WHERE recipe_id = 'aaaaaaaa-2222-0000-0000-000000000001' AND status = 'draft'$$,
    ARRAY[0],
    '3.11 0 draft versions exist after publication'
);

-- 3.12 Anonymous user cannot execute RPCs
SET LOCAL ROLE anon;

SELECT throws_ok(
    $$SELECT public.create_recipe_draft_from_version('aaaaaaaa-3333-0000-0000-000000000001'::uuid)$$,
    '42501',
    NULL,
    '3.12 Anon role has no EXECUTE privilege on create_recipe_draft_from_version'
);

SELECT * FROM finish();

ROLLBACK;
