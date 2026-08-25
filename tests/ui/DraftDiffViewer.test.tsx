import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DraftDiffViewer } from '../../src/ui/components/draft/DraftDiffViewer.js';
import { CostaraDecimal } from '../../src/domain/calculation/decimal.js';
import type { RecipeVersionData, RecipeInputData, ItemData, UnitData } from '../../src/domain/calculation/types.js';

describe('DraftDiffViewer Component (Responsive comparison)', () => {
  const activeVersion: RecipeVersionData = {
    id: 'ver-1',
    businessId: 'biz-1',
    recipeId: 'rec-1',
    versionNumber: 2,
    status: 'active',
    referenceYieldQuantity: new CostaraDecimal(14000),
    referenceYieldUnitId: 'u-g',
    portionQuantity: new CostaraDecimal(1000),
    portionUnitId: 'u-g',
    effectiveFrom: new Date('2026-01-01T06:00:00Z'),
  };

  const activeInputs: RecipeInputData[] = [
    {
      id: 'inp-1',
      recipeVersionId: 'ver-1',
      itemId: 'it-water',
      position: 1,
      quantityMode: 'percentage',
      percentage: new CostaraDecimal(72),
      costingSource: 'purchased',
    },
    {
      id: 'inp-2',
      recipeVersionId: 'ver-1',
      itemId: 'it-salt',
      position: 2,
      quantityMode: 'absolute',
      quantity: new CostaraDecimal(280),
      unitId: 'u-g',
      costingSource: 'purchased',
    },
  ];

  const draftInputs = [
    {
      id: 'd-inp-1',
      itemId: 'it-water',
      position: 1,
      quantityMode: 'percentage' as const,
      percentage: '75',
      costingSource: 'purchased' as const,
    },
    {
      id: 'd-inp-2',
      itemId: 'it-salt',
      position: 2,
      quantityMode: 'absolute' as const,
      quantity: '280',
      unitId: 'u-g',
      costingSource: 'purchased' as const,
    },
    {
      id: 'd-inp-3',
      itemId: 'it-seeds',
      position: 3,
      quantityMode: 'absolute' as const,
      quantity: '500',
      unitId: 'u-g',
      costingSource: 'purchased' as const,
    },
  ];

  const availableItems: ItemData[] = [
    { id: 'it-water', businessId: 'biz-1', name: 'Agua Purificada', kind: 'raw_material', baseUnitId: 'u-g', purchasable: true, producible: false, sellable: false, trackInventory: true, isActive: true },
    { id: 'it-salt', businessId: 'biz-1', name: 'Sal Fina', kind: 'raw_material', baseUnitId: 'u-g', purchasable: true, producible: false, sellable: false, trackInventory: true, isActive: true },
    { id: 'it-seeds', businessId: 'biz-1', name: 'Semillas de Girasol', kind: 'raw_material', baseUnitId: 'u-g', purchasable: true, producible: false, sellable: false, trackInventory: true, isActive: true },
  ];

  const availableUnits: UnitData[] = [
    { id: 'u-g', businessId: null, name: 'Gramo', code: 'g', dimension: 'mass', factorToBase: new CostaraDecimal(1), isBase: true },
  ];

  it('renders diff with modified, unchanged and added items without crashing', () => {
    render(
      <DraftDiffViewer
        activeVersion={activeVersion}
        activeInputs={activeInputs}
        draftYield={{ referenceYieldQuantity: '14000', referenceYieldUnitId: 'u-g' }}
        draftInputs={draftInputs}
        availableItems={availableItems}
        availableUnits={availableUnits}
      />
    );

    expect(screen.getAllByText('Agua Purificada').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sal Fina').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Semillas de Girasol').length).toBeGreaterThanOrEqual(1);

    expect(screen.getAllByText('Modificado').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sin cambio').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThanOrEqual(1);
  });
});
