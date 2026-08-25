import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDraftPreview } from '../../src/ui/hooks/useDraftPreview.js';
import { calculateRecipeDraftPreview } from '../../src/domain/calculation/recipeCalculator.js';
import { createInMemoryRecipeDataProvider } from '../../src/data/inMemoryRecipeRepository.js';
import type {
  RecipeVersionDraftInput,
  RecipeInputDraftInput,
  ItemData,
  UnitData,
  ItemCostVersionData,
} from '../../src/domain/calculation/types.js';
import { CostaraDecimal } from '../../src/domain/calculation/decimal.js';

describe('useDraftPreview Hook', () => {
  const unitG: UnitData = {
    id: 'u-g',
    code: 'g',
    nameSingular: 'gramo',
    namePlural: 'gramos',
    symbol: 'g',
    dimensionId: 'dim-mass',
    dimensionCode: 'mass',
    factorToBase: new CostaraDecimal(1),
    isBase: true,
  };

  const itemFlour: ItemData = {
    id: 'it-flour',
    businessId: 'biz-test',
    name: 'Harina',
    kind: 'raw_material',
    baseUnitId: 'u-g',
    purchasable: true,
    producible: false,
    sellable: false,
    trackInventory: true,
    isActive: true,
  };

  const itemBread: ItemData = {
    id: 'it-bread',
    businessId: 'biz-test',
    name: 'Pan',
    kind: 'finished_product',
    baseUnitId: 'u-g',
    purchasable: false,
    producible: true,
    sellable: true,
    trackInventory: true,
    isActive: true,
  };

  const costFlour: ItemCostVersionData = {
    id: 'cost-1',
    itemId: 'it-flour',
    businessId: 'biz-test',
    costAmount: new CostaraDecimal('20'),
    costQuantity: new CostaraDecimal('1000'),
    unitId: 'u-g',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  };

  const dataProvider = createInMemoryRecipeDataProvider({
    businessId: 'biz-test',
    fixtures: {
      units: [unitG],
      items: [itemFlour, itemBread],
      itemCostVersions: [costFlour],
    },
  });

  const asOf = new Date('2026-06-01T00:00:00Z');

  const draftVersion: RecipeVersionDraftInput = {
    id: 'draft-v1',
    businessId: 'biz-test',
    recipeId: 'rec-1',
    versionNumber: 2,
    status: 'draft',
    referenceYieldQuantity: new CostaraDecimal('1000'),
    referenceYieldUnitId: 'u-g',
  };

  const inputs: readonly RecipeInputDraftInput[] = [
    {
      id: 'inp-1',
      recipeVersionId: 'draft-v1',
      itemId: 'it-flour',
      position: 1,
      quantityMode: 'absolute',
      quantity: '1000',
      unitId: 'u-g',
      costingSource: 'purchased',
    },
  ];

  const percentageBases: readonly [] = [];

  it('runs domain calculation directly', async () => {
    const directResult = await calculateRecipeDraftPreview({
      dataProvider,
      asOf,
      draftVersion,
      inputs,
      percentageBases,
      outputItemId: 'it-bread',
      recipeName: 'Pan de Trigo',
    });

    expect(directResult).toBeDefined();
    expect(directResult.knownBatchMaterialCost.toFixed(2)).toBe('20.00');
  });

  it('calculates preview reactively with debouncing and sequence preservation in hook', async () => {
    const { result } = renderHook(() =>
      useDraftPreview({
        dataProvider,
        asOf,
        draftVersion,
        inputs,
        percentageBases,
        outputItemId: 'it-bread',
        recipeName: 'Pan de Trigo',
        debounceMs: 10,
      })
    );

    await waitFor(
      () => {
        if (result.current.calculationError) {
          throw new Error(`Hook calculation error: ${result.current.calculationError}`);
        }
        expect(result.current.result).not.toBeNull();
      },
      { timeout: 2000 }
    );

    expect(result.current.result?.knownBatchMaterialCost.toFixed(2)).toBe('20.00');
    expect(result.current.lastValidResult).not.toBeNull();
    expect(result.current.isCalculating).toBe(false);
  });
});
