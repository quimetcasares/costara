import { describe, it, expect } from 'vitest';
import { CostaraDecimal } from '../calculation/decimal.ts';
import { resolveRecipeCosting } from '../calculation/costingEngine.ts';
import { createInMemoryRecipeDataProvider } from '../../data/inMemoryRecipeRepository.ts';
import type {
  UnitData,
  ItemData,
  RecipeData,
  RecipeVersionData,
  RecipeInputData,
  ItemCostVersionData,
  ResolvedRecipeInput,
} from '../calculation/types.ts';

describe('Costing Engine', () => {
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

  const itemFlour: ItemData = {
    id: 'it-flour',
    businessId: 'biz-1',
    name: 'Harina Trigo',
    kind: 'raw_material',
    baseUnitId: unitG.id,
    purchasable: true,
    producible: false,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemButter: ItemData = {
    id: 'it-butter',
    businessId: 'biz-1',
    name: 'Mantequilla',
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

  const itemJam: ItemData = {
    id: 'it-jam',
    businessId: 'biz-1',
    name: 'Mermelada',
    kind: 'intermediate',
    baseUnitId: unitG.id,
    purchasable: true,
    producible: true,
    sellable: true,
    trackInventory: true,
    isActive: true,
  };

  const itemBerries: ItemData = {
    id: 'it-berries',
    businessId: 'biz-1',
    name: 'Frutos Rojos',
    kind: 'raw_material',
    baseUnitId: unitG.id,
    purchasable: true,
    producible: false,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemSugar: ItemData = {
    id: 'it-sugar',
    businessId: 'biz-1',
    name: 'Azúcar',
    kind: 'raw_material',
    baseUnitId: unitG.id,
    purchasable: true,
    producible: false,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemsMap = new Map<string, ItemData>([
    [itemFlour.id, itemFlour],
    [itemButter.id, itemButter],
    [itemSourdough.id, itemSourdough],
    [itemJam.id, itemJam],
    [itemBerries.id, itemBerries],
    [itemSugar.id, itemSugar],
  ]);

  it('1. selects historical purchase cost based on asOf and computes canonical unit cost', async () => {
    const itemCostVersions: ItemCostVersionData[] = [
      {
        id: 'c-1',
        businessId: 'biz-1',
        itemId: itemFlour.id,
        costAmount: new CostaraDecimal(20), // $20 / 1 kg on Jan 1
        costQuantity: new CostaraDecimal(1),
        unitId: unitKg.id,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        notes: null,
      },
      {
        id: 'c-2',
        businessId: 'biz-1',
        itemId: itemFlour.id,
        costAmount: new CostaraDecimal(23), // $23 / 1 kg on March 1
        costQuantity: new CostaraDecimal(1),
        unitId: unitKg.id,
        effectiveFrom: new Date('2026-03-01T00:00:00Z'),
        notes: null,
      },
      {
        id: 'c-3',
        businessId: 'biz-1',
        itemId: itemFlour.id,
        costAmount: new CostaraDecimal(26), // $26 / 1 kg on Aug 1
        costQuantity: new CostaraDecimal(1),
        unitId: unitKg.id,
        effectiveFrom: new Date('2026-08-01T00:00:00Z'),
        notes: null,
      },
    ];

    const dataProvider = createInMemoryRecipeDataProvider({
      businessId: 'biz-1',
      fixtures: { units: Array.from(unitsMap.values()), items: Array.from(itemsMap.values()), itemCostVersions },
    });

    const resolvedInputs: ResolvedRecipeInput[] = [
      {
        input: {
          id: 'inp-1',
          businessId: 'biz-1',
          recipeVersionId: 'v-1',
          itemId: itemFlour.id,
          position: 0,
          quantityMode: 'absolute',
          quantity: new CostaraDecimal(500),
          unitId: unitG.id,
          percentage: null,
          costingSource: 'purchased',
          notes: null,
        },
        item: itemFlour,
        canonicalQuantity: new CostaraDecimal(500),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
        isResolved: true,
        issues: [],
      },
    ];

    const scaledInputs = new Map<string, CostaraDecimal | null>([['inp-1', new CostaraDecimal(500)]]);

    // Calculate as of 2026-03-15 (should pick c-2: $23/kg -> $0.023/g -> 500 g = $11.50)
    const asOfMarch = new Date('2026-03-15T00:00:00Z');
    const res = await resolveRecipeCosting({
      resolvedInputs,
      scaledInputsById: scaledInputs,
      dataProvider,
      asOf: asOfMarch,
      unitsMap,
      itemsMap,
    });

    expect(res.status).toBe('complete');
    expect(res.isCostComplete).toBe(true);
    expect(res.knownBatchMaterialCost.toString()).toBe('11.5');
    expect(res.breakdown[0].unitCostCanonical?.toString()).toBe('0.023');
    expect(res.breakdown[0].applicableCostVersionId).toBe('c-2');
  });

  it('2. missing purchase cost when item has never had cost recorded', async () => {
    const dataProvider = createInMemoryRecipeDataProvider({
      businessId: 'biz-1',
      fixtures: { units: Array.from(unitsMap.values()), items: Array.from(itemsMap.values()), itemCostVersions: [] },
    });

    const resolvedInputs: ResolvedRecipeInput[] = [
      {
        input: {
          id: 'inp-butter',
          businessId: 'biz-1',
          recipeVersionId: 'v-1',
          itemId: itemButter.id,
          position: 0,
          quantityMode: 'absolute',
          quantity: new CostaraDecimal(200),
          unitId: unitG.id,
          percentage: null,
          costingSource: 'purchased',
          notes: null,
        },
        item: itemButter,
        canonicalQuantity: new CostaraDecimal(200),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
        isResolved: true,
        issues: [],
      },
    ];

    const scaledInputs = new Map<string, CostaraDecimal | null>([['inp-butter', new CostaraDecimal(200)]]);
    const res = await resolveRecipeCosting({
      resolvedInputs,
      scaledInputsById: scaledInputs,
      dataProvider,
      asOf: new Date('2026-03-15T00:00:00Z'),
      unitsMap,
      itemsMap,
    });

    expect(res.status).toBe('incomplete');
    expect(res.isCostComplete).toBe(false);
    expect(res.knownBatchMaterialCost.toString()).toBe('0');
    expect(res.issues.some((i) => i.code === 'MISSING_PURCHASE_COST')).toBe(true);
  });

  it('3. no cost as of date when costs only exist in the future', async () => {
    const itemCostVersions: ItemCostVersionData[] = [
      {
        id: 'c-future',
        businessId: 'biz-1',
        itemId: itemFlour.id,
        costAmount: new CostaraDecimal(30),
        costQuantity: new CostaraDecimal(1),
        unitId: unitKg.id,
        effectiveFrom: new Date('2026-08-01T00:00:00Z'),
        notes: null,
      },
    ];

    const dataProvider = createInMemoryRecipeDataProvider({
      businessId: 'biz-1',
      fixtures: { units: Array.from(unitsMap.values()), items: Array.from(itemsMap.values()), itemCostVersions },
    });

    const resolvedInputs: ResolvedRecipeInput[] = [
      {
        input: {
          id: 'inp-1',
          businessId: 'biz-1',
          recipeVersionId: 'v-1',
          itemId: itemFlour.id,
          position: 0,
          quantityMode: 'absolute',
          quantity: new CostaraDecimal(500),
          unitId: unitG.id,
          percentage: null,
          costingSource: 'purchased',
          notes: null,
        },
        item: itemFlour,
        canonicalQuantity: new CostaraDecimal(500),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
        isResolved: true,
        issues: [],
      },
    ];

    const res = await resolveRecipeCosting({
      resolvedInputs,
      scaledInputsById: new Map([['inp-1', new CostaraDecimal(500)]]),
      dataProvider,
      asOf: new Date('2026-03-15T00:00:00Z'),
      unitsMap,
      itemsMap,
    });

    expect(res.status).toBe('incomplete');
    expect(res.isCostComplete).toBe(false);
    const iss = res.issues.find((i) => i.code === 'NO_COST_AS_OF_DATE');
    expect(iss).toBeDefined();
  });

  it('4. cost from over a year ago is still valid and applied without error', async () => {
    const itemCostVersions: ItemCostVersionData[] = [
      {
        id: 'c-old',
        businessId: 'biz-1',
        itemId: itemFlour.id,
        costAmount: new CostaraDecimal(20),
        costQuantity: new CostaraDecimal(1),
        unitId: unitKg.id,
        effectiveFrom: new Date('2024-01-01T00:00:00Z'), // Old cost
        notes: null,
      },
    ];

    const dataProvider = createInMemoryRecipeDataProvider({
      businessId: 'biz-1',
      fixtures: { units: Array.from(unitsMap.values()), items: Array.from(itemsMap.values()), itemCostVersions },
    });

    const resolvedInputs: ResolvedRecipeInput[] = [
      {
        input: {
          id: 'inp-1',
          businessId: 'biz-1',
          recipeVersionId: 'v-1',
          itemId: itemFlour.id,
          position: 0,
          quantityMode: 'absolute',
          quantity: new CostaraDecimal(1000),
          unitId: unitG.id,
          percentage: null,
          costingSource: 'purchased',
          notes: null,
        },
        item: itemFlour,
        canonicalQuantity: new CostaraDecimal(1000),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
        isResolved: true,
        issues: [],
      },
    ];

    const res = await resolveRecipeCosting({
      resolvedInputs,
      scaledInputsById: new Map([['inp-1', new CostaraDecimal(1000)]]),
      dataProvider,
      asOf: new Date('2026-08-15T00:00:00Z'),
      unitsMap,
      itemsMap,
    });

    expect(res.status).toBe('complete');
    expect(res.knownBatchMaterialCost.toString()).toBe('20');
  });

  it('5. resolves produced intermediate recipe (Sourdough: 10 kg Flour @ $20 = $200, yield 10,000 g -> $0.02/g, parent consumes 1,400 g = $28)', async () => {
    const sourdoughRecipe: RecipeData = {
      id: 'rec-sourdough',
      businessId: 'biz-1',
      name: 'Receta Masa Madre',
      outputItemId: itemSourdough.id,
      isActive: true,
    };

    const sourdoughVersion: RecipeVersionData = {
      id: 'ver-sourdough-1',
      businessId: 'biz-1',
      recipeId: sourdoughRecipe.id,
      versionNumber: 1,
      status: 'active',
      referenceYieldQuantity: new CostaraDecimal(10),
      referenceYieldUnitId: unitKg.id, // 10,000 g yield
      portionQuantity: null,
      portionUnitId: null,
      yieldDescription: null,
      changeReason: null,
      notes: null,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    };

    const sourdoughInputs: RecipeInputData[] = [
      {
        id: 'inp-sd-flour',
        businessId: 'biz-1',
        recipeVersionId: sourdoughVersion.id,
        itemId: itemFlour.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: 'purchased',
        notes: null,
      },
    ];

    const itemCostVersions: ItemCostVersionData[] = [
      {
        id: 'c-flour',
        businessId: 'biz-1',
        itemId: itemFlour.id,
        costAmount: new CostaraDecimal(20), // $20 / kg = $0.02 / g
        costQuantity: new CostaraDecimal(1),
        unitId: unitKg.id,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        notes: null,
      },
    ];

    const dataProvider = createInMemoryRecipeDataProvider({
      businessId: 'biz-1',
      fixtures: {
        units: Array.from(unitsMap.values()),
        items: Array.from(itemsMap.values()),
        recipes: [sourdoughRecipe],
        recipeVersions: [sourdoughVersion],
        recipeInputs: sourdoughInputs,
        itemCostVersions,
      },
    });

    const parentInputs: ResolvedRecipeInput[] = [
      {
        input: {
          id: 'inp-parent-sd',
          businessId: 'biz-1',
          recipeVersionId: 'v-parent',
          itemId: itemSourdough.id,
          position: 0,
          quantityMode: 'absolute',
          quantity: new CostaraDecimal(1400),
          unitId: unitG.id,
          percentage: null,
          costingSource: 'produced',
          notes: null,
        },
        item: itemSourdough,
        canonicalQuantity: new CostaraDecimal(1400),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
        isResolved: true,
        issues: [],
      },
    ];

    const res = await resolveRecipeCosting({
      resolvedInputs: parentInputs,
      scaledInputsById: new Map([['inp-parent-sd', new CostaraDecimal(1400)]]),
      dataProvider,
      asOf: new Date('2026-03-15T00:00:00Z'),
      unitsMap,
      itemsMap,
    });

    expect(res.status).toBe('complete');
    expect(res.isCostComplete).toBe(true);
    // Sourdough batch cost = 10,000 g * 0.02 = $200. Output = 10,000 g -> unit cost = $0.02/g.
    // Parent consumption = 1,400 g * 0.02 = $28.00
    expect(res.knownBatchMaterialCost.toString()).toBe('28');
    expect(res.breakdown[0].children).toHaveLength(1);
    expect(res.breakdown[0].children![0].nodeMaterialCost?.toString()).toBe('28');
  });

  it('6. detects recursive recipe cycle (Recipe A produces A consuming B; Recipe B produces B consuming A) with path', async () => {
    const itemA: ItemData = {
      id: 'it-a',
      businessId: 'biz-1',
      name: 'Item A',
      kind: 'intermediate',
      baseUnitId: unitG.id,
      purchasable: false,
      producible: true,
      sellable: false,
      trackInventory: true,
      isActive: true,
    };

    const itemB: ItemData = {
      id: 'it-b',
      businessId: 'biz-1',
      name: 'Item B',
      kind: 'intermediate',
      baseUnitId: unitG.id,
      purchasable: false,
      producible: true,
      sellable: false,
      trackInventory: true,
      isActive: true,
    };

    const recipeA: RecipeData = {
      id: 'rec-a',
      businessId: 'biz-1',
      name: 'Receta A',
      outputItemId: itemA.id,
      isActive: true,
    };

    const versionA: RecipeVersionData = {
      id: 'ver-a',
      businessId: 'biz-1',
      recipeId: recipeA.id,
      versionNumber: 1,
      status: 'active',
      referenceYieldQuantity: new CostaraDecimal(1),
      referenceYieldUnitId: unitKg.id,
      portionQuantity: null,
      portionUnitId: null,
      yieldDescription: null,
      changeReason: null,
      notes: null,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    };

    const inputA: RecipeInputData = {
      id: 'inp-a-consumes-b',
      businessId: 'biz-1',
      recipeVersionId: versionA.id,
      itemId: itemB.id,
      position: 0,
      quantityMode: 'absolute',
      quantity: new CostaraDecimal(500),
      unitId: unitG.id,
      percentage: null,
      costingSource: 'produced',
      notes: null,
    };

    const recipeB: RecipeData = {
      id: 'rec-b',
      businessId: 'biz-1',
      name: 'Receta B',
      outputItemId: itemB.id,
      isActive: true,
    };

    const versionB: RecipeVersionData = {
      id: 'ver-b',
      businessId: 'biz-1',
      recipeId: recipeB.id,
      versionNumber: 1,
      status: 'active',
      referenceYieldQuantity: new CostaraDecimal(1),
      referenceYieldUnitId: unitKg.id,
      portionQuantity: null,
      portionUnitId: null,
      yieldDescription: null,
      changeReason: null,
      notes: null,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    };

    const inputB: RecipeInputData = {
      id: 'inp-b-consumes-a',
      businessId: 'biz-1',
      recipeVersionId: versionB.id,
      itemId: itemA.id,
      position: 0,
      quantityMode: 'absolute',
      quantity: new CostaraDecimal(500),
      unitId: unitG.id,
      percentage: null,
      costingSource: 'produced',
      notes: null,
    };

    const testItemsMap = new Map<string, ItemData>([
      [itemA.id, itemA],
      [itemB.id, itemB],
    ]);

    const dataProvider = createInMemoryRecipeDataProvider({
      businessId: 'biz-1',
      fixtures: {
        units: Array.from(unitsMap.values()),
        items: [itemA, itemB],
        recipes: [recipeA, recipeB],
        recipeVersions: [versionA, versionB],
        recipeInputs: [inputA, inputB],
      },
    });

    const rootInputs: ResolvedRecipeInput[] = [
      {
        input: inputA,
        item: itemB,
        canonicalQuantity: new CostaraDecimal(500),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
        isResolved: true,
        issues: [],
      },
    ];

    const res = await resolveRecipeCosting({
      resolvedInputs: rootInputs,
      scaledInputsById: new Map([[inputA.id, new CostaraDecimal(500)]]),
      dataProvider,
      asOf: new Date('2026-03-15T00:00:00Z'),
      unitsMap,
      itemsMap: testItemsMap,
      activeItemStack: [itemA.id], // Starting from A
    });

    expect(res.status).toBe('error');
    expect(res.issues.some((i) => i.code === 'RECIPE_DEPENDENCY_CYCLE')).toBe(true);
  });

  it('7. partial produced cost: sub-recipe with missing ingredient derives knownUnitMaterialCost marked as partial (isCostComplete=false)', async () => {
    // Jam recipe: 500 g Sugar (@ $20/kg = $10) + 500 g Berries (NO COST recorded)
    // Jam yield = 1,000 g
    // Known batch cost = $10. Known unit material cost = $0.01/g. isCostComplete = false.
    const jamRecipe: RecipeData = {
      id: 'rec-jam',
      businessId: 'biz-1',
      name: 'Mermelada Frutos Rojos',
      outputItemId: itemJam.id,
      isActive: true,
    };

    const jamVersion: RecipeVersionData = {
      id: 'ver-jam-1',
      businessId: 'biz-1',
      recipeId: jamRecipe.id,
      versionNumber: 1,
      status: 'active',
      referenceYieldQuantity: new CostaraDecimal(1),
      referenceYieldUnitId: unitKg.id, // 1,000 g yield
      portionQuantity: null,
      portionUnitId: null,
      yieldDescription: null,
      changeReason: null,
      notes: null,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    };

    const jamInputs: RecipeInputData[] = [
      {
        id: 'inp-jam-sugar',
        businessId: 'biz-1',
        recipeVersionId: jamVersion.id,
        itemId: itemSugar.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(500),
        unitId: unitG.id,
        percentage: null,
        costingSource: 'purchased',
        notes: null,
      },
      {
        id: 'inp-jam-berries',
        businessId: 'biz-1',
        recipeVersionId: jamVersion.id,
        itemId: itemBerries.id,
        position: 1,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(500),
        unitId: unitG.id,
        percentage: null,
        costingSource: 'purchased',
        notes: null,
      },
    ];

    const itemCostVersions: ItemCostVersionData[] = [
      {
        id: 'c-sugar',
        businessId: 'biz-1',
        itemId: itemSugar.id,
        costAmount: new CostaraDecimal(20), // $20 / kg = $0.02 / g -> 500 g = $10
        costQuantity: new CostaraDecimal(1),
        unitId: unitKg.id,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        notes: null,
      },
      // No cost for Berries
    ];

    const dataProvider = createInMemoryRecipeDataProvider({
      businessId: 'biz-1',
      fixtures: {
        units: Array.from(unitsMap.values()),
        items: Array.from(itemsMap.values()),
        recipes: [jamRecipe],
        recipeVersions: [jamVersion],
        recipeInputs: jamInputs,
        itemCostVersions,
      },
    });

    // Parent recipe consumes 200 g of Jam
    const parentInputs: ResolvedRecipeInput[] = [
      {
        input: {
          id: 'inp-parent-jam',
          businessId: 'biz-1',
          recipeVersionId: 'v-parent',
          itemId: itemJam.id,
          position: 0,
          quantityMode: 'absolute',
          quantity: new CostaraDecimal(200),
          unitId: unitG.id,
          percentage: null,
          costingSource: 'produced',
          notes: null,
        },
        item: itemJam,
        canonicalQuantity: new CostaraDecimal(200),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
        isResolved: true,
        issues: [],
      },
    ];

    const res = await resolveRecipeCosting({
      resolvedInputs: parentInputs,
      scaledInputsById: new Map([['inp-parent-jam', new CostaraDecimal(200)]]),
      dataProvider,
      asOf: new Date('2026-03-15T00:00:00Z'),
      unitsMap,
      itemsMap,
    });

    // Sub-recipe batch cost = $10 (sugar) + unknown (berries).
    // Jam unit cost = $10 / 1000 g = $0.01 / g.
    // Parent allocated cost = 200 g * $0.01/g = $2.00.
    // Node remains incomplete and status is incomplete.
    expect(res.status).toBe('incomplete');
    expect(res.isCostComplete).toBe(false);
    expect(res.knownBatchMaterialCost.toString()).toBe('2');
    expect(res.breakdown[0].nodeMaterialCost?.toString()).toBe('2');
    expect(res.breakdown[0].isCostComplete).toBe(false);
    expect(res.issues.some((i) => i.code === 'MISSING_PURCHASE_COST')).toBe(true);
  });

  it('8. memoization: two consumers (80 g and 200 g) of same produced item share template resolution but have distinct scaled sub-breakdowns', async () => {
    const sourdoughRecipe: RecipeData = {
      id: 'rec-sourdough',
      businessId: 'biz-1',
      name: 'Receta Masa Madre',
      outputItemId: itemSourdough.id,
      isActive: true,
    };

    const sourdoughVersion: RecipeVersionData = {
      id: 'ver-sourdough-1',
      businessId: 'biz-1',
      recipeId: sourdoughRecipe.id,
      versionNumber: 1,
      status: 'active',
      referenceYieldQuantity: new CostaraDecimal(10),
      referenceYieldUnitId: unitKg.id, // 10,000 g yield
      portionQuantity: null,
      portionUnitId: null,
      yieldDescription: null,
      changeReason: null,
      notes: null,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    };

    const sourdoughInputs: RecipeInputData[] = [
      {
        id: 'inp-sd-flour',
        businessId: 'biz-1',
        recipeVersionId: sourdoughVersion.id,
        itemId: itemFlour.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: 'purchased',
        notes: null,
      },
    ];

    const itemCostVersions: ItemCostVersionData[] = [
      {
        id: 'c-flour',
        businessId: 'biz-1',
        itemId: itemFlour.id,
        costAmount: new CostaraDecimal(20), // $20 / kg = $0.02 / g
        costQuantity: new CostaraDecimal(1),
        unitId: unitKg.id,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        notes: null,
      },
    ];

    const dataProvider = createInMemoryRecipeDataProvider({
      businessId: 'biz-1',
      fixtures: {
        units: Array.from(unitsMap.values()),
        items: Array.from(itemsMap.values()),
        recipes: [sourdoughRecipe],
        recipeVersions: [sourdoughVersion],
        recipeInputs: sourdoughInputs,
        itemCostVersions,
      },
    });

    const parentInputs: ResolvedRecipeInput[] = [
      {
        input: {
          id: 'inp-cons-1',
          businessId: 'biz-1',
          recipeVersionId: 'v-parent',
          itemId: itemSourdough.id,
          position: 0,
          quantityMode: 'absolute',
          quantity: new CostaraDecimal(80),
          unitId: unitG.id,
          percentage: null,
          costingSource: 'produced',
          notes: null,
        },
        item: itemSourdough,
        canonicalQuantity: new CostaraDecimal(80),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
        isResolved: true,
        issues: [],
      },
      {
        input: {
          id: 'inp-cons-2',
          businessId: 'biz-1',
          recipeVersionId: 'v-parent',
          itemId: itemSourdough.id,
          position: 1,
          quantityMode: 'absolute',
          quantity: new CostaraDecimal(200),
          unitId: unitG.id,
          percentage: null,
          costingSource: 'produced',
          notes: null,
        },
        item: itemSourdough,
        canonicalQuantity: new CostaraDecimal(200),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
        isResolved: true,
        issues: [],
      },
    ];

    const scaledInputs = new Map<string, CostaraDecimal | null>([
      ['inp-cons-1', new CostaraDecimal(80)],
      ['inp-cons-2', new CostaraDecimal(200)],
    ]);

    const res = await resolveRecipeCosting({
      resolvedInputs: parentInputs,
      scaledInputsById: scaledInputs,
      dataProvider,
      asOf: new Date('2026-03-15T00:00:00Z'),
      unitsMap,
      itemsMap,
    });

    expect(res.status).toBe('complete');
    // Consumer 1: 80 g * $0.02/g = $1.60
    expect(res.breakdown[0].nodeMaterialCost?.toString()).toBe('1.6');
    expect(res.breakdown[0].children![0].canonicalQuantity.toString()).toBe('80');
    expect(res.breakdown[0].children![0].nodeMaterialCost?.toString()).toBe('1.6');

    // Consumer 2: 200 g * $0.02/g = $4.00
    expect(res.breakdown[1].nodeMaterialCost?.toString()).toBe('4');
    expect(res.breakdown[1].children![0].canonicalQuantity.toString()).toBe('200');
    expect(res.breakdown[1].children![0].nodeMaterialCost?.toString()).toBe('4');

    // Total batch cost = 1.6 + 4.0 = 5.6
    expect(res.knownBatchMaterialCost.toString()).toBe('5.6');
  });

  it('9. unresolvable produced output: sub-recipe with batch cost but unresolvable output does NOT derive unit cost or allocate to parent', async () => {
    // Child item: Discrete bread piece produced by recipe without portion
    const itemPieceChild: ItemData = {
      id: 'it-piece-child',
      businessId: 'biz-1',
      name: 'Pan Intermedio Sin Porcion',
      kind: 'intermediate',
      baseUnitId: unitPiece.id, // count dimension
      purchasable: false,
      producible: true,
      sellable: false,
      trackInventory: true,
      isActive: true,
    };

    const childRecipe: RecipeData = {
      id: 'rec-child-unres',
      businessId: 'biz-1',
      name: 'Receta Pan Sin Porcion',
      outputItemId: itemPieceChild.id,
      isActive: true,
    };

    const childVersion: RecipeVersionData = {
      id: 'ver-child-unres-1',
      businessId: 'biz-1',
      recipeId: childRecipe.id,
      versionNumber: 1,
      status: 'active',
      referenceYieldQuantity: new CostaraDecimal(10),
      referenceYieldUnitId: unitKg.id, // 10 kg mass yield for count item
      portionQuantity: null, // NULL portion -> output quantity is unresolvable!
      portionUnitId: null,
      yieldDescription: null,
      changeReason: null,
      notes: null,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    };

    const childInputs: RecipeInputData[] = [
      {
        id: 'inp-child-flour',
        businessId: 'biz-1',
        recipeVersionId: childVersion.id,
        itemId: itemFlour.id,
        position: 0,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        percentage: null,
        costingSource: 'purchased',
        notes: null,
      },
    ];

    const itemCostVersions: ItemCostVersionData[] = [
      {
        id: 'c-flour',
        businessId: 'biz-1',
        itemId: itemFlour.id,
        costAmount: new CostaraDecimal(20), // $20 / kg = $200 batch cost
        costQuantity: new CostaraDecimal(1),
        unitId: unitKg.id,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        notes: null,
      },
    ];

    const dataProvider = createInMemoryRecipeDataProvider({
      businessId: 'biz-1',
      fixtures: {
        units: Array.from(unitsMap.values()),
        items: [...Array.from(itemsMap.values()), itemPieceChild],
        recipes: [childRecipe],
        recipeVersions: [childVersion],
        recipeInputs: childInputs,
        itemCostVersions,
      },
    });

    const parentInputs: ResolvedRecipeInput[] = [
      {
        input: {
          id: 'inp-parent-consumes-unres',
          businessId: 'biz-1',
          recipeVersionId: 'v-parent',
          itemId: itemPieceChild.id,
          position: 0,
          quantityMode: 'absolute',
          quantity: new CostaraDecimal(5), // Consumes 5 pieces
          unitId: unitPiece.id,
          percentage: null,
          costingSource: 'produced',
          notes: null,
        },
        item: itemPieceChild,
        canonicalQuantity: new CostaraDecimal(5),
        canonicalUnitCode: 'piece',
        dimensionCode: 'count',
        isResolved: true,
        issues: [],
      },
    ];

    const res = await resolveRecipeCosting({
      resolvedInputs: parentInputs,
      scaledInputsById: new Map([['inp-parent-consumes-unres', new CostaraDecimal(5)]]),
      dataProvider,
      asOf: new Date('2026-03-15T00:00:00Z'),
      unitsMap,
      itemsMap: new Map([...itemsMap.entries(), [itemPieceChild.id, itemPieceChild]]),
    });

    expect(res.status).toBe('incomplete');
    expect(res.isCostComplete).toBe(false);
    expect(res.knownBatchMaterialCost.toString()).toBe('0');
    expect(res.breakdown[0].nodeMaterialCost).toBeUndefined();
    expect(res.breakdown[0].unitCostCanonical).toBeUndefined();
    expect(res.issues.some((i) => i.code === 'UNRESOLVABLE_OUTPUT_QUANTITY')).toBe(true);
  });
});
