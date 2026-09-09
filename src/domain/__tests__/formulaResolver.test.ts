import { describe, it, expect } from 'vitest';
import { CostaraDecimal } from '../calculation/decimal.ts';
import { resolveRecipeFormula } from '../calculation/formulaResolver.ts';
import type {
  RecipeInputData,
  PercentageBaseData,
  ItemData,
  UnitData,
} from '../calculation/types.ts';

describe('Formula Resolver', () => {
  const unitG: UnitData = {
    id: 'u-g',
    code: 'g',
    nameSingular: 'gramo',
    namePlural: 'gramos',
    symbol: 'g',
    dimensionId: 'dim-mass',
    dimensionCode: 'mass',
    factorToBase: new CostaraDecimal(1),
    isBase: true,
  };

  const unitKg: UnitData = {
    id: 'u-kg',
    code: 'kg',
    nameSingular: 'kilogramo',
    namePlural: 'kilogramos',
    symbol: 'kg',
    dimensionId: 'dim-mass',
    dimensionCode: 'mass',
    factorToBase: new CostaraDecimal(1000),
    isBase: false,
  };

  const unitL: UnitData = {
    id: 'u-l',
    code: 'l',
    nameSingular: 'litro',
    namePlural: 'litros',
    symbol: 'L',
    dimensionId: 'dim-vol',
    dimensionCode: 'volume',
    factorToBase: new CostaraDecimal(1000),
    isBase: false,
  };

  const unitsMap = new Map<string, UnitData>([
    [unitG.id, unitG],
    [unitKg.id, unitKg],
    [unitL.id, unitL],
  ]);

  const itemFlourWhite: ItemData = {
    id: 'it-flour-white',
    businessId: 'biz-1',
    name: 'Harina Blanca',
    kind: 'raw_material',
    baseUnitId: unitG.id,
    purchasable: true,
    producible: false,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemFlourWhole: ItemData = {
    id: 'it-flour-whole',
    businessId: 'biz-1',
    name: 'Harina Integral',
    kind: 'raw_material',
    baseUnitId: unitG.id,
    purchasable: true,
    producible: false,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemSourdough: ItemData = {
    id: 'it-sourdough',
    businessId: 'biz-1',
    name: 'Masa Madre',
    kind: 'intermediate',
    baseUnitId: unitG.id,
    purchasable: false,
    producible: true,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemWater: ItemData = {
    id: 'it-water',
    businessId: 'biz-1',
    name: 'Agua',
    kind: 'raw_material',
    baseUnitId: unitG.id,
    purchasable: true,
    producible: false,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemMilkVol: ItemData = {
    id: 'it-milk-vol',
    businessId: 'biz-1',
    name: 'Leche Vol',
    kind: 'raw_material',
    baseUnitId: unitL.id,
    purchasable: true,
    producible: false,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemsMap = new Map<string, ItemData>([
    [itemFlourWhite.id, itemFlourWhite],
    [itemFlourWhole.id, itemFlourWhole],
    [itemSourdough.id, itemSourdough],
    [itemWater.id, itemWater],
    [itemMilkVol.id, itemMilkVol],
  ]);

  it('1. resolves single absolute input (10 kg -> 10,000 g)', () => {
    const inputs: RecipeInputData[] = [
      {
        id: 'inp-1',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemFlourWhite.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: null,
        notes: null,
      },
    ];

    const res = resolveRecipeFormula({ inputs, percentageBases: [], itemsMap, unitsMap });
    expect(res.status).toBe('complete');
    expect(res.resolvedInputs).toHaveLength(1);
    expect(res.resolvedInputs[0].canonicalQuantity?.toString()).toBe('10000');
    expect(res.resolvedInputs[0].canonicalUnitCode).toBe('g');
  });

  it('2. resolves simple percentage input (10% of 10 kg -> 1,000 g)', () => {
    const inputs: RecipeInputData[] = [
      {
        id: 'inp-flour',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemFlourWhite.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: null,
        notes: null,
      },
      {
        id: 'inp-sourdough',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemSourdough.id,
        position: 1,
        quantityMode: 'percentage',
        quantity: null,
        unitId: null,
        percentage: new CostaraDecimal(10),
        costingSource: 'produced',
        notes: null,
      },
    ];

    const percentageBases: PercentageBaseData[] = [
      { percentageInputId: 'inp-sourdough', basisInputId: 'inp-flour' },
    ];

    const res = resolveRecipeFormula({ inputs, percentageBases, itemsMap, unitsMap });
    expect(res.status).toBe('complete');
    expect(res.resolvedInputs[1].canonicalQuantity?.toString()).toBe('1000');
  });

  it('3. resolves compound percentage base (10 kg white + 4 kg whole wheat -> 14 kg base -> 10% = 1.4 kg)', () => {
    const inputs: RecipeInputData[] = [
      {
        id: 'inp-white',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemFlourWhite.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: null,
        notes: null,
      },
      {
        id: 'inp-whole',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemFlourWhole.id,
        position: 1,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(4),
        unitId: unitKg.id,
        percentage: null,
        costingSource: null,
        notes: null,
      },
      {
        id: 'inp-sourdough',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemSourdough.id,
        position: 2,
        quantityMode: 'percentage',
        quantity: null,
        unitId: null,
        percentage: new CostaraDecimal(10),
        costingSource: 'produced',
        notes: null,
      },
    ];

    const percentageBases: PercentageBaseData[] = [
      { percentageInputId: 'inp-sourdough', basisInputId: 'inp-white' },
      { percentageInputId: 'inp-sourdough', basisInputId: 'inp-whole' },
    ];

    const res = resolveRecipeFormula({ inputs, percentageBases, itemsMap, unitsMap });
    expect(res.status).toBe('complete');
    expect(res.resolvedInputs[2].canonicalQuantity?.toString()).toBe('1400');
  });

  it('4. supports percentage > 100% (160% of 10 kg -> 16,000 g)', () => {
    const inputs: RecipeInputData[] = [
      {
        id: 'inp-flour',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemFlourWhite.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: null,
        notes: null,
      },
      {
        id: 'inp-water',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemWater.id,
        position: 1,
        quantityMode: 'percentage',
        quantity: null,
        unitId: null,
        percentage: new CostaraDecimal(160),
        costingSource: 'purchased',
        notes: null,
      },
    ];

    const percentageBases: PercentageBaseData[] = [
      { percentageInputId: 'inp-water', basisInputId: 'inp-flour' },
    ];

    const res = resolveRecipeFormula({ inputs, percentageBases, itemsMap, unitsMap });
    expect(res.status).toBe('complete');
    expect(res.resolvedInputs[1].canonicalQuantity?.toString()).toBe('16000');
  });

  it('5. resolves chained dependencies: A (10 kg) -> B (10% of A) -> C (25% of [A + B])', () => {
    const inputs: RecipeInputData[] = [
      {
        id: 'inp-a',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemFlourWhite.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: null,
        notes: null,
      },
      {
        id: 'inp-b',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemSourdough.id,
        position: 1,
        quantityMode: 'percentage',
        quantity: null,
        unitId: null,
        percentage: new CostaraDecimal(10), // 10% of 10,000 = 1,000 g
        costingSource: 'produced',
        notes: null,
      },
      {
        id: 'inp-c',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemWater.id,
        position: 2,
        quantityMode: 'percentage',
        quantity: null,
        unitId: null,
        percentage: new CostaraDecimal(25), // 25% of [10,000 + 1,000 = 11,000] = 2,750 g
        costingSource: 'purchased',
        notes: null,
      },
    ];

    const percentageBases: PercentageBaseData[] = [
      { percentageInputId: 'inp-b', basisInputId: 'inp-a' },
      { percentageInputId: 'inp-c', basisInputId: 'inp-a' },
      { percentageInputId: 'inp-c', basisInputId: 'inp-b' },
    ];

    const res = resolveRecipeFormula({ inputs, percentageBases, itemsMap, unitsMap });
    expect(res.status).toBe('complete');
    expect(res.resolvedInputs[1].canonicalQuantity?.toString()).toBe('1000');
    expect(res.resolvedInputs[2].canonicalQuantity?.toString()).toBe('2750');
  });

  it('6. detects direct percentage cycle (A -> B -> A) and returns path', () => {
    const inputs: RecipeInputData[] = [
      {
        id: 'inp-a',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemFlourWhite.id,
        position: 0,
        quantityMode: 'percentage',
        quantity: null,
        unitId: null,
        percentage: new CostaraDecimal(10),
        costingSource: null,
        notes: null,
      },
      {
        id: 'inp-b',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemSourdough.id,
        position: 1,
        quantityMode: 'percentage',
        quantity: null,
        unitId: null,
        percentage: new CostaraDecimal(20),
        costingSource: null,
        notes: null,
      },
    ];

    const percentageBases: PercentageBaseData[] = [
      { percentageInputId: 'inp-a', basisInputId: 'inp-b' },
      { percentageInputId: 'inp-b', basisInputId: 'inp-a' },
    ];

    const res = resolveRecipeFormula({ inputs, percentageBases, itemsMap, unitsMap });
    expect(res.status).toBe('error');
    const cycleIssue = res.issues.find((i) => i.code === 'PERCENTAGE_DEPENDENCY_CYCLE');
    expect(cycleIssue).toBeDefined();
    expect(cycleIssue?.path).toBeDefined();
  });

  it('7. rejects heterogeneous basis dimensions (mixing mass and volume)', () => {
    const inputs: RecipeInputData[] = [
      {
        id: 'inp-mass',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemFlourWhite.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: null,
        notes: null,
      },
      {
        id: 'inp-vol',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemMilkVol.id,
        position: 1,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(2),
        unitId: unitL.id,
        percentage: null,
        costingSource: null,
        notes: null,
      },
      {
        id: 'inp-pct',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemSourdough.id,
        position: 2,
        quantityMode: 'percentage',
        quantity: null,
        unitId: null,
        percentage: new CostaraDecimal(10),
        costingSource: null,
        notes: null,
      },
    ];

    const percentageBases: PercentageBaseData[] = [
      { percentageInputId: 'inp-pct', basisInputId: 'inp-mass' },
      { percentageInputId: 'inp-pct', basisInputId: 'inp-vol' },
    ];

    const res = resolveRecipeFormula({ inputs, percentageBases, itemsMap, unitsMap });
    expect(res.status).toBe('error');
    expect(res.issues.some((i) => i.code === 'INCOMPATIBLE_PERCENTAGE_BASE_DIMENSIONS')).toBe(true);
  });

  it('8. percentage input without bases emits MISSING_PERCENTAGE_BASE without computing as 0', () => {
    const inputs: RecipeInputData[] = [
      {
        id: 'inp-flour',
        businessId: 'biz-1',
        recipeVersionId: 'v-draft',
        itemId: itemFlourWhite.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: null,
        notes: null,
      },
      {
        id: 'inp-sourdough',
        businessId: 'biz-1',
        recipeVersionId: 'v-draft',
        itemId: itemSourdough.id,
        position: 1,
        quantityMode: 'percentage',
        quantity: null,
        unitId: null,
        percentage: new CostaraDecimal(10),
        costingSource: 'produced',
        notes: null,
      },
    ];

    // No bases provided for inp-sourdough
    const res = resolveRecipeFormula({ inputs, percentageBases: [], itemsMap, unitsMap });
    expect(res.status).toBe('incomplete');
    expect(res.issues.some((i) => i.code === 'MISSING_PERCENTAGE_BASE')).toBe(true);

    // Flour is resolved to 10,000 g
    expect(res.resolvedInputs[0].canonicalQuantity?.toString()).toBe('10000');
    // Sourdough is null (not 0)
    expect(res.resolvedInputs[1].canonicalQuantity).toBeNull();
    expect(res.resolvedInputs[1].isResolved).toBe(false);
  });
});
