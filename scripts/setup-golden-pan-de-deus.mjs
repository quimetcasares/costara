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

export const GOLDEN_BUSINESS_ID = 'a0000000-0000-0000-0000-0000000000ff'; // Panara

// Deterministic Golden IDs
export const GOLDEN_IDS = {
  // Raw materials
  itemStrongFlour: 'd3000000-0000-0000-0000-000000000001',
  itemWheatFlour: 'd3000000-0000-0000-0000-000000000002',
  itemMilk: 'd3000000-0000-0000-0000-000000000003',
  itemDryYeast: 'd3000000-0000-0000-0000-000000000004',
  itemWater: 'd3000000-0000-0000-0000-000000000005',
  itemSalt: 'd3000000-0000-0000-0000-000000000006',
  itemSugar: 'd3000000-0000-0000-0000-000000000007',
  itemButter: 'd3000000-0000-0000-0000-000000000008',
  itemEgg: 'd3000000-0000-0000-0000-000000000009',
  itemYellowLemon: 'd3000000-0000-0000-0000-000000000010',
  itemOrange: 'd3000000-0000-0000-0000-000000000011',
  itemVanilla: 'd3000000-0000-0000-0000-000000000012',

  // Isolated Sourdough Item (producible + purchasable test seam)
  itemSourdoughIsolated: 'd3000000-0000-0000-0000-000000000013',

  // Intermediates
  itemSponge: 'd3000000-0000-0000-0000-000000000021',
  itemLemonCream: 'd3000000-0000-0000-0000-000000000022',
  itemEggWash: 'd3000000-0000-0000-0000-000000000023',

  // Finished Product
  itemPanDeDeus: 'd3000000-0000-0000-0000-000000000031',

  // Recipes
  recipeSponge: 'e3000000-0000-0000-0000-000000000001',
  recipeLemonCream: 'e3000000-0000-0000-0000-000000000002',
  recipeEggWash: 'e3000000-0000-0000-0000-000000000003',
  recipePanDeDeus: 'e3000000-0000-0000-0000-000000000004',

  // Versions
  versionSponge: 'f9000000-0000-0000-0000-000000000001',
  versionLemonCream: 'f9000000-0000-0000-0000-000000000002',
  versionEggWash: 'f9000000-0000-0000-0000-000000000003',
  versionPanDeDeus: 'f9000000-0000-0000-0000-000000000004',
};

export async function setupGoldenPanDeDeus() {
  console.log('Setting up Golden Case: Pan de Deus con Crema de Limón...');

  // 1. Fetch Units
  const { data: units, error: unitsErr } = await supabaseAdmin
    .from('units')
    .select('id, code');
  if (unitsErr) throw new Error(`Failed to fetch units: ${unitsErr.message}`);

  const unitG = units.find((u) => u.code === 'g')?.id;
  const unitKg = units.find((u) => u.code === 'kg')?.id;
  const unitPiece = units.find((u) => u.code === 'piece')?.id;

  if (!unitG || !unitKg || !unitPiece) {
    throw new Error('Required base units (g, kg, piece) not found.');
  }

  // 2. Ensure Panara Business exists
  await supabaseAdmin.from('businesses').upsert({
    id: GOLDEN_BUSINESS_ID,
    name: 'Panara',
    currency_code: 'MXN',
    timezone: 'America/Mexico_City',
  });

  // 3. Upsert Items
  const items = [
    // Purchased raw materials
    { id: GOLDEN_IDS.itemStrongFlour, business_id: GOLDEN_BUSINESS_ID, name: 'Harina de Fuerza Panara', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemWheatFlour, business_id: GOLDEN_BUSINESS_ID, name: 'Harina de Trigo Panara', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemMilk, business_id: GOLDEN_BUSINESS_ID, name: 'Leche Entera (Pesada)', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemDryYeast, business_id: GOLDEN_BUSINESS_ID, name: 'Levadura Seca Panara', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemWater, business_id: GOLDEN_BUSINESS_ID, name: 'Agua Purificada Panara', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemSalt, business_id: GOLDEN_BUSINESS_ID, name: 'Sal Fina Panara', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemSugar, business_id: GOLDEN_BUSINESS_ID, name: 'Azúcar Estándar Panara', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemButter, business_id: GOLDEN_BUSINESS_ID, name: 'Mantequilla sin Sal Panara', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemEgg, business_id: GOLDEN_BUSINESS_ID, name: 'Huevo Fresco Panara', kind: 'raw_material', base_unit_id: unitPiece, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemYellowLemon, business_id: GOLDEN_BUSINESS_ID, name: 'Limón Amarillo Panara', kind: 'raw_material', base_unit_id: unitPiece, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemOrange, business_id: GOLDEN_BUSINESS_ID, name: 'Naranja Panara', kind: 'raw_material', base_unit_id: unitPiece, purchasable: true, producible: false, sellable: false },
    { id: GOLDEN_IDS.itemVanilla, business_id: GOLDEN_BUSINESS_ID, name: 'Extracto de Vainilla Panara', kind: 'raw_material', base_unit_id: unitG, purchasable: true, producible: false, sellable: false },

    // Isolated Sourdough Item (producible + purchasable test seam)
    { id: GOLDEN_IDS.itemSourdoughIsolated, business_id: GOLDEN_BUSINESS_ID, name: 'Masa Madre Activa (Aislada Golden)', kind: 'intermediate', base_unit_id: unitG, purchasable: true, producible: true, sellable: false },

    // Intermediates
    { id: GOLDEN_IDS.itemSponge, business_id: GOLDEN_BUSINESS_ID, name: 'Esponja Pan de Deus', kind: 'intermediate', base_unit_id: unitG, purchasable: false, producible: true, sellable: false },
    { id: GOLDEN_IDS.itemLemonCream, business_id: GOLDEN_BUSINESS_ID, name: 'Crema de Limón', kind: 'intermediate', base_unit_id: unitG, purchasable: false, producible: true, sellable: false },
    { id: GOLDEN_IDS.itemEggWash, business_id: GOLDEN_BUSINESS_ID, name: 'Brillo de Huevo', kind: 'intermediate', base_unit_id: unitG, purchasable: false, producible: true, sellable: false },

    // Finished Product
    { id: GOLDEN_IDS.itemPanDeDeus, business_id: GOLDEN_BUSINESS_ID, name: 'Pan de Deus con Crema de Limón', kind: 'finished_product', base_unit_id: unitPiece, purchasable: false, producible: true, sellable: true },
  ];

  for (const it of items) {
    const { error: itErr } = await supabaseAdmin.from('items').upsert(it);
    if (itErr) throw new Error(`Failed to upsert item ${it.name}: ${itErr.message}`);
  }

  // 4. Test Costs (Explicitly labeled, fixed timestamp 2026-01-01T06:00:00.000Z = 2026-01-01 00:00:00 America/Mexico_City)
  const costEffectiveFrom = '2026-01-01T06:00:00.000Z';
  const testCosts = [
    { item_id: GOLDEN_IDS.itemStrongFlour, business_id: GOLDEN_BUSINESS_ID, cost_amount: '24.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Harina de Fuerza $24/kg' },
    { item_id: GOLDEN_IDS.itemWheatFlour, business_id: GOLDEN_BUSINESS_ID, cost_amount: '20.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Harina de Trigo $20/kg' },
    { item_id: GOLDEN_IDS.itemMilk, business_id: GOLDEN_BUSINESS_ID, cost_amount: '25.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Leche $25/kg (pesada en g)' },
    { item_id: GOLDEN_IDS.itemDryYeast, business_id: GOLDEN_BUSINESS_ID, cost_amount: '200.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Levadura Seca $200/kg' },
    { item_id: GOLDEN_IDS.itemWater, business_id: GOLDEN_BUSINESS_ID, cost_amount: '2.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Agua $2/kg' },
    { item_id: GOLDEN_IDS.itemSalt, business_id: GOLDEN_BUSINESS_ID, cost_amount: '15.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Sal Fina $15/kg' },
    { item_id: GOLDEN_IDS.itemSugar, business_id: GOLDEN_BUSINESS_ID, cost_amount: '30.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Azúcar $30/kg' },
    { item_id: GOLDEN_IDS.itemButter, business_id: GOLDEN_BUSINESS_ID, cost_amount: '180.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Mantequilla $180/kg' },
    { item_id: GOLDEN_IDS.itemEgg, business_id: GOLDEN_BUSINESS_ID, cost_amount: '3.500000000000', cost_quantity: '1.000000000000', unit_id: unitPiece, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Huevo $3.50/pieza' },
    { item_id: GOLDEN_IDS.itemYellowLemon, business_id: GOLDEN_BUSINESS_ID, cost_amount: '6.000000000000', cost_quantity: '1.000000000000', unit_id: unitPiece, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Limón Amarillo $6.00/pieza' },
    { item_id: GOLDEN_IDS.itemOrange, business_id: GOLDEN_BUSINESS_ID, cost_amount: '5.000000000000', cost_quantity: '1.000000000000', unit_id: unitPiece, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Naranja $5.00/pieza' },
    { item_id: GOLDEN_IDS.itemVanilla, business_id: GOLDEN_BUSINESS_ID, cost_amount: '500.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: costEffectiveFrom, notes: '[TEST COST - NOT REAL PANARA COST] Extracto Vainilla $500/kg' },
    // Isolated Sourdough Cost
    { item_id: GOLDEN_IDS.itemSourdoughIsolated, business_id: GOLDEN_BUSINESS_ID, cost_amount: '15.000000000000', cost_quantity: '1.000000000000', unit_id: unitKg, effective_from: costEffectiveFrom, notes: '[TEST COST ISOLATION - NOT REAL PANARA COST]' },
  ];

  for (const cv of testCosts) {
    const { data: existing } = await supabaseAdmin
      .from('item_cost_versions')
      .select('id')
      .eq('item_id', cv.item_id)
      .eq('effective_from', cv.effective_from)
      .maybeSingle();

    if (!existing) {
      const { error: cvErr } = await supabaseAdmin.from('item_cost_versions').insert(cv);
      if (cvErr) throw new Error(`Failed to insert cost for item ${cv.item_id}: ${cvErr.message}`);
    }
  }

  // 5. Upsert Recipes
  const recipes = [
    { id: GOLDEN_IDS.recipeSponge, business_id: GOLDEN_BUSINESS_ID, name: 'Esponja Pan de Deus', output_item_id: GOLDEN_IDS.itemSponge, is_active: true },
    { id: GOLDEN_IDS.recipeLemonCream, business_id: GOLDEN_BUSINESS_ID, name: 'Crema de Limón', output_item_id: GOLDEN_IDS.itemLemonCream, is_active: true },
    { id: GOLDEN_IDS.recipeEggWash, business_id: GOLDEN_BUSINESS_ID, name: 'Brillo de Huevo', output_item_id: GOLDEN_IDS.itemEggWash, is_active: true },
    { id: GOLDEN_IDS.recipePanDeDeus, business_id: GOLDEN_BUSINESS_ID, name: 'Pan de Deus con Crema de Limón', output_item_id: GOLDEN_IDS.itemPanDeDeus, is_active: true },
  ];

  for (const r of recipes) {
    const { error: rErr } = await supabaseAdmin.from('recipes').upsert(r);
    if (rErr) throw new Error(`Failed to upsert recipe ${r.name}: ${rErr.message}`);
  }

  // 6. Setup Recipe Versions with Draft -> Inputs -> Active pattern and idempotent check
  async function ensureRecipeVersion({
    versionId,
    recipeId,
    yieldQuantity,
    yieldUnitId,
    yieldDescription,
    notes,
    inputs,
  }) {
    const { data: exVersion, error: exErr } = await supabaseAdmin
      .from('recipe_versions')
      .select('id, status, version_number')
      .eq('id', versionId)
      .maybeSingle();
    if (exErr) throw new Error(`Failed to query version ${versionId}: ${exErr.message}`);

    if (exVersion) {
      if (exVersion.status === 'active') {
        const { data: existingInputs, error: inpsErr } = await supabaseAdmin
          .from('recipe_inputs')
          .select('id')
          .eq('recipe_version_id', versionId);
        if (inpsErr) throw new Error(`Failed to query inputs for active version ${versionId}: ${inpsErr.message}`);
        if (!existingInputs || existingInputs.length !== inputs.length) {
          throw new Error(
            `Active version ${versionId} is incomplete: expected ${inputs.length} inputs, found ${existingInputs?.length ?? 0}. Immutability prevents updating active version.`
          );
        }
        return;
      } else if (exVersion.status === 'draft') {
        const { error: delErr } = await supabaseAdmin
          .from('recipe_inputs')
          .delete()
          .eq('recipe_version_id', versionId);
        if (delErr) throw new Error(`Failed to clear draft inputs for ${versionId}: ${delErr.message}`);

        for (const inp of inputs) {
          const { error: inpErr } = await supabaseAdmin.from('recipe_inputs').insert(inp);
          if (inpErr) throw new Error(`Failed to insert input for ${versionId}: ${inpErr.message}`);
        }

        const { error: actErr } = await supabaseAdmin
          .from('recipe_versions')
          .update({
            status: 'active',
            effective_from: costEffectiveFrom,
          })
          .eq('id', versionId);
        if (actErr) throw new Error(`Failed to activate version ${versionId}: ${actErr.message}`);
        return;
      }
    }

    const { error: vErr } = await supabaseAdmin.from('recipe_versions').insert({
      id: versionId,
      business_id: GOLDEN_BUSINESS_ID,
      recipe_id: recipeId,
      version_number: 1,
      status: 'draft',
      reference_yield_quantity: yieldQuantity,
      reference_yield_unit_id: yieldUnitId,
      portion_quantity: null,
      portion_unit_id: null,
      yield_description: yieldDescription,
      notes,
    });
    if (vErr) throw new Error(`Failed to create version ${versionId}: ${vErr.message}`);

    for (const inp of inputs) {
      const { error: inpErr } = await supabaseAdmin.from('recipe_inputs').insert(inp);
      if (inpErr) throw new Error(`Failed to insert input for ${versionId}: ${inpErr.message}`);
    }

    const { error: actErr } = await supabaseAdmin
      .from('recipe_versions')
      .update({
        status: 'active',
        effective_from: costEffectiveFrom,
      })
      .eq('id', versionId);
    if (actErr) throw new Error(`Failed to activate version ${versionId}: ${actErr.message}`);
  }

  // Recipe 1: Esponja Pan de Deus (yield: 229 g)
  await ensureRecipeVersion({
    versionId: GOLDEN_IDS.versionSponge,
    recipeId: GOLDEN_IDS.recipeSponge,
    yieldQuantity: '229.000000000000',
    yieldUnitId: unitG,
    yieldDescription: 'Suma de insumos: 63g leche + 100g masa madre + 1g levadura + 65g harina fuerza = 229g',
    notes: 'Prefermento usado completo en la masa de Pan de Deus',
    inputs: [
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionSponge, item_id: GOLDEN_IDS.itemMilk, position: 1, quantity_mode: 'absolute', quantity: '63.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionSponge, item_id: GOLDEN_IDS.itemSourdoughIsolated, position: 2, quantity_mode: 'absolute', quantity: '100.000000000000', unit_id: unitG, costing_source: 'purchased', notes: '[ISOLATION SEAM - COSTED AS PURCHASED]' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionSponge, item_id: GOLDEN_IDS.itemDryYeast, position: 3, quantity_mode: 'absolute', quantity: '1.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionSponge, item_id: GOLDEN_IDS.itemStrongFlour, position: 4, quantity_mode: 'absolute', quantity: '65.000000000000', unit_id: unitG, costing_source: 'purchased' },
    ],
  });

  // Recipe 2: Crema de Limón (yield: 601 g declarado)
  await ensureRecipeVersion({
    versionId: GOLDEN_IDS.versionLemonCream,
    recipeId: GOLDEN_IDS.recipeLemonCream,
    yieldQuantity: '601.000000000000',
    yieldUnitId: unitG,
    yieldDescription: 'Rendimiento declarado de 601 g (fuente: campo RENDIMIENTO). Ingredientes basados en PORCION/MEDIDA: 3 huevos, 200 g azúcar, 2 limones amarillos, 1 g sal, 100 g mantequilla.',
    notes: 'Relleno de limón para Pan de Deus y otras piezas',
    inputs: [
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionLemonCream, item_id: GOLDEN_IDS.itemEgg, position: 1, quantity_mode: 'absolute', quantity: '3.000000000000', unit_id: unitPiece, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionLemonCream, item_id: GOLDEN_IDS.itemSugar, position: 2, quantity_mode: 'absolute', quantity: '200.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionLemonCream, item_id: GOLDEN_IDS.itemYellowLemon, position: 3, quantity_mode: 'absolute', quantity: '2.000000000000', unit_id: unitPiece, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionLemonCream, item_id: GOLDEN_IDS.itemSalt, position: 4, quantity_mode: 'absolute', quantity: '1.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionLemonCream, item_id: GOLDEN_IDS.itemButter, position: 5, quantity_mode: 'absolute', quantity: '100.000000000000', unit_id: unitG, costing_source: 'purchased' },
    ],
  });

  // Recipe 3: Brillo de Huevo (yield nominal: 120 g aproximados)
  await ensureRecipeVersion({
    versionId: GOLDEN_IDS.versionEggWash,
    recipeId: GOLDEN_IDS.recipeEggWash,
    yieldQuantity: '120.000000000000',
    yieldUnitId: unitG,
    yieldDescription: 'Rendimiento nominal aproximado: 120 g (1 huevo ≈ 60 g + 60 g leche). Preparación consumida en su totalidad por el batch.',
    notes: 'Barniz de huevo y leche preparado para la tanda de Pan de Deus',
    inputs: [
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionEggWash, item_id: GOLDEN_IDS.itemEgg, position: 1, quantity_mode: 'absolute', quantity: '1.000000000000', unit_id: unitPiece, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionEggWash, item_id: GOLDEN_IDS.itemMilk, position: 2, quantity_mode: 'absolute', quantity: '60.000000000000', unit_id: unitG, costing_source: 'purchased' },
    ],
  });

  // Recipe 4: Pan de Deus con Crema de Limón (yield: 8 piece)
  await ensureRecipeVersion({
    versionId: GOLDEN_IDS.versionPanDeDeus,
    recipeId: GOLDEN_IDS.recipePanDeDeus,
    yieldQuantity: '8.000000000000',
    yieldUnitId: unitPiece,
    yieldDescription: '8 piezas terminadas. División nominal de 70 g de masa cruda por pieza antes de relleno y horneado.',
    notes: 'Receta de Pan de Deus con relleno de Crema de Limón (35 g/pieza) y barniz de brillo de huevo completo.',
    inputs: [
      // Subpreparación Esponja (229 g consumidos completos)
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemSponge, position: 1, quantity_mode: 'absolute', quantity: '229.000000000000', unit_id: unitG, costing_source: 'produced' },

      // Insumos directos masa
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemWheatFlour, position: 2, quantity_mode: 'absolute', quantity: '190.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemWater, position: 3, quantity_mode: 'absolute', quantity: '45.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemSalt, position: 4, quantity_mode: 'absolute', quantity: '4.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemSugar, position: 5, quantity_mode: 'absolute', quantity: '43.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemButter, position: 6, quantity_mode: 'absolute', quantity: '30.000000000000', unit_id: unitG, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemEgg, position: 7, quantity_mode: 'absolute', quantity: '2.000000000000', unit_id: unitPiece, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemYellowLemon, position: 8, quantity_mode: 'absolute', quantity: '0.500000000000', unit_id: unitPiece, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemOrange, position: 9, quantity_mode: 'absolute', quantity: '0.500000000000', unit_id: unitPiece, costing_source: 'purchased' },
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemVanilla, position: 10, quantity_mode: 'absolute', quantity: '3.000000000000', unit_id: unitG, costing_source: 'purchased' },

      // Relleno: Crema de Limón (280 g = 35 g x 8 piezas)
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemLemonCream, position: 11, quantity_mode: 'absolute', quantity: '280.000000000000', unit_id: unitG, costing_source: 'produced' },

      // Barniz: Brillo de Huevo (120 g consumidos completos)
      { business_id: GOLDEN_BUSINESS_ID, recipe_version_id: GOLDEN_IDS.versionPanDeDeus, item_id: GOLDEN_IDS.itemEggWash, position: 12, quantity_mode: 'absolute', quantity: '120.000000000000', unit_id: unitG, costing_source: 'produced' },
    ],
  });

  console.log('Golden Case Pan de Deus fixtures created successfully!');
}

// Allow direct execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  setupGoldenPanDeDeus()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Golden Case fixture setup failed:', err);
      process.exit(1);
    });
}
