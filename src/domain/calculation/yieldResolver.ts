import { CostaraDecimal } from './decimal.ts';
import { toUniversalDimensionBase, findUniversalBaseUnit } from './units.ts';
import { unresolvableOutputQuantityIssue } from './issues.ts';
import type {
  RecipeVersionData,
  RecipeVersionDraftInput,
  ItemData,
  UnitData,
  CanonicalYield,
  CalculationIssue,
} from './types.ts';

export interface YieldResolutionResult {
  readonly referenceYield: CanonicalYield;
  readonly theoreticalPortions?: CostaraDecimal;
  readonly theoreticalOutputQuantity?: CostaraDecimal;
  readonly isOutputQuantityResolvable: boolean;
  readonly issues: readonly CalculationIssue[];
}

export function resolveYieldAndOutput(params: {
  recipeVersion: RecipeVersionData | RecipeVersionDraftInput;
  outputItem: ItemData;
  unitsMap: ReadonlyMap<string, UnitData>;
}): YieldResolutionResult {
  const { recipeVersion, outputItem, unitsMap } = params;
  const issues: CalculationIssue[] = [];

  const yieldUnit = unitsMap.get(recipeVersion.referenceYieldUnitId);
  if (!yieldUnit) {
    throw new Error(`Yield unit "${recipeVersion.referenceYieldUnitId}" not found in units catalog`);
  }

  const universalYieldBase = findUniversalBaseUnit(unitsMap, yieldUnit.dimensionCode);
  const canonicalYieldAmount = toUniversalDimensionBase(recipeVersion.referenceYieldQuantity, yieldUnit);

  const referenceYield: CanonicalYield = {
    quantity: recipeVersion.referenceYieldQuantity,
    unitId: yieldUnit.id,
    unitCode: yieldUnit.code,
    canonicalQuantity: canonicalYieldAmount,
    canonicalUnitCode: universalYieldBase?.code ?? yieldUnit.code,
    dimensionCode: yieldUnit.dimensionCode,
  };

  const outputItemBaseUnit = unitsMap.get(outputItem.baseUnitId);
  if (!outputItemBaseUnit) {
    throw new Error(`Output item base unit "${outputItem.baseUnitId}" not found in units catalog`);
  }

  // Continuous output matching yield dimension (e.g. dough mass in grams, syrup volume in ml)
  if (outputItemBaseUnit.dimensionCode === yieldUnit.dimensionCode) {
    return {
      referenceYield,
      theoreticalOutputQuantity: canonicalYieldAmount,
      isOutputQuantityResolvable: true,
      issues,
    };
  }

  // Discrete output (e.g. piece count) with defined portion
  if (outputItemBaseUnit.dimensionCode === 'count') {
    if (recipeVersion.portionQuantity && recipeVersion.portionUnitId) {
      const portionUnit = unitsMap.get(recipeVersion.portionUnitId);
      if (!portionUnit) {
        throw new Error(`Portion unit "${recipeVersion.portionUnitId}" not found in units catalog`);
      }

      const canonicalPortion = toUniversalDimensionBase(recipeVersion.portionQuantity, portionUnit);
      if (canonicalPortion.isPositive() && !canonicalPortion.isZero()) {
        const theoreticalPortions = canonicalYieldAmount.dividedBy(canonicalPortion);
        return {
          referenceYield,
          theoreticalPortions,
          theoreticalOutputQuantity: theoreticalPortions,
          isOutputQuantityResolvable: true,
          issues,
        };
      }
    }

    // Discrete output WITHOUT portion
    issues.push(unresolvableOutputQuantityIssue(recipeVersion.recipeId, recipeVersion.id));
    return {
      referenceYield,
      isOutputQuantityResolvable: false,
      issues,
    };
  }

  // Fallback for other dimension mismatch (e.g. count yield with mass output)
  issues.push(unresolvableOutputQuantityIssue(recipeVersion.recipeId, recipeVersion.id));
  return {
    referenceYield,
    isOutputQuantityResolvable: false,
    issues,
  };
}
