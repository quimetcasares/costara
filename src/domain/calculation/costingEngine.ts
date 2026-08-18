import { CostaraDecimal, DECIMAL_ZERO } from './decimal.js';
import { toUniversalDimensionBase } from './units.js';
import {
  missingPurchaseCostIssue,
  noCostAsOfDateIssue,
  noRecipeForProducedItemIssue,
  noRecipeAsOfDateIssue,
  ambiguousCostingSourceIssue,
  recipeCycleIssue,
  unresolvableOutputQuantityIssue,
} from './issues.js';
import { resolveRecipeFormula } from './formulaResolver.js';
import { resolveYieldAndOutput } from './yieldResolver.js';
import {
  allocateProducedItemCost,
  type ProducedItemTemplate,
} from './memoization.js';
import type {
  CostBreakdownNode,
  CalculationIssue,
  CalculationStatus,
  ItemData,
  UnitData,
  CostingSource,
  ResolvedRecipeInput,
} from './types.js';
import type { RecipeDataProvider } from '../data/types.js';

export interface CostingResolutionResult {
  readonly knownBatchMaterialCost: CostaraDecimal;
  readonly isCostComplete: boolean;
  readonly status: CalculationStatus;
  readonly issues: readonly CalculationIssue[];
  readonly breakdown: readonly CostBreakdownNode[];
}

export async function resolveRecipeCosting(params: {
  resolvedInputs: readonly ResolvedRecipeInput[];
  scaledInputsById: ReadonlyMap<string, CostaraDecimal | null>;
  dataProvider: RecipeDataProvider;
  asOf: Date;
  unitsMap: ReadonlyMap<string, UnitData>;
  itemsMap: ReadonlyMap<string, ItemData>;
  activeItemStack?: readonly string[];
  memoCache?: Map<string, ProducedItemTemplate>;
}): Promise<CostingResolutionResult> {
  const {
    resolvedInputs,
    scaledInputsById,
    dataProvider,
    asOf,
    unitsMap,
    itemsMap,
    activeItemStack = [],
    memoCache = new Map<string, ProducedItemTemplate>(),
  } = params;

  const issues: CalculationIssue[] = [];
  const breakdown: CostBreakdownNode[] = [];
  let totalKnownBatchCost = DECIMAL_ZERO;
  let isAllCostsComplete = true;
  let hasErrors = false;

  for (const resolvedInput of resolvedInputs) {
    const { input, item, isResolved, canonicalUnitCode } = resolvedInput;
    const scaledCanonical = scaledInputsById.get(input.id) ?? resolvedInput.canonicalQuantity;

    // Determine costing source
    let source: CostingSource | null = input.costingSource;
    if (!source) {
      if (item.purchasable && !item.producible) {
        source = 'purchased';
      } else if (!item.purchasable && item.producible) {
        source = 'produced';
      } else if (item.purchasable && item.producible) {
        const ambIssue = ambiguousCostingSourceIssue(item.id, item.name, input.id);
        issues.push(ambIssue);
        isAllCostsComplete = false;
        breakdown.push({
          inputId: input.id,
          itemId: item.id,
          itemName: item.name,
          itemKind: item.kind,
          position: input.position,
          quantityMode: input.quantityMode,
          requestedQuantity: input.quantity ?? undefined,
          percentage: input.percentage ?? undefined,
          canonicalQuantity: scaledCanonical ?? DECIMAL_ZERO,
          canonicalUnitCode,
          costingSource: 'purchased',
          status: 'incomplete',
          isCostComplete: false,
          issues: [ambIssue],
        });
        continue;
      } else {
        // Neither purchasable nor producible
        const issue = ambiguousCostingSourceIssue(item.id, item.name, input.id);
        issues.push(issue);
        isAllCostsComplete = false;
        continue;
      }
    }

    if (!isResolved || scaledCanonical === null) {
      isAllCostsComplete = false;
      breakdown.push({
        inputId: input.id,
        itemId: item.id,
        itemName: item.name,
        itemKind: item.kind,
        position: input.position,
        quantityMode: input.quantityMode,
        requestedQuantity: input.quantity ?? undefined,
        percentage: input.percentage ?? undefined,
        canonicalQuantity: DECIMAL_ZERO,
        canonicalUnitCode,
        costingSource: source,
        status: 'incomplete',
        isCostComplete: false,
        issues: resolvedInput.issues,
      });
      continue;
    }

    // 1. PURCHASED COSTING
    if (source === 'purchased') {
      const costResolution = await dataProvider.getItemCostResolution(item.id, asOf);
      if (costResolution.applicableCost) {
        const costVersion = costResolution.applicableCost;
        const costUnit = unitsMap.get(costVersion.unitId);
        if (!costUnit) {
          throw new Error(`Cost unit "${costVersion.unitId}" not found in units catalog`);
        }

        const canonicalCostQuantity = toUniversalDimensionBase(costVersion.costQuantity, costUnit);
        const unitCostCanonical = costVersion.costAmount.dividedBy(canonicalCostQuantity);
        const nodeMaterialCost = scaledCanonical.times(unitCostCanonical);

        totalKnownBatchCost = totalKnownBatchCost.plus(nodeMaterialCost);

        breakdown.push({
          inputId: input.id,
          itemId: item.id,
          itemName: item.name,
          itemKind: item.kind,
          position: input.position,
          quantityMode: input.quantityMode,
          requestedQuantity: input.quantity ?? undefined,
          percentage: input.percentage ?? undefined,
          canonicalQuantity: scaledCanonical,
          canonicalUnitCode,
          costingSource: 'purchased',
          status: 'complete',
          unitCostCanonical,
          nodeMaterialCost,
          applicableCostVersionId: costVersion.id,
          applicableCostEffectiveFrom: costVersion.effectiveFrom.toISOString(),
          isCostComplete: true,
          issues: [],
        });
      } else {
        isAllCostsComplete = false;
        let missingIssue: CalculationIssue;
        if (costResolution.hasAnyCostEver) {
          missingIssue = noCostAsOfDateIssue(
            item.id,
            asOf,
            costResolution.firstAvailableCostAt,
            item.name,
            input.id
          );
        } else {
          missingIssue = missingPurchaseCostIssue(item.id, item.name, input.id);
        }

        issues.push(missingIssue);

        breakdown.push({
          inputId: input.id,
          itemId: item.id,
          itemName: item.name,
          itemKind: item.kind,
          position: input.position,
          quantityMode: input.quantityMode,
          requestedQuantity: input.quantity ?? undefined,
          percentage: input.percentage ?? undefined,
          canonicalQuantity: scaledCanonical,
          canonicalUnitCode,
          costingSource: 'purchased',
          status: 'incomplete',
          isCostComplete: false,
          issues: [missingIssue],
        });
      }
      continue;
    }

    // 2. PRODUCED COSTING (Recursive)
    if (source === 'produced') {
      // Check recipe cycle
      if (activeItemStack.includes(item.id)) {
        const cyclePath = [...activeItemStack.map((id) => itemsMap.get(id)?.name ?? id), item.name];
        const cycleIss = recipeCycleIssue(cyclePath);
        issues.push(cycleIss);
        hasErrors = true;
        isAllCostsComplete = false;

        breakdown.push({
          inputId: input.id,
          itemId: item.id,
          itemName: item.name,
          itemKind: item.kind,
          position: input.position,
          quantityMode: input.quantityMode,
          requestedQuantity: input.quantity ?? undefined,
          percentage: input.percentage ?? undefined,
          canonicalQuantity: scaledCanonical,
          canonicalUnitCode,
          costingSource: 'produced',
          status: 'error',
          isCostComplete: false,
          issues: [cycleIss],
        });
        continue;
      }

      // Check memoization cache
      const memoKey = `${dataProvider.businessId}:${item.id}:${asOf.toISOString()}`;
      let template = memoCache.get(memoKey);

      if (!template) {
        // Resolve sub-recipe
        const subRecipe = await dataProvider.getRecipeByOutputItemId(item.id);
        if (!subRecipe) {
          const noRecIss = noRecipeForProducedItemIssue(item.id, item.name);
          issues.push(noRecIss);
          isAllCostsComplete = false;
          breakdown.push({
            inputId: input.id,
            itemId: item.id,
            itemName: item.name,
            itemKind: item.kind,
            position: input.position,
            quantityMode: input.quantityMode,
            requestedQuantity: input.quantity ?? undefined,
            percentage: input.percentage ?? undefined,
            canonicalQuantity: scaledCanonical,
            canonicalUnitCode,
            costingSource: 'produced',
            status: 'incomplete',
            isCostComplete: false,
            issues: [noRecIss],
          });
          continue;
        }

        const subVersion = await dataProvider.getPublishedRecipeVersionAsOf(subRecipe.id, asOf);
        if (!subVersion) {
          const noVerIss = noRecipeAsOfDateIssue(item.id, asOf, item.name);
          issues.push(noVerIss);
          isAllCostsComplete = false;
          breakdown.push({
            inputId: input.id,
            itemId: item.id,
            itemName: item.name,
            itemKind: item.kind,
            position: input.position,
            quantityMode: input.quantityMode,
            requestedQuantity: input.quantity ?? undefined,
            percentage: input.percentage ?? undefined,
            canonicalQuantity: scaledCanonical,
            canonicalUnitCode,
            costingSource: 'produced',
            status: 'incomplete',
            applicableRecipeVersionId: undefined,
            isCostComplete: false,
            issues: [noVerIss],
          });
          continue;
        }

        // Fetch sub-recipe inputs & bases
        const subInputs = await dataProvider.getRecipeInputs(subVersion.id);
        const subBases = await dataProvider.getPercentageBases(subVersion.id);

        // Resolve sub-recipe formula
        const subFormulaResult = resolveRecipeFormula({
          inputs: subInputs,
          percentageBases: subBases,
          itemsMap,
          unitsMap,
        });

        // Resolve sub-recipe yield
        const subYieldResult = resolveYieldAndOutput({
          recipeVersion: subVersion,
          outputItem: item,
          unitsMap,
        });

        // Sub-recipe scaled inputs map for reference batch (factor = 1)
        const subScaledInputs = new Map<string, CostaraDecimal | null>();
        for (const inp of subFormulaResult.resolvedInputs) {
          subScaledInputs.set(inp.input.id, inp.canonicalQuantity);
        }

        // Recursive sub-costing call
        const nextStack = [...activeItemStack, item.id];
        const subCostingResult = await resolveRecipeCosting({
          resolvedInputs: subFormulaResult.resolvedInputs,
          scaledInputsById: subScaledInputs,
          dataProvider,
          asOf,
          unitsMap,
          itemsMap,
          activeItemStack: nextStack,
          memoCache,
        });

        const subIssues = [
          ...subFormulaResult.issues,
          ...subYieldResult.issues,
          ...subCostingResult.issues,
        ];

        let unitMaterialCost: CostaraDecimal | undefined;
        let referenceCanonicalOutput = DECIMAL_ZERO;

        if (subYieldResult.theoreticalOutputQuantity && subYieldResult.theoreticalOutputQuantity.isPositive()) {
          referenceCanonicalOutput = subYieldResult.theoreticalOutputQuantity;
          unitMaterialCost = subCostingResult.knownBatchMaterialCost.dividedBy(referenceCanonicalOutput);
        } else {
          // Output is unresolvable
          subIssues.push(unresolvableOutputQuantityIssue(subRecipe.id, subVersion.id));
        }

        template = {
          outputItemId: item.id,
          recipeId: subRecipe.id,
          recipeVersionId: subVersion.id,
          referenceCanonicalOutput,
          knownBatchMaterialCost: subCostingResult.knownBatchMaterialCost,
          knownUnitMaterialCost: unitMaterialCost,
          isCostComplete: subCostingResult.isCostComplete && unitMaterialCost !== undefined,
          issues: subIssues,
          referenceBreakdown: subCostingResult.breakdown,
        };

        memoCache.set(memoKey, template);
      }

      // Allocate consumer cost using template
      const allocation = allocateProducedItemCost({
        template,
        requestedCanonicalQuantity: scaledCanonical,
      });

      if (allocation.allocatedMaterialCost) {
        totalKnownBatchCost = totalKnownBatchCost.plus(allocation.allocatedMaterialCost);
      }

      if (!allocation.isCostComplete) {
        isAllCostsComplete = false;
      }

      if (allocation.issues.some((i) => i.severity === 'error')) {
        hasErrors = true;
      }

      issues.push(...allocation.issues);

      const nodeStatus: CalculationStatus = allocation.issues.some((i) => i.severity === 'error')
        ? 'error'
        : allocation.isCostComplete
        ? 'complete'
        : 'incomplete';

      breakdown.push({
        inputId: input.id,
        itemId: item.id,
        itemName: item.name,
        itemKind: item.kind,
        position: input.position,
        quantityMode: input.quantityMode,
        requestedQuantity: input.quantity ?? undefined,
        percentage: input.percentage ?? undefined,
        canonicalQuantity: scaledCanonical,
        canonicalUnitCode,
        costingSource: 'produced',
        status: nodeStatus,
        unitCostCanonical: allocation.unitCostCanonical,
        nodeMaterialCost: allocation.allocatedMaterialCost,
        applicableRecipeVersionId: template.recipeVersionId,
        isCostComplete: allocation.isCostComplete,
        issues: allocation.issues,
        children: allocation.scaledChildren,
      });
    }
  }

  const overallStatus: CalculationStatus = hasErrors
    ? 'error'
    : isAllCostsComplete
    ? 'complete'
    : 'incomplete';

  return {
    knownBatchMaterialCost: totalKnownBatchCost,
    isCostComplete: isAllCostsComplete && !hasErrors,
    status: overallStatus,
    issues,
    breakdown,
  };
}
