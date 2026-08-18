import { CostaraDecimal, DECIMAL_ONE } from './decimal.js';
import { toUniversalDimensionBase } from './units.js';
import { invalidScaleTargetIssue, cannotScaleByUnresolvableOutputIssue } from './issues.js';
import type {
  ScaleTarget,
  CanonicalYield,
  ResolvedRecipeInput,
  UnitData,
  CalculationIssue,
} from './types.js';

export interface ScalingResult {
  readonly scaleFactor: CostaraDecimal;
  readonly scaledYield: CanonicalYield;
  readonly scaledPortions?: CostaraDecimal;
  readonly scaledInputsById: ReadonlyMap<string, CostaraDecimal | null>;
  readonly issues: readonly CalculationIssue[];
  readonly isSuccess: boolean;
}

export function applyRecipeScaling(params: {
  scaleTarget?: ScaleTarget;
  referenceYield: CanonicalYield;
  theoreticalPortions?: CostaraDecimal;
  resolvedInputs: readonly ResolvedRecipeInput[];
  unitsMap: ReadonlyMap<string, UnitData>;
  recipeId?: string;
  recipeVersionId?: string;
}): ScalingResult {
  const {
    scaleTarget,
    referenceYield,
    theoreticalPortions,
    resolvedInputs,
    unitsMap,
    recipeId,
    recipeVersionId,
  } = params;

  const issues: CalculationIssue[] = [];

  let scaleFactor = DECIMAL_ONE;

  if (scaleTarget) {
    if (scaleTarget.mode === 'yield') {
      if (!scaleTarget.targetQuantity.isPositive() || scaleTarget.targetQuantity.isZero()) {
        issues.push(invalidScaleTargetIssue(scaleTarget.targetQuantity.toString()));
        return failScaling(scaleFactor, referenceYield, resolvedInputs, issues);
      }

      let targetCanonical = scaleTarget.targetQuantity;
      if (scaleTarget.unitId) {
        const targetUnit = unitsMap.get(scaleTarget.unitId);
        if (targetUnit) {
          targetCanonical = toUniversalDimensionBase(scaleTarget.targetQuantity, targetUnit);
        }
      }

      scaleFactor = targetCanonical.dividedBy(referenceYield.canonicalQuantity);
    } else if (scaleTarget.mode === 'output_pieces') {
      if (!scaleTarget.targetPieces.isPositive() || scaleTarget.targetPieces.isZero()) {
        issues.push(invalidScaleTargetIssue(scaleTarget.targetPieces.toString()));
        return failScaling(scaleFactor, referenceYield, resolvedInputs, issues);
      }

      if (!theoreticalPortions || theoreticalPortions.isZero()) {
        issues.push(cannotScaleByUnresolvableOutputIssue(recipeId, recipeVersionId));
        return failScaling(scaleFactor, referenceYield, resolvedInputs, issues);
      }

      scaleFactor = scaleTarget.targetPieces.dividedBy(theoreticalPortions);
    }

    if (!scaleFactor.isPositive() || scaleFactor.isZero()) {
      issues.push(invalidScaleTargetIssue(scaleFactor.toString()));
      return failScaling(scaleFactor, referenceYield, resolvedInputs, issues);
    }
  }

  // Calculate scaled inputs map
  const scaledInputsById = new Map<string, CostaraDecimal | null>();
  for (const item of resolvedInputs) {
    if (item.canonicalQuantity !== null) {
      scaledInputsById.set(item.input.id, item.canonicalQuantity.times(scaleFactor));
    } else {
      scaledInputsById.set(item.input.id, null);
    }
  }

  const scaledYield: CanonicalYield = {
    ...referenceYield,
    quantity: referenceYield.quantity.times(scaleFactor),
    canonicalQuantity: referenceYield.canonicalQuantity.times(scaleFactor),
  };

  const scaledPortions = theoreticalPortions ? theoreticalPortions.times(scaleFactor) : undefined;

  return {
    scaleFactor,
    scaledYield,
    scaledPortions,
    scaledInputsById,
    issues,
    isSuccess: true,
  };
}

function failScaling(
  fallbackFactor: CostaraDecimal,
  referenceYield: CanonicalYield,
  resolvedInputs: readonly ResolvedRecipeInput[],
  issues: CalculationIssue[]
): ScalingResult {
  const scaledInputsById = new Map<string, CostaraDecimal | null>();
  for (const item of resolvedInputs) {
    scaledInputsById.set(item.input.id, item.canonicalQuantity);
  }

  return {
    scaleFactor: fallbackFactor,
    scaledYield: referenceYield,
    scaledInputsById,
    issues,
    isSuccess: false,
  };
}
