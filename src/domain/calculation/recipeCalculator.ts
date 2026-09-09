import { CostaraDecimal, DECIMAL_ZERO } from './decimal.ts';
import { resolveRecipeFormula } from './formulaResolver.ts';
import { resolveYieldAndOutput } from './yieldResolver.ts';
import { applyRecipeScaling } from './scalingEngine.ts';
import { resolveRecipeCosting } from './costingEngine.ts';
import { noRecipeAsOfDateIssue } from './issues.ts';
import type {
  RecipeCalculationResult,
  ScaleTarget,
  RecipeVersionDraftInput,
  RecipeInputDraftInput,
  PercentageBaseDraftInput,
  CalculationIssue,
  CalculationStatus,
  ItemData,
  UnitData,
  RecipeInputData,
  PercentageBaseData,
  RecipeVersionData,
} from './types.ts';
import type { RecipeDataProvider } from '../data/types.ts';

export async function calculatePublishedRecipeAsOf(params: {
  dataProvider: RecipeDataProvider;
  asOf: Date;
  recipeId?: string;
  outputItemId?: string;
  scaleTarget?: ScaleTarget;
}): Promise<RecipeCalculationResult> {
  const { dataProvider, asOf, recipeId, outputItemId, scaleTarget } = params;

  const business = await dataProvider.getBusiness();
  const currencyCode = business?.currencyCode ?? 'MXN';

  // 1. Locate recipe
  let recipe = recipeId ? await dataProvider.getRecipeById(recipeId) : null;
  if (!recipe && outputItemId) {
    recipe = await dataProvider.getRecipeByOutputItemId(outputItemId);
  }

  if (!recipe) {
    throw new Error(
      `Recipe not found for recipeId="${recipeId ?? ''}" and outputItemId="${outputItemId ?? ''}" in business "${dataProvider.businessId}"`
    );
  }

  // 2. Locate published recipe version applicable at asOf
  const recipeVersion = await dataProvider.getPublishedRecipeVersionAsOf(recipe.id, asOf);
  if (!recipeVersion) {
    const noVerIssue = noRecipeAsOfDateIssue(recipe.outputItemId, asOf, recipe.name);
    const outputItem = await dataProvider.getItem(recipe.outputItemId);
    const dummyYield = {
      quantity: DECIMAL_ZERO,
      unitId: '',
      unitCode: '',
      canonicalQuantity: DECIMAL_ZERO,
      canonicalUnitCode: '',
      dimensionCode: 'mass' as const,
    };

    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      outputItemId: recipe.outputItemId,
      outputItemName: outputItem?.name ?? recipe.name,
      businessId: dataProvider.businessId,
      currencyCode,
      asOf: asOf.toISOString(),
      status: 'incomplete',
      scaleFactor: new CostaraDecimal(1),
      referenceYield: dummyYield,
      scaledYield: dummyYield,
      knownBatchMaterialCost: DECIMAL_ZERO,
      isCostComplete: false,
      issues: [noVerIssue],
      breakdown: [],
    };
  }

  // 3. Fetch inputs, percentage bases, units, and items
  const [inputs, percentageBases, outputItem, unitsList] = await Promise.all([
    dataProvider.getRecipeInputs(recipeVersion.id),
    dataProvider.getPercentageBases(recipeVersion.id),
    dataProvider.getItem(recipe.outputItemId),
    dataProvider.getAllUnits(),
  ]);

  if (!outputItem) {
    throw new Error(`Output item "${recipe.outputItemId}" not found`);
  }

  const unitsMap = new Map<string, UnitData>();
  for (const u of unitsList) {
    unitsMap.set(u.id, u);
  }

  const itemIds = new Set<string>([recipe.outputItemId, ...inputs.map((i) => i.itemId)]);
  const itemsMap = new Map<string, ItemData>();
  itemsMap.set(outputItem.id, outputItem);

  for (const itId of itemIds) {
    if (!itemsMap.has(itId)) {
      const it = await dataProvider.getItem(itId);
      if (it) itemsMap.set(it.id, it);
    }
  }

  return executeCalculationPipeline({
    recipeId: recipe.id,
    recipeVersionId: recipeVersion.id,
    recipeName: recipe.name,
    outputItem,
    recipeVersion,
    inputs,
    percentageBases,
    scaleTarget,
    dataProvider,
    asOf,
    unitsMap,
    itemsMap,
    currencyCode,
  });
}

export async function calculateRecipeDraftPreview(params: {
  draftVersion: RecipeVersionDraftInput;
  inputs: readonly RecipeInputDraftInput[];
  percentageBases: readonly PercentageBaseDraftInput[];
  outputItemName?: string;
  outputItemId: string;
  recipeName?: string;
  dataProvider: RecipeDataProvider;
  asOf: Date;
  scaleTarget?: ScaleTarget;
}): Promise<RecipeCalculationResult> {
  const {
    draftVersion,
    inputs,
    percentageBases,
    outputItemName,
    outputItemId,
    recipeName = 'Draft Recipe',
    dataProvider,
    asOf,
    scaleTarget,
  } = params;

  if (draftVersion.businessId !== dataProvider.businessId) {
    throw new Error(
      `Business scope mismatch: draft businessId "${draftVersion.businessId}" does not match provider "${dataProvider.businessId}"`
    );
  }

  const business = await dataProvider.getBusiness();
  const currencyCode = business?.currencyCode ?? 'MXN';

  const [outputItem, unitsList] = await Promise.all([
    dataProvider.getItem(outputItemId),
    dataProvider.getAllUnits(),
  ]);

  if (!outputItem) {
    throw new Error(`Output item "${outputItemId}" not found`);
  }

  const unitsMap = new Map<string, UnitData>();
  for (const u of unitsList) {
    unitsMap.set(u.id, u);
  }

  const itemIds = new Set<string>([outputItemId, ...inputs.map((i) => i.itemId)]);
  const itemsMap = new Map<string, ItemData>();
  itemsMap.set(outputItem.id, outputItem);

  for (const itId of itemIds) {
    if (!itemsMap.has(itId)) {
      const it = await dataProvider.getItem(itId);
      if (it) itemsMap.set(it.id, it);
    }
  }

  // Convert draft inputs to domain RecipeInputData format with CostaraDecimal instances
  const domainInputs: RecipeInputData[] = inputs.map((inp) => ({
    id: inp.id,
    businessId: dataProvider.businessId,
    recipeVersionId: draftVersion.id ?? 'draft-version',
    itemId: inp.itemId,
    position: inp.position,
    quantityMode: inp.quantityMode,
    quantity:
      inp.quantity instanceof CostaraDecimal
        ? inp.quantity
        : inp.quantity !== null && inp.quantity !== undefined && String(inp.quantity).trim() !== ''
        ? new CostaraDecimal(String(inp.quantity))
        : null,
    unitId: inp.unitId ?? null,
    percentage:
      inp.percentage instanceof CostaraDecimal
        ? inp.percentage
        : inp.percentage !== null && inp.percentage !== undefined && String(inp.percentage).trim() !== ''
        ? new CostaraDecimal(String(inp.percentage))
        : null,
    costingSource: inp.costingSource ?? null,
    notes: inp.notes ?? null,
  }));

  const domainBases: PercentageBaseData[] = percentageBases.map((pb) => ({
    percentageInputId: pb.percentageInputId,
    basisInputId: pb.basisInputId,
  }));

  const domainDraftVersion: RecipeVersionData = {
    id: draftVersion.id ?? 'draft-version',
    businessId: draftVersion.businessId ?? dataProvider.businessId,
    recipeId: draftVersion.recipeId ?? 'draft-recipe',
    versionNumber: draftVersion.versionNumber ?? 1,
    status: 'draft',
    referenceYieldQuantity:
      draftVersion.referenceYieldQuantity instanceof CostaraDecimal
        ? draftVersion.referenceYieldQuantity
        : new CostaraDecimal(String(draftVersion.referenceYieldQuantity)),
    referenceYieldUnitId: draftVersion.referenceYieldUnitId,
    portionQuantity:
      draftVersion.portionQuantity instanceof CostaraDecimal
        ? draftVersion.portionQuantity
        : draftVersion.portionQuantity !== null && draftVersion.portionQuantity !== undefined && String(draftVersion.portionQuantity).trim() !== ''
        ? new CostaraDecimal(String(draftVersion.portionQuantity))
        : null,
    portionUnitId: draftVersion.portionUnitId ?? null,
    yieldDescription: draftVersion.yieldDescription ?? null,
    notes: draftVersion.notes ?? null,
    effectiveFrom: null,
    changeReason: null,
  };

  return executeCalculationPipeline({
    recipeId: draftVersion.recipeId,
    recipeVersionId: draftVersion.id,
    recipeName,
    outputItem: outputItem ?? {
      id: outputItemId,
      businessId: dataProvider.businessId,
      name: outputItemName ?? 'Output Item',
      kind: 'finished_product',
      baseUnitId: draftVersion.referenceYieldUnitId,
      purchasable: false,
      producible: true,
      sellable: true,
      trackInventory: true,
      isActive: true,
    },
    recipeVersion: domainDraftVersion,
    inputs: domainInputs,
    percentageBases: domainBases,
    scaleTarget,
    dataProvider,
    asOf,
    unitsMap,
    itemsMap,
    currencyCode,
  });
}

async function executeCalculationPipeline(params: {
  recipeId?: string;
  recipeVersionId?: string;
  recipeName: string;
  outputItem: ItemData;
  recipeVersion: RecipeVersionDraftInput;
  inputs: readonly RecipeInputData[];
  percentageBases: readonly PercentageBaseData[];
  scaleTarget?: ScaleTarget;
  dataProvider: RecipeDataProvider;
  asOf: Date;
  unitsMap: ReadonlyMap<string, UnitData>;
  itemsMap: ReadonlyMap<string, ItemData>;
  currencyCode: string;
}): Promise<RecipeCalculationResult> {
  const {
    recipeId,
    recipeVersionId,
    recipeName,
    outputItem,
    recipeVersion,
    inputs,
    percentageBases,
    scaleTarget,
    dataProvider,
    asOf,
    unitsMap,
    itemsMap,
    currencyCode,
  } = params;

  const allIssues: CalculationIssue[] = [];

  // 1. Formula Resolution
  const formulaResult = resolveRecipeFormula({
    inputs,
    percentageBases,
    itemsMap,
    unitsMap,
  });
  allIssues.push(...formulaResult.issues);

  // 2. Yield and Theoretical Output Resolution
  const yieldResult = resolveYieldAndOutput({
    recipeVersion,
    outputItem,
    unitsMap,
  });
  allIssues.push(...yieldResult.issues);

  // 3. Scaling
  const scalingResult = applyRecipeScaling({
    scaleTarget,
    referenceYield: yieldResult.referenceYield,
    theoreticalPortions: yieldResult.theoreticalPortions,
    resolvedInputs: formulaResult.resolvedInputs,
    unitsMap,
    recipeId,
    recipeVersionId,
  });
  allIssues.push(...scalingResult.issues);

  // 4. Costing
  const costingResult = await resolveRecipeCosting({
    resolvedInputs: formulaResult.resolvedInputs,
    scaledInputsById: scalingResult.scaledInputsById,
    dataProvider,
    asOf,
    unitsMap,
    itemsMap,
  });
  allIssues.push(...costingResult.issues);

  // 5. Unit Cost Derivation
  let knownCostPerOutputUnit: CostaraDecimal | undefined;
  if (yieldResult.isOutputQuantityResolvable) {
    if (scalingResult.scaledPortions && scalingResult.scaledPortions.isPositive()) {
      knownCostPerOutputUnit = costingResult.knownBatchMaterialCost.dividedBy(scalingResult.scaledPortions);
    } else if (scalingResult.scaledYield.canonicalQuantity.isPositive()) {
      knownCostPerOutputUnit = costingResult.knownBatchMaterialCost.dividedBy(scalingResult.scaledYield.canonicalQuantity);
    }
  }

  // Determine overall status
  let overallStatus: CalculationStatus = 'complete';
  if (allIssues.some((i) => i.severity === 'error') || !scalingResult.isSuccess || formulaResult.status === 'error') {
    overallStatus = 'error';
  } else if (
    !costingResult.isCostComplete ||
    formulaResult.status === 'incomplete' ||
    allIssues.some((i) => i.severity === 'warning')
  ) {
    overallStatus = 'incomplete';
  }

  return {
    recipeId,
    recipeVersionId,
    recipeName,
    outputItemId: outputItem.id,
    outputItemName: outputItem.name,
    businessId: dataProvider.businessId,
    currencyCode,
    asOf: asOf.toISOString(),
    status: overallStatus,
    scaleFactor: scalingResult.scaleFactor,
    referenceYield: yieldResult.referenceYield,
    scaledYield: scalingResult.scaledYield,
    theoreticalPortions: yieldResult.theoreticalPortions,
    scaledPortions: scalingResult.scaledPortions,
    knownBatchMaterialCost: costingResult.knownBatchMaterialCost,
    knownCostPerOutputUnit,
    isCostComplete: costingResult.isCostComplete && overallStatus === 'complete',
    issues: allIssues,
    breakdown: costingResult.breakdown,
  };
}
