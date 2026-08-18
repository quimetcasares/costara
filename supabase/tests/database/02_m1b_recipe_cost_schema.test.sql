BEGIN;

SELECT plan(82);

-- ============================================================================
-- 0. SETUP: Test Data (Businesses, Users, Items, Conversions)
-- ============================================================================
DO $$
DECLARE
    v_unit_g uuid;
    v_unit_kg uuid;
    v_unit_ml uuid;
    v_unit_piece uuid;

    v_biz_a uuid := 'a0000000-0000-0000-0000-000000000001';
    v_biz_b uuid := 'b0000000-0000-0000-0000-000000000002';

    v_user_a_owner uuid := '00000000-0000-0000-0000-0000000000a1';
    v_user_a_member uuid := '00000000-0000-0000-0000-0000000000a2';
    v_user_b_owner uuid := '00000000-0000-0000-0000-0000000000b1';
    v_user_no_mem uuid := '00000000-0000-0000-0000-0000000000c1';
BEGIN
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';
    SELECT id INTO v_unit_kg FROM public.units WHERE code = 'kg';
    SELECT id INTO v_unit_ml FROM public.units WHERE code = 'ml';
    SELECT id INTO v_unit_piece FROM public.units WHERE code = 'piece';

    -- Users
    INSERT INTO auth.users (id, email) VALUES
        (v_user_a_owner, 'owner_a@test.com'),
        (v_user_a_member, 'member_a@test.com'),
        (v_user_b_owner, 'owner_b@test.com'),
        (v_user_no_mem, 'nomem@test.com');

    -- Businesses
    INSERT INTO public.businesses (id, name, currency_code) VALUES
        (v_biz_a, 'Biz A', 'MXN'),
        (v_biz_b, 'Biz B', 'MXN');

    -- Memberships
    INSERT INTO public.business_members (business_id, user_id, role) VALUES
        (v_biz_a, v_user_a_owner, 'owner'),
        (v_biz_a, v_user_a_member, 'member'),
        (v_biz_b, v_user_b_owner, 'owner');

    -- Items Biz A
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable, producible, sellable) VALUES
        ('a0000000-0000-0000-0000-000000000010', v_biz_a, 'Harina Trigo', 'raw_material', v_unit_g, true, false, false),
        ('a0000000-0000-0000-0000-000000000011', v_biz_a, 'Agua', 'raw_material', v_unit_g, true, false, false),
        ('a0000000-0000-0000-0000-000000000012', v_biz_a, 'Sal', 'raw_material', v_unit_g, true, false, false),
        ('a0000000-0000-0000-0000-000000000013', v_biz_a, 'Levadura', 'raw_material', v_unit_g, true, false, false),
        ('a0000000-0000-0000-0000-000000000014', v_biz_a, 'Masa Madre Hija', 'intermediate', v_unit_g, false, true, false),
        ('a0000000-0000-0000-0000-000000000015', v_biz_a, 'Mermelada Fresa', 'intermediate', v_unit_g, true, true, true),
        ('a0000000-0000-0000-0000-000000000016', v_biz_a, 'Hogaza Rustica', 'finished_product', v_unit_piece, false, true, true),
        ('a0000000-0000-0000-0000-000000000017', v_biz_a, 'Baguette', 'finished_product', v_unit_piece, false, true, true);

    -- Items Biz B
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable, producible, sellable) VALUES
        ('b0000000-0000-0000-0000-000000000010', v_biz_b, 'Harina B', 'raw_material', v_unit_g, true, false, false),
        ('b0000000-0000-0000-0000-000000000016', v_biz_b, 'Pan B', 'finished_product', v_unit_piece, false, true, true);
END $$;

-- ============================================================================
-- BLOQUE 1: recipes
-- ============================================================================

-- 1. Inserción de recipe válida en Biz A
SELECT lives_ok(
    $$INSERT INTO public.recipes (id, business_id, name, output_item_id)
      VALUES ('a0000000-0000-0000-0000-000000000100', 'a0000000-0000-0000-0000-000000000001', 'Receta Hogaza', 'a0000000-0000-0000-0000-000000000016')$$,
    '1. Recipe válida en Biz A creada exitosamente'
);

-- 2. Rechazo de recipe con output_item_id perteneciente a Biz B
SELECT throws_ok(
    $$INSERT INTO public.recipes (business_id, name, output_item_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'Receta Cross Tenant', 'b0000000-0000-0000-0000-000000000016')$$,
    '23503'::text,
    NULL::text,
    '2. Rechazo de recipe con output_item_id de otro tenant (FK compuesta)'
);

-- 3. Rechazo de segunda recipe para el mismo output_item_id en el mismo tenant
SELECT throws_ok(
    $$INSERT INTO public.recipes (business_id, name, output_item_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'Segunda Receta Hogaza', 'a0000000-0000-0000-0000-000000000016')$$,
    '23505'::text,
    NULL::text,
    '3. Rechazo de segunda recipe para el mismo output_item en el mismo business (UNIQUE)'
);

-- 4. Rechazo de modificar business_id en recipes
SELECT throws_ok(
    $$UPDATE public.recipes SET business_id = 'b0000000-0000-0000-0000-000000000002'
      WHERE id = 'a0000000-0000-0000-0000-000000000100'$$,
    'P0001'::text,
    'business_id is immutable'::text,
    '4. Rechazo de modificar business_id en recipes'
);

-- 5. Modificación permitida de output_item_id si solo existen versiones draft
-- Creamos una receta temporal y una versión draft para probar cambio de output_item
INSERT INTO public.recipes (id, business_id, name, output_item_id)
VALUES ('a0000000-0000-0000-0000-000000000199', 'a0000000-0000-0000-0000-000000000001', 'Receta Temp Draft', 'a0000000-0000-0000-0000-000000000017');

INSERT INTO public.recipe_versions (id, business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id)
VALUES ('a0000000-0000-0000-0000-000000000299', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000199', 1, 'draft', 1000, (SELECT id FROM public.units WHERE code = 'g'));

-- Creamos item extra para cambiar output_item
INSERT INTO public.items (id, business_id, name, kind, base_unit_id, producible)
VALUES ('a0000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000001', 'Baguette Rustica', 'finished_product', (SELECT id FROM public.units WHERE code = 'piece'), true);

SELECT lives_ok(
    $$UPDATE public.recipes SET output_item_id = 'a0000000-0000-0000-0000-000000000018'
      WHERE id = 'a0000000-0000-0000-0000-000000000199'$$,
    '5. Modificación permitida de output_item_id cuando solo existen versiones draft'
);

-- ============================================================================
-- BLOQUE 2: recipe_versions Lifecycle & Invariants
-- ============================================================================

-- 6. Inserción de versión draft con effective_from NULL
SELECT lives_ok(
    $$INSERT INTO public.recipe_versions (id, business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id, created_by)
      VALUES ('a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 1, 'draft', 14000, (SELECT id FROM public.units WHERE code = 'g'), '00000000-0000-0000-0000-0000000000a1')$$,
    '6. Inserción de versión draft con effective_from NULL exitosa'
);

-- 7. Rechazo de INSERT directo con status = 'active'
SELECT throws_ok(
    $$INSERT INTO public.recipe_versions (business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id, effective_from)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 2, 'active', 14000, (SELECT id FROM public.units WHERE code = 'g'), now())$$,
    'P0001'::text,
    'New recipe versions must be created with status "draft"'::text,
    '7. Rechazo de INSERT directo con status = active'
);

-- 8. Rechazo de INSERT directo con status = 'archived'
SELECT throws_ok(
    $$INSERT INTO public.recipe_versions (business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id, effective_from)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 2, 'archived', 14000, (SELECT id FROM public.units WHERE code = 'g'), now())$$,
    'P0001'::text,
    'New recipe versions must be created with status "draft"'::text,
    '8. Rechazo de INSERT directo con status = archived'
);

-- 9. Rechazo de version_number <= 0
SELECT throws_ok(
    $$INSERT INTO public.recipe_versions (business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 0, 'draft', 14000, (SELECT id FROM public.units WHERE code = 'g'))$$,
    '23514'::text,
    NULL::text,
    '9. Rechazo de version_number <= 0 (CHECK)'
);

-- 10. Rechazo de reference_yield_quantity <= 0
SELECT throws_ok(
    $$INSERT INTO public.recipe_versions (business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 2, 'draft', 0, (SELECT id FROM public.units WHERE code = 'g'))$$,
    '23514'::text,
    NULL::text,
    '10. Rechazo de reference_yield_quantity <= 0 (CHECK)'
);

-- 11. Rechazo de portion_quantity presente con portion_unit_id NULL
SELECT throws_ok(
    $$INSERT INTO public.recipe_versions (business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id, portion_quantity, portion_unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 2, 'draft', 14000, (SELECT id FROM public.units WHERE code = 'g'), 1100, NULL)$$,
    '23514'::text,
    NULL::text,
    '11. Rechazo de portion_quantity presente con portion_unit_id NULL (CHECK)'
);

-- 12. Rechazo de portion_unit_id presente con portion_quantity NULL
SELECT throws_ok(
    $$INSERT INTO public.recipe_versions (business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id, portion_quantity, portion_unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 2, 'draft', 14000, (SELECT id FROM public.units WHERE code = 'g'), NULL, (SELECT id FROM public.units WHERE code = 'g'))$$,
    '23514'::text,
    NULL::text,
    '12. Rechazo de portion_unit_id presente con portion_quantity NULL (CHECK)'
);

-- 13. Rechazo de portion_unit_id incompatible dimensionalmente con yield unit (g vs ml)
SELECT throws_ok(
    $$INSERT INTO public.recipe_versions (business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id, portion_quantity, portion_unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 2, 'draft', 14000, (SELECT id FROM public.units WHERE code = 'g'), 1100, (SELECT id FROM public.units WHERE code = 'ml'))$$,
    'P0001'::text,
    'Unit dimension mismatch: portion unit dimension does not match reference yield unit dimension'::text,
    '13. Rechazo de porción incompatible dimensionalmente con yield unit (Trigger)'
);

-- 14. Rechazo de modificar business_id, recipe_id o version_number en recipe_versions
SELECT throws_ok(
    $$UPDATE public.recipe_versions SET version_number = 99 WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    'P0001'::text,
    'version_number is immutable'::text,
    '14. Rechazo de modificar version_number en recipe_versions'
);

-- 15a. Rechazo de cambiar created_by a otro usuario
SELECT throws_ok(
    $$UPDATE public.recipe_versions SET created_by = '00000000-0000-0000-0000-0000000000b1' WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    'P0001'::text,
    'created_by cannot be changed'::text,
    '15a. Rechazo de cambiar created_by a otro usuario'
);

-- 15b. Rechazo de limpiar manualmente created_by a NULL mientras el usuario existe
SELECT throws_ok(
    $$UPDATE public.recipe_versions SET created_by = NULL WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    'P0001'::text,
    'created_by cannot be manually cleared'::text,
    '15b. Rechazo de limpiar manualmente created_by a NULL mientras el usuario existe'
);

-- 15c. ON DELETE SET NULL funciona al eliminar el usuario referenciado de auth.users
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000ff', 'temp_author@test.com');

INSERT INTO public.recipes (id, business_id, name, output_item_id)
VALUES ('a0000000-0000-0000-0000-000000000188', 'a0000000-0000-0000-0000-000000000001', 'Receta Temp Author', 'a0000000-0000-0000-0000-000000000017');

INSERT INTO public.recipe_versions (id, business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id, created_by)
VALUES ('a0000000-0000-0000-0000-000000000288', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000188', 1, 'draft', 1000, (SELECT id FROM public.units WHERE code = 'g'), '00000000-0000-0000-0000-0000000000ff');

DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-0000000000ff';

SELECT results_eq(
    'SELECT created_by FROM public.recipe_versions WHERE id = ''a0000000-0000-0000-0000-000000000288''',
    ARRAY[NULL::uuid],
    '15c. created_by pasa a NULL automáticamente cuando el usuario es eliminado de auth.users (ON DELETE SET NULL)'
);

DELETE FROM public.recipe_versions WHERE id = 'a0000000-0000-0000-0000-000000000288';
DELETE FROM public.recipes WHERE id = 'a0000000-0000-0000-0000-000000000188';

-- 16. Edición libre de formulación y portion en draft
SELECT lives_ok(
    $$UPDATE public.recipe_versions
      SET reference_yield_quantity = 15000,
          portion_quantity = 1100,
          portion_unit_id = (SELECT id FROM public.units WHERE code = 'g'),
          notes = 'Notas actualizadas en borrador'
      WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    '16. Edición libre de formulación en versión draft exitosa'
);

-- 17. Rechazo de transición directa draft -> archived
SELECT throws_ok(
    $$UPDATE public.recipe_versions SET status = 'archived', effective_from = now() WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    'P0001'::text,
    'Invalid status transition: draft cannot transition directly to archived'::text,
    '17. Rechazo de transición directa draft -> archived'
);

-- ============================================================================
-- BLOQUE 3: recipe_inputs y percentage_bases en Draft
-- ============================================================================

-- 18. Inserción de input absolute válido
SELECT lives_ok(
    $$INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000010', 1, 'absolute', 10, (SELECT id FROM public.units WHERE code = 'kg'))$$,
    '18. Inserción de input absolute válido exitosa'
);

-- 19. Rechazo de input absolute con percentage NOT NULL o quantity NULL
SELECT throws_ok(
    $$INSERT INTO public.recipe_inputs (business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id, percentage)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000011', 2, 'absolute', 7, (SELECT id FROM public.units WHERE code = 'kg'), 70)$$,
    '23514'::text,
    NULL::text,
    '19. Rechazo de input absolute con percentage NOT NULL (CHECK)'
);

-- Insumo 2: Agua (absolute 7 kg)
INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
VALUES ('a0000000-0000-0000-0000-000000000302', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000011', 2, 'absolute', 7, (SELECT id FROM public.units WHERE code = 'kg'));

-- 20. Inserción de input percentage válido (> 100% permitido)
SELECT lives_ok(
    $$INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, percentage)
      VALUES ('a0000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000014', 3, 'percentage', 105.500000000000)$$,
    '20. Inserción de input percentage con porcentaje > 100% exitosa'
);

-- 21. Rechazo de input percentage con quantity o unit_id presentes
SELECT throws_ok(
    $$INSERT INTO public.recipe_inputs (business_id, recipe_version_id, item_id, position, quantity_mode, quantity, percentage)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000012', 4, 'percentage', 200, 2)$$,
    '23514'::text,
    NULL::text,
    '21. Rechazo de input percentage con quantity presente (CHECK)'
);

-- 22. Rechazo de input absolute con dimensión incompatible (Harina con base g consumida en ml)
SELECT throws_ok(
    $$INSERT INTO public.recipe_inputs (business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000010', 4, 'absolute', 500, (SELECT id FROM public.units WHERE code = 'ml'))$$,
    'P0001'::text,
    'Unit dimension mismatch: recipe input unit dimension does not match item base unit dimension'::text,
    '22. Rechazo de input absolute con dimensión incompatible (Trigger)'
);

-- 23. Rechazo de input con item de Biz B
SELECT throws_ok(
    $$INSERT INTO public.recipe_inputs (business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000010', 4, 'absolute', 500, (SELECT id FROM public.units WHERE code = 'g'))$$,
    '23503'::text,
    NULL::text,
    '23. Rechazo de input con item perteneciente a otro business (FK compuesta)'
);

-- 24. Rechazo de receta consumiendo su propio output_item como input directo
SELECT throws_ok(
    $$INSERT INTO public.recipe_inputs (business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000016', 4, 'absolute', 1, (SELECT id FROM public.units WHERE code = 'piece'))$$,
    'P0001'::text,
    'Direct self-consumption rejected: recipe cannot consume its own output item as an input'::text,
    '24. Rechazo de auto-consumo directo de receta (Trigger)'
);

-- 25. Rechazo de modificar business_id o recipe_version_id en recipe_inputs
SELECT throws_ok(
    $$UPDATE public.recipe_inputs SET business_id = 'b0000000-0000-0000-0000-000000000002' WHERE id = 'a0000000-0000-0000-0000-000000000301'$$,
    'P0001'::text,
    'business_id is immutable'::text,
    '25. Rechazo de modificar business_id en recipe_inputs'
);

-- 26. Inserción válida de base porcentual simple (Masa madre 105.5% sobre Harina)
SELECT lives_ok(
    $$INSERT INTO public.recipe_input_percentage_bases (business_id, recipe_version_id, percentage_input_id, basis_input_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000301')$$,
    '26. Inserción válida de base porcentual simple exitosa'
);

-- 27. Inserción válida de base porcentual compuesta (Masa madre también toma como base Agua)
SELECT lives_ok(
    $$INSERT INTO public.recipe_input_percentage_bases (business_id, recipe_version_id, percentage_input_id, basis_input_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000302')$$,
    '27. Inserción válida de base porcentual compuesta exitosa'
);

-- 28. Rechazo de auto-referencia directa en base porcentual (Input A -> Input A)
SELECT throws_ok(
    $$INSERT INTO public.recipe_input_percentage_bases (business_id, recipe_version_id, percentage_input_id, basis_input_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000303')$$,
    '23514'::text,
    NULL::text,
    '28. Rechazo de auto-referencia directa en base porcentual (CHECK)'
);

-- 29. Rechazo de base porcentual donde percentage_input_id tiene quantity_mode = absolute
SELECT throws_ok(
    $$INSERT INTO public.recipe_input_percentage_bases (business_id, recipe_version_id, percentage_input_id, basis_input_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000302')$$,
    'P0001'::text,
    'percentage_input_id must have quantity_mode = percentage'::text,
    '29. Rechazo de base porcentual sobre input con quantity_mode absolute (Trigger)'
);

-- Insert input in version 299 for cross-version testing
INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
VALUES ('a0000000-0000-0000-0000-000000000399', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000299', 'a0000000-0000-0000-0000-000000000010', 1, 'absolute', 1, (SELECT id FROM public.units WHERE code = 'kg'));

-- 30. Rechazo de base porcentual cruzando versión distinta
SELECT throws_ok(
    $$INSERT INTO public.recipe_input_percentage_bases (business_id, recipe_version_id, percentage_input_id, basis_input_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000399')$$,
    '23503'::text,
    NULL::text,
    '30. Rechazo de base porcentual asociando inputs de versión distinta (FK compuesta)'
);

-- 31. Rechazo de UPDATE sobre recipe_input_percentage_bases
SELECT throws_ok(
    $$UPDATE public.recipe_input_percentage_bases SET basis_input_id = 'a0000000-0000-0000-0000-000000000301' WHERE percentage_input_id = 'a0000000-0000-0000-0000-000000000303'$$,
    'P0001'::text,
    'recipe_input_percentage_bases does not support UPDATE. Modify dependencies via DELETE and INSERT.'::text,
    '31. Rechazo estructural de UPDATE sobre recipe_input_percentage_bases (Trigger)'
);

-- 32. Rechazo de cambiar quantity_mode a absolute si existen bases porcentuales asociadas
SELECT throws_ok(
    $$UPDATE public.recipe_inputs SET quantity_mode = 'absolute', quantity = 1, unit_id = (SELECT id FROM public.units WHERE code = 'kg'), percentage = NULL WHERE id = 'a0000000-0000-0000-0000-000000000303'$$,
    'P0001'::text,
    'Cannot change quantity_mode to absolute while percentage bases exist for this input. Delete percentage bases first.'::text,
    '32. Rechazo de mutar quantity_mode a absolute con bases existentes (Trigger bidireccional)'
);

-- ============================================================================
-- BLOQUE 4: Publication Gate & State Machine
-- ============================================================================

-- Insumo 4: Sal (absolute 200 g)
INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
VALUES ('a0000000-0000-0000-0000-000000000304', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000012', 4, 'absolute', 200, (SELECT id FROM public.units WHERE code = 'g'));

-- Insumo 5: Mermelada (item dual: purchasable AND producible) agregado temporalmente sin costing_source para probar publication gate
INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
VALUES ('a0000000-0000-0000-0000-000000000305', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000015', 5, 'absolute', 500, (SELECT id FROM public.units WHERE code = 'g'));

-- 33. Rechazo de publicar draft -> active si item dual tiene costing_source NULL
SELECT throws_ok(
    $$UPDATE public.recipe_versions SET status = 'active', effective_from = '2026-01-01 00:00:00+00' WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    'P0001'::text,
    'Cannot publish recipe version: hybrid items (purchasable and producible) must have explicit costing_source'::text,
    '33. Rechazo de publicar draft -> active con item dual sin costing_source (Publication Gate)'
);

-- 34. Rechazo de costing_source = 'produced' para item que no es producible (Harina)
SELECT throws_ok(
    $$UPDATE public.recipe_inputs SET costing_source = 'produced' WHERE id = 'a0000000-0000-0000-0000-000000000301'$$,
    'P0001'::text,
    'Item is not producible and cannot have costing_source = produced'::text,
    '34. Rechazo de costing_source = produced en item no producible'
);

-- 35. Rechazo de costing_source = 'purchased' para item que no es purchasable (Masa Madre Hija)
SELECT throws_ok(
    $$UPDATE public.recipe_inputs SET costing_source = 'purchased' WHERE id = 'a0000000-0000-0000-0000-000000000303'$$,
    'P0001'::text,
    'Item is not purchasable and cannot have costing_source = purchased'::text,
    '35. Rechazo de costing_source = purchased en item no purchasable'
);

-- Corregimos costing_source en Mermelada para que cumpla publication gate
UPDATE public.recipe_inputs SET costing_source = 'produced' WHERE id = 'a0000000-0000-0000-0000-000000000305';

-- Agregamos un input porcentual huérfano (sin bases) para verificar rechazo por bases incompletas
INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, percentage)
VALUES ('a0000000-0000-0000-0000-000000000306', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000013', 6, 'percentage', 2);

-- 36. Rechazo de publicar draft -> active si input porcentual no tiene bases asociadas
SELECT throws_ok(
    $$UPDATE public.recipe_versions SET status = 'active', effective_from = '2026-01-01 00:00:00+00' WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    'P0001'::text,
    'Cannot publish recipe version: percentage inputs must have at least one percentage base'::text,
    '36. Rechazo de publicar con input porcentual sin bases (Publication Gate)'
);

-- Asignamos base al insumo huérfano
INSERT INTO public.recipe_input_percentage_bases (business_id, recipe_version_id, percentage_input_id, basis_input_id)
VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000306', 'a0000000-0000-0000-0000-000000000301');

-- 37. Publicación exitosa draft -> active (v1)
SELECT lives_ok(
    $$UPDATE public.recipe_versions SET status = 'active', effective_from = '2026-01-01 00:00:00+00' WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    '37. Publicación exitosa draft -> active (v1)'
);

-- 38. Rechazo de modificar output_item_id en recipe ahora que existe versión publicada
SELECT throws_ok(
    $$UPDATE public.recipes SET output_item_id = 'a0000000-0000-0000-0000-000000000017' WHERE id = 'a0000000-0000-0000-0000-000000000100'$$,
    'P0001'::text,
    'output_item_id cannot be changed once a published version exists for this recipe'::text,
    '38. Rechazo de modificar output_item_id en recipe con versiones publicadas (Trigger)'
);

-- 39. Rechazo de insertar nuevo recipe_input en versión active
SELECT throws_ok(
    $$INSERT INTO public.recipe_inputs (business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000013', 7, 'absolute', 50, (SELECT id FROM public.units WHERE code = 'g'))$$,
    'P0001'::text,
    'Cannot modify recipe inputs for a published (active or archived) recipe version'::text,
    '39. Rechazo de insertar recipe_input en versión active (Inmutabilidad)'
);

-- 40. Rechazo de modificar recipe_input en versión active
SELECT throws_ok(
    $$UPDATE public.recipe_inputs SET quantity = 15 WHERE id = 'a0000000-0000-0000-0000-000000000301'$$,
    'P0001'::text,
    'Cannot modify recipe inputs for a published (active or archived) recipe version'::text,
    '40. Rechazo de modificar recipe_input en versión active (Inmutabilidad)'
);

-- 41. Rechazo de eliminar recipe_input en versión active
SELECT throws_ok(
    $$DELETE FROM public.recipe_inputs WHERE id = 'a0000000-0000-0000-0000-000000000301'$$,
    'P0001'::text,
    'Cannot modify recipe inputs for a published (active or archived) recipe version'::text,
    '41. Rechazo de eliminar recipe_input en versión active (Inmutabilidad)'
);

-- 42. Rechazo de insertar percentage_base en versión active
SELECT throws_ok(
    $$INSERT INTO public.recipe_input_percentage_bases (business_id, recipe_version_id, percentage_input_id, basis_input_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000306', 'a0000000-0000-0000-0000-000000000302')$$,
    'P0001'::text,
    'Cannot modify percentage bases for a published (active or archived) recipe version'::text,
    '42. Rechazo de insertar percentage_base en versión active'
);

-- 43. Rechazo de modificar formulación en versión active
SELECT throws_ok(
    $$UPDATE public.recipe_versions SET reference_yield_quantity = 20000 WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    'P0001'::text,
    'Active recipe versions are immutable. To make changes, create a new version.'::text,
    '43. Rechazo de modificar formulación en versión active'
);

-- 44. Rechazo de regresar active -> draft
SELECT throws_ok(
    $$UPDATE public.recipe_versions SET status = 'draft' WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    'P0001'::text,
    'Invalid status transition: active cannot transition back to draft'::text,
    '44. Rechazo de revertir versión active a draft'
);

-- 45. Transición exitosa active -> archived (v1)
SELECT lives_ok(
    $$UPDATE public.recipe_versions SET status = 'archived' WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    '45. Transición exitosa active -> archived sin fallar por updated_at'
);

-- 46. Rechazo de cualquier mutación sobre versión archived
SELECT throws_ok(
    $$UPDATE public.recipe_versions SET status = 'active' WHERE id = 'a0000000-0000-0000-0000-000000000201'$$,
    'P0001'::text,
    'Archived recipe versions are 100% immutable and cannot be updated.'::text,
    '46. Rechazo de mutación o reactivación sobre versión archived'
);

-- Creamos v2 draft para probar publicación temporalmente secuencial
INSERT INTO public.recipe_versions (id, business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id)
VALUES ('a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', 2, 'draft', 16000, (SELECT id FROM public.units WHERE code = 'g'));

-- Insumo v2: Harina (absolute 11 kg)
INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
VALUES ('a0000000-0000-0000-0000-000000000310', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000010', 1, 'absolute', 11, (SELECT id FROM public.units WHERE code = 'kg'));

-- 47. Rechazo de publicar v2 con effective_from <= v1 archived (2026-01-01)
SELECT throws_ok(
    $$UPDATE public.recipe_versions SET status = 'active', effective_from = '2025-12-31 00:00:00+00' WHERE id = 'a0000000-0000-0000-0000-000000000202'$$,
    'P0001'::text,
    'Cannot publish recipe version: effective_from must be later than all existing published versions of this recipe'::text,
    '47. Rechazo de publicar versión con effective_from anterior a versión archivada existente'
);

-- 48. Publicación exitosa de v2 active con fecha posterior (2026-06-01)
SELECT lives_ok(
    $$UPDATE public.recipe_versions SET status = 'active', effective_from = '2026-06-01 00:00:00+00' WHERE id = 'a0000000-0000-0000-0000-000000000202'$$,
    '48. Publicación exitosa de v2 active con fecha posterior'
);

-- ============================================================================
-- BLOQUE 5: item_cost_versions e is_approximate
-- ============================================================================

-- 49. item_unit_conversions existente conserva is_approximate = false por default
INSERT INTO public.item_unit_conversions (business_id, item_id, name_singular, quantity, unit_id)
VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'costal', 25, (SELECT id FROM public.units WHERE code = 'kg'));

SELECT results_eq(
    'SELECT is_approximate FROM public.item_unit_conversions WHERE name_singular = ''costal''',
    ARRAY[false],
    '49. Conversión conserva is_approximate = false por default'
);

-- 50. Creación de conversión con is_approximate = true
SELECT lives_ok(
    $$INSERT INTO public.item_unit_conversions (business_id, item_id, name_singular, quantity, unit_id, is_approximate)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000014', 'tanto', 155, (SELECT id FROM public.units WHERE code = 'g'), true)$$,
    '50. Creación de conversión con is_approximate = true exitosa'
);

-- 51. Inserción válida de item_cost_versions
SELECT lives_ok(
    $$INSERT INTO public.item_cost_versions (id, business_id, item_id, cost_amount, cost_quantity, unit_id, effective_from)
      VALUES ('a0000000-0000-0000-0000-000000000401', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 500.00, 25, (SELECT id FROM public.units WHERE code = 'kg'), '2026-01-01 00:00:00+00')$$,
    '51. Inserción válida de item_cost_versions exitosa'
);

-- 52. Rechazo de cost_amount < 0 o cost_quantity <= 0
SELECT throws_ok(
    $$INSERT INTO public.item_cost_versions (business_id, item_id, cost_amount, cost_quantity, unit_id, effective_from)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', -10, 25, (SELECT id FROM public.units WHERE code = 'kg'), '2026-02-01 00:00:00+00')$$,
    '23514'::text,
    NULL::text,
    '52. Rechazo de cost_amount < 0 (CHECK)'
);

-- 53. Rechazo de item_cost_versions para item con purchasable = false (Masa Madre Hija)
SELECT throws_ok(
    $$INSERT INTO public.item_cost_versions (business_id, item_id, cost_amount, cost_quantity, unit_id, effective_from)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000014', 100.00, 1, (SELECT id FROM public.units WHERE code = 'kg'), '2026-01-01 00:00:00+00')$$,
    'P0001'::text,
    'Item is not purchasable: cost versions cannot be defined for non-purchasable items'::text,
    '53. Rechazo de costo para item con purchasable = false (Trigger)'
);

-- 54. Rechazo de item_cost_versions con dimensión incompatible (Harina base g vs litro)
SELECT throws_ok(
    $$INSERT INTO public.item_cost_versions (business_id, item_id, cost_amount, cost_quantity, unit_id, effective_from)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 100.00, 1, (SELECT id FROM public.units WHERE code = 'l'), '2026-01-01 00:00:00+00')$$,
    'P0001'::text,
    'Unit dimension mismatch: cost unit dimension does not match item base unit dimension'::text,
    '54. Rechazo de costo con dimensión incompatible (Trigger)'
);

-- 55. Rechazo de costo duplicado para el mismo item en el mismo effective_from
SELECT throws_ok(
    $$INSERT INTO public.item_cost_versions (business_id, item_id, cost_amount, cost_quantity, unit_id, effective_from)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 550.00, 25, (SELECT id FROM public.units WHERE code = 'kg'), '2026-01-01 00:00:00+00')$$,
    '23505'::text,
    NULL::text,
    '55. Rechazo de costo duplicado para mismo item y mismo effective_from (UNIQUE)'
);

-- 56. Rechazo estructural de UPDATE sobre item_cost_versions
SELECT throws_ok(
    $$UPDATE public.item_cost_versions SET cost_amount = 600.00 WHERE id = 'a0000000-0000-0000-0000-000000000401'$$,
    'P0001'::text,
    'item_cost_versions is an append-only historical table: UPDATE and DELETE are strictly forbidden'::text,
    '56. Rechazo estructural de UPDATE sobre item_cost_versions (Trigger append-only)'
);

-- 57. Rechazo estructural de DELETE sobre item_cost_versions
SELECT throws_ok(
    $$DELETE FROM public.item_cost_versions WHERE id = 'a0000000-0000-0000-0000-000000000401'$$,
    'P0001'::text,
    'item_cost_versions is an append-only historical table: UPDATE and DELETE are strictly forbidden'::text,
    '57. Rechazo estructural de DELETE sobre item_cost_versions (Trigger append-only)'
);

-- ============================================================================
-- BLOQUE 6: RLS Isolation & Security
-- ============================================================================

-- Configuración de datos para Biz B
INSERT INTO public.recipes (id, business_id, name, output_item_id)
VALUES ('b0000000-0000-0000-0000-000000000100', 'b0000000-0000-0000-0000-000000000002', 'Receta Pan B', 'b0000000-0000-0000-0000-000000000016');

INSERT INTO public.recipe_versions (id, business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id)
VALUES ('b0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000100', 1, 'draft', 5000, (SELECT id FROM public.units WHERE code = 'g'));

INSERT INTO public.recipe_inputs (id, business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
VALUES ('b0000000-0000-0000-0000-000000000301', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000010', 1, 'absolute', 5, (SELECT id FROM public.units WHERE code = 'kg'));

INSERT INTO public.item_cost_versions (id, business_id, item_id, cost_amount, cost_quantity, unit_id, effective_from)
VALUES ('b0000000-0000-0000-0000-000000000401', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000010', 200.00, 10, (SELECT id FROM public.units WHERE code = 'kg'), '2026-01-01 00:00:00+00');

-- 58. User A (Owner Biz A) puede SELECT sus recipes
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';

SELECT results_eq(
    'SELECT name FROM public.recipes ORDER BY name',
    ARRAY['Receta Hogaza'::text, 'Receta Temp Draft'::text],
    '58. User A solo ve recipes de Biz A'
);

-- 59. User A puede SELECT sus recipe_versions
SELECT results_eq(
    'SELECT count(*)::integer FROM public.recipe_versions',
    ARRAY[3],
    '59. User A ve exactamente las 3 versiones de Biz A'
);

-- 60. User A puede SELECT sus recipe_inputs
SELECT results_eq(
    'SELECT count(*)::integer FROM public.recipe_inputs',
    ARRAY[8],
    '60. User A ve los inputs de Biz A'
);

-- 61. User A puede SELECT sus item_cost_versions
SELECT results_eq(
    'SELECT count(*)::integer FROM public.item_cost_versions',
    ARRAY[1],
    '61. User A ve los costos de Biz A'
);

RESET ROLE;

-- 62. User B (Owner Biz B) solo ve datos de Biz B
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000b1';

SELECT results_eq(
    'SELECT name FROM public.recipes',
    ARRAY['Receta Pan B'::text],
    '62. User B solo ve recipes de Biz B'
);

-- 63. User B ve 0 inputs de Biz A
SELECT is_empty(
    'SELECT * FROM public.recipe_inputs WHERE business_id = ''a0000000-0000-0000-0000-000000000001''',
    '63. User B no ve recipe_inputs de Biz A'
);

-- 64. User B ve 0 costos de Biz A
SELECT is_empty(
    'SELECT * FROM public.item_cost_versions WHERE business_id = ''a0000000-0000-0000-0000-000000000001''',
    '64. User B no ve item_cost_versions de Biz A'
);

RESET ROLE;

-- 65. User Member (Rol member de Biz A) puede SELECT datos de Biz A
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a2';

SELECT results_eq(
    'SELECT count(*)::integer FROM public.recipes',
    ARRAY[2],
    '65. User con rol member puede leer recipes de su business'
);

-- 66. Rol member NO puede INSERT en recipes
SELECT throws_ok(
    $$INSERT INTO public.recipes (business_id, name, output_item_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'Receta Prohibida Member', 'a0000000-0000-0000-0000-000000000017')$$,
    '42501'::text,
    NULL::text,
    '66. Rol member es rechazado al intentar INSERT en recipes (requiere owner/admin)'
);

-- 67. Rol member NO puede INSERT en recipe_versions
SELECT throws_ok(
    $$INSERT INTO public.recipe_versions (business_id, recipe_id, version_number, status, reference_yield_quantity, reference_yield_unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000199', 2, 'draft', 1000, (SELECT id FROM public.units WHERE code = 'g'))$$,
    '42501'::text,
    NULL::text,
    '67. Rol member es rechazado al intentar INSERT en recipe_versions'
);

-- 68. Rol member NO puede INSERT en recipe_inputs
SELECT throws_ok(
    $$INSERT INTO public.recipe_inputs (business_id, recipe_version_id, item_id, position, quantity_mode, quantity, unit_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000299', 'a0000000-0000-0000-0000-000000000010', 1, 'absolute', 100, (SELECT id FROM public.units WHERE code = 'g'))$$,
    '42501'::text,
    NULL::text,
    '68. Rol member es rechazado al intentar INSERT en recipe_inputs'
);

-- 69. Rol member NO puede INSERT en item_cost_versions
SELECT throws_ok(
    $$INSERT INTO public.item_cost_versions (business_id, item_id, cost_amount, cost_quantity, unit_id, effective_from)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 100, 1, (SELECT id FROM public.units WHERE code = 'kg'), '2026-07-01 00:00:00+00')$$,
    '42501'::text,
    NULL::text,
    '69. Rol member es rechazado al intentar INSERT en item_cost_versions'
);

RESET ROLE;

-- 70. Rol Owner puede INSERT en recipes
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';

SELECT lives_ok(
    $$INSERT INTO public.recipes (business_id, name, output_item_id)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'Receta Permitida Owner', 'a0000000-0000-0000-0000-000000000017')$$,
    '70. Rol owner puede insertar recipes'
);

RESET ROLE;

-- 71. Usuario sin membresía ve 0 filas en todas las tablas M1B
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000c1';

SELECT is_empty('SELECT * FROM public.recipes', '71a. Usuario sin membresía ve 0 recipes');
SELECT is_empty('SELECT * FROM public.recipe_versions', '71b. Usuario sin membresía ve 0 recipe_versions');
SELECT is_empty('SELECT * FROM public.recipe_inputs', '71c. Usuario sin membresía ve 0 recipe_inputs');
SELECT is_empty('SELECT * FROM public.item_cost_versions', '71d. Usuario sin membresía ve 0 item_cost_versions');

RESET ROLE;

-- 72. Rol anon ve 0 filas en todas las tablas M1B
SET LOCAL ROLE anon;

SELECT is_empty('SELECT * FROM public.recipes', '72a. Rol anon ve 0 recipes');
SELECT is_empty('SELECT * FROM public.recipe_versions', '72b. Rol anon ve 0 recipe_versions');
SELECT is_empty('SELECT * FROM public.recipe_inputs', '72c. Rol anon ve 0 recipe_inputs');
SELECT is_empty('SELECT * FROM public.recipe_input_percentage_bases', '72d. Rol anon ve 0 percentage_bases');
SELECT is_empty('SELECT * FROM public.item_cost_versions', '72e. Rol anon ve 0 item_cost_versions');

RESET ROLE;

-- 73. RLS UPDATE y DELETE en item_cost_versions no alteran registros bajo rol authenticated
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';

DO $$
DECLARE
    v_affected integer;
BEGIN
    -- UPDATE sin policy en RLS no debe afectar ninguna fila
    UPDATE public.item_cost_versions SET cost_amount = 999.00 WHERE id = 'a0000000-0000-0000-0000-000000000401';
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 0 THEN
        RAISE EXCEPTION 'item_cost_versions should not allow UPDATE via RLS';
    END IF;

    -- DELETE sin policy en RLS no debe afectar ninguna fila
    DELETE FROM public.item_cost_versions WHERE id = 'a0000000-0000-0000-0000-000000000401';
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 0 THEN
        RAISE EXCEPTION 'item_cost_versions should not allow DELETE via RLS';
    END IF;
END $$;

RESET ROLE;

-- Verificamos que el registro sigue intacto
SELECT results_eq(
    'SELECT cost_amount FROM public.item_cost_versions WHERE id = ''a0000000-0000-0000-0000-000000000401''',
    ARRAY[500.000000000000::numeric],
    '73. item_cost_versions permanece intacto tras intentos de UPDATE/DELETE bajo RLS'
);

SELECT * FROM finish();
ROLLBACK;
