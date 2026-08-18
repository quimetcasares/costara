import type { CalculationIssue, CalculationIssueCode } from './types.js';

export function createIssue(
  code: CalculationIssueCode,
  message: string,
  options: {
    severity?: 'error' | 'warning' | 'info';
    path?: readonly string[];
    itemId?: string;
    itemName?: string;
    inputId?: string;
    recipeId?: string;
    recipeVersionId?: string;
    metadata?: Readonly<Record<string, unknown>>;
  } = {}
): CalculationIssue {
  return {
    code,
    message,
    severity: options.severity ?? 'error',
    path: options.path,
    itemId: options.itemId,
    itemName: options.itemName,
    inputId: options.inputId,
    recipeId: options.recipeId,
    recipeVersionId: options.recipeVersionId,
    metadata: options.metadata,
  };
}

export function missingPurchaseCostIssue(itemId: string, itemName?: string, inputId?: string): CalculationIssue {
  return createIssue(
    'MISSING_PURCHASE_COST',
    `No purchase cost history has ever been recorded for item "${itemName ?? itemId}".`,
    { severity: 'warning', itemId, itemName, inputId }
  );
}

export function noCostAsOfDateIssue(
  itemId: string,
  asOf: Date,
  firstAvailableCostAt?: Date | null,
  itemName?: string,
  inputId?: string
): CalculationIssue {
  const firstStr = firstAvailableCostAt ? firstAvailableCostAt.toISOString() : undefined;
  return createIssue(
    'NO_COST_AS_OF_DATE',
    `No purchase cost version is applicable for item "${itemName ?? itemId}" as of ${asOf.toISOString()}.${
      firstStr ? ` First recorded cost is effective from ${firstStr}.` : ''
    }`,
    {
      severity: 'warning',
      itemId,
      itemName,
      inputId,
      metadata: firstStr ? { firstAvailableCostAt: firstStr } : undefined,
    }
  );
}

export function missingPercentageBaseIssue(inputId: string, itemId: string, itemName?: string): CalculationIssue {
  return createIssue(
    'MISSING_PERCENTAGE_BASE',
    `Percentage input for item "${itemName ?? itemId}" has no basis inputs configured.`,
    { severity: 'warning', inputId, itemId, itemName }
  );
}

export function percentageCycleIssue(cyclePath: readonly string[]): CalculationIssue {
  return createIssue(
    'PERCENTAGE_DEPENDENCY_CYCLE',
    `Percentage formulation dependency cycle detected: ${cyclePath.join(' -> ')}`,
    { severity: 'error', path: cyclePath }
  );
}

export function recipeCycleIssue(cyclePath: readonly string[]): CalculationIssue {
  return createIssue(
    'RECIPE_DEPENDENCY_CYCLE',
    `Nested recipe dependency cycle detected: ${cyclePath.join(' -> ')}`,
    { severity: 'error', path: cyclePath }
  );
}

export function incompatiblePercentageBaseDimensionsIssue(
  inputId: string,
  dimensionsFound: readonly string[]
): CalculationIssue {
  return createIssue(
    'INCOMPATIBLE_PERCENTAGE_BASE_DIMENSIONS',
    `Percentage base contains inputs with incompatible dimensions: ${dimensionsFound.join(', ')}`,
    { severity: 'error', inputId }
  );
}

export function incompatiblePercentageItemDimensionIssue(
  inputId: string,
  baseDimension: string,
  itemDimension: string
): CalculationIssue {
  return createIssue(
    'INCOMPATIBLE_PERCENTAGE_ITEM_DIMENSION',
    `Percentage input item dimension (${itemDimension}) does not match percentage base dimension (${baseDimension}).`,
    { severity: 'error', inputId }
  );
}

export function incompatibleInputDimensionIssue(
  inputId: string,
  unitDimension: string,
  itemDimension: string
): CalculationIssue {
  return createIssue(
    'INCOMPATIBLE_INPUT_DIMENSION',
    `Input unit dimension (${unitDimension}) does not match item base unit dimension (${itemDimension}).`,
    { severity: 'error', inputId }
  );
}

export function unresolvableOutputQuantityIssue(
  recipeId?: string,
  recipeVersionId?: string,
  message?: string
): CalculationIssue {
  return createIssue(
    'UNRESOLVABLE_OUTPUT_QUANTITY',
    message ?? 'Theoretical output count cannot be derived because portion quantity is not defined for discrete output.',
    { severity: 'info', recipeId, recipeVersionId }
  );
}

export function cannotScaleByUnresolvableOutputIssue(
  recipeId?: string,
  recipeVersionId?: string
): CalculationIssue {
  return createIssue(
    'CANNOT_SCALE_BY_UNRESOLVABLE_OUTPUT',
    'Cannot scale recipe by output pieces because theoretical output portions are unresolvable.',
    { severity: 'error', recipeId, recipeVersionId }
  );
}

export function invalidScaleTargetIssue(target: string): CalculationIssue {
  return createIssue(
    'INVALID_SCALE_TARGET',
    `Invalid scale target "${target}". Scale target must be strictly greater than zero.`,
    { severity: 'error' }
  );
}

export function noRecipeForProducedItemIssue(itemId: string, itemName?: string): CalculationIssue {
  return createIssue(
    'NO_RECIPE_FOR_PRODUCED_ITEM',
    `Item "${itemName ?? itemId}" is marked as produced but has no active recipe associated.`,
    { severity: 'warning', itemId, itemName }
  );
}

export function noRecipeAsOfDateIssue(itemId: string, asOf: Date, itemName?: string): CalculationIssue {
  return createIssue(
    'NO_RECIPE_AS_OF_DATE',
    `No published recipe version found for item "${itemName ?? itemId}" as of ${asOf.toISOString()}.`,
    { severity: 'warning', itemId, itemName }
  );
}

export function ambiguousCostingSourceIssue(itemId: string, itemName?: string, inputId?: string): CalculationIssue {
  return createIssue(
    'AMBIGUOUS_COSTING_SOURCE',
    `Item "${itemName ?? itemId}" is both purchasable and producible, but costing_source was not specified.`,
    { severity: 'warning', itemId, itemName, inputId }
  );
}
