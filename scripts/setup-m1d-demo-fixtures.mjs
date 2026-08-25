import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local if present
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (let line of content.split('\n')) {
      line = line.replace(/\r/g, '').trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required for local setup script.');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function getOrCreateUser(email, password) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error && data?.user) {
    console.log(`Created user ${email} (${data.user.id})`);
    return data.user.id;
  }

  const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (!listError && usersData?.users) {
    const existing = usersData.users.find((u) => u.email === email);
    if (existing) {
      console.log(`User ${email} already exists (${existing.id})`);
      return existing.id;
    }
  }

  throw new Error(`Failed to create user ${email}: ${error?.message || 'Unknown error'}`);
}

async function setupM1DFixtures() {
  console.log('Setting up local test fixtures for M1D...');

  // 1. Ensure test users (owner and member)
  const ownerUserId = await getOrCreateUser('a@costara.local', 'password123');
  const memberUserId = await getOrCreateUser('member@costara.local', 'password123');

  // 2. Fetch units
  const { data: units, error: unitsErr } = await supabaseAdmin
    .from('units')
    .select('id, code');
  if (unitsErr) throw new Error(`Failed to fetch units: ${unitsErr.message}`);

  const unitG = units.find((u) => u.code === 'g')?.id;
  const unitKg = units.find((u) => u.code === 'kg')?.id;
  const unitPiece = units.find((u) => u.code === 'piece')?.id;

  if (!unitG || !unitKg || !unitPiece) {
    throw new Error('Required base units (g, kg, piece) not found in units table.');
  }

  // 3. Business: Panara
  const businessId = 'a0000000-0000-0000-0000-0000000000ff';
  await supabaseAdmin.from('businesses').upsert({
    id: businessId,
    name: 'Panara',
    currency_code: 'MXN',
    timezone: 'America/Mexico_City',
  });

  // 4. Memberships
  await supabaseAdmin.from('business_members').upsert([
    { business_id: businessId, user_id: ownerUserId, role: 'owner' },
    { business_id: businessId, user_id: memberUserId, role: 'member' },
  ]);

  // 5. Items
  const itemFlourId = 'd1000000-0000-0000-0000-000000000001';
  const itemWholeFlourId = 'd1000000-0000-0000-0000-000000000002';
  const itemWaterId = 'd1000000-0000-0000-0000-000000000003';
  const itemSaltId = 'd1000000-0000-0000-0000-000000000004';
  const itemSourdoughId = 'd1000000-0000-0000-0000-000000000005';
  const itemRusticBreadId = 'd1000000-0000-0000-0000-000000000006';
  const itemSunflowerSeedsId = 'd1000000-0000-0000-0000-000000000007';
  const itemSeedBreadId = 'd1000000-0000-0000-0000-000000000008';
  const itemPastryCreamId = 'd1000000-0000-0000-0000-000000000009';

  const items = [
    { id: itemFlourId, business_id: businessId, name: 'Harina de Trigo', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: itemWholeFlourId, business_id: businessId, name: 'Harina Integral', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: itemWaterId, business_id: businessId, name: 'Agua Purificada', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: itemSaltId, business_id: businessId, name: 'Sal Fina', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: itemSourdoughId, business_id: businessId, name: 'Masa Madre Activa', kind: 'intermediate', base_unit_id: unitG, purchasable: false, producible: true, sellable: false },
    { id: itemRusticBreadId, business_id: businessId, name: 'Hogaza Rústica', kind: 'finished_product', base_unit_id: unitPiece, purchasable: false, producible: true, sellable: true },
    { id: itemSunflowerSeedsId, business_id: businessId, name: 'Semillas de Girasol', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: itemSeedBreadId, business_id: businessId, name: 'Pan de Semillas Especial', kind: 'finished_product', base_unit_id: unitPiece, purchasable: false, producible: true, sellable: true },
    { id: itemPastryCreamId, business_id: businessId, name: 'Crema Pastelera a Granel', kind: 'intermediate', base_unit_id: unitG, purchasable: false, producible: true, sellable: false },
  ];

  for (const item of items) {
    const { error: itErr } = await supabaseAdmin.from('items').upsert(item);
    if (itErr) throw new Error(`Failed to upsert item ${item.name}: ${itErr.message}`);
  }

  // 6. Item Cost Versions (Append-only)
  // Convert local date (00:00 local) to UTC according to business timezone (America/Mexico_City => UTC-6 => 06:00 UTC)
  const costVersions = [
    { item_id: itemFlourId, business_id: businessId, cost_amount: '20.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: '2026-01-01T06:00:00Z', notes: 'Precio inicial proveedor A' },
    { item_id: itemFlourId, business_id: businessId, cost_amount: '24.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: '2026-06-01T06:00:00Z', notes: 'Ajuste de precio proveedor A' },
    { item_id: itemWholeFlourId, business_id: businessId, cost_amount: '28.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: '2026-01-01T06:00:00Z', notes: 'Harina integral orgánica' },
    { item_id: itemWaterId, business_id: businessId, cost_amount: '2.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: '2026-01-01T06:00:00Z', notes: 'Agua purificada garrafón' },
    { item_id: itemSaltId, business_id: businessId, cost_amount: '15.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: '2026-01-01T06:00:00Z', notes: 'Sal de mar' },
  ];

  for (const cv of costVersions) {
    const { data: existing } = await supabaseAdmin
      .from('item_cost_versions')
      .select('id')
      .eq('item_id', cv.item_id)
      .eq('effective_from', cv.effective_from)
      .maybeSingle();

    if (!existing) {
      const { error: cvErr } = await supabaseAdmin.from('item_cost_versions').insert(cv);
      if (cvErr) throw new Error(`Failed to insert cost version: ${cvErr.message}`);
    }
  }

  // 7. Recipes
  const recipeSourdoughId = 'e1000000-0000-0000-0000-000000000001';
  const recipeRusticBreadId = 'e1000000-0000-0000-0000-000000000002';
  const recipeSeedBreadId = 'e1000000-0000-0000-0000-000000000003';
  const recipePastryCreamId = 'e1000000-0000-0000-0000-000000000004';

  const recipes = [
    { id: recipeSourdoughId, business_id: businessId, name: 'Masa Madre Activa', output_item_id: itemSourdoughId, is_active: true },
    { id: recipeRusticBreadId, business_id: businessId, name: 'Hogaza Rústica', output_item_id: itemRusticBreadId, is_active: true },
    { id: recipeSeedBreadId, business_id: businessId, name: 'Pan de Semillas Especial', output_item_id: itemSeedBreadId, is_active: true },
    { id: recipePastryCreamId, business_id: businessId, name: 'Crema Pastelera a Granel', output_item_id: itemPastryCreamId, is_active: true },
  ];

  for (const r of recipes) {
    const { error: rErr } = await supabaseAdmin.from('recipes').upsert(r);
    if (rErr) throw new Error(`Failed to upsert recipe ${r.name}: ${rErr.message}`);
  }

  // 8. Recipe Versions & Inputs

  // Recipe 1: Masa Madre Activa (v1 Active)
  const vSourdoughId = 'f1000000-0000-0000-0000-000000000001';
  const { data: exSourdough } = await supabaseAdmin.from('recipe_versions').select('id').eq('id', vSourdoughId).maybeSingle();
  if (!exSourdough) {
    await supabaseAdmin.from('recipe_versions').insert({
      id: vSourdoughId,
      business_id: businessId,
      recipe_id: recipeSourdoughId,
      version_number: 1,
      status: 'draft',
      reference_yield_quantity: '1000.000000000000',
      reference_yield_unit_id: unitG,
      portion_quantity: null,
      portion_unit_id: null,
      yield_description: 'Masa madre refrescada lista para usar',
      notes: 'Refresco 1:1 de harina y agua',
    });

    const inpsSourdough = [
      { id: 'a1000000-0000-0000-0000-000000000001', business_id: businessId, recipe_version_id: vSourdoughId, item_id: itemFlourId, position: 1, quantity_mode: 'absolute', quantity: '500.000000000000', unit_id: unitG, percentage: null, costing_source: 'purchased' },
      { id: 'a1000000-0000-0000-0000-000000000002', business_id: businessId, recipe_version_id: vSourdoughId, item_id: itemWaterId, position: 2, quantity_mode: 'absolute', quantity: '500.000000000000', unit_id: unitG, percentage: null, costing_source: 'purchased' },
    ];
    for (const inp of inpsSourdough) {
      await supabaseAdmin.from('recipe_inputs').upsert(inp);
    }

    await supabaseAdmin.from('recipe_versions').update({
      status: 'active',
      effective_from: '2026-01-01T00:00:00Z',
    }).eq('id', vSourdoughId);
  }

  // Recipe 2: Hogaza Rústica (v1 Archived, v2 Active)
  const vRustic1Id = 'f2000000-0000-0000-0000-000000000001';
  const vRustic2Id = 'f2000000-0000-0000-0000-000000000002';

  const { data: exRustic1 } = await supabaseAdmin.from('recipe_versions').select('id').eq('id', vRustic1Id).maybeSingle();
  if (!exRustic1) {
    // v1 (Archived)
    await supabaseAdmin.from('recipe_versions').insert({
      id: vRustic1Id,
      business_id: businessId,
      recipe_id: recipeRusticBreadId,
      version_number: 1,
      status: 'draft',
      reference_yield_quantity: '14000.000000000000',
      reference_yield_unit_id: unitG,
      portion_quantity: '1000.000000000000',
      portion_unit_id: unitG,
      yield_description: 'Masa lista para formado',
      notes: 'Hidratación al 70%',
    });

    const inpsRustic1 = [
      { id: 'b1000000-0000-0000-0000-000000000001', business_id: businessId, recipe_version_id: vRustic1Id, item_id: itemFlourId, position: 1, quantity_mode: 'absolute', quantity: '10000.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { id: 'b1000000-0000-0000-0000-000000000002', business_id: businessId, recipe_version_id: vRustic1Id, item_id: itemWholeFlourId, position: 2, quantity_mode: 'absolute', quantity: '4000.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { id: 'b1000000-0000-0000-0000-000000000003', business_id: businessId, recipe_version_id: vRustic1Id, item_id: itemWaterId, position: 3, quantity_mode: 'percentage', percentage: '70.000000000000', costing_source: 'purchased' },
      { id: 'b1000000-0000-0000-0000-000000000004', business_id: businessId, recipe_version_id: vRustic1Id, item_id: itemSourdoughId, position: 4, quantity_mode: 'percentage', percentage: '20.000000000000', costing_source: 'produced' },
      { id: 'b1000000-0000-0000-0000-000000000005', business_id: businessId, recipe_version_id: vRustic1Id, item_id: itemSaltId, position: 5, quantity_mode: 'percentage', percentage: '2.000000000000', costing_source: 'purchased' },
    ];
    for (const inp of inpsRustic1) {
      await supabaseAdmin.from('recipe_inputs').upsert(inp);
    }

    const basesRustic1 = [
      { business_id: businessId, recipe_version_id: vRustic1Id, percentage_input_id: 'b1000000-0000-0000-0000-000000000003', basis_input_id: 'b1000000-0000-0000-0000-000000000001' },
      { business_id: businessId, recipe_version_id: vRustic1Id, percentage_input_id: 'b1000000-0000-0000-0000-000000000003', basis_input_id: 'b1000000-0000-0000-0000-000000000002' },
      { business_id: businessId, recipe_version_id: vRustic1Id, percentage_input_id: 'b1000000-0000-0000-0000-000000000004', basis_input_id: 'b1000000-0000-0000-0000-000000000001' },
      { business_id: businessId, recipe_version_id: vRustic1Id, percentage_input_id: 'b1000000-0000-0000-0000-000000000004', basis_input_id: 'b1000000-0000-0000-0000-000000000002' },
      { business_id: businessId, recipe_version_id: vRustic1Id, percentage_input_id: 'b1000000-0000-0000-0000-000000000005', basis_input_id: 'b1000000-0000-0000-0000-000000000001' },
      { business_id: businessId, recipe_version_id: vRustic1Id, percentage_input_id: 'b1000000-0000-0000-0000-000000000005', basis_input_id: 'b1000000-0000-0000-0000-000000000002' },
    ];
    for (const b of basesRustic1) {
      await supabaseAdmin.from('recipe_input_percentage_bases').upsert(b);
    }

    await supabaseAdmin.from('recipe_versions').update({
      status: 'active',
      effective_from: '2026-01-15T00:00:00Z',
      change_reason: 'Versión inicial de lanzamiento',
    }).eq('id', vRustic1Id);
  }

  const { data: exRustic2 } = await supabaseAdmin.from('recipe_versions').select('id').eq('id', vRustic2Id).maybeSingle();
  if (!exRustic2) {
    // v2 (Active)
    await supabaseAdmin.from('recipe_versions').insert({
      id: vRustic2Id,
      business_id: businessId,
      recipe_id: recipeRusticBreadId,
      version_number: 2,
      status: 'draft',
      reference_yield_quantity: '14000.000000000000',
      reference_yield_unit_id: unitG,
      portion_quantity: '1000.000000000000',
      portion_unit_id: unitG,
      yield_description: 'Masa lista para formado',
      notes: 'Mejor miga y estructura',
    });

    const inpsRustic2 = [
      { id: 'c1000000-0000-0000-0000-000000000001', business_id: businessId, recipe_version_id: vRustic2Id, item_id: itemFlourId, position: 1, quantity_mode: 'absolute', quantity: '9000.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { id: 'c1000000-0000-0000-0000-000000000002', business_id: businessId, recipe_version_id: vRustic2Id, item_id: itemWholeFlourId, position: 2, quantity_mode: 'absolute', quantity: '5000.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { id: 'c1000000-0000-0000-0000-000000000003', business_id: businessId, recipe_version_id: vRustic2Id, item_id: itemWaterId, position: 3, quantity_mode: 'percentage', percentage: '72.000000000000', costing_source: 'purchased' },
      { id: 'c1000000-0000-0000-0000-000000000004', business_id: businessId, recipe_version_id: vRustic2Id, item_id: itemSourdoughId, position: 4, quantity_mode: 'percentage', percentage: '20.000000000000', costing_source: 'produced' },
      { id: 'c1000000-0000-0000-0000-000000000005', business_id: businessId, recipe_version_id: vRustic2Id, item_id: itemSaltId, position: 5, quantity_mode: 'percentage', percentage: '2.000000000000', costing_source: 'purchased' },
    ];
    for (const inp of inpsRustic2) {
      await supabaseAdmin.from('recipe_inputs').upsert(inp);
    }

    const basesRustic2 = [
      { business_id: businessId, recipe_version_id: vRustic2Id, percentage_input_id: 'c1000000-0000-0000-0000-000000000003', basis_input_id: 'c1000000-0000-0000-0000-000000000001' },
      { business_id: businessId, recipe_version_id: vRustic2Id, percentage_input_id: 'c1000000-0000-0000-0000-000000000003', basis_input_id: 'c1000000-0000-0000-0000-000000000002' },
      { business_id: businessId, recipe_version_id: vRustic2Id, percentage_input_id: 'c1000000-0000-0000-0000-000000000004', basis_input_id: 'c1000000-0000-0000-0000-000000000001' },
      { business_id: businessId, recipe_version_id: vRustic2Id, percentage_input_id: 'c1000000-0000-0000-0000-000000000004', basis_input_id: 'c1000000-0000-0000-0000-000000000002' },
      { business_id: businessId, recipe_version_id: vRustic2Id, percentage_input_id: 'c1000000-0000-0000-0000-000000000005', basis_input_id: 'c1000000-0000-0000-0000-000000000001' },
      { business_id: businessId, recipe_version_id: vRustic2Id, percentage_input_id: 'c1000000-0000-0000-0000-000000000005', basis_input_id: 'c1000000-0000-0000-0000-000000000002' },
    ];
    for (const b of basesRustic2) {
      await supabaseAdmin.from('recipe_input_percentage_bases').upsert(b);
    }

    // Archive v1 and activate v2 via update
    await supabaseAdmin.from('recipe_versions').update({ status: 'archived' }).eq('id', vRustic1Id);
    await supabaseAdmin.from('recipe_versions').update({
      status: 'active',
      effective_from: '2026-06-15T00:00:00Z',
      change_reason: 'Ajuste de hidratación a 72% y balance de harinas',
    }).eq('id', vRustic2Id);
  }

  // Recipe 3: Pan de Semillas Especial (v1 Active - Cost Incomplete)
  const vSeedId = 'f3000000-0000-0000-0000-000000000001';
  const { data: exSeed } = await supabaseAdmin.from('recipe_versions').select('id').eq('id', vSeedId).maybeSingle();
  if (!exSeed) {
    await supabaseAdmin.from('recipe_versions').insert({
      id: vSeedId,
      business_id: businessId,
      recipe_id: recipeSeedBreadId,
      version_number: 1,
      status: 'draft',
      reference_yield_quantity: '5000.000000000000',
      reference_yield_unit_id: unitG,
      portion_quantity: '500.000000000000',
      portion_unit_id: unitG,
      yield_description: 'Masa enriquecida con semillas',
      notes: 'Receta con costo incompleto por falta de precio en semillas',
    });

    const inpsSeed = [
      { id: 'd2000000-0000-0000-0000-000000000001', business_id: businessId, recipe_version_id: vSeedId, item_id: itemFlourId, position: 1, quantity_mode: 'absolute', quantity: '3000.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { id: 'd2000000-0000-0000-0000-000000000002', business_id: businessId, recipe_version_id: vSeedId, item_id: itemWaterId, position: 2, quantity_mode: 'absolute', quantity: '2000.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { id: 'd2000000-0000-0000-0000-000000000003', business_id: businessId, recipe_version_id: vSeedId, item_id: itemSunflowerSeedsId, position: 3, quantity_mode: 'absolute', quantity: '500.000000000000', unit_id: unitG, costing_source: 'purchased' },
    ];
    for (const inp of inpsSeed) {
      await supabaseAdmin.from('recipe_inputs').upsert(inp);
    }

    await supabaseAdmin.from('recipe_versions').update({
      status: 'active',
      effective_from: '2026-01-01T00:00:00Z',
    }).eq('id', vSeedId);
  }

  // Recipe 4: Crema Pastelera a Granel (v1 Active - No Discrete Portions)
  const vPastryId = 'f4000000-0000-0000-0000-000000000001';
  const { data: exPastry } = await supabaseAdmin.from('recipe_versions').select('id').eq('id', vPastryId).maybeSingle();
  if (!exPastry) {
    await supabaseAdmin.from('recipe_versions').insert({
      id: vPastryId,
      business_id: businessId,
      recipe_id: recipePastryCreamId,
      version_number: 1,
      status: 'draft',
      reference_yield_quantity: '2500.000000000000',
      reference_yield_unit_id: unitG,
      portion_quantity: null,
      portion_unit_id: null,
      yield_description: 'Crema cocida a granel',
      notes: 'Preparación continua sin porciones discretas',
    });

    const inpsPastry = [
      { id: 'e2000000-0000-0000-0000-000000000001', business_id: businessId, recipe_version_id: vPastryId, item_id: itemFlourId, position: 1, quantity_mode: 'absolute', quantity: '500.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { id: 'e2000000-0000-0000-0000-000000000002', business_id: businessId, recipe_version_id: vPastryId, item_id: itemWaterId, position: 2, quantity_mode: 'absolute', quantity: '2000.000000000000', unit_id: unitG, costing_source: 'purchased' },
    ];
    for (const inp of inpsPastry) {
      await supabaseAdmin.from('recipe_inputs').upsert(inp);
    }

    await supabaseAdmin.from('recipe_versions').update({
      status: 'active',
      effective_from: '2026-01-01T00:00:00Z',
    }).eq('id', vPastryId);
  }

  console.log('M1D test fixtures created successfully!');
}

setupM1DFixtures().catch((err) => {
  console.error('M1D Fixture setup failed:', err);
  process.exit(1);
});
