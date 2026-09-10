import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { ProductionRunView } from '../../src/ui/views/ProductionRunView.js';
import * as service from '../../src/data/productionExecutionService.js';

vi.mock('../../src/data/productionExecutionService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/productionExecutionService.js')>();
  return {
    ...actual,
    loadProductionRun: vi.fn(),
    loadAvailableItems: vi.fn(),
    confirmPlannedInputsNominal: vi.fn(),
    updateRunInputActual: vi.fn(),
    addUnplannedInput: vi.fn(),
    deleteUnplannedInput: vi.fn(),
    completeProductionRun: vi.fn(),
    cancelProductionRun: vi.fn(),
    updateProductionRunNotes: vi.fn(),
  };
});

describe('ProductionRunView UI component tests (M2C.1)', () => {
  const businessId = 'b0000000-0000-0000-0000-000000000001';
  const runId = 'r0000000-0000-0000-0000-000000000001';
  const mockSupabase = {} as any;

  const mockRunDetail: service.ProductionRunDetail = {
    id: runId,
    business_id: businessId,
    production_target_id: 't-1',
    recipe_version_id: 'rv-1',
    recipe_name: 'Pan de Muerto Tradicional',
    output_item_id: 'out-1',
    output_item_name: 'Pan de Muerto Tradicional',
    status: 'in_progress',
    planned_yield_quantity: '7',
    planned_yield_unit_id: 'u-kg',
    planned_yield_unit_code: 'kg',
    actual_yield_quantity: null,
    actual_yield_unit_id: null,
    actual_yield_unit_code: null,
    scheduled_date: '2026-09-09',
    started_at: '2026-09-09T08:00:00Z',
    completed_at: null,
    notes: 'Lote matutino',
    inputs: [
      {
        id: 'inp-1',
        business_id: businessId,
        production_run_id: runId,
        recipe_input_id: 'ri-1',
        item_id: 'harina-id',
        item_name: 'Harina Fuerte',
        position: 1,
        planned_quantity: '4.5',
        planned_unit_id: 'u-kg',
        planned_unit_code: 'kg',
        actual_quantity: null, // Pending
        actual_unit_id: null,
        actual_unit_code: null,
        notes: null,
        is_unplanned: false,
        difference: null,
      },
    ],
  };

  const mockAvailableItems: service.AvailableItem[] = [
    {
      id: 'item-mantequilla',
      name: 'Mantequilla Gloria',
      kind: 'raw_material',
      base_unit_id: 'u-kg',
      base_unit_code: 'kg',
      dimension_id: 'dim-mass',
      dimension_code: 'mass',
    },
  ];

  it('renders run details, planned yield, and inputs table', async () => {
    vi.mocked(service.loadProductionRun).mockResolvedValue(mockRunDetail);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Pan de Muerto Tradicional').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('Harina Fuerte').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4.5 kg/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^En taller$/i)).toBeTruthy();
    expect(screen.queryByText(/En progreso/i)).toBeNull();
    expect(screen.getByText(/^9 sep(t)?\.? 2026$/i)).toBeTruthy();
    expect(screen.queryByText(/8 sep/i)).toBeNull();
  });

  it('triggers "Sí, todo igual" quick action and calls confirmPlannedInputsNominal', async () => {
    vi.mocked(service.loadProductionRun).mockResolvedValue(mockRunDetail);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);
    vi.mocked(service.confirmPlannedInputsNominal).mockResolvedValue();

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/¿Usaste las cantidades planeadas\?/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /Sí, todo igual/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Hubo cambios/i })).toBeTruthy();
    });

    const quickBtn = screen.getByRole('button', { name: /Sí, todo igual/i });
    fireEvent.click(quickBtn);

    await waitFor(() => {
      expect(service.confirmPlannedInputsNominal).toHaveBeenCalledWith(
        mockSupabase,
        mockRunDetail.inputs
      );
    });
  });

  it('triggers "Hubo cambios" button, confirms nominal inputs and activates exception editing mode', async () => {
    const runAfterConfirm: service.ProductionRunDetail = {
      ...mockRunDetail,
      inputs: [
        {
          ...mockRunDetail.inputs[0],
          actual_quantity: 4.5,
          actual_unit_id: 'u-kg',
          actual_unit_code: 'kg',
          difference: 0,
        },
      ],
    };
    vi.mocked(service.loadProductionRun)
      .mockResolvedValueOnce(mockRunDetail)
      .mockResolvedValueOnce(runAfterConfirm);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);
    vi.mocked(service.confirmPlannedInputsNominal).mockResolvedValue();

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Hubo cambios/i })).toBeTruthy();
    });

    const changesBtn = screen.getByRole('button', { name: /Hubo cambios/i });
    fireEvent.click(changesBtn);

    await waitFor(() => {
      expect(service.confirmPlannedInputsNominal).toHaveBeenCalledWith(
        mockSupabase,
        mockRunDetail.inputs
      );
      expect(screen.getByText(/Edita solo lo que cambió/i)).toBeTruthy();
      expect(screen.queryByText(/Modo de edición por excepción activo/i)).toBeNull();
    });
  });

  it('opens AddUnplannedInputModal and adds an unplanned input line', async () => {
    vi.mocked(service.loadProductionRun).mockResolvedValue(mockRunDetail);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);
    vi.mocked(service.addUnplannedInput).mockResolvedValue('unplanned-inp-id');

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Insumo no planeado/i)).toBeTruthy();
    });

    // Click "Insumo no planeado" button
    fireEvent.click(screen.getByRole('button', { name: /Insumo no planeado/i }));

    // Modal appears
    const modal = screen.getByRole('dialog');
    expect(within(modal).getByRole('heading', { name: /Agregar insumo no planeado/i })).toBeTruthy();

    // Select item from list
    const itemBtn = within(modal).getByText('Mantequilla Gloria');
    fireEvent.click(itemBtn);

    // Fill quantity inside modal
    const qtyInput = within(modal).getByRole('spinbutton');
    fireEvent.change(qtyInput, { target: { value: '0.25' } });

    // Submit modal
    const submitBtn = within(modal).getByRole('button', { name: /Agregar insumo/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(service.addUnplannedInput).toHaveBeenCalledWith(
        mockSupabase,
        expect.objectContaining({
          runId,
          itemId: 'item-mantequilla',
          actualQuantity: '0.25',
          actualUnitId: 'u-kg',
        })
      );
    });
  });

  it('guardian check blocks completion when pending inputs exist', async () => {
    vi.mocked(service.loadProductionRun).mockResolvedValue(mockRunDetail);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Terminar producción/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Terminar producción/i }));

    // Guardian alert should appear inside CompleteRunModal
    const modal = screen.getByRole('dialog');
    expect(within(modal).getByText(/Faltan insumos por confirmar consumo/i)).toBeTruthy();
    expect(within(modal).getByText(/Hay 1 insumo sin consumo real registrado/i)).toBeTruthy();
    expect(within(modal).queryByText(/insumo\(s\)/i)).toBeNull();

    // The complete button in the modal should be disabled
    const completeModalBtn = within(modal).getByRole('button', { name: /Completar corrida/i }) as HTMLButtonElement;
    expect(completeModalBtn.disabled).toBe(true);
  });

  it('guardian check blocks cancellation if physical consumptions exist', async () => {
    const runWithConsumption: service.ProductionRunDetail = {
      ...mockRunDetail,
      inputs: [
        {
          id: 'inp-1',
          business_id: businessId,
          production_run_id: runId,
          recipe_input_id: 'ri-1',
          item_id: 'harina-id',
          item_name: 'Harina Fuerte',
          position: 1,
          planned_quantity: 4.5,
          planned_unit_id: 'u-kg',
          planned_unit_code: 'kg',
          actual_quantity: 4.5, // Physical consumption registered!
          actual_unit_id: 'u-kg',
          actual_unit_code: 'kg',
          notes: null,
          is_unplanned: false,
          difference: 0,
        },
      ],
    };

    vi.mocked(service.loadProductionRun).mockResolvedValue(runWithConsumption);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancelar corrida\.\.\./i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Cancelar corrida\.\.\./i }));

    // Guardian check inside CancelRunModal
    const modal = screen.getByRole('dialog');
    expect(within(modal).getByText(/Corrida bloqueada para cancelación/i)).toBeTruthy();
    expect(within(modal).getByText(/No se puede cancelar una corrida con consumos reales registrados/i)).toBeTruthy();

    const cancelModalBtn = within(modal).getByRole('button', { name: /Confirmar cancelación/i }) as HTMLButtonElement;
    expect(cancelModalBtn.disabled).toBe(true);
  });

  it('renders actual_quantity null as empty input with neutral placeholder and Pendiente status', async () => {
    vi.mocked(service.loadProductionRun).mockResolvedValue(mockRunDetail);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Harina Fuerte').length).toBeGreaterThan(0);
    });

    const inputs = screen.getAllByPlaceholderText('Cantidad usada') as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    for (const inp of inputs) {
      expect(inp.value).toBe('');
    }

    const pendingLabels = screen.getAllByText('Pendiente');
    expect(pendingLabels.length).toBeGreaterThan(0);
  });

  it('renders actual_quantity 0 as confirmed zero consumption and not as Pendiente', async () => {
    const runWithZeroConsumption: service.ProductionRunDetail = {
      ...mockRunDetail,
      inputs: [
        {
          id: 'inp-1',
          business_id: businessId,
          production_run_id: runId,
          recipe_input_id: 'ri-1',
          item_id: 'harina-id',
          item_name: 'Harina Fuerte',
          position: 1,
          planned_quantity: '4.5',
          planned_unit_id: 'u-kg',
          planned_unit_code: 'kg',
          actual_quantity: '0',
          actual_unit_id: 'u-kg',
          actual_unit_code: 'kg',
          notes: 'No se requirio',
          is_unplanned: false,
          difference: '-4.5',
        },
      ],
    };

    vi.mocked(service.loadProductionRun).mockResolvedValue(runWithZeroConsumption);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Harina Fuerte').length).toBeGreaterThan(0);
    });

    const inputs = screen.getAllByPlaceholderText('Cantidad usada') as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    for (const inp of inputs) {
      expect(inp.value).toBe('0');
    }

    expect(screen.queryByText('Pendiente')).toBeNull();
    expect(screen.getAllByText(/-4\.5 kg/i).length).toBeGreaterThan(0);
  });

  it('saves explicit 0 consumption via updateRunInputActual with quantity 0', async () => {
    vi.mocked(service.loadProductionRun).mockResolvedValue(mockRunDetail);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);
    vi.mocked(service.updateRunInputActual).mockResolvedValue();

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Harina Fuerte').length).toBeGreaterThan(0);
    });

    const desktopInput = (screen.getAllByPlaceholderText('Cantidad usada') as HTMLInputElement[])[0];
    fireEvent.change(desktopInput, { target: { value: '0' } });

    const saveBtn = screen.getByRole('button', { name: /^Guardar$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(service.updateRunInputActual).toHaveBeenCalledWith(
        mockSupabase,
        'inp-1',
        '0',
        'u-kg',
        null
      );
    });
  });

  it('localizes piece unit presentation in planned and actual yield', async () => {
    const runWithPieceUnit: service.ProductionRunDetail = {
      ...mockRunDetail,
      planned_yield_quantity: '8',
      planned_yield_unit_code: 'piece',
      actual_yield_quantity: '1',
      actual_yield_unit_code: 'piece',
      status: 'completed',
      completed_at: '2026-09-09T10:00:00Z',
    };

    vi.mocked(service.loadProductionRun).mockResolvedValue(runWithPieceUnit);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/8 piezas/i)).toBeTruthy();
      expect(screen.getByText(/1 pieza/i)).toBeTruthy();
    });
  });

  it('navigates back to #/production/2026-09-09 when clicking "Volver al día de producción" regardless of today being 2026-09-10', async () => {
    vi.mocked(service.loadProductionRun).mockResolvedValue({
      ...mockRunDetail,
      scheduled_date: '2026-09-09',
    });
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);

    const onBackMock = vi.fn();

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={onBackMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Volver al día de producción/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Volver al día de producción/i));

    expect(onBackMock).toHaveBeenCalledWith('2026-09-09');
  });

  it('navigates to #/production/2026-09-09 on successful completeRun', async () => {
    const runReadyToComplete: service.ProductionRunDetail = {
      ...mockRunDetail,
      scheduled_date: '2026-09-09',
      inputs: [
        {
          ...mockRunDetail.inputs[0],
          actual_quantity: 4.5,
          actual_unit_id: 'u-kg',
          actual_unit_code: 'kg',
          difference: 0,
        },
      ],
    };

    vi.mocked(service.loadProductionRun).mockResolvedValue(runReadyToComplete);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);
    vi.mocked(service.completeProductionRun).mockResolvedValue();

    const onCompleteMock = vi.fn();
    const onBackMock = vi.fn();

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={onBackMock}
        onComplete={onCompleteMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Terminar producción/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Terminar producción/i }));

    const modal = screen.getByRole('dialog');
    const completeBtn = within(modal).getByRole('button', { name: /Completar corrida/i });
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(service.completeProductionRun).toHaveBeenCalledWith(
        mockSupabase,
        expect.objectContaining({
          runId,
          actualYieldQuantity: '7',
          actualYieldUnitId: 'u-kg',
        })
      );
      expect(onCompleteMock).toHaveBeenCalledWith('2026-09-09');
    });
  });

  it('navigates to #/production/2026-09-09 on successful cancelRun', async () => {
    // Run has actual_quantity = null for all inputs, so cancellation is permitted
    vi.mocked(service.loadProductionRun).mockResolvedValue({
      ...mockRunDetail,
      scheduled_date: '2026-09-09',
    });
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);
    vi.mocked(service.cancelProductionRun).mockResolvedValue();

    const onCancelMock = vi.fn();
    const onBackMock = vi.fn();

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={onBackMock}
        onCancel={onCancelMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancelar corrida\.\.\./i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Cancelar corrida\.\.\./i }));

    const modal = screen.getByRole('dialog');
    const notesInput = within(modal).getByPlaceholderText(/Falla de equipo/i);
    fireEvent.change(notesInput, { target: { value: 'Cancelación autorizada' } });

    const confirmBtn = within(modal).getByRole('button', { name: /Confirmar cancelación/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(service.cancelProductionRun).toHaveBeenCalledWith(
        mockSupabase,
        runId,
        'Cancelación autorizada'
      );
      expect(onCancelMock).toHaveBeenCalledWith('2026-09-09');
    });
  });

  it('computes difference in real-time as user edits draft quantity and shows "Sin guardar" badge until saved or restored', async () => {
    const runConfirmed: service.ProductionRunDetail = {
      ...mockRunDetail,
      inputs: [
        {
          id: 'inp-1',
          business_id: businessId,
          production_run_id: runId,
          recipe_input_id: 'ri-1',
          item_id: 'harina-id',
          item_name: 'Harina Fuerte',
          position: 1,
          planned_quantity: '4.5',
          planned_unit_id: 'u-kg',
          planned_unit_code: 'kg',
          actual_quantity: '4.5',
          actual_unit_id: 'u-kg',
          actual_unit_code: 'kg',
          notes: null,
          is_unplanned: false,
          difference: '0',
        },
      ],
    };

    vi.mocked(service.loadProductionRun).mockResolvedValue(runConfirmed);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);
    vi.mocked(service.updateRunInputActual).mockResolvedValue();

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Harina Fuerte').length).toBeGreaterThan(0);
    });

    // Initially: no "Sin guardar" badge, difference is Exacto (0 diff)
    expect(screen.queryByText(/Sin guardar/i)).toBeNull();
    expect(screen.getAllByText('Exacto').length).toBeGreaterThan(0);

    // Get input in desktop view
    const desktopInput = (screen.getAllByPlaceholderText('Cantidad usada') as HTMLInputElement[])[0];

    // Change to 5.0 kg (+0.5 kg difference)
    fireEvent.change(desktopInput, { target: { value: '5.0' } });

    // Live difference should update immediately
    expect(screen.getAllByText('+0.5 kg').length).toBeGreaterThan(0);
    // "Sin guardar" badge appears
    expect(screen.getAllByText(/Sin guardar/i).length).toBeGreaterThan(0);

    // Change back to 4.5 kg (restored to persisted value)
    fireEvent.change(desktopInput, { target: { value: '4.5' } });
    expect(screen.queryByText(/Sin guardar/i)).toBeNull();
    expect(screen.getAllByText('Exacto').length).toBeGreaterThan(0);

    // Change to 0 kg (valid zero consumption)
    fireEvent.change(desktopInput, { target: { value: '0' } });
    expect(screen.getAllByText('-4.5 kg').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sin guardar/i).length).toBeGreaterThan(0);

    // Save consumption
    const saveBtn = screen.getByRole('button', { name: /^Guardar$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(service.updateRunInputActual).toHaveBeenCalledWith(
        mockSupabase,
        'inp-1',
        '0',
        'u-kg',
        null
      );
    });
  });

  it('AddUnplannedInputModal disables submit without selection/quantity and supports search filtering', async () => {
    const multipleItems: service.AvailableItem[] = [
      {
        id: 'item-1',
        name: 'Mantequilla Gloria',
        kind: 'raw_material',
        base_unit_id: 'u-kg',
        base_unit_code: 'kg',
        dimension_id: 'dim-mass',
        dimension_code: 'mass',
      },
      {
        id: 'item-2',
        name: 'Azúcar Estándar',
        kind: 'raw_material',
        base_unit_id: 'u-kg',
        base_unit_code: 'kg',
        dimension_id: 'dim-mass',
        dimension_code: 'mass',
      },
    ];

    vi.mocked(service.loadProductionRun).mockResolvedValue(mockRunDetail);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(multipleItems);
    vi.mocked(service.addUnplannedInput).mockResolvedValue('unplanned-id');

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Insumo no planeado/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Insumo no planeado/i }));

    const modal = screen.getByRole('dialog');
    const submitBtn = within(modal).getByRole('button', { name: /Agregar insumo/i }) as HTMLButtonElement;

    // Initially: no item selected, submit disabled
    expect(submitBtn.disabled).toBe(true);
    expect(within(modal).getByText(/Selecciona un insumo de la lista/i)).toBeTruthy();

    // Search filtering: filter by "Azúcar"
    const searchInput = within(modal).getByPlaceholderText(/Buscar por nombre\.\.\./i);
    fireEvent.change(searchInput, { target: { value: 'Azúcar' } });

    // Mantequilla Gloria should not be in filtered results
    expect(within(modal).queryByText('Mantequilla Gloria')).toBeNull();
    expect(within(modal).getByText('Azúcar Estándar')).toBeTruthy();

    // Select Azúcar
    fireEvent.click(within(modal).getByText('Azúcar Estándar'));
    expect(within(modal).getByText(/Insumo seleccionado/i)).toBeTruthy();

    // Submit still disabled because quantity is empty
    expect(submitBtn.disabled).toBe(true);

    // Enter 0 quantity -> still disabled
    const qtyInput = within(modal).getByRole('spinbutton');
    fireEvent.change(qtyInput, { target: { value: '0' } });
    expect(submitBtn.disabled).toBe(true);

    // Enter valid quantity -> submit enabled
    fireEvent.change(qtyInput, { target: { value: '1.5' } });
    expect(submitBtn.disabled).toBe(false);

    // Submit
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(service.addUnplannedInput).toHaveBeenCalledWith(
        mockSupabase,
        expect.objectContaining({
          runId,
          itemId: 'item-2',
          actualQuantity: '1.5',
          actualUnitId: 'u-kg',
        })
      );
    });
  });

  it('opens DeleteUnplannedInputModal on delete click, cancels safely, and confirms deletion via service', async () => {
    const runWithUnplanned: service.ProductionRunDetail = {
      ...mockRunDetail,
      inputs: [
        {
          id: 'inp-unplanned-1',
          business_id: businessId,
          production_run_id: runId,
          recipe_input_id: null,
          item_id: 'item-mantequilla',
          item_name: 'Mantequilla Gloria',
          position: null,
          planned_quantity: '0',
          planned_unit_id: 'u-kg',
          planned_unit_code: 'kg',
          actual_quantity: '0.5',
          actual_unit_id: 'u-kg',
          actual_unit_code: 'kg',
          notes: 'Ajuste de humedad',
          is_unplanned: true,
          difference: null,
        },
      ],
    };

    vi.mocked(service.loadProductionRun).mockResolvedValue(runWithUnplanned);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);
    vi.mocked(service.deleteUnplannedInput).mockResolvedValue();

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Mantequilla Gloria').length).toBeGreaterThan(0);
    });

    // Find delete button
    const deleteBtns = screen.getAllByRole('button', { name: /Eliminar insumo no planeado/i });
    expect(deleteBtns.length).toBeGreaterThan(0);
    fireEvent.click(deleteBtns[0]);

    // Modal appears (custom modal, NOT window.confirm)
    const modal = screen.getByRole('dialog');
    expect(within(modal).getByRole('heading', { name: /Eliminar insumo adicional/i })).toBeTruthy();
    expect(within(modal).getByText(/¿Quieres eliminar "Mantequilla Gloria" de esta corrida\?/i)).toBeTruthy();

    // Cancel first
    const cancelBtn = within(modal).getByRole('button', { name: /Cancelar/i });
    fireEvent.click(cancelBtn);

    // Modal closes without calling deleteUnplannedInput
    expect(service.deleteUnplannedInput).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: /Eliminar insumo adicional/i })).toBeNull();

    // Click delete again and confirm
    const deleteBtnsAgain = screen.getAllByRole('button', { name: /Eliminar insumo no planeado/i });
    fireEvent.click(deleteBtnsAgain[0]);

    const modalAgain = screen.getByRole('dialog');
    const confirmDeleteBtn = within(modalAgain).getByRole('button', { name: /Eliminar insumo$/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(service.deleteUnplannedInput).toHaveBeenCalledWith(
        mockSupabase,
        'inp-unplanned-1'
      );
    });
  });

  it('does not display technical copy or parenthesized plurals in ProductionRunView', async () => {
    vi.mocked(service.loadProductionRun).mockResolvedValue(mockRunDetail);
    vi.mocked(service.loadAvailableItems).mockResolvedValue(mockAvailableItems);

    render(
      <ProductionRunView
        supabase={mockSupabase}
        businessId={businessId}
        runId={runId}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Pan de Muerto Tradicional').length).toBeGreaterThan(0);
    });

    // Expected new headings
    expect(screen.getByText(/Cantidades planeadas y consumo real/i)).toBeTruthy();

    // Forbidden legacy / technical copy
    expect(screen.queryByText(/Snapshot de ingredientes/i)).toBeNull();
    expect(screen.queryByText(/Modo de edición por excepción activo/i)).toBeNull();
    expect(screen.queryByText(/pendiente\(s\)/i)).toBeNull();
    expect(screen.queryByText(/insumo\(s\)/i)).toBeNull();
    expect(screen.queryByText(/lote\(s\)/i)).toBeNull();
    expect(screen.queryByText(/merma/i)).toBeNull();
    expect(screen.queryByText(/desperdicio/i)).toBeNull();
    expect(screen.queryByText(/sobredosis/i)).toBeNull();
  });
});
