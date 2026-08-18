import { CostaraDecimal, DECIMAL_ZERO, DECIMAL_HUNDRED } from './decimal.js';
import {
  toUniversalDimensionBase,
  findUniversalBaseUnit,
  areUnitsDimensionallyCompatible,
} from './units.js';
import {
  missingPercentageBaseIssue,
  percentageCycleIssue,
  incompatiblePercentageBaseDimensionsIssue,
  incompatiblePercentageItemDimensionIssue,
  incompatibleInputDimensionIssue,
} from './issues.js';
import type {
  RecipeInputData,
  PercentageBaseData,
  ItemData,
  UnitData,
  CalculationIssue,
  CalculationStatus,
  UnitDimensionCode,
  ResolvedRecipeInput,
} from './types.js';

export interface FormulaResolutionResult {
  readonly status: CalculationStatus;
  readonly resolvedInputs: readonly ResolvedRecipeInput[];
  readonly issues: readonly CalculationIssue[];
  readonly inputsById: ReadonlyMap<string, ResolvedRecipeInput>;
}

const VisitState = {
  UNVISITED: 0,
  VISITING: 1,
  RESOLVED: 2,
  FAILED: 3,
} as const;
type VisitState = (typeof VisitState)[keyof typeof VisitState];

export function resolveRecipeFormula(params: {
  inputs: readonly RecipeInputData[];
  percentageBases: readonly PercentageBaseData[];
  itemsMap: ReadonlyMap<string, ItemData>;
  unitsMap: ReadonlyMap<string, UnitData>;
}): FormulaResolutionResult {
  const { inputs, percentageBases, itemsMap, unitsMap } = params;
  const issues: CalculationIssue[] = [];

  // Build lookup maps
  const inputMap = new Map<string, RecipeInputData>();
  for (const input of inputs) {
    inputMap.set(input.id, input);
  }

  // Bases for each percentage input: percentageInputId -> list of basisInputIds
  const basesMap = new Map<string, string[]>();
  for (const pb of percentageBases) {
    const list = basesMap.get(pb.percentageInputId) ?? [];
    list.push(pb.basisInputId);
    basesMap.set(pb.percentageInputId, list);
  }

  // Tracking state for DFS
  const visitStates = new Map<string, VisitState>();
  const visitingStack: string[] = [];
  const resolvedCanonicalQuantities = new Map<string, CostaraDecimal>();
  const resolvedDimensions = new Map<string, UnitDimensionCode>();
  const inputIssues = new Map<string, CalculationIssue[]>();

  for (const input of inputs) {
    visitStates.set(input.id, VisitState.UNVISITED);
    inputIssues.set(input.id, []);
  }

  // Helper to record issue for an input and globally
  function addInputIssue(inputId: string, issue: CalculationIssue) {
    inputIssues.get(inputId)?.push(issue);
    issues.push(issue);
  }

  // DFS function to resolve an input
  function resolveInput(inputId: string): boolean {
    const state = visitStates.get(inputId);
    if (state === VisitState.RESOLVED) return true;
    if (state === VisitState.FAILED) return false;

    const input = inputMap.get(inputId);
    if (!input) return false;

    const item = itemsMap.get(input.itemId);
    if (!item) return false;

    const itemBaseUnit = unitsMap.get(item.baseUnitId);
    if (!itemBaseUnit) return false;

    // Detect Cycle
    if (state === VisitState.VISITING) {
      // Find start of cycle in visitingStack
      const cycleStartIndex = visitingStack.indexOf(inputId);
      const cycleInputIds = cycleStartIndex >= 0 ? visitingStack.slice(cycleStartIndex) : [...visitingStack];
      cycleInputIds.push(inputId);

      // Reconstruct human-readable path using item names
      const cyclePath = cycleInputIds.map((id) => {
        const inp = inputMap.get(id);
        const itm = inp ? itemsMap.get(inp.itemId) : undefined;
        return itm?.name ?? id;
      });

      const cycleIssue = percentageCycleIssue(cyclePath);
      addInputIssue(inputId, cycleIssue);
      visitStates.set(inputId, VisitState.FAILED);
      return false;
    }

    visitStates.set(inputId, VisitState.VISITING);
    visitingStack.push(inputId);

    if (input.quantityMode === 'absolute') {
      if (!input.quantity || !input.unitId) {
        visitStates.set(inputId, VisitState.FAILED);
        visitingStack.pop();
        return false;
      }

      const inputUnit = unitsMap.get(input.unitId);
      if (!inputUnit) {
        visitStates.set(inputId, VisitState.FAILED);
        visitingStack.pop();
        return false;
      }

      // Dimensional validation between input unit and item's base unit
      if (!areUnitsDimensionallyCompatible(inputUnit, itemBaseUnit)) {
        addInputIssue(
          inputId,
          incompatibleInputDimensionIssue(inputId, inputUnit.dimensionCode, itemBaseUnit.dimensionCode)
        );
        visitStates.set(inputId, VisitState.FAILED);
        visitingStack.pop();
        return false;
      }

      const canonicalAmount = toUniversalDimensionBase(input.quantity, inputUnit);
      resolvedCanonicalQuantities.set(inputId, canonicalAmount);
      resolvedDimensions.set(inputId, inputUnit.dimensionCode);
      visitStates.set(inputId, VisitState.RESOLVED);
      visitingStack.pop();
      return true;
    }

    if (input.quantityMode === 'percentage') {
      if (!input.percentage) {
        visitStates.set(inputId, VisitState.FAILED);
        visitingStack.pop();
        return false;
      }

      const basisIds = basesMap.get(inputId) ?? [];
      if (basisIds.length === 0) {
        addInputIssue(inputId, missingPercentageBaseIssue(inputId, item.id, item.name));
        visitStates.set(inputId, VisitState.FAILED);
        visitingStack.pop();
        return false;
      }

      // Resolve all basis inputs
      let allBasesResolved = true;
      const basisCanonicalValues: CostaraDecimal[] = [];
      const basisDimensions: UnitDimensionCode[] = [];

      for (const basisId of basisIds) {
        const resolved = resolveInput(basisId);
        if (!resolved) {
          allBasesResolved = false;
        } else {
          const val = resolvedCanonicalQuantities.get(basisId);
          const dim = resolvedDimensions.get(basisId);
          if (val && dim) {
            basisCanonicalValues.push(val);
            basisDimensions.push(dim);
          }
        }
      }

      if (!allBasesResolved) {
        visitStates.set(inputId, VisitState.FAILED);
        visitingStack.pop();
        return false;
      }

      // Validate base dimensional homogeneity
      const firstDim = basisDimensions[0];
      const hasDimMismatch = basisDimensions.some((d) => d !== firstDim);
      if (hasDimMismatch) {
        addInputIssue(inputId, incompatiblePercentageBaseDimensionsIssue(inputId, basisDimensions));
        visitStates.set(inputId, VisitState.FAILED);
        visitingStack.pop();
        return false;
      }

      // Validate base dimension against item base unit dimension
      if (firstDim !== itemBaseUnit.dimensionCode) {
        addInputIssue(
          inputId,
          incompatiblePercentageItemDimensionIssue(inputId, firstDim, itemBaseUnit.dimensionCode)
        );
        visitStates.set(inputId, VisitState.FAILED);
        visitingStack.pop();
        return false;
      }

      // Sum base quantities
      let baseSum = DECIMAL_ZERO;
      for (const val of basisCanonicalValues) {
        baseSum = baseSum.plus(val);
      }

      // Apply percentage: (baseSum * percentage) / 100
      const canonicalAmount = baseSum.times(input.percentage).dividedBy(DECIMAL_HUNDRED);

      resolvedCanonicalQuantities.set(inputId, canonicalAmount);
      resolvedDimensions.set(inputId, firstDim);
      visitStates.set(inputId, VisitState.RESOLVED);
      visitingStack.pop();
      return true;
    }

    visitStates.set(inputId, VisitState.FAILED);
    visitingStack.pop();
    return false;
  }

  // Resolve all inputs
  for (const input of inputs) {
    if (visitStates.get(input.id) === VisitState.UNVISITED) {
      resolveInput(input.id);
    }
  }

  // Construct resolved output
  const resolvedInputs: ResolvedRecipeInput[] = [];
  const inputsById = new Map<string, ResolvedRecipeInput>();

  let hasErrors = false;
  let hasIncompletes = false;

  for (const input of inputs) {
    const item = itemsMap.get(input.itemId);
    const itemBaseUnit = item ? unitsMap.get(item.baseUnitId) : undefined;
    const universalBaseUnit = itemBaseUnit
      ? findUniversalBaseUnit(unitsMap, itemBaseUnit.dimensionCode)
      : undefined;

    const canonicalQty = resolvedCanonicalQuantities.get(input.id) ?? null;
    const dimensionCode = resolvedDimensions.get(input.id) ?? itemBaseUnit?.dimensionCode ?? 'mass';
    const issuesForInput = inputIssues.get(input.id) ?? [];
    const isResolved = canonicalQty !== null;

    if (issuesForInput.some((i) => i.severity === 'error')) {
      hasErrors = true;
    } else if (issuesForInput.some((i) => i.severity === 'warning') || !isResolved) {
      hasIncompletes = true;
    }

    const resolved: ResolvedRecipeInput = {
      input,
      item: item!,
      canonicalQuantity: canonicalQty,
      canonicalUnitCode: universalBaseUnit?.code ?? itemBaseUnit?.code ?? 'unit',
      dimensionCode,
      isResolved,
      issues: issuesForInput,
    };

    resolvedInputs.push(resolved);
    inputsById.set(input.id, resolved);
  }

  const status: CalculationStatus = hasErrors ? 'error' : hasIncompletes ? 'incomplete' : 'complete';

  return {
    status,
    resolvedInputs,
    issues,
    inputsById,
  };
}
