BEGIN;

SELECT plan(23);

-- 1. 1 kg equivale a 1000 g
SELECT results_eq(
    'SELECT (u_kg.factor_to_base / u_g.factor_to_base)::numeric FROM public.units u_kg, public.units u_g WHERE u_kg.code = ''kg'' AND u_g.code = ''g''',
    ARRAY[1000.000000000000::numeric],
    '1 kg equivale a 1000 g'
);

-- 2. 2.5 kg equivale a 2500 g
SELECT results_eq(
    'SELECT (2.5 * u_kg.factor_to_base / u_g.factor_to_base)::numeric FROM public.units u_kg, public.units u_g WHERE u_kg.code = ''kg'' AND u_g.code = ''g''',
    ARRAY[2500.000000000000::numeric],
    '2.5 kg equivale a 2500 g'
);

-- 3. KGS resuelve a kg
SELECT results_eq(
    'SELECT u.code FROM public.unit_aliases a JOIN public.units u ON u.id = a.unit_id WHERE lower(a.alias) = lower(''KGS'') AND a.business_id IS NULL',
    ARRAY['kg'::text],
    'KGS resuelve a kg'
);

-- Configuración de datos de prueba (Negocio A y Negocio B)
DO $$
DECLARE
    v_unit_g uuid;
    v_unit_kg uuid;
    v_unit_piece uuid;
    v_item_harina uuid;
    v_item_azucar uuid;
    v_item_huevo uuid;
    v_item_choco uuid;
BEGIN
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';
    SELECT id INTO v_unit_kg FROM public.units WHERE code = 'kg';
    SELECT id INTO v_unit_piece FROM public.units WHERE code = 'piece';

    -- Crear Negocios
    INSERT INTO public.businesses (id, name, currency_code) VALUES
        ('a0000000-0000-0000-0000-000000000001', 'Negocio A', 'MXN'),
        ('b0000000-0000-0000-0000-000000000002', 'Negocio B', 'MXN');

    -- Item Harina en Negocio A
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable)
    VALUES ('a0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Harina', 'raw_material', v_unit_g, true)
    RETURNING id INTO v_item_harina;

    -- Item Azúcar en Negocio A
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable)
    VALUES ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Azúcar', 'raw_material', v_unit_g, true)
    RETURNING id INTO v_item_azucar;

    -- Item Huevo en Negocio A
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable)
    VALUES ('a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'Huevo', 'raw_material', v_unit_piece, true)
    RETURNING id INTO v_item_huevo;

    -- Item Chocolate en Negocio A
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable)
    VALUES ('a0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'Chocolate', 'raw_material', v_unit_g, true)
    RETURNING id INTO v_item_choco;

    -- Item Secreto en Negocio B
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id, purchasable)
    VALUES ('b0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000002', 'Secreto B', 'raw_material', v_unit_g, true);

    -- 4. Harina: 1 costal = 25 kg
    INSERT INTO public.item_unit_conversions (business_id, item_id, name_singular, name_plural, quantity, unit_id)
    VALUES ('a0000000-0000-0000-0000-000000000001', v_item_harina, 'costal', 'costales', 25, v_unit_kg);

    -- 6. Huevo: 1 caja = 360 piece
    INSERT INTO public.item_unit_conversions (business_id, item_id, name_singular, name_plural, quantity, unit_id)
    VALUES ('a0000000-0000-0000-0000-000000000001', v_item_huevo, 'caja', 'cajas', 360, v_unit_piece);

    -- 7. Chocolate: 1 barra = 10 g
    INSERT INTO public.item_unit_conversions (business_id, item_id, name_singular, name_plural, quantity, unit_id)
    VALUES ('a0000000-0000-0000-0000-000000000001', v_item_choco, 'barra', 'barras', 10, v_unit_g);

    -- 10. Azúcar: 1 costal = 50 kg
    INSERT INTO public.item_unit_conversions (business_id, item_id, name_singular, name_plural, quantity, unit_id)
    VALUES ('a0000000-0000-0000-0000-000000000001', v_item_azucar, 'costal', 'costales', 50, v_unit_kg);
END $$;

-- 4. Harina, base g: 1 costal = 25 kg (verificación)
SELECT results_eq(
    'SELECT c.quantity, u.code FROM public.item_unit_conversions c JOIN public.units u ON u.id = c.unit_id WHERE c.name_singular = ''costal'' AND c.item_id = ''a0000000-0000-0000-0000-000000000010''',
    $$VALUES (25.000000000000::numeric, 'kg'::text)$$,
    'Harina: 1 costal = 25 kg'
);

-- 5. 2 costales de Harina equivalen a 50,000 g
SELECT results_eq(
    'SELECT (2 * c.quantity * u_target.factor_to_base / u_base.factor_to_base)::numeric FROM public.item_unit_conversions c JOIN public.items i ON i.id = c.item_id JOIN public.units u_target ON u_target.id = c.unit_id JOIN public.units u_base ON u_base.id = i.base_unit_id WHERE c.item_id = ''a0000000-0000-0000-0000-000000000010'' AND c.name_singular = ''costal''',
    ARRAY[50000.000000000000::numeric],
    '2 costales de harina = 50,000 g'
);

-- 6. Huevo, base piece: 1 caja = 360 pieces
SELECT results_eq(
    'SELECT c.quantity, u.code FROM public.item_unit_conversions c JOIN public.units u ON u.id = c.unit_id WHERE c.item_id = ''a0000000-0000-0000-0000-000000000012'' AND c.name_singular = ''caja''',
    $$VALUES (360.000000000000::numeric, 'piece'::text)$$,
    'Huevo: 1 caja = 360 pieces'
);

-- 7. Chocolate, base g: 1 barra = 10 g
SELECT results_eq(
    'SELECT c.quantity, u.code FROM public.item_unit_conversions c JOIN public.units u ON u.id = c.unit_id WHERE c.item_id = ''a0000000-0000-0000-0000-000000000013'' AND c.name_singular = ''barra''',
    $$VALUES (10.000000000000::numeric, 'g'::text)$$,
    'Chocolate: 1 barra = 10 g'
);

-- 8. Harina base g NO puede definir 1 costal = 25 l (incompatibilidad dimensional)
SELECT throws_ok(
    $$INSERT INTO public.item_unit_conversions (business_id, item_id, name_singular, quantity, unit_id) VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'tambor', 25, (SELECT id FROM public.units WHERE code = 'l'))$$,
    'P0001'::text,
    'Unit dimension mismatch: conversion unit dimension does not match item base unit dimension'::text,
    'Rechazo por incompatibilidad dimensional'::text
);

-- 9. Tenant isolation (RLS)
-- Insertar usuario de prueba en auth.users
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000aa', 'user_a@example.com');
INSERT INTO public.business_members (business_id, user_id, role)
VALUES ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000aa', 'member');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000aa';

SELECT results_eq(
    'SELECT name FROM public.items ORDER BY name',
    ARRAY['Azúcar'::text, 'Chocolate'::text, 'Harina'::text, 'Huevo'::text],
    'Tenant A solo puede ver sus items, no el de Tenant B'
);

RESET ROLE;

-- 10. Un mismo nombre contextual representa cantidades distintas según el item
SELECT results_eq(
    'SELECT i.name, c.quantity FROM public.item_unit_conversions c JOIN public.items i ON i.id = c.item_id WHERE c.name_singular = ''costal'' ORDER BY i.name',
    $$VALUES ('Azúcar'::text, 50.000000000000::numeric), ('Harina'::text, 25.000000000000::numeric)$$,
    'Costal Harina = 25 kg vs Costal Azúcar = 50 kg'
);

-- Pruebas adicionales de Invariantes:

-- Invariante 11: Máximo 1 unidad base por dimensión
SELECT throws_ok(
    $$INSERT INTO public.units (dimension_id, code, name_singular, name_plural, symbol, factor_to_base, is_base) VALUES ((SELECT id FROM public.unit_dimensions WHERE code = 'mass'), 'g2', 'gramo2', 'gramos2', 'g2', 1, true)$$,
    '23505'::text,
    NULL::text,
    'Rechazo de segunda base unit en dimensión mass'::text
);

-- Invariante 12: factor_to_base <= 0 rechazado
SELECT throws_ok(
    $$INSERT INTO public.units (dimension_id, code, name_singular, name_plural, symbol, factor_to_base, is_base) VALUES ((SELECT id FROM public.unit_dimensions WHERE code = 'mass'), 'mg_bad', 'bad', 'bads', 'b', 0, false)$$,
    '23514'::text,
    NULL::text,
    'Rechazo de factor_to_base <= 0'::text
);

-- Invariante 13: Alias igual a canonical code rechazado (case-insensitive)
SELECT throws_ok(
    $$INSERT INTO public.unit_aliases (business_id, unit_id, alias) VALUES (NULL, (SELECT id FROM public.units WHERE code = 'g'), 'KG')$$,
    'P0001'::text,
    'Alias "KG" conflicts with canonical unit code'::text,
    'Rechazo de alias igual a código canónico'::text
);

-- Invariante 14: Alias duplicado global rechazado
SELECT throws_ok(
    $$INSERT INTO public.unit_aliases (business_id, unit_id, alias) VALUES (NULL, (SELECT id FROM public.units WHERE code = 'g'), 'kgs')$$,
    '23505'::text,
    NULL::text,
    'Rechazo de alias global duplicado'::text
);

-- Invariante 15: Conversion de business distinto al item rechazada por FK compuesto
SELECT throws_ok(
    $$INSERT INTO public.item_unit_conversions (business_id, item_id, name_singular, quantity, unit_id) VALUES ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000010', 'costal_malo', 25, (SELECT id FROM public.units WHERE code = 'kg'))$$,
    '23503'::text,
    NULL::text,
    'Rechazo de conversión perteneciente a business distinto del item'::text
);

-- Invariante 16: Conversión activa con el mismo nombre en el mismo item rechazada (case-insensitive)
SELECT throws_ok(
    $$INSERT INTO public.item_unit_conversions (business_id, item_id, name_singular, quantity, unit_id) VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'COSTAL', 30, (SELECT id FROM public.units WHERE code = 'kg'))$$,
    '23505'::text,
    NULL::text,
    'Rechazo de segunda conversión ACTIVA con el mismo nombre case-insensitive'::text
);

-- Invariante 17: Conversión desactivada permite nueva conversión activa con el mismo nombre
SELECT lives_ok(
    $$
    UPDATE public.item_unit_conversions SET is_active = false WHERE item_id = 'a0000000-0000-0000-0000-000000000010' AND name_singular = 'costal';
    INSERT INTO public.item_unit_conversions (business_id, item_id, name_singular, quantity, unit_id) VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'COSTAL', 30, (SELECT id FROM public.units WHERE code = 'kg'));
    $$,
    'Permite nueva conversión activa tras desactivar la anterior'
);

-- Invariante 18: Currency code de business inválido rechazado
SELECT throws_ok(
    $$INSERT INTO public.businesses (name, currency_code) VALUES ('Malo', 'mxn')$$,
    '23514'::text,
    NULL::text,
    'Rechazo de currency_code no 3-char uppercase'::text
);

-- Invariante 19: Role de business_member inválido rechazado
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000bb', 'user_b@example.com');
SELECT throws_ok(
    $$INSERT INTO public.business_members (business_id, user_id, role) VALUES ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000bb', 'superman')$$,
    '23514'::text,
    NULL::text,
    'Rechazo de rol de miembro no válido'::text
);

-- Invariante 20: updated_at se actualiza en UPDATE de business
SELECT lives_ok(
    $$
    UPDATE public.businesses SET name = 'Negocio A Modificado' WHERE id = 'a0000000-0000-0000-0000-000000000001';
    $$,
    'Trigger updated_at ejecutado correctamente'
);

-- Invariante 21: Kind de item inválido rechazado
SELECT throws_ok(
    $$INSERT INTO public.items (business_id, name, kind, base_unit_id) VALUES ('a0000000-0000-0000-0000-000000000001', 'Insumo Raro', 'magic', (SELECT id FROM public.units WHERE code = 'g'))$$,
    '23514'::text,
    NULL::text,
    'Rechazo de kind de item inválido'::text
);

-- Invariante 22: Base unit con factor_to_base != 1 rechazada
SELECT throws_ok(
    $$INSERT INTO public.units (dimension_id, code, name_singular, name_plural, symbol, factor_to_base, is_base) VALUES ((SELECT id FROM public.unit_dimensions WHERE code = 'length'), 'mm_bad', 'bad', 'bads', 'b', 10, true)$$,
    '23514'::text,
    NULL::text,
    'Rechazo de is_base = true con factor != 1'::text
);

-- Invariante 23: DELETE físico de item con conversiones relacionadas es rechazado (ON DELETE RESTRICT)
SELECT throws_ok(
    $$DELETE FROM public.items WHERE id = 'a0000000-0000-0000-0000-000000000010'$$,
    '23503'::text,
    NULL::text,
    'Rechazo de DELETE físico de item con conversiones existentes (ON DELETE RESTRICT)'::text
);

SELECT * FROM finish();
ROLLBACK;
