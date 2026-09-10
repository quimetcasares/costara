import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StartRunModal } from '../../src/ui/components/production/StartRunModal.js';
import type { ProductionTargetWithRuns } from '../../src/data/productionExecutionService.js';

describe('StartRunModal component tests', () => {
  const mockTarget: ProductionTargetWithRuns = {
    id: 'target-1',
    business_id: 'b-1',
    production_plan_id: 'plan-1',
    target_date: '2026-09-09',
    item_id: 'item-hogaza',
    item_name: 'Hogaza Rústica',
    recipe_version_id: 'rv-1',
    target_quantity: '8',
    unit_id: 'u-piece',
    unit_code: 'piece',
    notes: null,
    runs: [],
    total_runs_count: 0,
    active_or_completed_runs_count: 0,
    in_progress_runs_count: 0,
    completed_runs_count: 0,
    cancelled_runs_count: 0,
    total_completed_yield: '0',
    suggested_remaining_quantity: '8',
    is_fulfilled: false,
  };

  it('localizes piece unit to "piezas" and "pieza" dynamically as quantity changes', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <StartRunModal
        target={mockTarget}
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Initial with 8 pieces
    expect(screen.getByText(/Meta total: 8 piezas/i)).toBeTruthy();
    expect(screen.getByText(/Cantidad para este lote \(piezas\) \*/i)).toBeTruthy();

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('8');

    // Change input to 1
    fireEvent.change(input, { target: { value: '1' } });
    expect(screen.getByText('pieza')).toBeTruthy();

    // Change input back to 4
    fireEvent.change(input, { target: { value: '4' } });
    expect(screen.getAllByText('piezas').length).toBeGreaterThan(0);
  });
});
