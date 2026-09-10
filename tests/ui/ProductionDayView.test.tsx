import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ProductionDayView } from '../../src/ui/views/ProductionDayView.js';
import * as service from '../../src/data/productionExecutionService.js';

vi.mock('../../src/data/productionExecutionService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/productionExecutionService.js')>();
  return {
    ...actual,
    loadProductionDay: vi.fn(),
    startTargetProductionRun: vi.fn(),
  };
});

describe('ProductionDayView UI component tests (M2C.1)', () => {
  const businessId = 'b0000000-0000-0000-0000-000000000001';
  const mockSupabase = {} as any;

  it('renders explicit error state when business timezone is missing or invalid (no silent fallback)', () => {
    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone=""
        onSelectRun={vi.fn()}
        onDateChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Zona horaria del negocio inválida o no configurada/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/Costara requiere una zona horaria IANA válida/i)
    ).toBeTruthy();
  });

  it('renders target card with meta, progress, remaining quantity, and status', async () => {
    const mockTargets: service.ProductionTargetWithRuns[] = [
      {
        id: 'target-1',
        business_id: businessId,
        production_plan_id: 'plan-1',
        target_date: '2026-09-09',
        item_id: 'item-1',
        item_name: 'Pan de Muerto Tradicional',
        recipe_version_id: 'rv-1',
        target_quantity: 14,
        unit_id: 'u-kg',
        unit_code: 'kg',
        notes: null,
        runs: [
          {
            id: 'run-1',
            business_id: businessId,
            production_target_id: 'target-1',
            recipe_version_id: 'rv-1',
            status: 'completed',
            planned_yield_quantity: 7,
            planned_yield_unit_id: 'u-kg',
            planned_yield_unit_code: 'kg',
            actual_yield_quantity: 7.1,
            actual_yield_unit_id: 'u-kg',
            actual_yield_unit_code: 'kg',
            scheduled_date: '2026-09-09',
            started_at: '2026-09-09T08:00:00Z',
            completed_at: '2026-09-09T10:00:00Z',
            notes: null,
          },
        ],
        total_runs_count: 1,
        active_or_completed_runs_count: 1,
        in_progress_runs_count: 0,
        completed_runs_count: 1,
        cancelled_runs_count: 0,
        total_completed_yield: 7.1,
        suggested_remaining_quantity: 6.9,
        is_fulfilled: false,
      },
    ];

    vi.mocked(service.loadProductionDay).mockResolvedValue({
      targets: mockTargets,
      unplannedRuns: [],
    });

    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={vi.fn()}
        onDateChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Pan de Muerto Tradicional')).toBeTruthy();
    });

    // Check target meta and progress
    expect(screen.getByText(/Meta total:/i)).toBeTruthy();
    expect(screen.getAllByText(/14 kg/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Faltan 6.9 kg/i)).toBeTruthy();
    expect(screen.getByText(/Iniciar otro lote/i)).toBeTruthy();
  });

  it('opens StartRunModal with suggested remaining quantity and calls startTargetProductionRun', async () => {
    const mockTargets: service.ProductionTargetWithRuns[] = [
      {
        id: 'target-1',
        business_id: businessId,
        production_plan_id: 'plan-1',
        target_date: '2026-09-09',
        item_id: 'item-1',
        item_name: 'Hogaza de Centeno',
        recipe_version_id: 'rv-1',
        target_quantity: 10,
        unit_id: 'u-kg',
        unit_code: 'kg',
        notes: null,
        runs: [],
        total_runs_count: 0,
        active_or_completed_runs_count: 0,
        in_progress_runs_count: 0,
        completed_runs_count: 0,
        cancelled_runs_count: 0,
        total_completed_yield: 0,
        suggested_remaining_quantity: 10,
        is_fulfilled: false,
      },
    ];

    vi.mocked(service.loadProductionDay).mockResolvedValue({
      targets: mockTargets,
      unplannedRuns: [],
    });
    vi.mocked(service.startTargetProductionRun).mockResolvedValue({
      runId: 'new-run-uuid',
      idempotent: false,
    });

    const onSelectRunMock = vi.fn();

    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={onSelectRunMock}
        onDateChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hogaza de Centeno')).toBeTruthy();
    });

    // Click "Iniciar corrida"
    const startBtn = screen.getByRole('button', { name: /Iniciar corrida/i });
    fireEvent.click(startBtn);

    // Modal should be open with default 10
    expect(screen.getByRole('heading', { name: /Iniciar corrida de producción/i })).toBeTruthy();
    const qtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(qtyInput.value).toBe('10');

    // Change value to 5 (target splitting)
    fireEvent.change(qtyInput, { target: { value: '5' } });

    // Submit modal
    const confirmBtn = screen.getByRole('button', { name: /Iniciar lote/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(service.startTargetProductionRun).toHaveBeenCalledWith(
        mockSupabase,
        expect.objectContaining({
          businessId,
          targetId: 'target-1',
          runScaleTarget: {
            mode: 'yield',
            targetQuantity: '5',
            unitId: 'u-kg',
          },
        })
      );
      expect(onSelectRunMock).toHaveBeenCalledWith('new-run-uuid');
    });
  });

  it('navigates to previous and next day', async () => {
    vi.mocked(service.loadProductionDay).mockResolvedValue({
      targets: [],
      unplannedRuns: [],
    });

    const onDateChangeMock = vi.fn();

    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={vi.fn()}
        onDateChange={onDateChangeMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Ayer/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Ayer/i }));
    expect(onDateChangeMock).toHaveBeenCalledWith('2026-09-08');

    fireEvent.click(screen.getByRole('button', { name: /Mañana/i }));
    expect(onDateChangeMock).toHaveBeenCalledWith('2026-09-10');
  });

  it('renders error state exclusively on load failure without showing empty state', async () => {
    vi.mocked(service.loadProductionDay).mockRejectedValue(
      new Error("Could not find a relationship between 'recipes' and 'output_item_id' in the schema cache")
    );

    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={vi.fn()}
        onDateChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Error al cargar el día de producción/i)).toBeTruthy();
      expect(screen.getByText(/Could not find a relationship/i)).toBeTruthy();
    });

    // The empty state must NOT be rendered
    expect(screen.queryByText(/No hay metas de producción planeadas para este día/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeTruthy();
  });

  it('renders target with only cancelled runs as "Por iniciar" with CTA "Iniciar corrida" while listing cancelled run in history', async () => {
    const mockTargets: service.ProductionTargetWithRuns[] = [
      {
        id: 'target-cancelled-only',
        business_id: businessId,
        production_plan_id: 'plan-1',
        target_date: '2026-09-09',
        item_id: 'item-sourdough',
        item_name: 'Masa Madre Activa',
        recipe_version_id: 'rv-sourdough-1',
        target_quantity: 2000,
        unit_id: 'u-g',
        unit_code: 'g',
        notes: null,
        runs: [
          {
            id: 'run-cancelled-1',
            business_id: businessId,
            production_target_id: 'target-cancelled-only',
            recipe_version_id: 'rv-sourdough-1',
            status: 'cancelled',
            planned_yield_quantity: 1000,
            planned_yield_unit_id: 'u-g',
            planned_yield_unit_code: 'g',
            actual_yield_quantity: null,
            actual_yield_unit_id: null,
            actual_yield_unit_code: null,
            scheduled_date: '2026-09-09',
            started_at: '2026-09-09T08:00:00Z',
            completed_at: null,
            notes: null,
          },
        ],
        total_runs_count: 1,
        active_or_completed_runs_count: 0,
        in_progress_runs_count: 0,
        completed_runs_count: 0,
        cancelled_runs_count: 1,
        total_completed_yield: 0,
        suggested_remaining_quantity: 2000,
        is_fulfilled: false,
      },
    ];

    vi.mocked(service.loadProductionDay).mockResolvedValue({
      targets: mockTargets,
      unplannedRuns: [],
    });

    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={vi.fn()}
        onDateChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Masa Madre Activa')).toBeTruthy();
    });

    // Must show "Por iniciar", NOT "En curso" or "En taller"
    expect(screen.getByText('Por iniciar')).toBeTruthy();
    expect(screen.queryByText(/En curso/i)).toBeNull();
    expect(screen.queryByText(/En taller/i)).toBeNull();

    // CTA must be "Iniciar corrida", NOT "Iniciar otro lote"
    expect(screen.getByRole('button', { name: /Iniciar corrida/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Iniciar otro lote/i })).toBeNull();

    // The cancelled run must still be visible in history
    expect(screen.getByText('Cancelada')).toBeTruthy();
    expect(screen.getByText(/1000 g/)).toBeTruthy();
  });

  it('localizes "piece" unit to "piezas" and "pieza" in target cards and run list', async () => {
    const mockTargets: service.ProductionTargetWithRuns[] = [
      {
        id: 'target-piece',
        business_id: businessId,
        production_plan_id: 'plan-1',
        target_date: '2026-09-09',
        item_id: 'item-hogaza',
        item_name: 'Hogaza Rústica',
        recipe_version_id: 'rv-hogaza',
        target_quantity: 8,
        unit_id: 'u-piece',
        unit_code: 'piece',
        notes: null,
        runs: [
          {
            id: 'run-p1',
            business_id: businessId,
            production_target_id: 'target-piece',
            recipe_version_id: 'rv-hogaza',
            status: 'completed',
            planned_yield_quantity: 4,
            planned_yield_unit_id: 'u-piece',
            planned_yield_unit_code: 'piece',
            actual_yield_quantity: 1,
            actual_yield_unit_id: 'u-piece',
            actual_yield_unit_code: 'piece',
            scheduled_date: '2026-09-09',
            started_at: '2026-09-09T08:00:00Z',
            completed_at: '2026-09-09T10:00:00Z',
            notes: null,
          },
        ],
        total_runs_count: 1,
        active_or_completed_runs_count: 1,
        in_progress_runs_count: 0,
        completed_runs_count: 1,
        cancelled_runs_count: 0,
        total_completed_yield: 1,
        suggested_remaining_quantity: 7,
        is_fulfilled: false,
      },
    ];

    vi.mocked(service.loadProductionDay).mockResolvedValue({
      targets: mockTargets,
      unplannedRuns: [],
    });

    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={vi.fn()}
        onDateChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hogaza Rústica')).toBeTruthy();
    });

    // 8 piece -> 8 piezas
    expect(screen.getAllByText(/8 piezas/i).length).toBeGreaterThan(0);
    // 7 remaining -> Faltan 7 piezas
    expect(screen.getByText(/Faltan 7 piezas/i)).toBeTruthy();
    // 1 completed -> 1 pieza
    expect(screen.getAllByText(/1 pieza/i).length).toBeGreaterThan(0);
    // 4 planned in run -> 4 piezas
    expect(screen.getByText(/4 piezas/i)).toBeTruthy();
  });

  it('renders target state "En taller" when an active run is in progress', async () => {
    const mockTargets: service.ProductionTargetWithRuns[] = [
      {
        id: 'target-in-progress',
        business_id: businessId,
        production_plan_id: 'plan-1',
        target_date: '2026-09-09',
        item_id: 'item-1',
        item_name: 'Pan de Muerto',
        recipe_version_id: 'rv-1',
        target_quantity: 2000,
        unit_id: 'u-g',
        unit_code: 'g',
        notes: null,
        runs: [
          {
            id: 'run-ip-1',
            business_id: businessId,
            production_target_id: 'target-in-progress',
            recipe_version_id: 'rv-1',
            status: 'in_progress',
            planned_yield_quantity: 1000,
            planned_yield_unit_id: 'u-g',
            planned_yield_unit_code: 'g',
            actual_yield_quantity: null,
            actual_yield_unit_id: null,
            actual_yield_unit_code: null,
            scheduled_date: '2026-09-09',
            started_at: '2026-09-09T08:00:00Z',
            completed_at: null,
            notes: null,
          },
        ],
        total_runs_count: 1,
        active_or_completed_runs_count: 1,
        in_progress_runs_count: 1,
        completed_runs_count: 0,
        cancelled_runs_count: 0,
        total_completed_yield: 0,
        suggested_remaining_quantity: 2000,
        is_fulfilled: false,
      },
    ];

    vi.mocked(service.loadProductionDay).mockResolvedValue({
      targets: mockTargets,
      unplannedRuns: [],
    });

    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={vi.fn()}
        onDateChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Pan de Muerto')).toBeTruthy();
    });

    expect(screen.getAllByText('En taller').length).toBeGreaterThan(0);
    expect(screen.queryByText(/En curso/i)).toBeNull();
  });

  it('renders target state "Parcial (25%)" when completed quantity is partial and no run in progress', async () => {
    const mockTargets: service.ProductionTargetWithRuns[] = [
      {
        id: 'target-partial',
        business_id: businessId,
        production_plan_id: 'plan-1',
        target_date: '2026-09-09',
        item_id: 'item-1',
        item_name: 'Pan de Muerto',
        recipe_version_id: 'rv-1',
        target_quantity: 2000,
        unit_id: 'u-g',
        unit_code: 'g',
        notes: null,
        runs: [
          {
            id: 'run-c-1',
            business_id: businessId,
            production_target_id: 'target-partial',
            recipe_version_id: 'rv-1',
            status: 'completed',
            planned_yield_quantity: 1000,
            planned_yield_unit_id: 'u-g',
            planned_yield_unit_code: 'g',
            actual_yield_quantity: 500,
            actual_yield_unit_id: 'u-g',
            actual_yield_unit_code: 'g',
            scheduled_date: '2026-09-09',
            started_at: '2026-09-09T08:00:00Z',
            completed_at: '2026-09-09T09:00:00Z',
            notes: null,
          },
        ],
        total_runs_count: 1,
        active_or_completed_runs_count: 1,
        in_progress_runs_count: 0,
        completed_runs_count: 1,
        cancelled_runs_count: 0,
        total_completed_yield: 500,
        suggested_remaining_quantity: 1500,
        is_fulfilled: false,
      },
    ];

    vi.mocked(service.loadProductionDay).mockResolvedValue({
      targets: mockTargets,
      unplannedRuns: [],
    });

    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={vi.fn()}
        onDateChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Pan de Muerto')).toBeTruthy();
    });

    expect(screen.getByText('Parcial (25%)')).toBeTruthy();
    expect(screen.queryByText(/En curso/i)).toBeNull();
    expect(screen.queryByText(/En taller/i)).toBeNull();
  });

  it('renders target state "Meta cumplida (100%)" when completed quantity equals target quantity', async () => {
    const mockTargets: service.ProductionTargetWithRuns[] = [
      {
        id: 'target-fulfilled',
        business_id: businessId,
        production_plan_id: 'plan-1',
        target_date: '2026-09-09',
        item_id: 'item-1',
        item_name: 'Pan de Muerto',
        recipe_version_id: 'rv-1',
        target_quantity: 2000,
        unit_id: 'u-g',
        unit_code: 'g',
        notes: null,
        runs: [
          {
            id: 'run-c-1',
            business_id: businessId,
            production_target_id: 'target-fulfilled',
            recipe_version_id: 'rv-1',
            status: 'completed',
            planned_yield_quantity: 2000,
            planned_yield_unit_id: 'u-g',
            planned_yield_unit_code: 'g',
            actual_yield_quantity: 2000,
            actual_yield_unit_id: 'u-g',
            actual_yield_unit_code: 'g',
            scheduled_date: '2026-09-09',
            started_at: '2026-09-09T08:00:00Z',
            completed_at: '2026-09-09T09:00:00Z',
            notes: null,
          },
        ],
        total_runs_count: 1,
        active_or_completed_runs_count: 1,
        in_progress_runs_count: 0,
        completed_runs_count: 1,
        cancelled_runs_count: 0,
        total_completed_yield: 2000,
        suggested_remaining_quantity: 0,
        is_fulfilled: true,
      },
    ];

    vi.mocked(service.loadProductionDay).mockResolvedValue({
      targets: mockTargets,
      unplannedRuns: [],
    });

    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={vi.fn()}
        onDateChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Pan de Muerto')).toBeTruthy();
    });

    expect(screen.getByText('Meta cumplida (100%)')).toBeTruthy();
  });

  it('renders target state "Meta superada" with clamped bar and overproduction callout', async () => {
    const mockTargets: service.ProductionTargetWithRuns[] = [
      {
        id: 'target-overproduced',
        business_id: businessId,
        production_plan_id: 'plan-1',
        target_date: '2026-09-09',
        item_id: 'item-1',
        item_name: 'Masa Madre Activa',
        recipe_version_id: 'rv-1',
        target_quantity: 2000,
        unit_id: 'u-g',
        unit_code: 'g',
        notes: null,
        runs: [
          {
            id: 'run-c-1',
            business_id: businessId,
            production_target_id: 'target-overproduced',
            recipe_version_id: 'rv-1',
            status: 'completed',
            planned_yield_quantity: 2500,
            planned_yield_unit_id: 'u-g',
            planned_yield_unit_code: 'g',
            actual_yield_quantity: 2500,
            actual_yield_unit_id: 'u-g',
            actual_yield_unit_code: 'g',
            scheduled_date: '2026-09-09',
            started_at: '2026-09-09T08:00:00Z',
            completed_at: '2026-09-09T09:00:00Z',
            notes: null,
          },
        ],
        total_runs_count: 1,
        active_or_completed_runs_count: 1,
        in_progress_runs_count: 0,
        completed_runs_count: 1,
        cancelled_runs_count: 0,
        total_completed_yield: 2500,
        suggested_remaining_quantity: 0,
        is_fulfilled: true,
      },
    ];

    vi.mocked(service.loadProductionDay).mockResolvedValue({
      targets: mockTargets,
      unplannedRuns: [],
    });

    const { container } = render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={vi.fn()}
        onDateChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Masa Madre Activa')).toBeTruthy();
    });

    expect(screen.getByText('Meta superada')).toBeTruthy();
    expect(screen.getByText(/sobre la meta/i)).toBeTruthy();
    expect(screen.getByText(/\+500 g sobre la meta \(125%\)/i)).toBeTruthy();

    // Progress bar fill should be clamped at 100%
    const progressBar = container.querySelector('.bg-emerald-500');
    expect(progressBar).toBeTruthy();
    expect(progressBar?.getAttribute('style')).toContain('width: 100%');
  });

  it('renders "Lotes" and eliminates technical copy "Lotes físicos iniciados"', async () => {
    const mockTargets: service.ProductionTargetWithRuns[] = [
      {
        id: 'target-1',
        business_id: businessId,
        production_plan_id: 'plan-1',
        target_date: '2026-09-09',
        item_id: 'item-1',
        item_name: 'Pan de Muerto',
        recipe_version_id: 'rv-1',
        target_quantity: 10,
        unit_id: 'u-kg',
        unit_code: 'kg',
        notes: null,
        runs: [
          {
            id: 'run-1',
            business_id: businessId,
            production_target_id: 'target-1',
            recipe_version_id: 'rv-1',
            status: 'completed',
            planned_yield_quantity: 5,
            planned_yield_unit_id: 'u-kg',
            planned_yield_unit_code: 'kg',
            actual_yield_quantity: 5,
            actual_yield_unit_id: 'u-kg',
            actual_yield_unit_code: 'kg',
            scheduled_date: '2026-09-09',
            started_at: '2026-09-09T08:00:00Z',
            completed_at: '2026-09-09T10:00:00Z',
            notes: null,
          },
        ],
        total_runs_count: 1,
        active_or_completed_runs_count: 1,
        in_progress_runs_count: 0,
        completed_runs_count: 1,
        cancelled_runs_count: 0,
        total_completed_yield: 5,
        suggested_remaining_quantity: 5,
        is_fulfilled: false,
      },
    ];

    vi.mocked(service.loadProductionDay).mockResolvedValue({
      targets: mockTargets,
      unplannedRuns: [],
    });

    render(
      <ProductionDayView
        supabase={mockSupabase}
        businessId={businessId}
        businessTimezone="America/Mexico_City"
        dateParam="2026-09-09"
        onSelectRun={vi.fn()}
        onDateChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Pan de Muerto')).toBeTruthy();
    });

    expect(screen.getByText(/Lotes \(1\)/i)).toBeTruthy();
    expect(screen.queryByText(/Lotes físicos iniciados/i)).toBeNull();
  });
});
