import { describe, it, expect } from 'vitest';
import { CostaraDecimal } from '../calculation/decimal.ts';
import {
  calculatePublishedRecipeAsOf,
  calculateRecipeDraftPreview,
} from '../calculation/recipeCalculator.ts';
import { createInMemoryRecipeDataProvider } from '../../data/inMemoryRecipeRepository.ts';
import type {
  UnitData,
  ItemData,
  RecipeData,
  RecipeVersionData,
  RecipeInputData,
  PercentageBaseData,
  ItemCostVersionData,
} from '../calculation/types.ts';

describe('Recipe Calculator Orchestrator (Historical vs Draft Preview)', () => {
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

  const allUnits = [unitG, unitKg, unitPiece];

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
    name: 'Masa Madre Hija',
    kind: 'intermediate',
    baseUnitId: unitG.id,
    purchasable: false,
    producible: true,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemLoaf: ItemData = {
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

  const allItems = [itemFlourWhite, itemFlourWhole, itemSourdough, itemLoaf];

  // Sourdough Recipe (produced sub-recipe)
  const sourdoughRecipe: RecipeData = {
    id: 'rec-sourdough',
    businessId: 'biz-1',
    name: 'Receta Masa Madre',
    outputItemId: itemSourdough.id,
    isActive: true,
  };

  const sourdoughVersionV1: RecipeVersionData = {
    id: 'ver-sd-v1',
    businessId: 'biz-1',
    recipeId: sourdoughRecipe.id,
    versionNumber: 1,
    status: 'archived',
    referenceYieldQuantity: new CostaraDecimal(10), // 10,000 g yield
    referenceYieldUnitId: unitKg.id,
    portionQuantity: null,
    portionUnitId: null,
    yieldDescription: null,
    changeReason: 'Version 1',
    notes: null,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  };

  const sourdoughInputsV1: RecipeInputData[] = [
    {
      id: 'inp-sd-flour-v1',
      businessId: 'biz-1',
      recipeVersionId: sourdoughVersionV1.id,
      itemId: itemFlourWhite.id,
      position: 0,
      quantityMode: 'absolute',
      quantity: new CostaraDecimal(10),
      unitId: unitKg.id,
      percentage: null,
      costingSource: 'purchased',
      notes: null,
    },
  ];

  // Loaf Recipe
  const loafRecipe: RecipeData = {
    id: 'rec-loaf',
    businessId: 'biz-1',
    name: 'Receta Hogaza Rustica',
    outputItemId: itemLoaf.id,
    isActive: true,
  };

  const loafVersionV1: RecipeVersionData = {
    id: 'ver-loaf-v1',
    businessId: 'biz-1',
    recipeId: loafRecipe.id,
    versionNumber: 1,
    status: 'archived',
    referenceYieldQuantity: new CostaraDecimal(14), // 14 kg yield
    referenceYieldUnitId: unitKg.id,
    portionQuantity: new CostaraDecimal('1.1'), // 1.1 kg portion -> 12.7272... pieces
    portionUnitId: unitKg.id,
    yieldDescription: 'Masa lista para formar',
    changeReason: 'V1 Initial',
    notes: null,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  };

  const loafVersionV2: RecipeVersionData = {
    id: 'ver-loaf-v2',
    businessId: 'biz-1',
    recipeId: loafRecipe.id,
    versionNumber: 2,
    status: 'active',
    referenceYieldQuantity: new CostaraDecimal(14),
    referenceYieldUnitId: unitKg.id,
    portionQuantity: new CostaraDecimal('1.1'),
    portionUnitId: unitKg.id,
    yieldDescription: 'V2 slightly more sourdough',
    changeReason: 'Ajuste de acidez',
    notes: null,
    effectiveFrom: new Date('2026-06-01T00:00:00Z'),
  };

  const loafInputsV1: RecipeInputData[] = [
    {
      id: 'inp-l1-white',
      businessId: 'biz-1',
      recipeVersionId: loafVersionV1.id,
      itemId: itemFlourWhite.id,
      position: 0,
      quantityMode: 'absolute',
      quantity: new CostaraDecimal(10), // 10 kg
      unitId: unitKg.id,
      percentage: null,
      costingSource: 'purchased',
      notes: null,
    },
    {
      id: 'inp-l1-whole',
      businessId: 'biz-1',
      recipeVersionId: loafVersionV1.id,
      itemId: itemFlourWhole.id,
      position: 1,
      quantityMode: 'absolute',
      quantity: new CostaraDecimal(4), // 4 kg
      unitId: unitKg.id,
      percentage: null,
      costingSource: 'purchased',
      notes: null,
    },
    {
      id: 'inp-l1-sd',
      businessId: 'biz-1',
      recipeVersionId: loafVersionV1.id,
      itemId: itemSourdough.id,
      position: 2,
      quantityMode: 'percentage',
      quantity: null,
      unitId: null,
      percentage: new CostaraDecimal(10), // 10% of 14 kg = 1.4 kg (1,400 g)
      costingSource: 'produced',
      notes: null,
    },
  ];

  const loafBasesV1: PercentageBaseData[] = [
    { percentageInputId: 'inp-l1-sd', basisInputId: 'inp-l1-white' },
    { percentageInputId: 'inp-l1-sd', basisInputId: 'inp-l1-whole' },
  ];

  const loafInputsV2: RecipeInputData[] = [
    {
      id: 'inp-l2-white',
      businessId: 'biz-1',
      recipeVersionId: loafVersionV2.id,
      itemId: itemFlourWhite.id,
      position: 0,
      quantityMode: 'absolute',
      quantity: new CostaraDecimal(10),
      unitId: unitKg.id,
      percentage: null,
      costingSource: 'purchased',
      notes: null,
    },
    {
      id: 'inp-l2-whole',
      businessId: 'biz-1',
      recipeVersionId: loafVersionV2.id,
      itemId: itemFlourWhole.id,
      position: 1,
      quantityMode: 'absolute',
      quantity: new CostaraDecimal(4),
      unitId: unitKg.id,
      percentage: null,
      costingSource: 'purchased',
      notes: null,
    },
    {
      id: 'inp-l2-sd',
      businessId: 'biz-1',
      recipeVersionId: loafVersionV2.id,
      itemId: itemSourdough.id,
      position: 2,
      quantityMode: 'percentage',
      quantity: null,
      unitId: null,
      percentage: new CostaraDecimal(15), // 15% of 14 kg = 2.1 kg (2,100 g)
      costingSource: 'produced',
      notes: null,
    },
  ];

  const loafBasesV2: PercentageBaseData[] = [
    { percentageInputId: 'inp-l2-sd', basisInputId: 'inp-l2-white' },
    { percentageInputId: 'inp-l2-sd', basisInputId: 'inp-l2-whole' },
  ];

  const itemCostVersions: ItemCostVersionData[] = [
    // White Flour: Jan ($20/kg), March ($23/kg), Aug ($26/kg)
    {
      id: 'c-fw-jan',
      businessId: 'biz-1',
      itemId: itemFlourWhite.id,
      costAmount: new CostaraDecimal(20),
      costQuantity: new CostaraDecimal(1),
      unitId: unitKg.id,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      notes: null,
    },
    {
      id: 'c-fw-mar',
      businessId: 'biz-1',
      itemId: itemFlourWhite.id,
      costAmount: new CostaraDecimal(23),
      costQuantity: new CostaraDecimal(1),
      unitId: unitKg.id,
      effectiveFrom: new Date('2026-03-01T00:00:00Z'),
      notes: null,
    },
    {
      id: 'c-fw-aug',
      businessId: 'biz-1',
      itemId: itemFlourWhite.id,
      costAmount: new CostaraDecimal(26),
      costQuantity: new CostaraDecimal(1),
      unitId: unitKg.id,
      effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      notes: null,
    },
    // Whole Wheat Flour: Jan ($30/kg)
    {
      id: 'c-fwh-jan',
      businessId: 'biz-1',
      itemId: itemFlourWhole.id,
      costAmount: new CostaraDecimal(30),
      costQuantity: new CostaraDecimal(1),
      unitId: unitKg.id,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      notes: null,
    },
  ];

  const fixtures = {
    units: allUnits,
    items: allItems,
    recipes: [sourdoughRecipe, loafRecipe],
    recipeVersions: [sourdoughVersionV1, loafVersionV1, loafVersionV2],
    recipeInputs: [...sourdoughInputsV1, ...loafInputsV1, ...loafInputsV2],
    percentageBases: [...loafBasesV1, ...loafBasesV2],
    itemCostVersions,
  };

  it('1. historical calculation as of March 15 uses v1 (10% sourdough) and March costs ($23/kg white flour, $30/kg whole wheat)', async () => {
    const dataProvider = createInMemoryRecipeDataProvider({ businessId: 'biz-1', fixtures });
    const asOf = new Date('2026-03-15T00:00:00Z');

    const res = await calculatePublishedRecipeAsOf({
      dataProvider,
      asOf,
      recipeId: loafRecipe.id,
    });

    expect(res.status).toBe('complete');
    expect(res.recipeVersionId).toBe(loafVersionV1.id);
    expect(res.currencyCode).toBe('MXN');

    // Formulation:
    // White Flour: 10 kg @ $23/kg = $230.00
    // Whole Wheat: 4 kg @ $30/kg = $120.00
    // Sourdough (produced): 10 kg White @ $23 = $230 for 10,000 g yield -> $0.023/g.
    // Consumes 1,400 g Sourdough = 1,400 * $0.023 = $32.20
    // Total batch cost = 230 + 120 + 32.20 = $382.20
    expect(res.knownBatchMaterialCost.toString()).toBe('382.2');

    // Portions: 14 kg / 1.1 kg = 12.727272...
    // Cost per piece = $382.20 / (14/1.1) = $382.20 * 1.1 / 14 = 420.42 / 14 = $30.03 / piece
    expect(res.knownCostPerOutputUnit?.toDecimalPlaces(2).toString()).toBe('30.03');
    expect(res.knownCostPerOutputUnit?.toString().startsWith('30.029999999999999999999999999999999999999999999999')).toBe(true);
    expect(res.theoreticalPortions?.toString().startsWith('12.727272727272727272')).toBe(true);
  });

  it('2. historical calculation as of August 15 uses v2 (15% sourdough) and August costs ($26/kg white flour)', async () => {
    const dataProvider = createInMemoryRecipeDataProvider({ businessId: 'biz-1', fixtures });
    const asOf = new Date('2026-08-15T00:00:00Z');

    const res = await calculatePublishedRecipeAsOf({
      dataProvider,
      asOf,
      recipeId: loafRecipe.id,
    });

    expect(res.status).toBe('complete');
    expect(res.recipeVersionId).toBe(loafVersionV2.id);

    // Formulation V2:
    // White Flour: 10 kg @ $26/kg = $260.00
    // Whole Wheat: 4 kg @ $30/kg = $120.00
    // Sourdough: 10 kg White @ $26 = $260 for 10,000 g -> $0.026/g.
    // Consumes 15% of 14 kg = 2,100 g Sourdough = 2,100 * $0.026 = $54.60
    // Total batch cost = 260 + 120 + 54.60 = $434.60
    expect(res.knownBatchMaterialCost.toString()).toBe('434.6');
  });

  it('3. scaling by target pieces (12 pieces) projects exact scaled batch cost and input quantities', async () => {
    const dataProvider = createInMemoryRecipeDataProvider({ businessId: 'biz-1', fixtures });
    const asOf = new Date('2026-03-15T00:00:00Z');

    const res = await calculatePublishedRecipeAsOf({
      dataProvider,
      asOf,
      recipeId: loafRecipe.id,
      scaleTarget: { mode: 'output_pieces', targetPieces: new CostaraDecimal(12) },
    });

    expect(res.status).toBe('complete');
    expect(res.scaledPortions?.toString()).toBe('12');
    // Unit cost is invariant to scale: $30.03 / piece
    expect(res.knownCostPerOutputUnit?.toString()).toBe('30.03');
    // Scaled batch cost for 12 pieces = 12 * 30.03 = $360.36
    expect(res.knownBatchMaterialCost.toString()).toBe('360.36');
  });

  it('4. draft preview calculates in-memory draft version without publishing and uses published version for sub-recipes at asOf', async () => {
    const dataProvider = createInMemoryRecipeDataProvider({ businessId: 'biz-1', fixtures });
    const asOf = new Date('2026-03-15T00:00:00Z');

    const draftVersion = {
      id: 'ver-draft-custom',
      businessId: 'biz-1',
      referenceYieldQuantity: new CostaraDecimal(14),
      referenceYieldUnitId: unitKg.id,
      portionQuantity: new CostaraDecimal('1.1'),
      portionUnitId: unitKg.id,
    };

    const draftInputs = [
      {
        id: 'd-inp-1',
        itemId: itemFlourWhite.id,
        position: 0,
        quantityMode: 'absolute' as const,
        quantity: new CostaraDecimal(14), // 14 kg white flour
        unitId: unitKg.id,
        costingSource: 'purchased' as const,
      },
      {
        id: 'd-inp-2',
        itemId: itemSourdough.id,
        position: 1,
        quantityMode: 'percentage' as const,
        percentage: new CostaraDecimal(20), // 20% of 14 kg = 2.8 kg
        costingSource: 'produced' as const,
      },
    ];

    const draftBases = [{ percentageInputId: 'd-inp-2', basisInputId: 'd-inp-1' }];

    const res = await calculateRecipeDraftPreview({
      draftVersion,
      inputs: draftInputs,
      percentageBases: draftBases,
      outputItemId: itemLoaf.id,
      recipeName: 'Draft Hogaza 20% Sourdough',
      dataProvider,
      asOf,
    });

    expect(res.status).toBe('complete');
    expect(res.recipeName).toBe('Draft Hogaza 20% Sourdough');
    // White: 14 kg @ $23 = $322.00
    // Sourdough: 2.8 kg (2,800 g) @ $0.023/g = $64.40
    // Batch cost = 322 + 64.40 = $386.40
    expect(res.knownBatchMaterialCost.toString()).toBe('386.4');
  });

  it('5. draft preview with percentage input without bases returns MISSING_PERCENTAGE_BASE issue and marks incomplete', async () => {
    const dataProvider = createInMemoryRecipeDataProvider({ businessId: 'biz-1', fixtures });
    const asOf = new Date('2026-03-15T00:00:00Z');

    const draftVersion = {
      businessId: 'biz-1',
      referenceYieldQuantity: new CostaraDecimal(14),
      referenceYieldUnitId: unitKg.id,
    };

    const draftInputs = [
      {
        id: 'd-inp-1',
        itemId: itemFlourWhite.id,
        position: 0,
        quantityMode: 'absolute' as const,
        quantity: new CostaraDecimal(10),
        unitId: unitKg.id,
        costingSource: 'purchased' as const,
      },
      {
        id: 'd-inp-2',
        itemId: itemSourdough.id,
        position: 1,
        quantityMode: 'percentage' as const,
        percentage: new CostaraDecimal(10),
        costingSource: 'produced' as const,
      },
    ];

    // No bases for d-inp-2
    const res = await calculateRecipeDraftPreview({
      draftVersion,
      inputs: draftInputs,
      percentageBases: [],
      outputItemId: itemLoaf.id,
      dataProvider,
      asOf,
    });

    expect(res.status).toBe('incomplete');
    expect(res.issues.some((i) => i.code === 'MISSING_PERCENTAGE_BASE')).toBe(true);
    // Flour 10 kg @ $23 = $230 is still known and computed
    expect(res.knownBatchMaterialCost.toString()).toBe('230');
  });

  it('6. rejects draft preview if draft businessId does not match dataProvider.businessId', async () => {
    const dataProvider = createInMemoryRecipeDataProvider({ businessId: 'biz-1', fixtures });
    const asOf = new Date('2026-03-15T00:00:00Z');

    const draftVersion = {
      businessId: 'biz-WRONG-TENANT',
      referenceYieldQuantity: new CostaraDecimal(14),
      referenceYieldUnitId: unitKg.id,
    };

    await expect(
      calculateRecipeDraftPreview({
        draftVersion,
        inputs: [],
        percentageBases: [],
        outputItemId: itemLoaf.id,
        dataProvider,
        asOf,
      })
    ).rejects.toThrow(/Business scope mismatch/);
  });

  it('7. BUG FIX REGRESSION: calculates recursive subrecipe containing ingredients NOT present in root recipe', async () => {
    // Subrecipe produces itemSourdough with water and a unique ingredient: itemYeast (NOT in parent loaf recipe)
    const itemYeast: ItemData = {
      id: 'it-unique-yeast',
      businessId: 'biz-1',
      name: 'Levadura Exclusiva Subreceta',
      kind: 'raw_material',
      baseUnitId: unitG.id,
      purchasable: true,
      producible: false,
      sellable: false,
      trackInventory: true,
      isActive: true,
    };
    const yeastCost: ItemCostVersionData = {
      id: 'cost-yeast',
      businessId: 'biz-1',
      itemId: itemYeast.id,
      costAmount: new CostaraDecimal(50),
      costQuantity: new CostaraDecimal(1),
      unitId: unitKg.id, // $50/kg = $0.05/g
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      notes: null,
    };
    const subRecipeInputsWithUnique: RecipeInputData[] = [
      {
        id: 'sub-inp-unique-1',
        businessId: 'biz-1',
        recipeVersionId: sourdoughVersionV1.id,
        itemId: itemYeast.id, // Item unique to subrecipe
        position: 1,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(20), // 20g * $0.05 = $1.00
        unitId: unitG.id,
        percentage: null,
        costingSource: 'purchased',
        notes: null,
      },
      {
        id: 'sub-inp-unique-2',
        businessId: 'biz-1',
        recipeVersionId: sourdoughVersionV1.id,
        itemId: itemFlourWhite.id,
        position: 2,
        quantityMode: 'absolute',
        quantity: new CostaraDecimal(980), // 980g flour
        unitId: unitG.id,
        percentage: null,
        costingSource: 'purchased',
        notes: null,
      },
    ];

    const customFixtures = {
      ...fixtures,
      items: [...fixtures.items, itemYeast],
      itemCostVersions: [...fixtures.itemCostVersions, yeastCost],
      recipeInputs: [
        ...fixtures.recipeInputs.filter((i) => i.recipeVersionId !== sourdoughVersionV1.id),
        ...subRecipeInputsWithUnique,
      ],
    };
    const dataProvider = createInMemoryRecipeDataProvider({ businessId: 'biz-1', fixtures: customFixtures });
    const asOf = new Date('2026-03-15T00:00:00Z');

    // Root recipe is Hogaza (loafRecipe), which does NOT contain itemYeast
    const res = await calculatePublishedRecipeAsOf({
      recipeId: loafRecipe.id,
      dataProvider,
      asOf,
    });

    expect(res.status).toBe('complete');
    expect(res.isCostComplete).toBe(true);
    expect(res.issues).toHaveLength(0);
    // Sourdough node should be present and complete
    const sourdoughNode = res.breakdown.find((n) => n.itemId === itemSourdough.id);
    expect(sourdoughNode).toBeDefined();
    expect(sourdoughNode?.isCostComplete).toBe(true);
    // The unique yeast item should be inside children of sourdoughNode, scaled by 1400/10000 = 0.14
    const yeastNode = sourdoughNode?.children?.find((c) => c.itemId === itemYeast.id);
    expect(yeastNode).toBeDefined();
    expect(yeastNode?.canonicalQuantity.equals(new CostaraDecimal('2.8'))).toBe(true);
  });
});
