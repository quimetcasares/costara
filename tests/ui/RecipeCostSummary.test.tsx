import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecipeCostSummary } from '../../src/ui/components/recipes/RecipeCostSummary.js';
import { CostaraDecimal } from '../../src/domain/calculation/decimal.js';
import type { RecipeCalculationResult } from '../../src/domain/calculation/types.js';

describe('RecipeCostSummary Component', () => {
  it('correctly separates mass/volume unit cost from portion cost (BUG 1 regression test)', () => {
    const calculation: RecipeCalculationResult = {
      recipeId: 'rec-1',
      recipeName: 'Hogaza Rústica',
      outputItemId: 'item-bread',
      outputItemName: 'Pan Rústico',
      businessId: 'biz-1',
      currencyCode: 'MXN',
      asOf: '2026-06-15T00:00:00Z',
      status: 'complete',
      scaleFactor: new CostaraDecimal(1),
      referenceYield: {
        quantity: new CostaraDecimal(14000),
        unitId: 'unit-g',
        unitCode: 'g',
        canonicalQuantity: new CostaraDecimal(14000),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
      },
      scaledYield: {
        quantity: new CostaraDecimal(14000),
        unitId: 'unit-g',
        unitCode: 'g',
        canonicalQuantity: new CostaraDecimal(14000),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
      },
      theoreticalPortions: new CostaraDecimal(14),
      scaledPortions: new CostaraDecimal(14),
      knownBatchMaterialCost: new CostaraDecimal('416.76'),
      knownCostPerOutputUnit: new CostaraDecimal('29.768571428571'),
      isCostComplete: true,
      issues: [],
      breakdown: [],
    };

    render(<RecipeCostSummary calculation={calculation} currencyCode="MXN" />);

    // Batch Total Cost
    expect(screen.getByText('$416.76 MXN')).toBeTruthy();

    // Mass/Volume cost: 416.76 / 14000g = 0.029768... MXN / g -> $0.03 MXN / g
    expect(screen.getByText('$0.03 MXN / g')).toBeTruthy();

    // Portion cost: 416.76 / 14 = 29.768571... MXN / pieza -> $29.77 MXN / pieza
    expect(screen.getByText('$29.77 MXN / pieza')).toBeTruthy();
  });

  it('handles kg reference yield unit appropriately', () => {
    const calculation: RecipeCalculationResult = {
      recipeId: 'rec-1',
      recipeName: 'Hogaza Rústica en Kg',
      outputItemId: 'item-bread',
      outputItemName: 'Pan Rústico',
      businessId: 'biz-1',
      currencyCode: 'MXN',
      asOf: '2026-06-15T00:00:00Z',
      status: 'complete',
      scaleFactor: new CostaraDecimal(1),
      referenceYield: {
        quantity: new CostaraDecimal(14),
        unitId: 'unit-kg',
        unitCode: 'kg',
        canonicalQuantity: new CostaraDecimal(14000),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
      },
      scaledYield: {
        quantity: new CostaraDecimal(14),
        unitId: 'unit-kg',
        unitCode: 'kg',
        canonicalQuantity: new CostaraDecimal(14000),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
      },
      theoreticalPortions: new CostaraDecimal(14),
      scaledPortions: new CostaraDecimal(14),
      knownBatchMaterialCost: new CostaraDecimal('416.76'),
      isCostComplete: true,
      issues: [],
      breakdown: [],
    };

    render(<RecipeCostSummary calculation={calculation} currencyCode="MXN" />);

    // Mass/Volume cost: 416.76 / 14kg = 29.768... MXN / kg -> $29.77 MXN / kg
    expect(screen.getByText('$29.77 MXN / kg')).toBeTruthy();

    // Portion cost: $29.77 MXN / pieza
    expect(screen.getByText('$29.77 MXN / pieza')).toBeTruthy();
  });
});
