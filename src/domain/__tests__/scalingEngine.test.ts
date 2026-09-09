import { describe, it, expect } from 'vitest';
import { CostaraDecimal } from '../calculation/decimal.ts';
import { applyRecipeScaling } from '../calculation/scalingEngine.ts';
import type {
  CanonicalYield,
  ResolvedRecipeInput,
  UnitData,
  ItemData,
} from '../calculation/types.ts';

describe('Recipe Scaling Engine', () => {
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

  const unitsMap = new Map<string, UnitData>([
    [unitG.id, unitG],
    [unitKg.id, unitKg],
  ]);

  const itemFlour: ItemData = {
    id: 'it-flour',
    businessId: 'biz-1',
    name: 'Harina',
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

  const referenceYield: CanonicalYield = {
    quantity: new CostaraDecimal(14),
    unitId: unitKg.id,
    unitCode: 'kg',
    canonicalQuantity: new CostaraDecimal(14000),
    canonicalUnitCode: 'g',
    dimensionCode: 'mass',
  };

  const resolvedInputs: ResolvedRecipeInput[] = [
    {
      input: {
        id: 'inp-1',
        businessId: 'biz-1',
        recipeVersionId: 'v-1',
        itemId: itemFlour.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: null,
        notes: null,
      },
      item: itemFlour,
      canonicalQuantity: new CostaraDecimal(10000),
      canonicalUnitCode: 'g',
      dimensionCode: 'mass',
      isResolved: true,
      issues: [],
    },
    {
      input: {
        id: 'inp-2',
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
      item: itemSourdough,
      canonicalQuantity: new CostaraDecimal(1000),
      canonicalUnitCode: 'g',
      dimensionCode: 'mass',
      isResolved: true,
      issues: [],
    },
  ];

  it('1. no scale target preserves reference quantities with scale factor 1', () => {
    const res = applyRecipeScaling({
      referenceYield,
      resolvedInputs,
      unitsMap,
    });

    expect(res.isSuccess).toBe(true);
    expect(res.scaleFactor.toString()).toBe('1');
    expect(res.scaledInputsById.get('inp-1')?.toString()).toBe('10000');
    expect(res.scaledInputsById.get('inp-2')?.toString()).toBe('1000');
  });

  it('2. scales by yield: 14 kg -> 20 kg (factor = 20,000 / 14,000 = 1.428571...)', () => {
    const res = applyRecipeScaling({
      scaleTarget: { mode: 'yield', targetQuantity: new CostaraDecimal(20), unitId: unitKg.id },
      referenceYield,
      resolvedInputs,
      unitsMap,
    });

    expect(res.isSuccess).toBe(true);
    const factorStr = res.scaleFactor.toString();
    expect(factorStr.startsWith('1.428571428571428571')).toBe(true);

    const scaledFlour = res.scaledInputsById.get('inp-1')!;
    // 10,000 * 1.428571... = 14285.71428571428571...
    expect(scaledFlour.toString().startsWith('14285.71428571428571')).toBe(true);

    const scaledSourdough = res.scaledInputsById.get('inp-2')!;
    // 1,000 * 1.428571... = 1428.571428571428571...
    expect(scaledSourdough.toString().startsWith('1428.571428571428571')).toBe(true);
  });

  it('3. scales by output count: 12.7272... pieces -> 12 pieces', () => {
    // 14 / 1.1 = 12.727272...
    const theoreticalPortions = new CostaraDecimal(14000).dividedBy(new CostaraDecimal(1100));

    const res = applyRecipeScaling({
      scaleTarget: { mode: 'output_pieces', targetPieces: new CostaraDecimal(12) },
      referenceYield,
      theoreticalPortions,
      resolvedInputs,
      unitsMap,
    });

    expect(res.isSuccess).toBe(true);
    expect(res.scaledPortions?.toString()).toBe('12');
    // Scale factor: 12 / (14/1.1) = 12 * 1.1 / 14 = 13.2 / 14 = 0.942857142857...
    expect(res.scaleFactor.toString().startsWith('0.942857142857142857')).toBe(true);
  });

  it('4. rejects negative or zero scale target with INVALID_SCALE_TARGET', () => {
    const res = applyRecipeScaling({
      scaleTarget: { mode: 'yield', targetQuantity: new CostaraDecimal(0) },
      referenceYield,
      resolvedInputs,
      unitsMap,
    });

    expect(res.isSuccess).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_SCALE_TARGET')).toBe(true);
  });

  it('5. scaling by output pieces when theoretical output is unresolvable fails with CANNOT_SCALE_BY_UNRESOLVABLE_OUTPUT', () => {
    const res = applyRecipeScaling({
      scaleTarget: { mode: 'output_pieces', targetPieces: new CostaraDecimal(10) },
      referenceYield,
      theoreticalPortions: undefined, // unresolvable
      resolvedInputs,
      unitsMap,
    });

    expect(res.isSuccess).toBe(false);
    expect(res.issues.some((i) => i.code === 'CANNOT_SCALE_BY_UNRESOLVABLE_OUTPUT')).toBe(true);
  });
});
