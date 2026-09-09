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

  it('renders yieldDescription and discrete output for piece output without saying "A granel" (Pan de Deus)', () => {
    const calculation: RecipeCalculationResult = {
      recipeId: 'rec-pan-de-deus',
      recipeName: 'Pan de Deus con Crema de Limón',
      outputItemId: 'item-pan-de-deus',
      outputItemName: 'Pan de Deus',
      businessId: 'biz-1',
      currencyCode: 'MXN',
      asOf: '2026-06-01T00:00:00Z',
      status: 'complete',
      scaleFactor: new CostaraDecimal(1),
      referenceYield: {
        quantity: new CostaraDecimal(8),
        unitId: 'unit-piece',
        unitCode: 'piece',
        canonicalQuantity: new CostaraDecimal(8),
        canonicalUnitCode: 'piece',
        dimensionCode: 'count',
      },
      scaledYield: {
        quantity: new CostaraDecimal(8),
        unitId: 'unit-piece',
        unitCode: 'piece',
        canonicalQuantity: new CostaraDecimal(8),
        canonicalUnitCode: 'piece',
        dimensionCode: 'count',
      },
      knownBatchMaterialCost: new CostaraDecimal('56.14588'),
      knownCostPerOutputUnit: new CostaraDecimal('7.018235'),
      isCostComplete: true,
      issues: [],
      breakdown: [],
    };

    const yieldDescription =
      '8 piezas terminadas. División nominal de 70 g de masa cruda por pieza antes de relleno y horneado.';

    render(
      <RecipeCostSummary
        calculation={calculation}
        currencyCode="MXN"
        yieldDescription={yieldDescription}
      />
    );

    // 1. Shows output yield
    expect(screen.getByText('8 piezas')).toBeTruthy();

    // 2. Shows yieldDescription
    expect(screen.getByText('Detalle de rendimiento')).toBeTruthy();
    expect(screen.getByText(yieldDescription)).toBeTruthy();

    // 3. Cost per unit
    expect(screen.getByText('$7.02 MXN / piece')).toBeTruthy();

    // 4. Does NOT show "A granel (sin porciones)"
    expect(screen.queryByText(/A granel \(sin porciones\)/i)).toBeNull();

    // 5. Shows discrete output indication
    expect(screen.getByText('Salida discreta: 8 piezas')).toBeTruthy();
  });

  it('maintains "A granel (sin porciones)" for bulk mass output without portion_quantity (Masa Madre demo)', () => {
    const calculation: RecipeCalculationResult = {
      recipeId: 'rec-mm',
      recipeName: 'Masa Madre Activa',
      outputItemId: 'item-mm',
      outputItemName: 'Masa Madre Activa',
      businessId: 'biz-1',
      currencyCode: 'MXN',
      asOf: '2026-06-01T00:00:00Z',
      status: 'complete',
      scaleFactor: new CostaraDecimal(1),
      referenceYield: {
        quantity: new CostaraDecimal(1000),
        unitId: 'unit-g',
        unitCode: 'g',
        canonicalQuantity: new CostaraDecimal(1000),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
      },
      scaledYield: {
        quantity: new CostaraDecimal(1000),
        unitId: 'unit-g',
        unitCode: 'g',
        canonicalQuantity: new CostaraDecimal(1000),
        canonicalUnitCode: 'g',
        dimensionCode: 'mass',
      },
      knownBatchMaterialCost: new CostaraDecimal('15.00'),
      knownCostPerOutputUnit: new CostaraDecimal('0.015'),
      isCostComplete: true,
      issues: [],
      breakdown: [],
    };

    render(
      <RecipeCostSummary
        calculation={calculation}
        currencyCode="MXN"
        yieldDescription={null}
      />
    );

    expect(screen.getByText('1 kg')).toBeTruthy();
    expect(screen.getByText('$0.02 MXN / g')).toBeTruthy();
    expect(screen.getByText('A granel (sin porciones)')).toBeTruthy();
    expect(screen.queryByText('Detalle de rendimiento')).toBeNull();
  });
});
