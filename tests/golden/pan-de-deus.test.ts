import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseRecipeDataProvider } from '../../src/data/supabaseRecipeRepository.js';
import { calculatePublishedRecipeAsOf } from '../../src/domain/calculation/recipeCalculator.js';
import { CostaraDecimal } from '../../src/domain/calculation/decimal.js';
import { setupGoldenPanDeDeus, GOLDEN_BUSINESS_ID, GOLDEN_IDS } from '../../scripts/setup-golden-pan-de-deus.mjs';

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
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to run golden tests.');
}

describe('Golden Case: Pan de Deus con Crema de Limón', () => {
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const dataProvider = createSupabaseRecipeDataProvider({
    businessId: GOLDEN_BUSINESS_ID,
    client: adminClient,
  });

  // Fixed asOf date after costEffectiveFrom (2026-01-01T06:00:00.000Z)
  const asOf = new Date('2026-06-01T00:00:00Z');

  // Exact mathematical references
  // Esponja: 63*0.025 + 100*0.015 + 1*0.2 + 65*0.024 = 1.575 + 1.5 + 0.2 + 1.56 = 4.835
  const EXPECTED_SPONGE_COST = new CostaraDecimal('4.835');
  const EXPECTED_SPONGE_COST_ALLOCATED = new CostaraDecimal(229).times(EXPECTED_SPONGE_COST.dividedBy(229));

  // Crema de Limón: 3*3.5 + 200*0.03 + 2*6.0 + 1*0.015 + 100*0.18 = 10.5 + 6.0 + 12.0 + 0.015 + 18.0 = 46.515
  // Allocated to 280g: 280 * (46.515 / 601) = 13024.2 / 601
  const EXPECTED_LEMON_CREAM_TOTAL = new CostaraDecimal('46.515');
  const EXPECTED_LEMON_CREAM_ALLOCATED = new CostaraDecimal(280).times(EXPECTED_LEMON_CREAM_TOTAL.dividedBy(601));

  // Brillo de Huevo: 1*3.5 + 60*0.025 = 3.5 + 1.5 = 5.0
  const EXPECTED_EGG_WASH_COST = new CostaraDecimal('5.0');
  const EXPECTED_EGG_WASH_COST_ALLOCATED = new CostaraDecimal(120).times(EXPECTED_EGG_WASH_COST.dividedBy(120));

  // Direct Dough Ingredients:
  // 190*0.020 (3.8) + 45*0.002 (0.09) + 4*0.015 (0.06) + 43*0.030 (1.29) + 30*0.180 (5.4) + 2*3.5 (7.0) + 0.5*6.0 (3.0) + 0.5*5.0 (2.5) + 3*0.500 (1.5) = 24.64
  const EXPECTED_DOUGH_DIRECT_COST = new CostaraDecimal('24.64');

  // Batch Total: 24.64 + 4.835 + 5.0 + (13024.2 / 601) = 34.475 + 13024.2/601 = 33743.675 / 601
  const EXPECTED_BATCH_TOTAL = EXPECTED_DOUGH_DIRECT_COST
    .plus(EXPECTED_SPONGE_COST_ALLOCATED)
    .plus(EXPECTED_EGG_WASH_COST_ALLOCATED)
    .plus(EXPECTED_LEMON_CREAM_ALLOCATED);

  // Expected Cost per Piece: Batch Total / 8
  const EXPECTED_COST_PER_PIECE = EXPECTED_BATCH_TOTAL.dividedBy(8);

  beforeAll(async () => {
    // Ensure deterministic clean setup of golden case
    await setupGoldenPanDeDeus();
  }, 15000);

  it('1 & 11. calculates base batch of 8 pieces with zero unexpected issues and complete status', async () => {
    const calc = await calculatePublishedRecipeAsOf({
      recipeId: GOLDEN_IDS.recipePanDeDeus,
      dataProvider,
      asOf,
    });

    expect(calc).toBeDefined();
    expect(calc.status).toBe('complete');
    expect(calc.isCostComplete).toBe(true);
    expect(calc.issues).toHaveLength(0);
    expect(calc.scaleFactor.equals(1)).toBe(true);
    expect(calc.scaledYield.canonicalQuantity.equals(8)).toBe(true);
    expect(calc.scaledYield.canonicalUnitCode).toBe('piece');
  });

  it('2. calculates exact known direct batch material cost without floating point drift', async () => {
    const calc = await calculatePublishedRecipeAsOf({
      recipeId: GOLDEN_IDS.recipePanDeDeus,
      dataProvider,
      asOf,
    });

    expect(calc.knownBatchMaterialCost.toString()).toBe(EXPECTED_BATCH_TOTAL.toString());
    // In human readable rounded MXN: ~$56.15 MXN
    expect(calc.knownBatchMaterialCost.toFixed(2)).toBe('56.15');
  });

  it('3. calculates cost per piece = batch cost / 8', async () => {
    const calc = await calculatePublishedRecipeAsOf({
      recipeId: GOLDEN_IDS.recipePanDeDeus,
      dataProvider,
      asOf,
    });

    expect(calc.knownCostPerOutputUnit).toBeDefined();
    expect(calc.knownCostPerOutputUnit!.toString()).toBe(EXPECTED_COST_PER_PIECE.toString());
    // In human readable rounded MXN: ~$7.02 MXN per piece
    expect(calc.knownCostPerOutputUnit!.toFixed(2)).toBe('7.02');
  });

  it('4. consumes Esponja at 100% (229g) with its complete internal breakdown', async () => {
    const calc = await calculatePublishedRecipeAsOf({
      recipeId: GOLDEN_IDS.recipePanDeDeus,
      dataProvider,
      asOf,
    });

    const spongeNode = calc.breakdown.find((n) => n.itemId === GOLDEN_IDS.itemSponge);
    expect(spongeNode).toBeDefined();
    expect(spongeNode!.canonicalQuantity.equals(229)).toBe(true);
    expect(spongeNode!.nodeMaterialCost).toBeDefined();
    expect(spongeNode!.nodeMaterialCost!.toString()).toBe(EXPECTED_SPONGE_COST_ALLOCATED.toString());
    expect(spongeNode!.nodeMaterialCost!.toFixed(2)).toBe('4.84');
    expect(spongeNode!.nodeMaterialCost!.toFixed(3)).toBe('4.835');
    expect(spongeNode!.isCostComplete).toBe(true);

    // Verify Esponja children
    expect(spongeNode!.children).toHaveLength(4);
    const milkChild = spongeNode!.children?.find((c) => c.itemId === GOLDEN_IDS.itemMilk);
    expect(milkChild?.canonicalQuantity.equals(63)).toBe(true);
    expect(milkChild?.nodeMaterialCost?.equals('1.575')).toBe(true);

    const sourdoughChild = spongeNode!.children?.find((c) => c.itemId === GOLDEN_IDS.itemSourdoughIsolated);
    expect(sourdoughChild?.canonicalQuantity.equals(100)).toBe(true);
    expect(sourdoughChild?.nodeMaterialCost?.equals('1.5')).toBe(true);

    const yeastChild = spongeNode!.children?.find((c) => c.itemId === GOLDEN_IDS.itemDryYeast);
    expect(yeastChild?.canonicalQuantity.equals(1)).toBe(true);
    expect(yeastChild?.nodeMaterialCost?.equals('0.2')).toBe(true);

    const strongFlourChild = spongeNode!.children?.find((c) => c.itemId === GOLDEN_IDS.itemStrongFlour);
    expect(strongFlourChild?.canonicalQuantity.equals(65)).toBe(true);
    expect(strongFlourChild?.nodeMaterialCost?.equals('1.56')).toBe(true);
  });

  it('5. consumes Crema de Limón proportionally: exactly 280g of 601g declared yield', async () => {
    const calc = await calculatePublishedRecipeAsOf({
      recipeId: GOLDEN_IDS.recipePanDeDeus,
      dataProvider,
      asOf,
    });

    const lemonNode = calc.breakdown.find((n) => n.itemId === GOLDEN_IDS.itemLemonCream);
    expect(lemonNode).toBeDefined();
    expect(lemonNode!.canonicalQuantity.equals(280)).toBe(true);
    expect(lemonNode!.nodeMaterialCost).toBeDefined();
    expect(lemonNode!.nodeMaterialCost!.toString()).toBe(EXPECTED_LEMON_CREAM_ALLOCATED.toString());
    expect(lemonNode!.isCostComplete).toBe(true);

    // Verify lemon cream children scaled by 280/601
    const allocFactor = new CostaraDecimal(280).dividedBy(601);
    const eggChild = lemonNode!.children?.find((c) => c.itemId === GOLDEN_IDS.itemEgg);
    expect(eggChild?.canonicalQuantity.toString()).toBe(new CostaraDecimal(3).times(allocFactor).toString());
  });

  it('6. consumes Brillo de Huevo at 100% (120g nominal) allocating $5.00 MXN', async () => {
    const calc = await calculatePublishedRecipeAsOf({
      recipeId: GOLDEN_IDS.recipePanDeDeus,
      dataProvider,
      asOf,
    });

    const eggWashNode = calc.breakdown.find((n) => n.itemId === GOLDEN_IDS.itemEggWash);
    expect(eggWashNode).toBeDefined();
    expect(eggWashNode!.canonicalQuantity.equals(120)).toBe(true);
    expect(eggWashNode!.nodeMaterialCost).toBeDefined();
    expect(eggWashNode!.nodeMaterialCost!.toString()).toBe(EXPECTED_EGG_WASH_COST.toString());
    expect(eggWashNode!.isCostComplete).toBe(true);

    expect(eggWashNode!.children).toHaveLength(2);
    const eggChild = eggWashNode!.children?.find((c) => c.itemId === GOLDEN_IDS.itemEgg);
    expect(eggChild?.canonicalQuantity.equals(1)).toBe(true);
    expect(eggChild?.nodeMaterialCost?.equals('3.5')).toBe(true);

    const milkChild = eggWashNode!.children?.find((c) => c.itemId === GOLDEN_IDS.itemMilk);
    expect(milkChild?.canonicalQuantity.equals(60)).toBe(true);
    expect(milkChild?.nodeMaterialCost?.equals('1.5')).toBe(true);
  });

  it('7. resolves recursive costing tree down to isolated Masa Madre', async () => {
    const calc = await calculatePublishedRecipeAsOf({
      recipeId: GOLDEN_IDS.recipePanDeDeus,
      dataProvider,
      asOf,
    });

    const spongeNode = calc.breakdown.find((n) => n.itemId === GOLDEN_IDS.itemSponge);
    const sourdoughChild = spongeNode?.children?.find((c) => c.itemId === GOLDEN_IDS.itemSourdoughIsolated);
    expect(sourdoughChild).toBeDefined();
    expect(sourdoughChild?.costingSource).toBe('purchased');
    expect(sourdoughChild?.isCostComplete).toBe(true);
    expect(sourdoughChild?.unitCostCanonical?.equals('0.015')).toBe(true); // $15/kg = $0.015/g
  });

  it('8. scales to 16 pieces (2x): doubles batch cost, preserves identical cost per piece', async () => {
    const scaledCalc = await calculatePublishedRecipeAsOf({
      recipeId: GOLDEN_IDS.recipePanDeDeus,
      dataProvider,
      asOf,
      scaleTarget: {
        mode: 'yield',
        targetQuantity: new CostaraDecimal(16),
      },
    });

    expect(scaledCalc.scaleFactor.equals(2)).toBe(true);
    expect(scaledCalc.scaledYield.canonicalQuantity.equals(16)).toBe(true);

    // Batch cost is exactly 2x
    expect(scaledCalc.knownBatchMaterialCost.toString()).toBe(EXPECTED_BATCH_TOTAL.times(2).toString());

    // Cost per piece is identical
    expect(scaledCalc.knownCostPerOutputUnit!.toFixed(20)).toBe(EXPECTED_COST_PER_PIECE.toFixed(20));
    expect(scaledCalc.knownCostPerOutputUnit!.toFixed(2)).toBe('7.02');

    // Scaled inputs
    const spongeNode = scaledCalc.breakdown.find((n) => n.itemId === GOLDEN_IDS.itemSponge);
    expect(spongeNode?.canonicalQuantity.equals(458)).toBe(true); // 229 * 2

    const lemonNode = scaledCalc.breakdown.find((n) => n.itemId === GOLDEN_IDS.itemLemonCream);
    expect(lemonNode?.canonicalQuantity.equals(560)).toBe(true); // 280 * 2

    const eggWashNode = scaledCalc.breakdown.find((n) => n.itemId === GOLDEN_IDS.itemEggWash);
    expect(eggWashNode?.canonicalQuantity.equals(240)).toBe(true); // 120 * 2
  });

  it('9. scales to 4 pieces (0.5x): halves batch cost, preserves identical cost per piece', async () => {
    const scaledCalc = await calculatePublishedRecipeAsOf({
      recipeId: GOLDEN_IDS.recipePanDeDeus,
      dataProvider,
      asOf,
      scaleTarget: {
        mode: 'yield',
        targetQuantity: new CostaraDecimal(4),
      },
    });

    expect(scaledCalc.scaleFactor.equals(0.5)).toBe(true);
    expect(scaledCalc.scaledYield.canonicalQuantity.equals(4)).toBe(true);

    // Batch cost is exactly 0.5x
    expect(scaledCalc.knownBatchMaterialCost.toString()).toBe(EXPECTED_BATCH_TOTAL.times(0.5).toString());

    // Cost per piece is identical
    expect(scaledCalc.knownCostPerOutputUnit!.toFixed(20)).toBe(EXPECTED_COST_PER_PIECE.toFixed(20));
    expect(scaledCalc.knownCostPerOutputUnit!.toFixed(2)).toBe('7.02');

    // Scaled inputs
    const spongeNode = scaledCalc.breakdown.find((n) => n.itemId === GOLDEN_IDS.itemSponge);
    expect(spongeNode?.canonicalQuantity.equals(114.5)).toBe(true); // 229 * 0.5

    const lemonNode = scaledCalc.breakdown.find((n) => n.itemId === GOLDEN_IDS.itemLemonCream);
    expect(lemonNode?.canonicalQuantity.equals(140)).toBe(true); // 280 * 0.5
  });

  it('10. handles missing cost intentionally without crashing and preserves partial known cost', async () => {
    // Wrap dataProvider with a Proxy so all prototype methods are preserved
    const missingCostProvider = new Proxy(dataProvider, {
      get(target, prop, receiver) {
        if (prop === 'getItemCostResolution') {
          return async (itemId: string, asOfDate: Date) => {
            if (itemId === GOLDEN_IDS.itemVanilla) {
              return {
                applicableCost: null,
                hasAnyCostEver: false,
                firstAvailableCostAt: null,
              };
            }
            return target.getItemCostResolution(itemId, asOfDate);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const calc = await calculatePublishedRecipeAsOf({
      recipeId: GOLDEN_IDS.recipePanDeDeus,
      dataProvider: missingCostProvider,
      asOf,
    });

    expect(calc).toBeDefined();
    expect(calc.status).toBe('incomplete');
    expect(calc.isCostComplete).toBe(false);
    expect(calc.issues.some((i) => i.code === 'MISSING_PURCHASE_COST' && i.itemId === GOLDEN_IDS.itemVanilla)).toBe(true);

    const expectedPartialCost = EXPECTED_BATCH_TOTAL.minus(new CostaraDecimal(3).times(0.5));
    expect(calc.knownBatchMaterialCost.toString()).toBe(expectedPartialCost.toString());
  });
});
