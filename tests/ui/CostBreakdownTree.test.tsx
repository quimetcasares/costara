import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostBreakdownTree } from '../../src/ui/components/recipes/CostBreakdownTree.js';
import { CostaraDecimal } from '../../src/domain/calculation/decimal.js';
import type { CostBreakdownNode } from '../../src/domain/calculation/types.js';

describe('CostBreakdownTree Component (Responsive & Unit Cost)', () => {
  const mockNodes: CostBreakdownNode[] = [
    {
      itemId: 'item-flour',
      itemName: 'Harina de Trigo',
      itemKind: 'raw_material',
      quantityMode: 'absolute',
      canonicalQuantity: new CostaraDecimal(9000),
      canonicalUnitCode: 'g',
      unitCostCanonical: new CostaraDecimal('0.024'),
      nodeMaterialCost: new CostaraDecimal('216.00'),
      isCostComplete: true,
      status: 'complete',
      depth: 0,
      costingSource: 'purchased',
      issues: [],
    },
    {
      itemId: 'item-water',
      itemName: 'Agua Purificada',
      itemKind: 'raw_material',
      quantityMode: 'percentage',
      percentage: new CostaraDecimal(75),
      canonicalQuantity: new CostaraDecimal(10500),
      canonicalUnitCode: 'g',
      unitCostCanonical: new CostaraDecimal('0.002'),
      nodeMaterialCost: new CostaraDecimal('21.00'),
      isCostComplete: true,
      status: 'complete',
      depth: 0,
      costingSource: 'purchased',
      issues: [],
    },
    {
      itemId: 'item-seeds',
      itemName: 'Semillas de Girasol',
      itemKind: 'raw_material',
      quantityMode: 'absolute',
      canonicalQuantity: new CostaraDecimal(500),
      canonicalUnitCode: 'g',
      unitCostCanonical: null,
      nodeMaterialCost: null,
      isCostComplete: false,
      status: 'incomplete',
      depth: 0,
      costingSource: 'purchased',
      issues: [],
    },
  ];

  it('renders both desktop table and mobile stacked card layouts with complete metrics', () => {
    render(<CostBreakdownTree nodes={mockNodes} currencyCode="MXN" />);

    // Item names present
    expect(screen.getAllByText('Harina de Trigo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Agua Purificada').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Semillas de Girasol').length).toBeGreaterThanOrEqual(1);

    // Adaptive unit cost formatting (BUG 8) - never $0.00
    expect(screen.getAllByText('$0.024 MXN / g').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$0.002 MXN / g').length).toBeGreaterThanOrEqual(1);

    // Line total costs
    expect(screen.getAllByText('$216.00 MXN').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$21.00 MXN').length).toBeGreaterThanOrEqual(1);

    // Status badges
    expect(screen.getAllByText('Completo').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Incompleto').length).toBeGreaterThanOrEqual(1);
  });
});
