BEGIN;

SELECT plan(11);

-- 1. Setup transactional test data
DO $$
DECLARE
    v_unit_g uuid;
    v_user_a uuid := '00000000-0000-0000-0000-0000000000a1';
    v_user_b uuid := '00000000-0000-0000-0000-0000000000b2';
    v_user_no_mem uuid := '00000000-0000-0000-0000-0000000000c3';
    v_user_member_role uuid := '00000000-0000-0000-0000-0000000000d4';

    v_biz_a uuid := '11111111-1111-1111-1111-111111111111';
    v_biz_b uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
    SELECT id INTO v_unit_g FROM public.units WHERE code = 'g';

    -- Create test users in auth.users
    INSERT INTO auth.users (id, email) VALUES
        (v_user_a, 'test_a@example.com'),
        (v_user_b, 'test_b@example.com'),
        (v_user_no_mem, 'test_nomem@example.com'),
        (v_user_member_role, 'test_member@example.com');

    -- Create Businesses
    INSERT INTO public.businesses (id, name, currency_code) VALUES
        (v_biz_a, 'Business A RLS', 'MXN'),
        (v_biz_b, 'Business B RLS', 'MXN');

    -- Create Memberships
    INSERT INTO public.business_members (business_id, user_id, role) VALUES
        (v_biz_a, v_user_a, 'owner'),
        (v_biz_b, v_user_b, 'owner'),
        (v_biz_a, v_user_member_role, 'member');

    -- Create Items
    INSERT INTO public.items (id, business_id, name, kind, base_unit_id) VALUES
        ('11111111-1111-1111-1111-111111111101', v_biz_a, 'Item A1', 'raw_material', v_unit_g),
        ('11111111-1111-1111-1111-111111111102', v_biz_a, 'Item A2', 'raw_material', v_unit_g),
        ('22222222-2222-2222-2222-222222222201', v_biz_b, 'Item B1', 'raw_material', v_unit_g);
END $$;

-- 2. Test User A (Owner of Business A)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';

SELECT results_eq(
    'SELECT name FROM public.businesses',
    ARRAY['Business A RLS'::text],
    'User A can read only Business A'
);

SELECT results_eq(
    'SELECT name FROM public.items ORDER BY name',
    ARRAY['Item A1'::text, 'Item A2'::text],
    'User A can read only Items of Business A'
);

SELECT lives_ok(
    $$INSERT INTO public.items (business_id, name, kind, base_unit_id) VALUES ('11111111-1111-1111-1111-111111111111', 'Item A3 New', 'raw_material', (SELECT id FROM public.units WHERE code = 'g'))$$,
    'User A (owner) can insert items into Business A'
);

RESET ROLE;

-- 3. Test User B (Owner of Business B)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000b2';

SELECT results_eq(
    'SELECT name FROM public.businesses',
    ARRAY['Business B RLS'::text],
    'User B can read only Business B'
);

SELECT results_eq(
    'SELECT name FROM public.items ORDER BY name',
    ARRAY['Item B1'::text],
    'User B can read only Items of Business B'
);

SELECT is_empty(
    'SELECT name FROM public.items WHERE business_id = ''11111111-1111-1111-1111-111111111111''',
    'User B cannot read items of Business A directly'
);

RESET ROLE;

-- 4. Test User without membership
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000c3';

SELECT is_empty(
    'SELECT name FROM public.businesses',
    'User without membership sees no businesses'
);

SELECT is_empty(
    'SELECT name FROM public.items',
    'User without membership sees no items'
);

RESET ROLE;

-- 5. Test User with "member" role (Read-only on items, no INSERT)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000d4';

SELECT results_eq(
    'SELECT count(*)::integer FROM public.items WHERE business_id = ''11111111-1111-1111-1111-111111111111''',
    ARRAY[3],
    'User with member role can read Business A items'
);

SELECT throws_ok(
    $$INSERT INTO public.items (business_id, name, kind, base_unit_id) VALUES ('11111111-1111-1111-1111-111111111111', 'Item Forbidden', 'raw_material', (SELECT id FROM public.units WHERE code = 'g'))$$,
    '42501'::text,
    NULL::text,
    'User with member role cannot insert items (requires owner/admin)'
);

RESET ROLE;

-- 6. Test Unauthenticated / Anon Role
SET LOCAL ROLE anon;

SELECT is_empty(
    'SELECT name FROM public.items',
    'Anon user sees no items'
);

SELECT * FROM finish();
ROLLBACK;
