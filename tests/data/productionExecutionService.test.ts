import { describe, it, expect, vi } from 'vitest';
import {
  loadProductionDay,
  loadProductionRun,
  confirmPlannedInputsNominal,
  updateRunInputActual,
  addUnplannedInput,
  deleteUnplannedInput,
  completeProductionRun,
  cancelProductionRun,
  updateProductionRunNotes,
  startTargetProductionRun,
  loadAvailableItems,
  type ProductionRunInputDetail,
} from '../../src/data/productionExecutionService.js';

describe('productionExecutionService unit tests (M2C.1)', () => {
  const businessId = 'b0000000-0000-0000-0000-000000000001';
  const targetId = 't0000000-0000-0000-0000-000000000001';
  const runId = 'r0000000-0000-0000-0000-000000000001';

  it('loadProductionDay calculates target metrics, suggested remaining, and groups runs', async () => {
    const mockTargets = [
      {
        id: targetId,
        business_id: businessId,
        production_plan_id: 'p1',
        target_date: '2026-09-09',
        item_id: 'item-1',
        recipe_version_id: 'rv-1',
        target_quantity: '14.000',
        unit_id: 'u-kg',
        notes: 'Meta diaria',
        items: { id: 'item-1', name: 'Pan de Muerto' },
        units: { id: 'u-kg', code: 'kg' },
      },
    ];

    const mockRuns = [
      {
        id: runId,
        business_id: businessId,
        production_target_id: targetId,
        recipe_version_id: 'rv-1',
        status: 'completed',
        planned_yield_quantity: '7.000',
        planned_yield_unit_id: 'u-kg',
        actual_yield_quantity: '7.200',
        actual_yield_unit_id: 'u-kg',
        scheduled_date: '2026-09-09',
        started_at: '2026-09-09T08:00:00Z',
        completed_at: '2026-09-09T10:00:00Z',
        notes: 'Lote 1 terminado',
        planned_unit: { id: 'u-kg', code: 'kg' },
        actual_unit: { id: 'u-kg', code: 'kg' },
        recipe_versions: {
          recipe_id: 'rec-1',
          recipes: {
            id: 'rec-1',
            name: 'Pan de Muerto',
            output_item_id: 'item-1',
            items: { id: 'item-1', name: 'Pan de Muerto' },
          },
        },
      },
      {
        id: 'unplanned-run-1',
        business_id: businessId,
        production_target_id: null,
        recipe_version_id: 'rv-2',
        status: 'in_progress',
        planned_yield_quantity: '5.000',
        planned_yield_unit_id: 'u-kg',
        actual_yield_quantity: null,
        actual_yield_unit_id: null,
        scheduled_date: '2026-09-09',
        started_at: '2026-09-09T11:00:00Z',
        completed_at: null,
        notes: null,
        planned_unit: { id: 'u-kg', code: 'kg' },
        actual_unit: null,
        recipe_versions: {
          recipe_id: 'rec-2',
          recipes: {
            id: 'rec-2',
            name: 'Baguette',
            output_item_id: 'item-2',
            items: { id: 'item-2', name: 'Baguette' },
          },
        },
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'production_targets') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockTargets, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'production_runs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockRuns, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const result = await loadProductionDay(mockSupabase, businessId, '2026-09-09');

    expect(result.targets).toHaveLength(1);
    const target = result.targets[0];
    expect(target.item_name).toBe('Pan de Muerto');
    expect(target.target_quantity).toBe('14');
    expect(target.total_completed_yield).toBe('7.2');
    // target was 14, completed 7.2 => remaining is 14 - 7.2 = 6.8
    expect(target.suggested_remaining_quantity).toBe('6.8');
    expect(target.is_fulfilled).toBe(false);
    expect(target.runs).toHaveLength(1);

    expect(result.unplannedRuns).toHaveLength(1);
    expect(result.unplannedRuns[0].id).toBe('unplanned-run-1');
  });

  it('loadProductionRun maps nominal and unplanned inputs with difference calculation', async () => {
    const mockRun = {
      id: runId,
      business_id: businessId,
      production_target_id: targetId,
      recipe_version_id: 'rv-1',
      status: 'in_progress',
      planned_yield_quantity: '7.000',
      planned_yield_unit_id: 'u-kg',
      actual_yield_quantity: null,
      actual_yield_unit_id: null,
      scheduled_date: '2026-09-09',
      started_at: '2026-09-09T08:00:00Z',
      completed_at: null,
      notes: 'En proceso',
      planned_unit: { id: 'u-kg', code: 'kg' },
      actual_unit: null,
      recipe_versions: {
        recipe_id: 'rec-1',
        recipes: {
          id: 'rec-1',
          name: 'Pan de Muerto',
          output_item_id: 'item-1',
          items: { id: 'item-1', name: 'Pan de Muerto' },
        },
      },
    };

    const mockInputs = [
      {
        id: 'inp-1',
        business_id: businessId,
        production_run_id: runId,
        recipe_input_id: 'ri-1',
        item_id: 'harina-id',
        position: 1,
        planned_quantity: '5.000',
        planned_unit_id: 'u-kg',
        actual_quantity: '5.200',
        actual_unit_id: 'u-kg',
        notes: null,
        items: { id: 'harina-id', name: 'Harina Fuerte' },
        planned_unit: { id: 'u-kg', code: 'kg' },
        actual_unit: { id: 'u-kg', code: 'kg' },
      },
      {
        id: 'inp-2',
        business_id: businessId,
        production_run_id: runId,
        recipe_input_id: null, // Unplanned input
        item_id: 'agua-id',
        position: 2,
        planned_quantity: '0',
        planned_unit_id: null,
        actual_quantity: '0.100',
        actual_unit_id: 'u-l',
        notes: 'Ajuste de humedad',
        items: { id: 'agua-id', name: 'Agua' },
        planned_unit: null,
        actual_unit: { id: 'u-l', code: 'L' },
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'production_runs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockRun, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'production_run_inputs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockInputs, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const detail = await loadProductionRun(mockSupabase, businessId, runId);
    expect(detail.id).toBe(runId);
    expect(detail.inputs).toHaveLength(2);

    const nominal = detail.inputs[0];
    expect(nominal.is_unplanned).toBe(false);
    expect(nominal.planned_quantity).toBe('5');
    expect(nominal.actual_quantity).toBe('5.2');
    expect(nominal.difference).toBe('0.2');

    const unplanned = detail.inputs[1];
    expect(unplanned.is_unplanned).toBe(true);
    expect(unplanned.difference).toBeNull();
  });

  it('confirmPlannedInputsNominal updates only pending nominal inputs to planned values', async () => {
    const inputs: ProductionRunInputDetail[] = [
      {
        id: 'inp-1',
        business_id: businessId,
        production_run_id: runId,
        recipe_input_id: 'ri-1',
        item_id: 'item-1',
        item_name: 'Harina',
        position: 1,
        planned_quantity: '4.5',
        planned_unit_id: 'u-kg',
        planned_unit_code: 'kg',
        actual_quantity: null, // Pending!
        actual_unit_id: null,
        actual_unit_code: null,
        notes: null,
        is_unplanned: false,
        difference: null,
      },
      {
        id: 'inp-2',
        business_id: businessId,
        production_run_id: runId,
        recipe_input_id: 'ri-2',
        item_id: 'item-2',
        item_name: 'Azúcar',
        position: 2,
        planned_quantity: '1',
        planned_unit_id: 'u-kg',
        planned_unit_code: 'kg',
        actual_quantity: '1', // Already confirmed
        actual_unit_id: 'u-kg',
        actual_unit_code: 'kg',
        notes: null,
        is_unplanned: false,
        difference: '0',
      },
      {
        id: 'inp-3',
        business_id: businessId,
        production_run_id: runId,
        recipe_input_id: null, // Unplanned, should not be touched
        item_id: 'item-3',
        item_name: 'Levadura',
        position: 3,
        planned_quantity: '0',
        planned_unit_id: null,
        planned_unit_code: null,
        actual_quantity: null,
        actual_unit_id: null,
        actual_unit_code: null,
        notes: null,
        is_unplanned: true,
        difference: null,
      },
    ];

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        update: updateMock,
      }),
    } as any;

    await confirmPlannedInputsNominal(mockSupabase, inputs);

    // Only inp-1 should have been updated
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      actual_quantity: '4.5',
      actual_unit_id: 'u-kg',
    });
  });

  it('startTargetProductionRun invokes Edge Function and handles 409 conflict properly', async () => {
    const invokeMock = vi.fn().mockResolvedValue({
      data: { run_id: runId, idempotent: false },
      error: null,
    });

    const mockSupabase = {
      functions: {
        invoke: invokeMock,
      },
    } as any;

    const result = await startTargetProductionRun(mockSupabase, {
      runId,
      businessId,
      targetId,
      runScaleTarget: { mode: 'yield', targetQuantity: '7', unitId: 'u-kg' },
    });

    expect(result.runId).toBe(runId);
    expect(invokeMock).toHaveBeenCalledWith('start-production-run', {
      body: {
        runId,
        businessId,
        targetId,
        runScaleTarget: { mode: 'yield', targetQuantity: '7', unitId: 'u-kg' },
        notes: null,
      },
    });

    // Test 409 conflict handling
    const conflictMockSupabase = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: {
            message: 'Conflict',
            context: {
              json: async () => ({ code: 'RECIPE_VERSION_CONFLICT' }),
            },
          },
        }),
      },
    } as any;

    await expect(
      startTargetProductionRun(conflictMockSupabase, {
        runId,
        businessId,
        targetId,
        runScaleTarget: { mode: 'yield', targetQuantity: '7', unitId: 'u-kg' },
      })
    ).rejects.toThrow('La receta cambió desde que se planeó esta producción.');
  });

  it('cancelProductionRun transforms physical consumption error into human explanation', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      error: { message: 'Cannot cancel production run with existing physical consumptions' },
    });

    const mockSupabase = {
      rpc: rpcMock,
    } as any;

    await expect(
      cancelProductionRun(mockSupabase, runId, 'Cancel reason')
    ).rejects.toThrow(
      'No se puede cancelar una corrida con consumos reales registrados. Si no se consumió nada, ponga las cantidades reales en 0 o vacías.'
    );
  });

  it('updateRunInputActual updates actual quantity and notes for an input', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as any;

    await updateRunInputActual(mockSupabase, 'inp-1', '4.8', 'u-kg', 'Ajuste de harina');
    expect(updateMock).toHaveBeenCalledWith({
      actual_quantity: '4.8',
      actual_unit_id: 'u-kg',
      notes: 'Ajuste de harina',
    });
  });

  it('addUnplannedInput, deleteUnplannedInput, completeProductionRun, updateProductionRunNotes call their respective RPCs', async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: 'ok', error: null });
    const mockSupabase = { rpc: rpcMock } as any;

    await addUnplannedInput(mockSupabase, {
      inputId: 'inp-new',
      runId,
      itemId: 'item-new',
      actualQuantity: '0.5',
      actualUnitId: 'u-kg',
      notes: 'Extra',
    });
    expect(rpcMock).toHaveBeenCalledWith('add_unplanned_production_run_input', {
      p_input_id: 'inp-new',
      p_run_id: runId,
      p_item_id: 'item-new',
      p_actual_quantity: '0.5',
      p_actual_unit_id: 'u-kg',
      p_notes: 'Extra',
    });

    await deleteUnplannedInput(mockSupabase, 'inp-new');
    expect(rpcMock).toHaveBeenCalledWith('delete_unplanned_production_run_input', {
      p_input_id: 'inp-new',
    });

    await completeProductionRun(mockSupabase, {
      runId,
      actualYieldQuantity: '7.2',
      actualYieldUnitId: 'u-kg',
      notes: 'Lote finalizado',
    });
    expect(rpcMock).toHaveBeenCalledWith('complete_production_run', {
      p_run_id: runId,
      p_actual_yield_quantity: '7.2',
      p_actual_yield_unit_id: 'u-kg',
      p_completed_at: null,
      p_notes: 'Lote finalizado',
    });

    await updateProductionRunNotes(mockSupabase, runId, 'Nuevas notas');
    expect(rpcMock).toHaveBeenCalledWith('update_production_run_notes', {
      p_run_id: runId,
      p_notes: 'Nuevas notas',
    });
  });

  it('preserves exact decimal precision avoiding IEEE-754 float drift', async () => {
    // 1. Target 0.3 with runs 0.1 and 0.2 completes exactly to 0.3 with 0 remaining (no 5.55e-17)
    const mockTargets = [
      {
        id: targetId,
        business_id: businessId,
        production_plan_id: 'p1',
        target_date: '2026-09-09',
        item_id: 'item-1',
        recipe_version_id: 'rv-1',
        target_quantity: '0.3',
        unit_id: 'u-kg',
        notes: null,
        items: { id: 'item-1', name: 'Pan Fino' },
        units: { id: 'u-kg', code: 'kg' },
      },
    ];

    const mockRuns = [
      {
        id: 'run-01',
        business_id: businessId,
        production_target_id: targetId,
        recipe_version_id: 'rv-1',
        status: 'completed',
        planned_yield_quantity: '0.1',
        planned_yield_unit_id: 'u-kg',
        actual_yield_quantity: '0.1',
        actual_yield_unit_id: 'u-kg',
        scheduled_date: '2026-09-09',
        started_at: '2026-09-09T08:00:00Z',
        completed_at: '2026-09-09T09:00:00Z',
        notes: null,
        planned_unit: { id: 'u-kg', code: 'kg' },
        actual_unit: { id: 'u-kg', code: 'kg' },
        recipe_versions: {
          recipe_id: 'rec-1',
          recipes: { id: 'rec-1', name: 'Pan Fino', output_item_id: 'item-1' },
        },
      },
      {
        id: 'run-02',
        business_id: businessId,
        production_target_id: targetId,
        recipe_version_id: 'rv-1',
        status: 'completed',
        planned_yield_quantity: '0.2',
        planned_yield_unit_id: 'u-kg',
        actual_yield_quantity: '0.2',
        actual_yield_unit_id: 'u-kg',
        scheduled_date: '2026-09-09',
        started_at: '2026-09-09T09:00:00Z',
        completed_at: '2026-09-09T10:00:00Z',
        notes: null,
        planned_unit: { id: 'u-kg', code: 'kg' },
        actual_unit: { id: 'u-kg', code: 'kg' },
        recipe_versions: {
          recipe_id: 'rec-1',
          recipes: { id: 'rec-1', name: 'Pan Fino', output_item_id: 'item-1' },
        },
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'production_targets') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockTargets, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'production_runs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockRuns, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const result = await loadProductionDay(mockSupabase, businessId, '2026-09-09');
    const target = result.targets[0];
    expect(target.total_completed_yield).toBe('0.3');
    expect(target.suggested_remaining_quantity).toBe('0');
    expect(target.is_fulfilled).toBe(true);

    // 2. Difference calculation: planned 0.3, actual 0.1 -> exact '-0.2'
    const mockDiffRun = {
      id: runId,
      business_id: businessId,
      production_target_id: targetId,
      recipe_version_id: 'rv-1',
      status: 'in_progress',
      planned_yield_quantity: '0.3',
      planned_yield_unit_id: 'u-kg',
      actual_yield_quantity: null,
      actual_yield_unit_id: null,
      scheduled_date: '2026-09-09',
      started_at: '2026-09-09T08:00:00Z',
      completed_at: null,
      notes: null,
      planned_unit: { id: 'u-kg', code: 'kg' },
      actual_unit: null,
      recipe_versions: {
        recipe_id: 'rec-1',
        recipes: { id: 'rec-1', name: 'Pan', output_item_id: 'item-1' },
      },
    };

    const mockDiffInputs = [
      {
        id: 'inp-diff',
        business_id: businessId,
        production_run_id: runId,
        recipe_input_id: 'ri-1',
        item_id: 'item-harina',
        position: 1,
        planned_quantity: '0.3',
        planned_unit_id: 'u-kg',
        actual_quantity: '0.1',
        actual_unit_id: 'u-kg',
        notes: null,
        items: { id: 'item-harina', name: 'Harina' },
        planned_unit: { id: 'u-kg', code: 'kg' },
        actual_unit: { id: 'u-kg', code: 'kg' },
      },
      {
        id: 'inp-zero',
        business_id: businessId,
        production_run_id: runId,
        recipe_input_id: 'ri-2',
        item_id: 'item-sal',
        position: 2,
        planned_quantity: '5',
        planned_unit_id: 'u-g',
        actual_quantity: '0',
        actual_unit_id: 'u-g',
        notes: null,
        items: { id: 'item-sal', name: 'Sal' },
        planned_unit: { id: 'u-g', code: 'g' },
        actual_unit: { id: 'u-g', code: 'g' },
      },
      {
        id: 'inp-large',
        business_id: businessId,
        production_run_id: runId,
        recipe_input_id: 'ri-3',
        item_id: 'item-bulk',
        position: 3,
        planned_quantity: '9007199254740993.123456789012',
        planned_unit_id: 'u-kg',
        actual_quantity: '9007199254740993.123456789012',
        actual_unit_id: 'u-kg',
        notes: null,
        items: { id: 'item-bulk', name: 'Bulk' },
        planned_unit: { id: 'u-kg', code: 'kg' },
        actual_unit: { id: 'u-kg', code: 'kg' },
      },
    ];

    const mockDiffSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'production_runs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockDiffRun, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'production_run_inputs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockDiffInputs, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const diffDetail = await loadProductionRun(mockDiffSupabase, businessId, runId);
    // Difference is exact '-0.2'
    expect(diffDetail.inputs[0].difference).toBe('-0.2');

    // Confirmed 0 consumption has actual_quantity === '0' and difference === '-5'
    expect(diffDetail.inputs[1].actual_quantity).toBe('0');
    expect(diffDetail.inputs[1].difference).toBe('-5');

    // Preserves > Number.MAX_SAFE_INTEGER precision intact
    expect(diffDetail.inputs[2].planned_quantity).toBe('9007199254740993.123456789012');
    expect(diffDetail.inputs[2].actual_quantity).toBe('9007199254740993.123456789012');
    expect(diffDetail.inputs[2].difference).toBe('0');
  });

  it('loadAvailableItems maps raw materials and pre-mixes with dimension codes', async () => {
    const mockItems = [
      {
        id: 'item-1',
        name: 'Mantequilla',
        kind: 'raw_material',
        base_unit_id: 'u-kg',
        units: {
          id: 'u-kg',
          code: 'kg',
          dimension_id: 'dim-mass',
          unit_dimensions: { id: 'dim-mass', code: 'mass' },
        },
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockItems, error: null }),
            }),
          }),
        }),
      }),
    } as any;

    const items = await loadAvailableItems(mockSupabase, businessId);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Mantequilla');
    expect(items[0].base_unit_code).toBe('kg');
    expect(items[0].dimension_code).toBe('mass');
  });
});
