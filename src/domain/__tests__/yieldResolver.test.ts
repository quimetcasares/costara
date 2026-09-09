import { describe, it, expect } from 'vitest';
import { CostaraDecimal } from '../calculation/decimal.ts';
import { resolveYieldAndOutput } from '../calculation/yieldResolver.ts';
import type { RecipeVersionData, ItemData, UnitData } from '../calculation/types.ts';

describe('Yield and Theoretical Output Resolver', () => {
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

  const unitPiece: UnitData = {
    id: 'u-piece',
    code: 'piece',
    nameSingular: 'pieza',
    namePlural: 'piezas',
    symbol: 'pza',
    dimensionId: 'dim-count',
    dimensionCode: 'count',
    factorToBase: new CostaraDecimal(1),
    isBase: true,
  };

  const unitsMap = new Map<string, UnitData>([
    [unitG.id, unitG],
    [unitKg.id, unitKg],
    [unitPiece.id, unitPiece],
  ]);

  const itemDoughMass: ItemData = {
    id: 'it-dough',
    businessId: 'biz-1',
    name: 'Masa Croissant',
    kind: 'intermediate',
    baseUnitId: unitG.id,
    purchasable: false,
    producible: true,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemLoafBread: ItemData = {
    id: 'it-loaf',
    businessId: 'biz-1',
    name: 'Hogaza Rustica',
    kind: 'finished_product',
    baseUnitId: unitPiece.id,
    purchasable: false,
    producible: true,
    sellable: true,
    trackInventory: true,
    isActive: true,
  };

  it('1. continuous output item matching yield dimension produces direct canonical output (14 kg -> 14,000 g)', () => {
    const version: RecipeVersionData = {
      id: 'v-1',
      businessId: 'biz-1',
      recipeId: 'r-1',
      versionNumber: 1,
      status: 'active',
      referenceYieldQuantity: new CostaraDecimal(14),
      referenceYieldUnitId: unitKg.id,
      portionQuantity: null,
      portionUnitId: null,
      yieldDescription: 'Masa cruda',
      changeReason: null,
      notes: null,
      effectiveFrom: new Date(),
    };

    const res = resolveYieldAndOutput({ recipeVersion: version, outputItem: itemDoughMass, unitsMap });
    expect(res.isOutputQuantityResolvable).toBe(true);
    expect(res.referenceYield.canonicalQuantity.toString()).toBe('14000');
    expect(res.referenceYield.canonicalUnitCode).toBe('g');
    expect(res.theoreticalOutputQuantity?.toString()).toBe('14000');
    expect(res.theoreticalPortions).toBeUndefined();
  });

  it('2. discrete piece output with portion derives non-integer theoretical portions (14 kg / 1.1 kg -> 12.7272... pieces)', () => {
    const version: RecipeVersionData = {
      id: 'v-2',
      businessId: 'biz-1',
      recipeId: 'r-2',
      versionNumber: 1,
      status: 'active',
      referenceYieldQuantity: new CostaraDecimal(14),
      referenceYieldUnitId: unitKg.id,
      portionQuantity: new CostaraDecimal('1.1'),
      portionUnitId: unitKg.id,
      yieldDescription: null,
      changeReason: null,
      notes: null,
      effectiveFrom: new Date(),
    };

    const res = resolveYieldAndOutput({ recipeVersion: version, outputItem: itemLoafBread, unitsMap });
    expect(res.isOutputQuantityResolvable).toBe(true);
    expect(res.theoreticalPortions).toBeDefined();

    // 14,000 / 1,100 = 12.727272727272727272...
    const str = res.theoreticalPortions!.toString();
    expect(str.startsWith('12.727272727272727272')).toBe(true);
    expect(res.theoreticalOutputQuantity?.toString()).toBe(str);
  });

  it('3. discrete piece output without portion marks output as unresolvable with issue', () => {
    const version: RecipeVersionData = {
      id: 'v-3',
      businessId: 'biz-1',
      recipeId: 'r-3',
      versionNumber: 1,
      status: 'active',
      referenceYieldQuantity: new CostaraDecimal(14),
      referenceYieldUnitId: unitKg.id,
      portionQuantity: null,
      portionUnitId: null,
      yieldDescription: null,
      changeReason: null,
      notes: null,
      effectiveFrom: new Date(),
    };

    const res = resolveYieldAndOutput({ recipeVersion: version, outputItem: itemLoafBread, unitsMap });
    expect(res.isOutputQuantityResolvable).toBe(false);
    expect(res.theoreticalPortions).toBeUndefined();
    expect(res.theoreticalOutputQuantity).toBeUndefined();
    expect(res.issues.some((i) => i.code === 'UNRESOLVABLE_OUTPUT_QUANTITY')).toBe(true);
  });
});
