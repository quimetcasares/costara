import type { SupabaseClient } from '@supabase/supabase-js';
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
  UnitDimensionCode,
  ItemKind,
  RecipeVersionStatus,
  QuantityMode,
  CostingSource,
} from '../domain/calculation/types.js';
import {
  fromDatabaseNumeric,
  fromDatabaseNumericRequired,
} from '../domain/calculation/decimal.js';

export class SupabaseRecipeRepository implements RecipeDataProvider {
  readonly businessId: string;
  private readonly client: SupabaseClient;

  // Local in-request cache for units and items
  private unitsCache: Map<string, UnitData> | null = null;

  constructor(options: { businessId: string; client: SupabaseClient }) {
    this.businessId = options.businessId;
    this.client = options.client;
  }

  async getBusiness(): Promise<BusinessData | null> {
    const { data, error } = await this.client
      .from('businesses')
      .select('id, name, currency_code, timezone')
      .eq('id', this.businessId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      currencyCode: data.currency_code,
      timezone: data.timezone,
    };
  }

  async getRecipeById(recipeId: string): Promise<RecipeData | null> {
    const { data, error } = await this.client
      .from('recipes')
      .select('id, business_id, name, output_item_id, is_active')
      .eq('business_id', this.businessId)
      .eq('id', recipeId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      businessId: data.business_id,
      name: data.name,
      outputItemId: data.output_item_id,
      isActive: data.is_active,
    };
  }

  async getRecipeByOutputItemId(outputItemId: string): Promise<RecipeData | null> {
    const { data, error } = await this.client
      .from('recipes')
      .select('id, business_id, name, output_item_id, is_active')
      .eq('business_id', this.businessId)
      .eq('output_item_id', outputItemId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      businessId: data.business_id,
      name: data.name,
      outputItemId: data.output_item_id,
      isActive: data.is_active,
    };
  }

  async getPublishedRecipeVersionAsOf(recipeId: string, asOf: Date): Promise<RecipeVersionData | null> {
    const asOfIso = asOf.toISOString();
    const { data, error } = await this.client
      .from('recipe_versions')
      .select(
        'id, business_id, recipe_id, version_number, status, reference_yield_quantity::text, reference_yield_unit_id, portion_quantity::text, portion_unit_id, yield_description, change_reason, notes, effective_from'
      )
      .eq('business_id', this.businessId)
      .eq('recipe_id', recipeId)
      .in('status', ['active', 'archived'])
      .lte('effective_from', asOfIso)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      businessId: data.business_id,
      recipeId: data.recipe_id,
      versionNumber: data.version_number,
      status: data.status as RecipeVersionStatus,
      referenceYieldQuantity: fromDatabaseNumericRequired(
        data.reference_yield_quantity as string,
        'reference_yield_quantity'
      ),
      referenceYieldUnitId: data.reference_yield_unit_id,
      portionQuantity: fromDatabaseNumeric(data.portion_quantity as string | null),
      portionUnitId: data.portion_unit_id,
      yieldDescription: data.yield_description,
      changeReason: data.change_reason,
      notes: data.notes,
      effectiveFrom: data.effective_from ? new Date(data.effective_from) : null,
    };
  }

  async getRecipeInputs(recipeVersionId: string): Promise<readonly RecipeInputData[]> {
    const { data, error } = await this.client
      .from('recipe_inputs')
      .select(
        'id, business_id, recipe_version_id, item_id, position, quantity_mode, quantity::text, unit_id, percentage::text, costing_source, notes'
      )
      .eq('business_id', this.businessId)
      .eq('recipe_version_id', recipeVersionId)
      .order('position', { ascending: true });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      businessId: row.business_id,
      recipeVersionId: row.recipe_version_id,
      itemId: row.item_id,
      position: row.position,
      quantityMode: row.quantity_mode as QuantityMode,
      quantity: fromDatabaseNumeric(row.quantity as string | null),
      unitId: row.unit_id,
      percentage: fromDatabaseNumeric(row.percentage as string | null),
      costingSource: row.costing_source as CostingSource | null,
      notes: row.notes,
    }));
  }

  async getPercentageBases(recipeVersionId: string): Promise<readonly PercentageBaseData[]> {
    const { data, error } = await this.client
      .from('recipe_input_percentage_bases')
      .select('percentage_input_id, basis_input_id')
      .eq('business_id', this.businessId)
      .eq('recipe_version_id', recipeVersionId);

    if (error || !data) return [];

    return data.map((row) => ({
      percentageInputId: row.percentage_input_id,
      basisInputId: row.basis_input_id,
    }));
  }

  async getItemCostResolution(itemId: string, asOf: Date): Promise<ItemCostResolution> {
    const { data, error } = await this.client
      .from('item_cost_versions')
      .select(
        'id, business_id, item_id, cost_amount::text, cost_quantity::text, unit_id, effective_from, notes'
      )
      .eq('business_id', this.businessId)
      .eq('item_id', itemId)
      .order('effective_from', { ascending: false });

    if (error || !data || data.length === 0) {
      return {
        applicableCost: null,
        hasAnyCostEver: false,
        firstAvailableCostAt: null,
      };
    }

    const asOfTime = asOf.getTime();
    let applicable: ItemCostVersionData | null = null;
    let earliestDate: Date | null = null;

    for (const row of data) {
      const effDate = new Date(row.effective_from);
      if (effDate.getTime() <= asOfTime) {
        applicable = {
          id: row.id,
          businessId: row.business_id,
          itemId: row.item_id,
          costAmount: fromDatabaseNumericRequired(row.cost_amount as string, 'cost_amount'),
          costQuantity: fromDatabaseNumericRequired(row.cost_quantity as string, 'cost_quantity'),
          unitId: row.unit_id,
          effectiveFrom: effDate,
          notes: row.notes,
        };
        break; // First match is most recent <= asOf
      }

      if (earliestDate === null || effDate.getTime() < earliestDate.getTime()) {
        earliestDate = effDate;
      }
    }

    if (applicable) {
      return {
        applicableCost: applicable,
        hasAnyCostEver: true,
        firstAvailableCostAt: null,
      };
    }

    return {
      applicableCost: null,
      hasAnyCostEver: true,
      firstAvailableCostAt: earliestDate,
    };
  }

  async getItem(itemId: string): Promise<ItemData | null> {
    const { data, error } = await this.client
      .from('items')
      .select(
        'id, business_id, name, kind, base_unit_id, purchasable, producible, sellable, track_inventory, is_active'
      )
      .eq('business_id', this.businessId)
      .eq('id', itemId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      businessId: data.business_id,
      name: data.name,
      kind: data.kind as ItemKind,
      baseUnitId: data.base_unit_id,
      purchasable: data.purchasable,
      producible: data.producible,
      sellable: data.sellable,
      trackInventory: data.track_inventory,
      isActive: data.is_active,
    };
  }

  async getUnit(unitId: string): Promise<UnitData | null> {
    const units = await this.getAllUnits();
    return units.find((u) => u.id === unitId) ?? null;
  }

  async getAllUnits(): Promise<readonly UnitData[]> {
    if (this.unitsCache) {
      return Array.from(this.unitsCache.values());
    }

    const { data, error } = await this.client
      .from('units')
      .select(
        'id, code, name_singular, name_plural, symbol, dimension_id, factor_to_base::text, is_base, unit_dimensions(code)'
      );

    if (error || !data) return [];

    const map = new Map<string, UnitData>();
    for (const row of data) {
      // Dimension code from joined table or fallback
      const dimCode = (row as any).unit_dimensions?.code as UnitDimensionCode ?? 'mass';
      const unit: UnitData = {
        id: row.id,
        code: row.code,
        nameSingular: row.name_singular,
        namePlural: row.name_plural,
        symbol: row.symbol,
        dimensionId: row.dimension_id,
        dimensionCode: dimCode,
        factorToBase: fromDatabaseNumericRequired(row.factor_to_base as string, 'factor_to_base'),
        isBase: row.is_base,
      };
      map.set(unit.id, unit);
    }

    this.unitsCache = map;
    return Array.from(map.values());
  }
}

export function createSupabaseRecipeDataProvider(options: {
  businessId: string;
  client: SupabaseClient;
}): RecipeDataProvider {
  return new SupabaseRecipeRepository(options);
}
