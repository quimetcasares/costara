import type {
  UnitData,
  ItemData,
  RecipeData,
  RecipeVersionData,
  RecipeInputData,
  PercentageBaseData,
  ItemCostResolution,
} from '../calculation/types.ts';

export interface BusinessData {
  readonly id: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly timezone: string;
}

/**
 * Data provider boundary for Costara recipe calculation engine.
 * Pure and business-scoped: every instance is bound to a specific businessId.
 */
export interface RecipeDataProvider {
  readonly businessId: string;

  getBusiness(): Promise<BusinessData | null>;

  getRecipeById(recipeId: string): Promise<RecipeData | null>;

  getRecipeByOutputItemId(outputItemId: string): Promise<RecipeData | null>;

  getActiveRecipeVersion(recipeId: string): Promise<RecipeVersionData | null>;

  getPublishedRecipeVersionAsOf(recipeId: string, asOf: Date): Promise<RecipeVersionData | null>;

  getRecipeInputs(recipeVersionId: string): Promise<readonly RecipeInputData[]>;

  getPercentageBases(recipeVersionId: string): Promise<readonly PercentageBaseData[]>;

  getItemCostResolution(itemId: string, asOf: Date): Promise<ItemCostResolution>;

  getItem(itemId: string): Promise<ItemData | null>;

  getUnit(unitId: string): Promise<UnitData | null>;

  getAllUnits(): Promise<readonly UnitData[]>;
}
