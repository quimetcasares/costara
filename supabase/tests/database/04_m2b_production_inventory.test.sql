BEGIN;

SELECT plan(45);

-- ============================================================================
-- 0. SETUP: Test Data (Businesses, Users, Units, Items, Conversions, Densities, Recipe)
-- ============================================================================
DO $$
DECLARE
    v_user_a uuid := '00000000-0000-0000-0000-0000000000a1';
    v_user_a_mem uuid := '00000000-0000-0000-0000-0000000000a2';
    v_user_b uuid := '00000000-0000-0000-0000-0000000000b1';

    v_biz_a uuid := '11111111-1111-1111-1111-111111111111';
    v_biz_b uuid := '22222222-2222-2222-2222-222222222222';

    v_unit_g uuid;
    v_unit_kg uuid;
    v_unit_ml uuid;
    v_unit_l uuid;
    v_unit_pza uuid;

    v_item_flour uuid := 'aaaaaaaa-1111-0000-0000-000000000001';
    v_item_water uuid := 'aaaaaaaa-1111-0000-0000-000000000002';
    v_item_milk  uuid := 'aaaaaaaa-1111-0000-0000-000000000003';
    v_item_oil   uuid := 'aaaaaaaa-1111-0000-0000-000000000004';
    v_item_bread uuid := 'aaaaaaaa-1111-0000-0000-000000000005';

    v_item_b_flour uuid := 'bbbbbbbb-1111-0000-0000-000000000001';

    v_conv_costal uuid := 'aaaaaaaa-5555-0000-0000-000000000001';
    v_density_milk uuid := 'aaaaaaaa-6666-0000-0000-000000000001';

    v_recipe_id uuid := 'aaaaaaaa-2222-0000-0000-000000000001';
    v_v1_id uuid := 'aaaaaaaa-3333-0000-0000-000000000001';
    v_v2_draft_id uuid := 'aaaaaaaa-3333-0000-0000-000000000002';

    v_inp_flour uuid := 'aaaaaaaa-4444-0000-0000-000000000001';
    v_inp_water uuid := 'aaaaaaaa-4444-0000-0000-000000000002';
    v_inp_milk  uuid := 'aaaaaaaa-4444-0000-0000-000000000003';
    v_inp_v2_flour uuid := 'aaaaaaaa-4444-0000-0000-000000000099';
BEGIN
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';
    SELECT id INTO v_unit_kg FROM public.units WHERE code = 'kg';
    SELECT id INTO v_unit_ml FROM public.units WHERE code = 'ml';
    SELECT id INTO v_unit_l FROM public.units WHERE code = 'l';
    SELECT id INTO v_unit_pza FROM public.units WHERE code = 'piece';

    -- Users
    INSERT INTO auth.users (id, email) VALUES
        (v_user_a, 'owner_a@test.com'),
        (v_user_a_mem, 'member_a@test.com'),
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
        (v_biz_a, v_user_a_mem, 'member'),
        (v_biz_b, v_user_b, 'owner')
    ON CONFLICT (business_id, user_id) DO NOTHING;

    -- Items Biz A
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable, producible, sellable, track_inventory) VALUES
        (v_item_flour, v_biz_a, 'Harina Fuerte', 'raw_material', v_unit_g, true, false, false, true),
        (v_item_water, v_biz_a, 'Agua', 'raw_material', v_unit_g, true, false, false, true),
        (v_item_milk,  v_biz_a, 'Leche Entera', 'raw_material', v_unit_g, true, false, false, true),
        (v_item_oil,   v_biz_a, 'Aceite Vegetal', 'raw_material', v_unit_g, true, false, false, true),
        (v_item_bread, v_biz_a, 'Pan Campesino', 'finished_product', v_unit_pza, false, true, true, true)
    ON CONFLICT (id) DO NOTHING;

    -- Items Biz B
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable, producible, sellable, track_inventory) VALUES
        (v_item_b_flour, v_biz_b, 'Harina Biz B', 'raw_material', v_unit_g, true, false, false, true)
    ON CONFLICT (id) DO NOTHING;

    -- Item Unit Conversion: 1 costal = 25 kg of Harina
    INSERT INTO public.item_unit_conversions (id, business_id, item_id, name_singular, name_plural, quantity, unit_id, is_active) VALUES
        (v_conv_costal, v_biz_a, v_item_flour, 'costal', 'costales', 25.0, v_unit_kg, true)
    ON CONFLICT (id) DO NOTHING;

    -- Item Density for Milk: 1 ml = 1.03 g (approximate)
    INSERT INTO public.item_densities (id, business_id, item_id, mass_unit_id, volume_unit_id, density_factor, is_approximate, is_active) VALUES
        (v_density_milk, v_biz_a, v_item_milk, v_unit_g, v_unit_ml, 1.030000000000, true, true)
    ON CONFLICT (id) DO NOTHING;

    -- Recipe & Versions
    INSERT INTO public.recipes (id, business_id, name, output_item_id, is_active) VALUES
        (v_recipe_id, v_biz_a, 'Pan Campesino Receta', v_item_bread, true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.recipe_versions (
        id, business_id, recipe_id, version_number, status,
        reference_yield_quantity, reference_yield_unit_id
    ) VALUES
        (v_v1_id, v_biz_a, v_recipe_id, 1, 'draft', 10.0, v_unit_pza),
        (v_v2_draft_id, v_biz_a, v_recipe_id, 2, 'draft', 10.0, v_unit_pza)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id) VALUES
        (v_inp_flour, v_biz_a, v_v1_id, v_item_flour, 1, 'absolute', 5000.0, v_unit_g),
        (v_inp_water, v_biz_a, v_v1_id, v_item_water, 2, 'absolute', 3000.0, v_unit_g),
        (v_inp_milk,  v_biz_a, v_v1_id, v_item_milk,  3, 'absolute', 1000.0, v_unit_g),
        (v_inp_v2_flour, v_biz_a, v_v2_draft_id, v_item_flour, 1, 'absolute', 5000.0, v_unit_g)
    ON CONFLICT (id) DO NOTHING;

    -- Publish v1 to active status with effective_from
    UPDATE public.recipe_versions
    SET status = 'active',
        effective_from = '2026-01-01 00:00:00+00'::timestamptz
    WHERE id = v_v1_id;
END $$;


-- ============================================================================
-- 1. AISLAMIENTO MULTI-TENANT
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000b1'; -- User B

-- 1.1 User B cannot read Biz A item densities
SELECT is_empty(
    $$SELECT id FROM public.item_densities WHERE business_id = '11111111-1111-1111-1111-111111111111'$$,
    '1.1 Multi-tenant: User B cannot see Biz A item densities'
);

-- 1.2 User B cannot create purchase receipt in Biz A
SELECT throws_ok(
    $$SELECT public.create_purchase_receipt(
        '11111111-1111-1111-1111-111111111111'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000001'::uuid,
        10.0,
        (SELECT id FROM public.units WHERE code = 'kg')
    )$$,
    '42501',
    'Forbidden: user is not a member of business 11111111-1111-1111-1111-111111111111',
    '1.2 Multi-tenant: User B cannot create receipt in Biz A'
);


-- ============================================================================
-- 2. PLAN TEMPLATE -> PLAN -> TARGETS
-- ============================================================================
SET LOCAL "request.jwt.claim.sub" TO '00000000-0000-0000-0000-0000000000a1'; -- User A

-- 2.1 Create template and template item
SELECT lives_ok(
    $$
    INSERT INTO public.production_plan_templates (id, business_id, name)
    VALUES ('aaaaaaaa-7777-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Plantilla Regular');

    INSERT INTO public.production_plan_template_items (
        business_id, template_id, day_of_week, item_id, target_quantity, unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-7777-0000-0000-000000000001',
        1, -- Monday
        'aaaaaaaa-1111-0000-0000-000000000005', -- Bread
        20.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    );
    $$,
    '2.1 Plan template and template item created successfully'
);

-- 2.2 Template item with incompatible dimension fails
SELECT throws_ok(
    $$
    INSERT INTO public.production_plan_template_items (
        business_id, template_id, day_of_week, item_id, target_quantity, unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-7777-0000-0000-000000000001',
        2,
        'aaaaaaaa-1111-0000-0000-000000000005', -- Bread (piece base unit)
        20.0,
        (SELECT id FROM public.units WHERE code = 'kg') -- Dimension mismatch
    );
    $$,
    'P0001',
    'Unit dimension mismatch: template item unit must match item base unit dimension',
    '2.2 Incompatible dimension on template item is rejected'
);

-- 2.3 Create dated production plan
SELECT lives_ok(
    $$
    INSERT INTO public.production_plans (id, business_id, template_id, name, start_date, end_date)
    VALUES (
        'aaaaaaaa-8888-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-7777-0000-0000-000000000001',
        'Semana 38',
        '2026-09-14',
        '2026-09-20'
    );
    $$,
    '2.3 Dated production plan created successfully'
);

-- 2.4 Target outside plan date range fails
SELECT throws_ok(
    $$
    INSERT INTO public.production_targets (
        business_id, production_plan_id, target_date, item_id, target_quantity, unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-8888-0000-0000-000000000001',
        '2026-09-25', -- Outside range
        'aaaaaaaa-1111-0000-0000-000000000005',
        20.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    );
    $$,
    'P0001',
    'Target date 2026-09-25 is outside production plan range [2026-09-14, 2026-09-20]',
    '2.4 Target date outside plan date range is rejected'
);


-- ============================================================================
-- 3. SNAPSHOT RECIPE_VERSION EN TARGET
-- ============================================================================
-- 3.1 Create target linking recipe v1
SELECT lives_ok(
    $$
    INSERT INTO public.production_targets (
        id, business_id, production_plan_id, target_date, item_id, recipe_version_id, target_quantity, unit_id
    ) VALUES (
        'aaaaaaaa-9999-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-8888-0000-0000-000000000001',
        '2026-09-14',
        'aaaaaaaa-1111-0000-0000-000000000005',
        'aaaaaaaa-3333-0000-0000-000000000001', -- v1
        20.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    );
    $$,
    '3.1 Production target preserves recipe_version snapshot'
);


-- ============================================================================
-- 4. RECIPE_VERSION CONGELADA EN RUN
-- ============================================================================
RESET ROLE;
-- 4.1 Run with draft recipe version fails
SELECT throws_ok(
    $$
    INSERT INTO public.production_runs (
        business_id, recipe_version_id, planned_yield_quantity, planned_yield_unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-3333-0000-0000-000000000002', -- Draft v2
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    );
    $$,
    'P0001',
    'Cannot execute production run with draft recipe version. Version must be active or archived',
    '4.1 Production run cannot be created with draft recipe version'
);

-- 4.2 Create run with active version v1
SELECT lives_ok(
    $$
    INSERT INTO public.production_runs (
        id, business_id, recipe_version_id, status, planned_yield_quantity, planned_yield_unit_id
    ) VALUES (
        'aaaaaaaa-aaaa-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-3333-0000-0000-000000000001',
        'planned',
        10.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    );
    $$,
    '4.2 Production run created successfully with active version'
);

-- 4.3 Modifying recipe_version_id on created run fails
SELECT throws_ok(
    $$
    UPDATE public.production_runs
    SET recipe_version_id = 'aaaaaaaa-3333-0000-0000-000000000002'
    WHERE id = 'aaaaaaaa-aaaa-0000-0000-000000000001';
    $$,
    'P0001',
    'recipe_version_id is immutable once production run is created',
    '4.3 recipe_version_id is frozen and immutable on production run'
);


-- ============================================================================
-- 5, 6, 7, 8, 9. INPUTS: PLANEADOS, REALES, ACTUAL=0, NO PLANEADOS Y REPETIDOS
-- ============================================================================
SELECT lives_ok(
    $$
    -- 5. Input planeado confirmado como real (Flour: planned 5000g, actual 5000g)
    INSERT INTO public.production_run_inputs (
        id, business_id, production_run_id, recipe_input_id, item_id, position,
        planned_quantity, planned_unit_id, actual_quantity, actual_unit_id
    ) VALUES (
        'aaaaaaaa-bbbb-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000001',
        'aaaaaaaa-4444-0000-0000-000000000001',
        'aaaaaaaa-1111-0000-0000-000000000001',
        1,
        5000.0, (SELECT id FROM public.units WHERE code = 'g'),
        5000.0, (SELECT id FROM public.units WHERE code = 'g')
    );

    -- 6. Input real diferente al planeado (Water: planned 3000g, actual 3200g)
    INSERT INTO public.production_run_inputs (
        id, business_id, production_run_id, recipe_input_id, item_id, position,
        planned_quantity, planned_unit_id, actual_quantity, actual_unit_id
    ) VALUES (
        'aaaaaaaa-bbbb-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000001',
        'aaaaaaaa-4444-0000-0000-000000000002',
        'aaaaaaaa-1111-0000-0000-000000000002',
        2,
        3000.0, (SELECT id FROM public.units WHERE code = 'g'),
        3200.0, (SELECT id FROM public.units WHERE code = 'g')
    );

    -- 7. Input planeado con actual = 0 (Milk: planned 1000g, actual 0g)
    INSERT INTO public.production_run_inputs (
        id, business_id, production_run_id, recipe_input_id, item_id, position,
        planned_quantity, planned_unit_id, actual_quantity, actual_unit_id
    ) VALUES (
        'aaaaaaaa-bbbb-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000001',
        'aaaaaaaa-4444-0000-0000-000000000003',
        'aaaaaaaa-1111-0000-0000-000000000003',
        3,
        1000.0, (SELECT id FROM public.units WHERE code = 'g'),
        0.0,    (SELECT id FROM public.units WHERE code = 'g')
    );

    -- 8. Input no planeado (Oil: recipe_input_id NULL, planned 0/NULL, actual 20g)
    INSERT INTO public.production_run_inputs (
        id, business_id, production_run_id, recipe_input_id, item_id, position,
        planned_quantity, planned_unit_id, actual_quantity, actual_unit_id
    ) VALUES (
        'aaaaaaaa-bbbb-0000-0000-000000000004',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000001',
        NULL,
        'aaaaaaaa-1111-0000-0000-000000000004',
        4,
        0.0, NULL,
        20.0, (SELECT id FROM public.units WHERE code = 'g')
    );

    -- 9. Mismo item no planeado en dos líneas legítimas (Oil: second line, actual 15g)
    INSERT INTO public.production_run_inputs (
        id, business_id, production_run_id, recipe_input_id, item_id, position,
        planned_quantity, planned_unit_id, actual_quantity, actual_unit_id
    ) VALUES (
        'aaaaaaaa-bbbb-0000-0000-000000000005',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000001',
        NULL,
        'aaaaaaaa-1111-0000-0000-000000000004',
        5,
        0.0, NULL,
        15.0, (SELECT id FROM public.units WHERE code = 'g')
    );
    $$,
    '5-9. Configured planned, altered, actual=0, unplanned, and multi-line unplanned inputs'
);

-- Check Ajuste 1: unplanned input with planned_quantity > 0 fails constraint
SELECT throws_ok(
    $$
    INSERT INTO public.production_run_inputs (
        business_id, production_run_id, recipe_input_id, item_id,
        planned_quantity, planned_unit_id, actual_quantity, actual_unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000001',
        NULL,
        'aaaaaaaa-1111-0000-0000-000000000004',
        10.0, (SELECT id FROM public.units WHERE code = 'g'),
        10.0, (SELECT id FROM public.units WHERE code = 'g')
    );
    $$,
    '23514',
    NULL,
    'Ajuste 1: Unplanned input cannot have planned_quantity > 0'
);

-- Provenance Test A: Recipe input from another recipe version is rejected
SELECT throws_ok(
    $$
    INSERT INTO public.production_run_inputs (
        business_id, production_run_id, recipe_input_id, item_id,
        planned_quantity, planned_unit_id, actual_quantity, actual_unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000001',
        'aaaaaaaa-4444-0000-0000-000000000099', -- Belongs to v2, run belongs to v1!
        'aaaaaaaa-1111-0000-0000-000000000001', -- Flour
        5000.0, (SELECT id FROM public.units WHERE code = 'g'),
        5000.0, (SELECT id FROM public.units WHERE code = 'g')
    );
    $$,
    'P0001',
    'Recipe input aaaaaaaa-4444-0000-0000-000000000099 belongs to recipe version aaaaaaaa-3333-0000-0000-000000000002, which does not match production run recipe version aaaaaaaa-3333-0000-0000-000000000001',
    'Provenance: Recipe input from another recipe version is rejected'
);

-- Provenance Test B: Item ID mismatch between recipe input and run input is rejected
SELECT throws_ok(
    $$
    INSERT INTO public.production_run_inputs (
        business_id, production_run_id, recipe_input_id, item_id,
        planned_quantity, planned_unit_id, actual_quantity, actual_unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000001',
        'aaaaaaaa-4444-0000-0000-000000000001', -- Recipe input is Flour
        'aaaaaaaa-1111-0000-0000-000000000004', -- Run input item is Oil!
        5000.0, (SELECT id FROM public.units WHERE code = 'g'),
        5000.0, (SELECT id FROM public.units WHERE code = 'g')
    );
    $$,
    'P0001',
    'Recipe input aaaaaaaa-4444-0000-0000-000000000001 item aaaaaaaa-1111-0000-0000-000000000001 does not match production run input item aaaaaaaa-1111-0000-0000-000000000004',
    'Provenance: Item mismatch between recipe input and run input is rejected'
);


-- ============================================================================
-- 10. RUN COMPLETED CON OUTPUT 0 Y CONSUMOS
-- ============================================================================
-- Complete the run with actual_yield_quantity = 0 (batch failure)
SELECT lives_ok(
    $$
    SELECT public.complete_production_run(
        'aaaaaaaa-aaaa-0000-0000-000000000001'::uuid,
        0.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    );
    $$,
    '10.1 Run completed successfully with output 0'
);

-- Verify status is completed
SELECT results_eq(
    $$SELECT status, actual_yield_quantity FROM public.production_runs WHERE id = 'aaaaaaaa-aaaa-0000-0000-000000000001'$$,
    $$VALUES ('completed'::text, 0.0::numeric)$$,
    '10.2 Run status is completed with actual_yield = 0'
);

-- Verify Kardex movements:
-- Flour: -5000g
-- Water: -3200g
-- Milk (actual 0): NO movement!
-- Oil 1: -20g
-- Oil 2: -15g
-- Output (yield 0): NO movement!
SELECT results_eq(
    $$
    SELECT item_id, movement_type, quantity_base
    FROM public.inventory_movements
    WHERE production_run_id = 'aaaaaaaa-aaaa-0000-0000-000000000001'
    ORDER BY created_at ASC, quantity_base ASC
    $$,
    $$VALUES
        ('aaaaaaaa-1111-0000-0000-000000000001'::uuid, 'production_input'::text, -5000.0::numeric),
        ('aaaaaaaa-1111-0000-0000-000000000002'::uuid, 'production_input'::text, -3200.0::numeric),
        ('aaaaaaaa-1111-0000-0000-000000000004'::uuid, 'production_input'::text, -20.0::numeric),
        ('aaaaaaaa-1111-0000-0000-000000000004'::uuid, 'production_input'::text, -15.0::numeric)
    $$,
    '10.3 Kardex generated exactly 4 input movements; 0 output and 0 for actual=0 input'
);


-- ============================================================================
-- 11 & 12. CANCELLED SIN MOVIMIENTOS & IMPEDIR CANCELLED CON CONSUMO
-- ============================================================================
-- 11. Create new run without consumptions and cancel it
SELECT lives_ok(
    $$
    INSERT INTO public.production_runs (
        id, business_id, recipe_version_id, status, planned_yield_quantity, planned_yield_unit_id
    ) VALUES (
        'aaaaaaaa-aaaa-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-3333-0000-0000-000000000001',
        'planned',
        5.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    );

    SELECT public.cancel_production_run('aaaaaaaa-aaaa-0000-0000-000000000002'::uuid);
    $$,
    '11.1 Production run cancelled successfully before consumption'
);

SELECT results_eq(
    $$SELECT status FROM public.production_runs WHERE id = 'aaaaaaaa-aaaa-0000-0000-000000000002'$$,
    $$VALUES ('cancelled'::text)$$,
    '11.2 Status is cancelled'
);

SELECT is_empty(
    $$SELECT id FROM public.inventory_movements WHERE production_run_id = 'aaaaaaaa-aaaa-0000-0000-000000000002'$$,
    '11.3 Cancelled run generated zero Kardex movements'
);

-- 12. Run with physical consumption cannot be cancelled
SELECT lives_ok(
    $$
    INSERT INTO public.production_runs (
        id, business_id, recipe_version_id, status, planned_yield_quantity, planned_yield_unit_id
    ) VALUES (
        'aaaaaaaa-aaaa-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-3333-0000-0000-000000000001',
        'in_progress',
        5.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    );

    INSERT INTO public.production_run_inputs (
        business_id, production_run_id, recipe_input_id, item_id,
        planned_quantity, planned_unit_id, actual_quantity, actual_unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000003',
        'aaaaaaaa-4444-0000-0000-000000000001',
        'aaaaaaaa-1111-0000-0000-000000000001',
        500.0, (SELECT id FROM public.units WHERE code = 'g'),
        500.0, (SELECT id FROM public.units WHERE code = 'g')
    );
    $$,
    '12.1 Run with physical consumption created'
);

SELECT throws_ok(
    $$SELECT public.cancel_production_run('aaaaaaaa-aaaa-0000-0000-000000000003'::uuid)$$,
    'P0001',
    'Cannot cancel production run with existing physical consumptions',
    '12.2 cancel_production_run rejects cancelling run with physical consumptions'
);

SELECT throws_ok(
    $$UPDATE public.production_runs SET status = 'cancelled' WHERE id = 'aaaaaaaa-aaaa-0000-0000-000000000003'$$,
    'P0001',
    'Cannot cancel production run with existing physical consumptions',
    '12.3 Trigger rejects direct cancellation of run with physical consumptions'
);


-- ============================================================================
-- 13. IDEMPOTENCIA DE COMPLETE_PRODUCTION_RUN
-- ============================================================================
SELECT lives_ok(
    $$SELECT public.complete_production_run(
        'aaaaaaaa-aaaa-0000-0000-000000000001'::uuid,
        0.0,
        (SELECT id FROM public.units WHERE code = 'piece')
    )$$,
    '13.1 Calling complete_production_run again is idempotent and lives'
);

SELECT results_eq(
    $$SELECT count(*)::integer FROM public.inventory_movements WHERE production_run_id = 'aaaaaaaa-aaaa-0000-0000-000000000001'$$,
    $$VALUES (4::integer)$$,
    '13.2 Idempotent completion does not duplicate Kardex movements'
);


-- ============================================================================
-- 14 & 15. SIGNOS DEL KARDEX & IMPEDIR INSERT DIRECTO
-- ============================================================================
-- 14. Signs check
SELECT is_empty(
    $$
    SELECT id FROM public.inventory_movements
    WHERE (movement_type = 'production_input' AND quantity_base >= 0)
       OR (movement_type = 'production_output' AND quantity_base <= 0)
    $$,
    '14.1 Production inputs are strictly negative and outputs strictly positive'
);

-- 15. Direct INSERT to inventory_movements is prevented for client roles
SET LOCAL ROLE authenticated;
SELECT throws_ok(
    $$
    INSERT INTO public.inventory_movements (
        business_id, item_id, movement_type, quantity_captured, captured_unit_id,
        quantity_base, base_unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-1111-0000-0000-000000000001',
        'purchase_receipt',
        10.0, (SELECT id FROM public.units WHERE code = 'kg'),
        10000.0, (SELECT id FROM public.units WHERE code = 'g')
    );
    $$,
    '42501',
    NULL,
    '15.1 Direct INSERT into inventory_movements is rejected by privileges/RLS'
);
RESET ROLE;


-- ============================================================================
-- 15b. INITIAL BALANCE (SALDO INICIAL)
-- ============================================================================
SELECT lives_ok(
    $$
    SELECT public.create_initial_inventory_balance(
        '11111111-1111-1111-1111-111111111111'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000001'::uuid, -- Flour (base_unit: g)
        100.0,
        (SELECT id FROM public.units WHERE code = 'kg'),
        NULL,
        '2026-08-01 00:00:00+00'::timestamptz,
        'Saldo inicial al adoptar Costara'
    );
    $$,
    '15b.1 create_initial_inventory_balance executes successfully'
);

SELECT results_eq(
    $$
    SELECT movement_type, quantity_captured, quantity_base
    FROM public.inventory_movements
    WHERE movement_type = 'initial_balance'
    $$,
    $$VALUES ('initial_balance'::text, 100.0::numeric, 100000.0::numeric)$$,
    '15b.2 Initial balance of 100 kg normalized to 100,000 g with positive sign'
);


-- ============================================================================
-- 16. PURCHASE RECEIPT (RECEPCIÓN MÍNIMA)
-- ============================================================================
DO $$
DECLARE
    v_receipt_id uuid;
    v_unit_kg uuid;
BEGIN
    SELECT id INTO v_unit_kg FROM public.units WHERE code = 'kg';

    SELECT public.create_purchase_receipt(
        '11111111-1111-1111-1111-111111111111'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000001'::uuid, -- Flour (base_unit: g)
        50.0,
        v_unit_kg,
        NULL,
        pg_catalog.now(),
        'Compra de 50 kg de Harina'
    ) INTO v_receipt_id;
END $$;

SELECT results_eq(
    $$
    SELECT movement_type, quantity_captured, quantity_base
    FROM public.inventory_movements
    WHERE movement_type = 'purchase_receipt' AND item_unit_conversion_id IS NULL
    $$,
    $$VALUES ('purchase_receipt'::text, 50.0::numeric, 50000.0::numeric)$$,
    '16.1 Purchase receipt of 50 kg normalized to 50,000 g'
);


-- ============================================================================
-- 17. ITEM UNIT CONVERSION (2 COSTALES -> UNIDAD BASE)
-- ============================================================================
DO $$
DECLARE
    v_receipt_id uuid;
BEGIN
    -- 2 costales of Flour (1 costal = 25 kg = 25,000 g) -> 50,000 g base
    SELECT public.create_purchase_receipt(
        '11111111-1111-1111-1111-111111111111'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000001'::uuid,
        2.0,
        NULL,
        'aaaaaaaa-5555-0000-0000-000000000001'::uuid, -- costal
        pg_catalog.now(),
        'Recepcion 2 costales'
    ) INTO v_receipt_id;
END $$;

SELECT results_eq(
    $$
    SELECT movement_type, quantity_captured, quantity_base, conversion_factor
    FROM public.inventory_movements
    WHERE item_unit_conversion_id = 'aaaaaaaa-5555-0000-0000-000000000001'
    $$,
    $$VALUES ('purchase_receipt'::text, 2.0::numeric, 50000.0::numeric, 25000.0::numeric)$$,
    '17.1 Receipt of 2 costales normalized to 50,000 g with factor 25,000'
);


-- ============================================================================
-- 18 & 19. DENSIDAD (2 L LECHE -> UNIDAD BASE MASA) & HISTORIAL INMUTABLE
-- ============================================================================
-- 18. Receipt of 2 L Milk (density 1.03 g/ml -> 2,000 ml * 1.03 = 2,060 g)
SELECT lives_ok(
    $$
    SELECT public.create_purchase_receipt(
        '11111111-1111-1111-1111-111111111111'::uuid,
        'aaaaaaaa-1111-0000-0000-000000000003'::uuid, -- Milk
        2.0,
        (SELECT id FROM public.units WHERE code = 'l'),
        NULL,
        '2026-09-01 10:00:00+00'::timestamptz,
        'Recepcion 2 L leche'
    );
    $$,
    '18.1 Receipt of 2 L milk recorded with density conversion'
);

SELECT results_eq(
    $$
    SELECT quantity_captured, quantity_base, conversion_factor, is_approximate
    FROM public.inventory_movements
    WHERE item_id = 'aaaaaaaa-1111-0000-0000-000000000003' AND movement_type = 'purchase_receipt'
    $$,
    $$VALUES (2.0::numeric, 2060.0::numeric, 1030.0::numeric, true)$$,
    '18.2 Milk normalized to 2,060 g (is_approximate = true)'
);

-- 19. Subsequent update of density does not alter historical movement
UPDATE public.item_densities
SET density_factor = 1.050000000000
WHERE id = 'aaaaaaaa-6666-0000-0000-000000000001';

SELECT results_eq(
    $$
    SELECT quantity_base
    FROM public.inventory_movements
    WHERE item_id = 'aaaaaaaa-1111-0000-0000-000000000003' AND movement_type = 'purchase_receipt'
    $$,
    $$VALUES (2060.0::numeric)$$,
    '19.1 Historical milk movement quantity_base remains exactly 2,060 g after density change'
);


-- ============================================================================
-- 20. REVERSAL EXACTO Y NO DUPLICABLE
-- ============================================================================
DO $$
DECLARE
    v_milk_mov_id uuid;
    v_rev_id uuid;
BEGIN
    SELECT id INTO v_milk_mov_id
    FROM public.inventory_movements
    WHERE item_id = 'aaaaaaaa-1111-0000-0000-000000000003' AND movement_type = 'purchase_receipt'
    LIMIT 1;

    -- Execute reversal
    SELECT public.reverse_inventory_movement(v_milk_mov_id, 'Error de captura leche') INTO v_rev_id;
END $$;

-- 20.1 Reversal movement values
SELECT results_eq(
    $$
    SELECT movement_type, quantity_captured, quantity_base, reversal_of_movement_id IS NOT NULL
    FROM public.inventory_movements
    WHERE movement_type = 'reversal'
    $$,
    $$VALUES ('reversal'::text, -2.0::numeric, -2060.0::numeric, true)$$,
    '20.1 Reversal has exact inverted values (-2 L captured, -2,060 g base)'
);

-- 20.2 Duplicate reversal attempt fails
SELECT throws_ok(
    $$
    SELECT public.reverse_inventory_movement(
        (SELECT id FROM public.inventory_movements WHERE item_id = 'aaaaaaaa-1111-0000-0000-000000000003' AND movement_type = 'purchase_receipt' LIMIT 1),
        'Intento duplicado'
    );
    $$,
    'P0001',
    NULL,
    '20.2 Cannot reverse the same movement twice'
);

-- 20.3 Reversing a reversal movement fails
SELECT throws_ok(
    $$
    SELECT public.reverse_inventory_movement(
        (SELECT id FROM public.inventory_movements WHERE movement_type = 'reversal' LIMIT 1),
        'Revertir reversa'
    );
    $$,
    'P0001',
    'Cannot reverse a reversal movement',
    '20.3 Reversing a reversal movement is rejected'
);


-- ============================================================================
-- 21. IMPEDIR MODIFICAR PRODUCTION_RUN_INPUTS DESPUÉS DE COMPLETED/CANCELLED
-- ============================================================================
-- 21.1 Modify input on completed run fails
SELECT throws_ok(
    $$
    UPDATE public.production_run_inputs
    SET actual_quantity = 5500.0
    WHERE id = 'aaaaaaaa-bbbb-0000-0000-000000000001';
    $$,
    'P0001',
    'Cannot modify inputs of a completed production run',
    '21.1 Cannot update inputs of a completed production run'
);

-- 21.2 Insert input on completed run fails
SELECT throws_ok(
    $$
    INSERT INTO public.production_run_inputs (
        business_id, production_run_id, item_id,
        planned_quantity, actual_quantity, actual_unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000001', -- Completed run
        'aaaaaaaa-1111-0000-0000-000000000004',
        0.0, 50.0, (SELECT id FROM public.units WHERE code = 'g')
    );
    $$,
    'P0001',
    'Cannot modify inputs of a completed production run',
    '21.2 Cannot insert inputs into a completed production run'
);

-- 21.3 Modify input on cancelled run fails
SELECT throws_ok(
    $$
    INSERT INTO public.production_run_inputs (
        business_id, production_run_id, item_id,
        planned_quantity, actual_quantity, actual_unit_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-0000-0000-000000000002', -- Cancelled run
        'aaaaaaaa-1111-0000-0000-000000000004',
        0.0, 50.0, (SELECT id FROM public.units WHERE code = 'g')
    );
    $$,
    'P0001',
    'Cannot modify inputs of a cancelled production run',
    '21.3 Cannot insert inputs into a cancelled production run'
);


-- ============================================================================
-- 22. IMPEDIR ALTERAR MOVIMIENTOS HISTÓRICOS (INMUTABILIDAD KARDEX)
-- ============================================================================
RESET ROLE;

-- 22.1 UPDATE on inventory_movements fails even for superuser/postgres via trigger
SELECT throws_ok(
    $$
    UPDATE public.inventory_movements
    SET notes = 'Alteracion de kardex'
    WHERE movement_type = 'purchase_receipt';
    $$,
    'P0001',
    'Inventory movements are strictly immutable and cannot be updated or deleted',
    '22.1 UPDATE on inventory_movements is blocked by trigger'
);

-- 22.2 DELETE on inventory_movements fails even for superuser/postgres via trigger
SELECT throws_ok(
    $$
    DELETE FROM public.inventory_movements
    WHERE movement_type = 'purchase_receipt';
    $$,
    'P0001',
    'Inventory movements are strictly immutable and cannot be updated or deleted',
    '22.2 DELETE on inventory_movements is blocked by trigger'
);


-- ============================================================================
-- 23. INTEGRIDAD DE ENLACES ORIGEN (check_inventory_movements_origin_links & FKs)
-- ============================================================================
-- 23.1 production_input without production_run_input_id is rejected by constraint
SELECT throws_ok(
    $$
    INSERT INTO public.inventory_movements (
        business_id, item_id, movement_type, quantity_captured, captured_unit_id,
        quantity_base, base_unit_id, production_run_id, production_run_input_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-1111-0000-0000-000000000001',
        'production_input',
        -10.0, (SELECT id FROM public.units WHERE code = 'g'),
        -10.0, (SELECT id FROM public.units WHERE code = 'g'),
        'aaaaaaaa-aaaa-0000-0000-000000000001',
        NULL
    );
    $$,
    '23514',
    NULL,
    '23.1 production_input without production_run_input_id is rejected by CHECK constraint'
);

-- 23.2 purchase_receipt with production_run_id is rejected by constraint
SELECT throws_ok(
    $$
    INSERT INTO public.inventory_movements (
        business_id, item_id, movement_type, quantity_captured, captured_unit_id,
        quantity_base, base_unit_id, production_run_id
    ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-1111-0000-0000-000000000001',
        'purchase_receipt',
        10.0, (SELECT id FROM public.units WHERE code = 'g'),
        10.0, (SELECT id FROM public.units WHERE code = 'g'),
        'aaaaaaaa-aaaa-0000-0000-000000000001'
    );
    $$,
    '23514',
    NULL,
    '23.2 purchase_receipt with production_run_id is rejected by CHECK constraint'
);

-- 23.3 Cross-business production_run_id is rejected by composite FK
SELECT throws_ok(
    $$
    INSERT INTO public.inventory_movements (
        business_id, item_id, movement_type, quantity_captured, captured_unit_id,
        quantity_base, base_unit_id, production_run_id
    ) VALUES (
        '22222222-2222-2222-2222-222222222222', -- Biz B
        'bbbbbbbb-1111-0000-0000-000000000001', -- Item on Biz B
        'production_output',
        10.0, (SELECT id FROM public.units WHERE code = 'g'),
        10.0, (SELECT id FROM public.units WHERE code = 'g'),
        'aaaaaaaa-aaaa-0000-0000-000000000001'  -- Run belongs to Biz A!
    );
    $$,
    '23503',
    NULL,
    '23.3 Cross-business production_run_id is rejected by composite FK fk_inventory_movements_run_business'
);

SELECT * FROM finish();

ROLLBACK;
