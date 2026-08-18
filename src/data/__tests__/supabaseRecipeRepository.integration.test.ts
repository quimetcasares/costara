import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { CostaraDecimal } from '../../domain/calculation/decimal.js';
import { createSupabaseRecipeDataProvider } from '../supabaseRecipeRepository.js';
import { calculatePublishedRecipeAsOf } from '../../domain/calculation/recipeCalculator.js';

const supabaseUrl = 'http://127.0.0.1:54321';
const serviceRoleKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('Supabase Recipe Repository Integration', () => {
  const client = createClient(supabaseUrl, serviceRoleKey);

  const bizAId = 'a0000000-0000-0000-0000-0000000000ff';
  const bizBId = 'b0000000-0000-0000-0000-0000000000fe';

  const itemFlourAId = 'a0000000-0000-0000-0000-0000000000f1';
  const itemFlourBId = 'b0000000-0000-0000-0000-0000000000f3';

  const e2eRecipeId = 'a0000000-0000-0000-0000-000000000099';
  const e2eVersionId = 'a0000000-0000-0000-0000-000000000098';
  const e2eOutputItemId = 'a0000000-0000-0000-0000-000000000097';
  const e2eInputId = 'a0000000-0000-0000-0000-000000000096';

  let unitGId: string;
  let unitKgId: string;

  beforeAll(async () => {
    // 1. Get units
    const { data: units } = await client.from('units').select('id, code').in('code', ['g', 'kg']);
    unitGId = units?.find((u) => u.code === 'g')?.id ?? '';
    unitKgId = units?.find((u) => u.code === 'kg')?.id ?? '';

    // 2. Setup E2E test data for Biz A in database
    // Create output item
    await client.from('items').upsert({
      id: e2eOutputItemId,
      business_id: bizAId,
      name: 'Pan Rustico E2E',
      kind: 'finished_product',
      base_unit_id: unitGId,
      purchasable: false,
      producible: true,
      sellable: true,
      track_inventory: true,
      is_active: true,
    });

    // Create recipe
    await client.from('recipes').upsert({
      id: e2eRecipeId,
      business_id: bizAId,
      name: 'Receta Pan Rustico E2E',
      output_item_id: e2eOutputItemId,
      is_active: true,
    });

    // Check if recipe version already exists to remain cleanly idempotent across runs
    const { data: existingVer } = await client
      .from('recipe_versions')
      .select('id, status')
      .eq('id', e2eVersionId)
      .maybeSingle();

    if (!existingVer) {
      await client.from('recipe_versions').insert({
        id: e2eVersionId,
        business_id: bizAId,
        recipe_id: e2eRecipeId,
        version_number: 1,
        status: 'draft',
        reference_yield_quantity: '10.000000000000',
        reference_yield_unit_id: unitKgId,
        effective_from: null,
      });

      await client.from('recipe_inputs').insert({
        id: e2eInputId,
        business_id: bizAId,
        recipe_version_id: e2eVersionId,
        item_id: itemFlourAId,
        position: 0,
        quantity_mode: 'absolute',
        quantity: '10.000000000000',
        unit_id: unitKgId,
        costing_source: 'purchased',
      });

      await client
        .from('recipe_versions')
        .update({
          status: 'active',
          effective_from: '2026-01-01T00:00:00Z',
        })
        .eq('id', e2eVersionId);
    }

    // Create historical cost for Harina Panara ($20 / 1 kg as of 2026-01-01)
    await client.from('item_cost_versions').upsert({
      id: 'a0000000-0000-0000-0000-000000000095',
      business_id: bizAId,
      item_id: itemFlourAId,
      cost_amount: '20.000000000000',
      cost_quantity: '1.000000000000',
      unit_id: unitKgId,
      effective_from: '2026-01-01T00:00:00Z',
      notes: 'E2E Seed Cost',
    });
  });

  it('A. business scope: provider A does not return records belonging to business B', async () => {
    const providerA = createSupabaseRecipeDataProvider({ businessId: bizAId, client });
    const providerB = createSupabaseRecipeDataProvider({ businessId: bizBId, client });

    // Item belonging to Biz B queried via Provider A should return null
    const itemBviaA = await providerA.getItem(itemFlourBId);
    expect(itemBviaA).toBeNull();

    // Item belonging to Biz B queried via Provider B should return valid item
    const itemBviaB = await providerB.getItem(itemFlourBId);
    expect(itemBviaB).not.toBeNull();
    expect(itemBviaB?.businessId).toBe(bizBId);
  });

  it('B. historical recipe lookup: asOf selects the correct published recipe version', async () => {
    const providerA = createSupabaseRecipeDataProvider({ businessId: bizAId, client });

    // Query published version as of 2026-03-15 for e2eRecipeId
    const versionMarch = await providerA.getPublishedRecipeVersionAsOf(
      e2eRecipeId,
      new Date('2026-03-15T00:00:00Z')
    );
    expect(versionMarch).not.toBeNull();
    expect(versionMarch?.id).toBe(e2eVersionId);
    expect(versionMarch?.businessId).toBe(bizAId);
  });

  it('C. historical cost lookup: asOf selects the correct item_cost_version', async () => {
    const providerA = createSupabaseRecipeDataProvider({ businessId: bizAId, client });

    const costRes = await providerA.getItemCostResolution(
      itemFlourAId,
      new Date('2026-03-15T00:00:00Z')
    );

    expect(costRes).toBeDefined();
    expect(costRes.hasAnyCostEver).toBe(true);
    expect(costRes.applicableCost).not.toBeNull();
    expect(costRes.applicableCost?.businessId).toBe(bizAId);
    expect(costRes.applicableCost?.costAmount.toString()).toBe('20');
  });

  it('D. numeric precision regression test: numeric(30,12) with >15 digits preserves exact string representation in CostaraDecimal', async () => {
    const highPrecisionCost = '999999999999999999.123456789012';
    const smallPrecisionQty = '0.000000000001';
    const testCostId = 'a0000000-0000-0000-0000-000000000094';

    // Insert high precision cost in DB
    await client.from('item_cost_versions').upsert({
      id: testCostId,
      business_id: bizAId,
      item_id: itemFlourAId,
      cost_amount: highPrecisionCost,
      cost_quantity: smallPrecisionQty,
      unit_id: unitKgId,
      effective_from: '2099-01-01T00:00:00Z',
      notes: 'Precision Regression Test',
    });

    const providerA = createSupabaseRecipeDataProvider({ businessId: bizAId, client });
    const costRes = await providerA.getItemCostResolution(
      itemFlourAId,
      new Date('2099-01-02T00:00:00Z')
    );

    expect(costRes.applicableCost).not.toBeNull();
    // Verify exact precision without IEEE-754 degradation to 1e18
    expect(costRes.applicableCost?.costAmount.toString()).toBe(highPrecisionCost);
    expect(costRes.applicableCost?.costQuantity.toString()).toBe(smallPrecisionQty);
    expect(costRes.applicableCost?.costAmount instanceof CostaraDecimal).toBe(true);
  });

  it('E. full chain integration: real DB data -> SupabaseRecipeDataProvider -> calculatePublishedRecipeAsOf -> RecipeCalculationResult', async () => {
    const providerA = createSupabaseRecipeDataProvider({ businessId: bizAId, client });
    const asOf = new Date('2026-03-15T00:00:00Z');

    const result = await calculatePublishedRecipeAsOf({
      dataProvider: providerA,
      asOf,
      recipeId: e2eRecipeId,
    });

    expect(result.status).toBe('complete');
    expect(result.recipeId).toBe(e2eRecipeId);
    expect(result.recipeVersionId).toBe(e2eVersionId);
    expect(result.businessId).toBe(bizAId);
    expect(result.currencyCode).toBe('MXN');
    expect(result.isCostComplete).toBe(true);

    // Formulation: 10 kg Flour @ $20/kg = $200.00
    // Canonical quantity of input: 10 kg -> 10,000 g
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].canonicalQuantity.toString()).toBe('10000');
    expect(result.breakdown[0].canonicalUnitCode).toBe('g');
    expect(result.breakdown[0].nodeMaterialCost?.toString()).toBe('200');

    // Total batch cost = $200.00
    expect(result.knownBatchMaterialCost.toString()).toBe('200');

    // Yield = 10 kg -> 10,000 g
    expect(result.referenceYield.canonicalQuantity.toString()).toBe('10000');
    expect(result.referenceYield.canonicalUnitCode).toBe('g');

    // Cost per output unit (continuous mass: $200 / 10,000 g = $0.02 / g)
    expect(result.knownCostPerOutputUnit?.toString()).toBe('0.02');
  });
});
