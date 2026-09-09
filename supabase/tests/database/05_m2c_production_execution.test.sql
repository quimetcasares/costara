BEGIN;

SELECT plan(41);

-- ============================================================================
-- 0. SETUP: Test Fixtures
-- ============================================================================
DO $$
DECLARE
    v_user_a uuid := '00000000-0000-0000-0000-0000000000a1';
    v_user_b uuid := '00000000-0000-0000-0000-0000000000b1';

    v_biz_a uuid := '11111111-1111-1111-1111-111111111111';
    v_biz_b uuid := '22222222-2222-2222-2222-222222222222';

    v_unit_g uuid;
    v_unit_kg uuid;
    v_unit_pza uuid;

    v_item_flour uuid := 'aaaaaaaa-1111-0000-0000-000000000001';
    v_item_water uuid := 'aaaaaaaa-1111-0000-0000-000000000002';
    v_item_bread uuid := 'aaaaaaaa-1111-0000-0000-000000000005';
    v_item_salt  uuid := 'aaaaaaaa-1111-0000-0000-000000000006';
    v_item_inact uuid := 'aaaaaaaa-1111-0000-0000-000000000007';

    v_recipe_id uuid := 'aaaaaaaa-2222-0000-0000-000000000001';
    v_v1_id uuid := 'aaaaaaaa-3333-0000-0000-000000000001';
    v_v2_draft_id uuid := 'aaaaaaaa-3333-0000-0000-000000000002';

    v_inp_flour uuid := 'aaaaaaaa-4444-0000-0000-000000000001';
    v_inp_water uuid := 'aaaaaaaa-4444-0000-0000-000000000002';

    v_plan_id uuid := 'aaaaaaaa-7777-0000-0000-000000000001';
    v_target_id uuid := 'aaaaaaaa-8888-0000-0000-000000000001';
BEGIN
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';
    SELECT id INTO v_unit_kg FROM public.units WHERE code = 'kg';
    SELECT id INTO v_unit_pza FROM public.units WHERE code = 'piece';

    -- Users
    INSERT INTO auth.users (id, email) VALUES
        (v_user_a, 'owner_a@test.com'),
        (v_user_b, 'owner_b@test.com')
    ON CONFLICT (id) DO NOTHING;

    -- Businesses
    INSERT INTO public.businesses (id, name, currency_code, timezone) VALUES
        (v_biz_a, 'Biz A Bakery', 'MXN', 'America/Mexico_City'),
        (v_biz_b, 'Biz B Bakery', 'MXN', 'America/Mexico_City')
    ON CONFLICT (id) DO NOTHING;

    -- Memberships
    INSERT INTO public.business_members (business_id, user_id, role) VALUES
        (v_biz_a, v_user_a, 'owner'),
        (v_biz_b, v_user_b, 'owner')
    ON CONFLICT (business_id, user_id) DO NOTHING;

    -- Items
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable, producible, sellable, track_inventory, is_active) VALUES
        (v_item_flour, v_biz_a, 'Harina Fuerte', 'raw_material', v_unit_g, true, false, false, true, true),
        (v_item_water, v_biz_a, 'Agua', 'raw_material', v_unit_g, true, false, false, true, true),
        (v_item_bread, v_biz_a, 'Pan Campesino', 'finished_product', v_unit_pza, false, true, true, true, true),
        (v_item_salt,  v_biz_a, 'Sal Marina', 'raw_material', v_unit_g, true, false, false, true, true),
        (v_item_inact, v_biz_a, 'Levadura Inactiva', 'raw_material', v_unit_g, true, false, false, true, false)
    ON CONFLICT (id) DO NOTHING;

    -- Recipe & Versions
    INSERT INTO public.recipes (id, business_id, name, output_item_id, is_active) VALUES
        (v_recipe_id, v_biz_a, 'Pan Campesino Receta', v_item_bread, true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.recipe_versions (id, business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id) VALUES
        (v_v1_id, v_biz_a, v_recipe_id, 1, 'draft', 10.0, v_unit_pza),
        (v_v2_draft_id, v_biz_a, v_recipe_id, 2, 'draft', 10.0, v_unit_pza)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id) VALUES
        (v_inp_flour, v_biz_a, v_v1_id, v_item_flour, 1, 'absolute', 5000.0, v_unit_g),
        (v_inp_water, v_biz_a, v_v1_id, v_item_water, 2, 'absolute', 3000.0, v_unit_g)
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.recipe_versions
    SET status = 'active', effective_from = '2026-01-01 00:00:00+00'::timestamptz
    WHERE id = v_v1_id;

    -- Production Plan & Target
    INSERT INTO public.production_plans (id, business_id, name, start_date, end_date) VALUES
        (v_plan_id, v_biz_a, 'Semana 37', '2026-09-07', '2026-09-13')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.production_targets (id, business_id, production_plan_id, target_date, item_id, recipe_version_id, target_quantity, unit_id, position, notes) VALUES
        (v_target_id, v_biz_a, v_plan_id, '2026-09-10', v_item_bread, v_v1_id, 20.0, v_unit_pza, 1, 'Target 20 loaves')
    ON CONFLICT (id) DO NOTHING;
END $$;


-- ============================================================================
-- 1. START PRODUCTION RUN VIA SNAPSHOT (SERVICE ROLE) & TARGET SPLITTING
-- ============================================================================
-- 1.1 First run linked to target (batch 1: 10 loaves)
SELECT lives_ok(
    $$SELECT public.start_production_run_from_snapshot(
        'c0000000-0000-0000-0000-000000000001'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid,
        'aaaaaaaa-8888-0000-0000-000000000001'::uuid,
        'aaaaaaaa-3333-0000-0000-000000000001'::uuid,
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece'),
        '2026-09-10'::date,
        '00000000-0000-0000-0000-0000000000a1'::uuid,
        'First batch of 10 loaves',
        jsonb_build_array(
            jsonb_build_object(
                'recipe_input_id', 'aaaaaaaa-4444-0000-0000-000000000001',
                'item_id', 'aaaaaaaa-1111-0000-0000-000000000001',
                'position', 1,
                'planned_quantity', 5000.0,
                'planned_unit_id', (SELECT id FROM public.units WHERE code = 'g')
            ),
            jsonb_build_object(
                'recipe_input_id', 'aaaaaaaa-4444-0000-0000-000000000002',
                'item_id', 'aaaaaaaa-1111-0000-0000-000000000002',
                'position', 2,
                'planned_quantity', 3000.0,
                'planned_unit_id', (SELECT id FROM public.units WHERE code = 'g')
            )
        )
    )$$,
    '1.1 Service role can start run 1 linked to target'
);

-- 1.2 Target splitting: Second run linked to SAME target (batch 2: 10 loaves)
SELECT lives_ok(
    $$SELECT public.start_production_run_from_snapshot(
        'c0000000-0000-0000-0000-000000000002'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid,
        'aaaaaaaa-8888-0000-0000-000000000001'::uuid,
        'aaaaaaaa-3333-0000-0000-000000000001'::uuid,
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece'),
        '2026-09-10'::date,
        '00000000-0000-0000-0000-0000000000a1'::uuid,
        'Second batch of 10 loaves',
        jsonb_build_array(
            jsonb_build_object(
                'recipe_input_id', 'aaaaaaaa-4444-0000-0000-000000000001',
                'item_id', 'aaaaaaaa-1111-0000-0000-000000000001',
                'position', 1,
                'planned_quantity', 5000.0,
                'planned_unit_id', (SELECT id FROM public.units WHERE code = 'g')
            ),
            jsonb_build_object(
                'recipe_input_id', 'aaaaaaaa-4444-0000-0000-000000000002',
                'item_id', 'aaaaaaaa-1111-0000-0000-000000000002',
                'position', 2,
                'planned_quantity', 3000.0,
                'planned_unit_id', (SELECT id FROM public.units WHERE code = 'g')
            )
        )
    )$$,
    '1.2 Target splitting: Multiple runs can reference the same target (cardinality 1 -> N)'
);

-- 1.3 Verify both runs are linked to target in public.production_runs
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.production_runs WHERE production_target_id = 'aaaaaaaa-8888-0000-0000-000000000001'$$,
    $$VALUES (2)$$,
    '1.3 Both runs exist and reference target'
);

-- 1.4 Idempotency: re-running with same parameters returns idempotent: true
SELECT is(
    (public.start_production_run_from_snapshot(
        'c0000000-0000-0000-0000-000000000001'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid,
        'aaaaaaaa-8888-0000-0000-000000000001'::uuid,
        'aaaaaaaa-3333-0000-0000-000000000001'::uuid,
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece'),
        '2026-09-10'::date,
        '00000000-0000-0000-0000-0000000000a1'::uuid,
        'First batch of 10 loaves',
        jsonb_build_array(
            jsonb_build_object(
                'recipe_input_id', 'aaaaaaaa-4444-0000-0000-000000000001',
                'item_id', 'aaaaaaaa-1111-0000-0000-000000000001',
                'position', 1,
                'planned_quantity', 5000.0,
                'planned_unit_id', (SELECT id FROM public.units WHERE code = 'g')
            ),
            jsonb_build_object(
                'recipe_input_id', 'aaaaaaaa-4444-0000-0000-000000000002',
                'item_id', 'aaaaaaaa-1111-0000-0000-000000000002',
                'position', 2,
                'planned_quantity', 3000.0,
                'planned_unit_id', (SELECT id FROM public.units WHERE code = 'g')
            )
        )
    ))->>'idempotent',
    'true',
    '1.4 start_production_run_from_snapshot is idempotent on identical rerun'
);


-- ============================================================================
-- 2. TARGET IMMUTABILITY ONCE A RUN IS LINKED
-- ============================================================================
-- 2.1 Cannot update target_quantity
SELECT throws_ok(
    $$UPDATE public.production_targets SET target_quantity = 25.0 WHERE id = 'aaaaaaaa-8888-0000-0000-000000000001'$$,
    'P0001',
    'Cannot modify planning intention of target aaaaaaaa-8888-0000-0000-000000000001 because production runs already exist',
    '2.1 Target immutability: Cannot modify target_quantity'
);

-- 2.2 Cannot update item_id
SELECT throws_ok(
    $$UPDATE public.production_targets SET item_id = 'aaaaaaaa-1111-0000-0000-000000000001' WHERE id = 'aaaaaaaa-8888-0000-0000-000000000001'$$,
    'P0001',
    'Cannot modify planning intention of target aaaaaaaa-8888-0000-0000-000000000001 because production runs already exist',
    '2.2 Target immutability: Cannot modify target item_id'
);

-- 2.3 Cannot update target_date
SELECT throws_ok(
    $$UPDATE public.production_targets SET target_date = '2026-09-11' WHERE id = 'aaaaaaaa-8888-0000-0000-000000000001'$$,
    'P0001',
    'Cannot modify planning intention of target aaaaaaaa-8888-0000-0000-000000000001 because production runs already exist',
    '2.3 Target immutability: Cannot modify target_date'
);

-- 2.4 Cannot update recipe_version_id
SELECT throws_ok(
    $$UPDATE public.production_targets SET recipe_version_id = 'aaaaaaaa-3333-0000-0000-000000000002' WHERE id = 'aaaaaaaa-8888-0000-0000-000000000001'$$,
    'P0001',
    'Cannot modify planning intention of target aaaaaaaa-8888-0000-0000-000000000001 because production runs already exist',
    '2.4 Target immutability: Cannot modify recipe_version_id'
);

-- 2.5 Cannot delete target
SELECT throws_ok(
    $$DELETE FROM public.production_targets WHERE id = 'aaaaaaaa-8888-0000-0000-000000000001'$$,
    'P0001',
    'Cannot delete target aaaaaaaa-8888-0000-0000-000000000001 because production runs already exist',
    '2.5 Target immutability: Cannot delete target with linked runs'
);


-- ============================================================================
-- 3. PERMISSIONS: DIRECT DML RESTRICTIONS FOR AUTHENTICATED
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000a1'; -- User A

-- 3.1 Direct INSERT on production_runs is denied
SELECT throws_ok(
    $$INSERT INTO public.production_runs (business_id, recipe_version_id, planned_yield_quantity, planned_yield_unit_id, scheduled_date)
      VALUES ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-3333-0000-0000-000000000001', 10.0, (SELECT id FROM public.units WHERE code = 'piece'), '2026-09-10')$$,
    '42501',
    NULL,
    '3.1 Direct INSERT into public.production_runs denied to authenticated'
);

-- 3.2 Direct UPDATE on production_runs is denied
SELECT throws_ok(
    $$UPDATE public.production_runs SET notes = 'Hacked' WHERE id = 'c0000000-0000-0000-0000-000000000001'$$,
    '42501',
    NULL,
    '3.2 Direct UPDATE on public.production_runs denied to authenticated'
);

-- 3.3 Direct DELETE on production_runs is denied
SELECT throws_ok(
    $$DELETE FROM public.production_runs WHERE id = 'c0000000-0000-0000-0000-000000000001'$$,
    '42501',
    NULL,
    '3.3 Direct DELETE on public.production_runs denied to authenticated'
);

-- 3.4 Direct INSERT on production_run_inputs is denied
SELECT throws_ok(
    $$INSERT INTO public.production_run_inputs (business_id, production_run_id, item_id, position, planned_quantity)
      VALUES ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 99, 100)$$,
    '42501',
    NULL,
    '3.4 Direct INSERT on public.production_run_inputs denied to authenticated'
);

-- 3.5 Direct DELETE on production_run_inputs is denied
SELECT throws_ok(
    $$DELETE FROM public.production_run_inputs WHERE production_run_id = 'c0000000-0000-0000-0000-000000000001'$$,
    '42501',
    NULL,
    '3.5 Direct DELETE on public.production_run_inputs denied to authenticated'
);

-- 3.6 Direct UPDATE on planned_quantity on production_run_inputs is denied (column privilege)
SELECT throws_ok(
    $$UPDATE public.production_run_inputs SET planned_quantity = 9999 WHERE production_run_id = 'c0000000-0000-0000-0000-000000000001'$$,
    '42501',
    NULL,
    '3.6 Direct UPDATE on planned_quantity denied to authenticated'
);

-- 3.7 Direct UPDATE on actual_quantity and actual_unit_id is permitted for authenticated
SELECT lives_ok(
    $$UPDATE public.production_run_inputs
      SET actual_quantity = 5100.0,
          actual_unit_id = (SELECT id FROM public.units WHERE code = 'g'),
          notes = 'Used 100g extra flour'
      WHERE production_run_id = 'c0000000-0000-0000-0000-000000000001'
        AND recipe_input_id = 'aaaaaaaa-4444-0000-0000-000000000001'$$,
    '3.7 Direct UPDATE on actual_quantity, actual_unit_id, notes permitted'
);

-- 3.8 Negative actual_quantity is rejected by trigger
SELECT throws_ok(
    $$UPDATE public.production_run_inputs
      SET actual_quantity = -10.0
      WHERE production_run_id = 'c0000000-0000-0000-0000-000000000001'
        AND recipe_input_id = 'aaaaaaaa-4444-0000-0000-000000000001'$$,
    'P0001',
    'Actual quantity must be non-negative',
    '3.8 Negative actual_quantity is rejected'
);

-- 3.9 actual_quantity without actual_unit_id is rejected by trigger
SELECT throws_ok(
    $$UPDATE public.production_run_inputs
      SET actual_quantity = 5000.0, actual_unit_id = NULL
      WHERE production_run_id = 'c0000000-0000-0000-0000-000000000001'
        AND recipe_input_id = 'aaaaaaaa-4444-0000-0000-000000000001'$$,
    'P0001',
    'Actual unit must be specified when actual quantity is set',
    '3.9 actual_quantity without actual_unit_id is rejected'
);


-- ============================================================================
-- 4. RPC: add_unplanned_production_run_input & delete_unplanned_production_run_input
-- ============================================================================
-- 4.1 Add unplanned salt input to run 1
SELECT lives_ok(
    $$SELECT public.add_unplanned_production_run_input(
        'e0000000-0000-0000-0000-000000000001'::uuid,
        'c0000000-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000006'::uuid,
        50.0,
        (SELECT id FROM public.units WHERE code = 'g'),
        'Extra salt added'
    )$$,
    '4.1 Authenticated member can add unplanned input'
);

-- 4.2 Verify unplanned input fields: recipe_input_id NULL, planned_quantity 0, planned_unit_id NULL
SELECT results_eq(
    $$SELECT recipe_input_id, planned_quantity, planned_unit_id, actual_quantity, notes
      FROM public.production_run_inputs
      WHERE id = 'e0000000-0000-0000-0000-000000000001'$$,
    $$VALUES (NULL::uuid, 0::numeric, NULL::uuid, 50.0::numeric, 'Extra salt added'::text)$$,
    '4.2 Unplanned input has recipe_input_id NULL and planned_quantity 0'
);

-- 4.3 Idempotency of add_unplanned_production_run_input
SELECT is(
    public.add_unplanned_production_run_input(
        'e0000000-0000-0000-0000-000000000001'::uuid,
        'c0000000-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000006'::uuid,
        50.0,
        (SELECT id FROM public.units WHERE code = 'g'),
        'Extra salt added'
    ),
    'e0000000-0000-0000-0000-000000000001'::uuid,
    '4.3 add_unplanned_production_run_input is idempotent'
);

-- 4.4 Dimension mismatch on unplanned input is rejected (e.g. piece for salt which is mass)
SELECT throws_ok(
    $$SELECT public.add_unplanned_production_run_input(
        'e0000000-0000-0000-0000-000000000002'::uuid,
        'c0000000-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000006'::uuid,
        1.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    )$$,
    'P0001',
    'Unit dimension mismatch: actual unit must match item base unit dimension',
    '4.4 Dimension mismatch on unplanned input is rejected'
);

-- 4.5 User B cannot add unplanned input to Biz A run
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000b1';
SELECT throws_ok(
    $$SELECT public.add_unplanned_production_run_input(
        'e0000000-0000-0000-0000-000000000003'::uuid,
        'c0000000-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000006'::uuid
    )$$,
    '42501',
    'Forbidden: user is not a member of business 11111111-1111-1111-1111-111111111111',
    '4.5 Non-member cannot add unplanned input'
);

-- 4.6 User A can delete unplanned input
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000a1';
SELECT lives_ok(
    $$SELECT public.delete_unplanned_production_run_input('e0000000-0000-0000-0000-000000000001'::uuid)$$,
    '4.6 Authenticated member can delete unplanned input'
);

-- 4.7 Cannot delete nominal input via delete_unplanned_production_run_input
SELECT throws_ok(
    $$SELECT public.delete_unplanned_production_run_input(
        (SELECT id FROM public.production_run_inputs WHERE production_run_id = 'c0000000-0000-0000-0000-000000000001' AND recipe_input_id IS NOT NULL LIMIT 1)
    )$$,
    'P0001',
    'Cannot delete nominal recipe input line from production run',
    '4.7 Cannot delete nominal recipe input via delete RPC'
);


-- ============================================================================
-- 5. RPC: update_production_run_notes
-- ============================================================================
-- 5.1 Authenticated member can update notes
SELECT lives_ok(
    $$SELECT public.update_production_run_notes('c0000000-0000-0000-0000-000000000001'::uuid, 'Batch 1 updated notes')$$,
    '5.1 Authenticated member can update run notes'
);

-- 5.2 Non-member cannot update notes
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000b1';
SELECT throws_ok(
    $$SELECT public.update_production_run_notes('c0000000-0000-0000-0000-000000000001'::uuid, 'Malicious notes')$$,
    '42501',
    'Forbidden: user is not a member of business 11111111-1111-1111-1111-111111111111',
    '5.2 Non-member cannot update run notes'
);


-- ============================================================================
-- 6. STATUS LIFECYCLE & INPUT MUTABILITY WHEN COMPLETED
-- ============================================================================
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000a1';

-- Set actual quantities on all inputs before completion
UPDATE public.production_run_inputs
SET actual_quantity = planned_quantity, actual_unit_id = planned_unit_id
WHERE production_run_id = 'c0000000-0000-0000-0000-000000000001' AND actual_quantity IS NULL;

-- Complete run 1
SELECT lives_ok(
    $$SELECT public.complete_production_run(
        'c0000000-0000-0000-0000-000000000001'::uuid,
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    )$$,
    '6.1 Complete production run 1'
);

-- 6.2 Cannot update notes once completed
SELECT throws_ok(
    $$SELECT public.update_production_run_notes('c0000000-0000-0000-0000-000000000001'::uuid, 'Late notes')$$,
    'P0001',
    'Cannot edit notes of a completed production run',
    '6.2 Cannot edit notes of completed production run'
);

-- 6.3 Cannot update actual inputs once completed
SELECT throws_ok(
    $$UPDATE public.production_run_inputs
      SET actual_quantity = 6000.0
      WHERE production_run_id = 'c0000000-0000-0000-0000-000000000001'
        AND recipe_input_id = 'aaaaaaaa-4444-0000-0000-000000000001'$$,
    'P0001',
    'Cannot modify inputs of a completed production run',
    '6.3 Cannot modify inputs of completed production run'
);

-- 6.4 Cannot add unplanned input to completed run
SELECT throws_ok(
    $$SELECT public.add_unplanned_production_run_input(
        'e0000000-0000-0000-0000-000000000099'::uuid,
        'c0000000-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000006'::uuid
    )$$,
    'P0001',
    'Cannot add unplanned input to a completed production run',
    '6.4 Cannot add unplanned input to completed run'
);


-- ============================================================================
-- 7. RPC: get_current_inventory_stock
-- ============================================================================
-- 7.1 Returns rows for all track_inventory = true items, including 0-stock and inactive
SELECT is(
    (SELECT count(*)::integer FROM public.get_current_inventory_stock('11111111-1111-1111-1111-111111111111'::uuid)),
    5,
    '7.1 get_current_inventory_stock returns all 5 tracked items'
);

-- 7.2 Sal Marina has current_stock = 0
SELECT is(
    (SELECT current_stock FROM public.get_current_inventory_stock('11111111-1111-1111-1111-111111111111'::uuid) WHERE item_id = 'aaaaaaaa-1111-0000-0000-000000000006'),
    0.0::numeric,
    '7.2 Items with no movements return current_stock = 0'
);

-- 7.3 Inactive item is included in stock query
SELECT is(
    (SELECT is_active FROM public.get_current_inventory_stock('11111111-1111-1111-1111-111111111111'::uuid) WHERE item_id = 'aaaaaaaa-1111-0000-0000-000000000007'),
    false,
    '7.3 Inactive items are included in stock query'
);

-- 7.4 Non-member cannot query stock
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000b1';
SELECT throws_ok(
    $$SELECT * FROM public.get_current_inventory_stock('11111111-1111-1111-1111-111111111111'::uuid)$$,
    '42501',
    'Forbidden: user is not a member of business 11111111-1111-1111-1111-111111111111',
    '7.4 Non-member cannot call get_current_inventory_stock'
);


-- ============================================================================
-- 8. RPC: start_production_run_from_snapshot RESTRICTIONS & VALIDATIONS
-- ============================================================================
-- 8.1 Authenticated cannot execute start_production_run_from_snapshot (service_role only)
SELECT throws_ok(
    $$SELECT public.start_production_run_from_snapshot(
        'c0000000-0000-0000-0000-000000000099'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid,
        NULL,
        'aaaaaaaa-3333-0000-0000-000000000001'::uuid,
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece'),
        '2026-09-10'::date,
        '00000000-0000-0000-0000-0000000000a1'::uuid,
        NULL,
        '[]'::jsonb
    )$$,
    '42501',
    NULL,
    '8.1 start_production_run_from_snapshot denied to authenticated'
);

-- Reset role to service_role / superuser to test internal validations
RESET ROLE;

-- 8.2 Non-member created_by is rejected
SELECT throws_ok(
    $$SELECT public.start_production_run_from_snapshot(
        'c0000000-0000-0000-0000-000000000099'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid,
        NULL,
        'aaaaaaaa-3333-0000-0000-000000000001'::uuid,
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece'),
        '2026-09-10'::date,
        '00000000-0000-0000-0000-0000000000b1'::uuid, -- User B not member of Biz A
        NULL,
        '[]'::jsonb
    )$$,
    '42501',
    'Forbidden: user 00000000-0000-0000-0000-0000000000b1 is not a member of business 11111111-1111-1111-1111-111111111111',
    '8.2 Rejects non-member created_by'
);

-- 8.3 Rejects draft recipe version
SELECT throws_ok(
    $$SELECT public.start_production_run_from_snapshot(
        'c0000000-0000-0000-0000-000000000099'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid,
        NULL,
        'aaaaaaaa-3333-0000-0000-000000000002'::uuid, -- v2 draft
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece'),
        '2026-09-10'::date,
        '00000000-0000-0000-0000-0000000000a1'::uuid,
        NULL,
        '[]'::jsonb
    )$$,
    'P0001',
    'Cannot execute production run with draft recipe version',
    '8.3 Rejects draft recipe version'
);

-- 8.4 Rejects yield unit mismatch with output item base unit
SELECT throws_ok(
    $$SELECT public.start_production_run_from_snapshot(
        'c0000000-0000-0000-0000-000000000099'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid,
        NULL,
        'aaaaaaaa-3333-0000-0000-000000000001'::uuid,
        10.0,
        (SELECT id FROM public.units WHERE code = 'kg'), -- wrong unit, output item is piece
        '2026-09-10'::date,
        '00000000-0000-0000-0000-0000000000a1'::uuid,
        NULL,
        '[]'::jsonb
    )$$,
    'P0001',
    NULL,
    '8.4 Rejects yield unit mismatch'
);

-- 8.5 Rejects missing input lines (count mismatch)
SELECT throws_ok(
    $$SELECT public.start_production_run_from_snapshot(
        'c0000000-0000-0000-0000-000000000099'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid,
        NULL,
        'aaaaaaaa-3333-0000-0000-000000000001'::uuid,
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece'),
        '2026-09-10'::date,
        '00000000-0000-0000-0000-0000000000a1'::uuid,
        NULL,
        jsonb_build_array(
            jsonb_build_object(
                'recipe_input_id', 'aaaaaaaa-4444-0000-0000-000000000001',
                'item_id', 'aaaaaaaa-1111-0000-0000-000000000001',
                'planned_quantity', 5000.0,
                'planned_unit_id', (SELECT id FROM public.units WHERE code = 'g')
            )
        )
    )$$,
    'P0001',
    'Snapshot input count mismatch: expected 2, got 1',
    '8.5 Rejects incomplete input snapshot'
);

-- 8.6 Rejects zero / negative input quantity (underflow check)
SELECT throws_ok(
    $$SELECT public.start_production_run_from_snapshot(
        'c0000000-0000-0000-0000-000000000099'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid,
        NULL,
        'aaaaaaaa-3333-0000-0000-000000000001'::uuid,
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece'),
        '2026-09-10'::date,
        '00000000-0000-0000-0000-0000000000a1'::uuid,
        NULL,
        jsonb_build_array(
            jsonb_build_object(
                'recipe_input_id', 'aaaaaaaa-4444-0000-0000-000000000001',
                'item_id', 'aaaaaaaa-1111-0000-0000-000000000001',
                'planned_quantity', 0.0,
                'planned_unit_id', (SELECT id FROM public.units WHERE code = 'g')
            ),
            jsonb_build_object(
                'recipe_input_id', 'aaaaaaaa-4444-0000-0000-000000000002',
                'item_id', 'aaaaaaaa-1111-0000-0000-000000000002',
                'planned_quantity', 3000.0,
                'planned_unit_id', (SELECT id FROM public.units WHERE code = 'g')
            )
        )
    )$$,
    'P0001',
    'Planned quantity for nominal input aaaaaaaa-4444-0000-0000-000000000001 must be positive, underflow detected',
    '8.6 Rejects zero planned quantity'
);

SELECT * FROM finish();
ROLLBACK;
