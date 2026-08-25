import type {
  RecipeDataProvider,
  BusinessData,
} from '../domain/data/types.js';
import type {
  UnitData,
  ItemData,
  RecipeData,
  RecipeVersionData,
  RecipeInputData,
  PercentageBaseData,
  ItemCostVersionData,
  ItemCostResolution,
} from '../domain/calculation/types.js';

export interface InMemoryFixtures {
  readonly businesses?: readonly BusinessData[];
  readonly units?: readonly UnitData[];
  readonly items?: readonly ItemData[];
  readonly recipes?: readonly RecipeData[];
  readonly recipeVersions?: readonly RecipeVersionData[];
  readonly recipeInputs?: readonly RecipeInputData[];
  readonly percentageBases?: readonly PercentageBaseData[];
  readonly itemCostVersions?: readonly ItemCostVersionData[];
}

export class InMemoryRecipeRepository implements RecipeDataProvider {
  readonly businessId: string;
  private readonly fixtures: InMemoryFixtures;

  constructor(options: { businessId: string; fixtures?: InMemoryFixtures }) {
    this.businessId = options.businessId;
    this.fixtures = options.fixtures ?? {};
  }

  async getBusiness(): Promise<BusinessData | null> {
    const list = this.fixtures.businesses ?? [];
    return list.find((b) => b.id === this.businessId) ?? {
      id: this.businessId,
      name: 'Default Business',
      currencyCode: 'MXN',
      timezone: 'America/Mexico_City',
    };
  }

  async getRecipeById(recipeId: string): Promise<RecipeData | null> {
    const list = this.fixtures.recipes ?? [];
    return list.find((r) => r.id === recipeId && r.businessId === this.businessId) ?? null;
  }

  async getRecipeByOutputItemId(outputItemId: string): Promise<RecipeData | null> {
    const list = this.fixtures.recipes ?? [];
    return (
      list.find((r) => r.outputItemId === outputItemId && r.businessId === this.businessId && r.isActive) ??
      null
    );
  }

  async getActiveRecipeVersion(recipeId: string): Promise<RecipeVersionData | null> {
    const list = this.fixtures.recipeVersions ?? [];
    return (
      list.find(
        (rv) => rv.recipeId === recipeId && rv.businessId === this.businessId && rv.status === 'active'
      ) ?? null
    );
  }

  async getPublishedRecipeVersionAsOf(recipeId: string, asOf: Date): Promise<RecipeVersionData | null> {
    const list = this.fixtures.recipeVersions ?? [];
    const candidates = list.filter(
      (v) =>
        v.recipeId === recipeId &&
        v.businessId === this.businessId &&
        (v.status === 'active' || v.status === 'archived') &&
        v.effectiveFrom !== null &&
        v.effectiveFrom.getTime() <= asOf.getTime()
    );

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.effectiveFrom!.getTime() - a.effectiveFrom!.getTime());
    return candidates[0];
  }

  async getRecipeInputs(recipeVersionId: string): Promise<readonly RecipeInputData[]> {
    const list = this.fixtures.recipeInputs ?? [];
    return list
      .filter((i) => i.recipeVersionId === recipeVersionId && i.businessId === this.businessId)
      .sort((a, b) => a.position - b.position);
  }

  async getPercentageBases(recipeVersionId: string): Promise<readonly PercentageBaseData[]> {
    const inputs = await this.getRecipeInputs(recipeVersionId);
    const inputIds = new Set(inputs.map((i) => i.id));
    const list = this.fixtures.percentageBases ?? [];

    return list.filter((pb) => inputIds.has(pb.percentageInputId) && inputIds.has(pb.basisInputId));
  }

  async getItemCostResolution(itemId: string, asOf: Date): Promise<ItemCostResolution> {
    const list = this.fixtures.itemCostVersions ?? [];
    const itemCosts = list.filter(
      (c) => c.itemId === itemId && c.businessId === this.businessId
    );

    if (itemCosts.length === 0) {
      return {
        applicableCost: null,
        hasAnyCostEver: false,
        firstAvailableCostAt: null,
      };
    }

    const applicable = itemCosts
      .filter((c) => c.effectiveFrom.getTime() <= asOf.getTime())
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];

    if (applicable) {
      return {
        applicableCost: applicable,
        hasAnyCostEver: true,
        firstAvailableCostAt: null,
      };
    }

    // All costs are future relative to asOf
    const sortedAsc = [...itemCosts].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
    return {
      applicableCost: null,
      hasAnyCostEver: true,
      firstAvailableCostAt: sortedAsc[0].effectiveFrom,
    };
  }

  async getItem(itemId: string): Promise<ItemData | null> {
    const list = this.fixtures.items ?? [];
    return list.find((i) => i.id === itemId && i.businessId === this.businessId) ?? null;
  }

  async getUnit(unitId: string): Promise<UnitData | null> {
    const list = this.fixtures.units ?? [];
    return list.find((u) => u.id === unitId) ?? null;
  }

  async getAllUnits(): Promise<readonly UnitData[]> {
    return this.fixtures.units ?? [];
  }
}

export function createInMemoryRecipeDataProvider(options: {
  businessId: string;
  fixtures?: InMemoryFixtures;
}): RecipeDataProvider {
  return new InMemoryRecipeRepository(options);
}
