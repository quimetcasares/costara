import type { CostaraDecimal } from './decimal.ts';

export type UnitDimensionCode = 'mass' | 'volume' | 'count' | 'length';

export type ItemKind = 'raw_material' | 'intermediate' | 'finished_product' | 'packaging';

export type RecipeVersionStatus = 'draft' | 'active' | 'archived';

export type QuantityMode = 'absolute' | 'percentage';

export type CostingSource = 'purchased' | 'produced';

export type CalculationStatus = 'complete' | 'incomplete' | 'error';

export interface UnitData {
  readonly id: string;
  readonly code: string;
  readonly nameSingular: string;
  readonly namePlural: string;
  readonly symbol: string;
  readonly dimensionId: string;
  readonly dimensionCode: UnitDimensionCode;
  readonly factorToBase: CostaraDecimal;
  readonly isBase: boolean;
}

export interface ItemData {
  readonly id: string;
  readonly businessId: string;
  readonly name: string;
  readonly kind: ItemKind;
  readonly baseUnitId: string;
  readonly purchasable: boolean;
  readonly producible: boolean;
  readonly sellable: boolean;
  readonly trackInventory: boolean;
  readonly isActive: boolean;
}

export interface RecipeData {
  readonly id: string;
  readonly businessId: string;
  readonly name: string;
  readonly outputItemId: string;
  readonly isActive: boolean;
}

export interface RecipeVersionData {
  readonly id: string;
  readonly businessId: string;
  readonly recipeId: string;
  readonly versionNumber: number;
  readonly status: RecipeVersionStatus;
  readonly referenceYieldQuantity: CostaraDecimal;
  readonly referenceYieldUnitId: string;
  readonly portionQuantity: CostaraDecimal | null;
  readonly portionUnitId: string | null;
  readonly yieldDescription: string | null;
  readonly changeReason: string | null;
  readonly notes: string | null;
  readonly effectiveFrom: Date | null;
}

export interface RecipeInputData {
  readonly id: string;
  readonly businessId: string;
  readonly recipeVersionId: string;
  readonly itemId: string;
  readonly position: number;
  readonly quantityMode: QuantityMode;
  readonly quantity: CostaraDecimal | null;
  readonly unitId: string | null;
  readonly percentage: CostaraDecimal | null;
  readonly costingSource: CostingSource | null;
  readonly notes: string | null;
}

export interface PercentageBaseData {
  readonly percentageInputId: string;
  readonly basisInputId: string;
}

export interface ItemCostVersionData {
  readonly id: string;
  readonly businessId: string;
  readonly itemId: string;
  readonly costAmount: CostaraDecimal;
  readonly costQuantity: CostaraDecimal;
  readonly unitId: string;
  readonly effectiveFrom: Date;
  readonly notes: string | null;
}

export interface ItemCostResolution {
  readonly applicableCost: ItemCostVersionData | null;
  readonly hasAnyCostEver: boolean;
  readonly firstAvailableCostAt: Date | null;
}

export interface CanonicalQuantity {
  readonly amount: CostaraDecimal;
  readonly dimensionCode: UnitDimensionCode;
  readonly universalBaseUnitId: string;
  readonly universalBaseUnitCode: string;
}

export interface CanonicalYield {
  readonly quantity: CostaraDecimal;
  readonly unitId: string;
  readonly unitCode: string;
  readonly canonicalQuantity: CostaraDecimal;
  readonly canonicalUnitCode: string;
  readonly dimensionCode: UnitDimensionCode;
}

export type ScaleTarget =
  | { readonly mode: 'yield'; readonly targetQuantity: CostaraDecimal; readonly unitId?: string; readonly unitCode?: string }
  | { readonly mode: 'output_pieces'; readonly targetPieces: CostaraDecimal };

export type CalculationIssueCode =
  | 'MISSING_PURCHASE_COST'
  | 'NO_COST_AS_OF_DATE'
  | 'MISSING_PERCENTAGE_BASE'
  | 'NO_RECIPE_FOR_PRODUCED_ITEM'
  | 'NO_RECIPE_AS_OF_DATE'
  | 'AMBIGUOUS_COSTING_SOURCE'
  | 'UNRESOLVABLE_OUTPUT_QUANTITY'
  | 'PERCENTAGE_DEPENDENCY_CYCLE'
  | 'RECIPE_DEPENDENCY_CYCLE'
  | 'INCOMPATIBLE_PERCENTAGE_BASE_DIMENSIONS'
  | 'INCOMPATIBLE_PERCENTAGE_ITEM_DIMENSION'
  | 'INCOMPATIBLE_INPUT_DIMENSION'
  | 'INVALID_SCALE_TARGET'
  | 'CANNOT_SCALE_BY_UNRESOLVABLE_OUTPUT'
  | 'INVALID_ITEM_CAPABILITIES'
  | 'BUSINESS_SCOPE_MISMATCH';

export interface CalculationIssue {
  readonly code: CalculationIssueCode;
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly path?: readonly string[];
  readonly itemId?: string;
  readonly itemName?: string;
  readonly inputId?: string;
  readonly recipeId?: string;
  readonly recipeVersionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ResolvedRecipeInput {
  readonly input: RecipeInputData;
  readonly item: ItemData;
  readonly canonicalQuantity: CostaraDecimal | null;
  readonly canonicalUnitCode: string;
  readonly dimensionCode: UnitDimensionCode;
  readonly isResolved: boolean;
  readonly issues: readonly CalculationIssue[];
}

export interface CostBreakdownNode {
  readonly inputId?: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly itemKind: ItemKind;
  readonly position: number;
  readonly quantityMode?: QuantityMode;
  readonly requestedQuantity?: CostaraDecimal;
  readonly requestedUnitCode?: string;
  readonly percentage?: CostaraDecimal;
  readonly canonicalQuantity: CostaraDecimal;
  readonly canonicalUnitCode: string;
  readonly costingSource: CostingSource;
  readonly status: CalculationStatus;
  readonly unitCostCanonical?: CostaraDecimal;
  readonly nodeMaterialCost?: CostaraDecimal;
  readonly applicableCostVersionId?: string;
  readonly applicableCostEffectiveFrom?: string;
  readonly applicableRecipeVersionId?: string;
  readonly isCostComplete: boolean;
  readonly issues: readonly CalculationIssue[];
  readonly children?: readonly CostBreakdownNode[];
}

export interface RecipeCalculationResult {
  readonly recipeId?: string;
  readonly recipeVersionId?: string;
  readonly recipeName: string;
  readonly outputItemId: string;
  readonly outputItemName: string;
  readonly businessId: string;
  readonly currencyCode: string;
  readonly asOf: string;
  readonly status: CalculationStatus;
  readonly scaleFactor: CostaraDecimal;

  readonly referenceYield: CanonicalYield;
  readonly scaledYield: CanonicalYield;
  readonly theoreticalPortions?: CostaraDecimal;
  readonly scaledPortions?: CostaraDecimal;

  readonly knownBatchMaterialCost: CostaraDecimal;
  readonly knownCostPerOutputUnit?: CostaraDecimal;
  readonly isCostComplete: boolean;

  readonly issues: readonly CalculationIssue[];
  readonly breakdown: readonly CostBreakdownNode[];
}

// Draft preview inputs
export interface RecipeVersionDraftInput {
  readonly id?: string;
  readonly businessId: string;
  readonly recipeId?: string;
  readonly versionNumber?: number;
  readonly referenceYieldQuantity: CostaraDecimal;
  readonly referenceYieldUnitId: string;
  readonly portionQuantity?: CostaraDecimal | null;
  readonly portionUnitId?: string | null;
  readonly yieldDescription?: string | null;
  readonly notes?: string | null;
}

export interface RecipeInputDraftInput {
  readonly id: string;
  readonly itemId: string;
  readonly position: number;
  readonly quantityMode: QuantityMode;
  readonly quantity?: CostaraDecimal | null;
  readonly unitId?: string | null;
  readonly percentage?: CostaraDecimal | null;
  readonly costingSource?: CostingSource | null;
  readonly notes?: string | null;
}

export interface PercentageBaseDraftInput {
  readonly percentageInputId: string;
  readonly basisInputId: string;
}
