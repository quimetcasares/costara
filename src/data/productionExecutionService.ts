import type { SupabaseClient } from '@supabase/supabase-js';
import { CostaraDecimal } from '../domain/calculation/decimal.js';

export interface ProductionRunSummary {
  id: string;
  business_id: string;
  production_target_id: string | null;
  recipe_version_id: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  planned_yield_quantity: string;
  planned_yield_unit_id: string;
  planned_yield_unit_code: string;
  actual_yield_quantity: string | null;
  actual_yield_unit_id: string | null;
  actual_yield_unit_code?: string | null;
  scheduled_date: string;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  item_id?: string;
  item_name?: string;
}

export interface ProductionTargetWithRuns {
  id: string;
  business_id: string;
  production_plan_id: string;
  target_date: string;
  item_id: string;
  item_name: string;
  recipe_version_id: string | null;
  target_quantity: string;
  unit_id: string;
  unit_code: string;
  notes: string | null;
  runs: ProductionRunSummary[];
  total_runs_count: number;
  active_or_completed_runs_count: number;
  in_progress_runs_count: number;
  completed_runs_count: number;
  cancelled_runs_count: number;
  total_completed_yield: string;
  suggested_remaining_quantity: string;
  is_fulfilled: boolean;
}

export interface ProductionRunInputDetail {
  id: string;
  business_id: string;
  production_run_id: string;
  recipe_input_id: string | null;
  item_id: string;
  item_name: string;
  position: number;
  planned_quantity: string;
  planned_unit_id: string | null;
  planned_unit_code: string | null;
  actual_quantity: string | null;
  actual_unit_id: string | null;
  actual_unit_code: string | null;
  notes: string | null;
  is_unplanned: boolean;
  difference: string | null;
}

export interface ProductionRunDetail {
  id: string;
  business_id: string;
  production_target_id: string | null;
  recipe_version_id: string;
  recipe_name: string;
  output_item_id: string;
  output_item_name: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  planned_yield_quantity: string;
  planned_yield_unit_id: string;
  planned_yield_unit_code: string;
  actual_yield_quantity: string | null;
  actual_yield_unit_id: string | null;
  actual_yield_unit_code: string | null;
  scheduled_date: string;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  inputs: ProductionRunInputDetail[];
}

export interface AvailableItem {
  id: string;
  name: string;
  kind: string;
  base_unit_id: string;
  base_unit_code: string;
  dimension_id: string;
  dimension_code: string;
}

export interface ProductionDayData {
  targets: ProductionTargetWithRuns[];
  unplannedRuns: ProductionRunSummary[];
}

/**
 * Loads production targets and production runs for a given calendar date in a business.
 */
export async function loadProductionDay(
  supabase: SupabaseClient,
  businessId: string,
  dateStr: string
): Promise<ProductionDayData> {
  const [targetsRes, runsRes] = await Promise.all([
    supabase
      .from('production_targets')
      .select(`
        id,
        business_id,
        production_plan_id,
        target_date,
        item_id,
        recipe_version_id,
        target_quantity,
        unit_id,
        notes,
        items ( id, name ),
        units ( id, code )
      `)
      .eq('business_id', businessId)
      .eq('target_date', dateStr)
      .order('created_at', { ascending: true }),

    supabase
      .from('production_runs')
      .select(`
        id,
        business_id,
        production_target_id,
        recipe_version_id,
        status,
        planned_yield_quantity,
        planned_yield_unit_id,
        actual_yield_quantity,
        actual_yield_unit_id,
        scheduled_date,
        started_at,
        completed_at,
        notes,
        planned_unit:units!planned_yield_unit_id ( id, code ),
        actual_unit:units!actual_yield_unit_id ( id, code ),
        recipe_versions (
          recipe_id,
          recipes (
            id,
            name,
            output_item_id,
            output_item:items!fk_recipes_output_item_business ( id, name )
          )
        )
      `)
      .eq('business_id', businessId)
      .eq('scheduled_date', dateStr)
      .order('started_at', { ascending: true }),
  ]);

  if (targetsRes.error) {
    throw new Error(`Error al cargar metas de producción: ${targetsRes.error.message}`);
  }
  if (runsRes.error) {
    throw new Error(`Error al cargar corridas de producción: ${runsRes.error.message}`);
  }

  const rawRuns = runsRes.data ?? [];
  const runsSummaryList: ProductionRunSummary[] = rawRuns.map((r: any) => {
    const plannedUnit = Array.isArray(r.planned_unit) ? r.planned_unit[0] : r.planned_unit;
    const actualUnit = Array.isArray(r.actual_unit) ? r.actual_unit[0] : r.actual_unit;
    const rv = Array.isArray(r.recipe_versions) ? r.recipe_versions[0] : r.recipe_versions;
    const recipe = rv?.recipes ? (Array.isArray(rv.recipes) ? rv.recipes[0] : rv.recipes) : null;
    const outputItem = recipe?.output_item
      ? (Array.isArray(recipe.output_item) ? recipe.output_item[0] : recipe.output_item)
      : recipe?.items
        ? (Array.isArray(recipe.items) ? recipe.items[0] : recipe.items)
        : null;

    return {
      id: r.id,
      business_id: r.business_id,
      production_target_id: r.production_target_id,
      recipe_version_id: r.recipe_version_id,
      status: r.status,
      planned_yield_quantity: String(r.planned_yield_quantity),
      planned_yield_unit_id: r.planned_yield_unit_id,
      planned_yield_unit_code: plannedUnit?.code ?? '',
      actual_yield_quantity: r.actual_yield_quantity !== null && r.actual_yield_quantity !== undefined ? String(r.actual_yield_quantity) : null,
      actual_yield_unit_id: r.actual_yield_unit_id,
      actual_yield_unit_code: actualUnit?.code ?? null,
      scheduled_date: r.scheduled_date,
      started_at: r.started_at,
      completed_at: r.completed_at,
      notes: r.notes,
      item_id: outputItem?.id,
      item_name: outputItem?.name ?? recipe?.name,
    };
  });

  const runsByTargetId = new Map<string, ProductionRunSummary[]>();
  const unplannedRuns: ProductionRunSummary[] = [];

  for (const run of runsSummaryList) {
    if (run.production_target_id) {
      const list = runsByTargetId.get(run.production_target_id) ?? [];
      list.push(run);
      runsByTargetId.set(run.production_target_id, list);
    } else {
      unplannedRuns.push(run);
    }
  }

  const rawTargets = targetsRes.data ?? [];
  const targets: ProductionTargetWithRuns[] = rawTargets.map((t: any) => {
    const item = Array.isArray(t.items) ? t.items[0] : t.items;
    const unit = Array.isArray(t.units) ? t.units[0] : t.units;
    const targetRuns = runsByTargetId.get(t.id) ?? [];

    const totalRunsCount = targetRuns.length;
    const inProgressCount = targetRuns.filter((r) => r.status === 'in_progress').length;
    const completedRuns = targetRuns.filter((r) => r.status === 'completed');
    const completedCount = completedRuns.length;
    const cancelledCount = targetRuns.filter((r) => r.status === 'cancelled').length;
    const activeOrCompletedRunsCount = inProgressCount + completedCount;

    let totalYieldDec = new CostaraDecimal(0);
    for (const r of completedRuns) {
      if (r.actual_yield_quantity !== null && r.actual_yield_quantity !== undefined) {
        totalYieldDec = totalYieldDec.plus(new CostaraDecimal(String(r.actual_yield_quantity)));
      }
    }

    const targetQtyDec = new CostaraDecimal(String(t.target_quantity));
    const suggestedRemainingDec = targetQtyDec.greaterThan(totalYieldDec)
      ? targetQtyDec.minus(totalYieldDec)
      : new CostaraDecimal(0);
    const isFulfilled = totalYieldDec.greaterThanOrEqualTo(targetQtyDec) && targetQtyDec.greaterThan(0);

    return {
      id: t.id,
      business_id: t.business_id,
      production_plan_id: t.production_plan_id,
      target_date: t.target_date,
      item_id: t.item_id,
      item_name: item?.name ?? 'Producto',
      recipe_version_id: t.recipe_version_id,
      target_quantity: targetQtyDec.toString(),
      unit_id: t.unit_id,
      unit_code: unit?.code ?? '',
      notes: t.notes,
      runs: targetRuns,
      total_runs_count: totalRunsCount,
      active_or_completed_runs_count: activeOrCompletedRunsCount,
      in_progress_runs_count: inProgressCount,
      completed_runs_count: completedCount,
      cancelled_runs_count: cancelledCount,
      total_completed_yield: totalYieldDec.toString(),
      suggested_remaining_quantity: suggestedRemainingDec.toString(),
      is_fulfilled: isFulfilled,
    };
  });

  return { targets, unplannedRuns };
}

/**
 * Loads a single production run with all nominal and unplanned inputs.
 */
export async function loadProductionRun(
  supabase: SupabaseClient,
  businessId: string,
  runId: string
): Promise<ProductionRunDetail> {
  const [runRes, inputsRes] = await Promise.all([
    supabase
      .from('production_runs')
      .select(`
        id,
        business_id,
        production_target_id,
        recipe_version_id,
        status,
        planned_yield_quantity,
        planned_yield_unit_id,
        actual_yield_quantity,
        actual_yield_unit_id,
        scheduled_date,
        started_at,
        completed_at,
        notes,
        planned_unit:units!planned_yield_unit_id ( id, code ),
        actual_unit:units!actual_yield_unit_id ( id, code ),
        recipe_versions (
          recipe_id,
          recipes (
            id,
            name,
            output_item_id,
            output_item:items!fk_recipes_output_item_business ( id, name )
          )
        )
      `)
      .eq('id', runId)
      .eq('business_id', businessId)
      .single(),

    supabase
      .from('production_run_inputs')
      .select(`
        id,
        business_id,
        production_run_id,
        recipe_input_id,
        item_id,
        position,
        planned_quantity,
        planned_unit_id,
        actual_quantity,
        actual_unit_id,
        notes,
        items ( id, name ),
        planned_unit:units!planned_unit_id ( id, code ),
        actual_unit:units!actual_unit_id ( id, code )
      `)
      .eq('production_run_id', runId)
      .order('position', { ascending: true }),
  ]);

  if (runRes.error || !runRes.data) {
    throw new Error(`Error al cargar corrida de producción: ${runRes.error?.message ?? 'No encontrada'}`);
  }
  if (inputsRes.error) {
    throw new Error(`Error al cargar insumos de la corrida: ${inputsRes.error.message}`);
  }

  const r = runRes.data as any;
  const plannedUnit = Array.isArray(r.planned_unit) ? r.planned_unit[0] : r.planned_unit;
  const actualUnit = Array.isArray(r.actual_unit) ? r.actual_unit[0] : r.actual_unit;
  const rv = Array.isArray(r.recipe_versions) ? r.recipe_versions[0] : r.recipe_versions;
  const recipe = rv?.recipes ? (Array.isArray(rv.recipes) ? rv.recipes[0] : rv.recipes) : null;
  const outputItem = recipe?.output_item
    ? (Array.isArray(recipe.output_item) ? recipe.output_item[0] : recipe.output_item)
    : recipe?.items
      ? (Array.isArray(recipe.items) ? recipe.items[0] : recipe.items)
      : null;

  const rawInputs = inputsRes.data ?? [];
  const inputs: ProductionRunInputDetail[] = rawInputs.map((inp: any) => {
    const item = Array.isArray(inp.items) ? inp.items[0] : inp.items;
    const pUnit = Array.isArray(inp.planned_unit) ? inp.planned_unit[0] : inp.planned_unit;
    const aUnit = Array.isArray(inp.actual_unit) ? inp.actual_unit[0] : inp.actual_unit;

    const plannedQtyDec = new CostaraDecimal(String(inp.planned_quantity));
    const actualQtyDec = inp.actual_quantity !== null && inp.actual_quantity !== undefined
      ? new CostaraDecimal(String(inp.actual_quantity))
      : null;
    const isUnplanned = inp.recipe_input_id === null;

    let difference: string | null = null;
    if (actualQtyDec !== null && !isUnplanned && inp.actual_unit_id === inp.planned_unit_id) {
      difference = actualQtyDec.minus(plannedQtyDec).toString();
    }

    return {
      id: inp.id,
      business_id: inp.business_id,
      production_run_id: inp.production_run_id,
      recipe_input_id: inp.recipe_input_id,
      item_id: inp.item_id,
      item_name: item?.name ?? 'Insumo',
      position: inp.position,
      planned_quantity: plannedQtyDec.toString(),
      planned_unit_id: inp.planned_unit_id,
      planned_unit_code: pUnit?.code ?? null,
      actual_quantity: actualQtyDec !== null ? actualQtyDec.toString() : null,
      actual_unit_id: inp.actual_unit_id,
      actual_unit_code: aUnit?.code ?? null,
      notes: inp.notes,
      is_unplanned: isUnplanned,
      difference,
    };
  });

  return {
    id: r.id,
    business_id: r.business_id,
    production_target_id: r.production_target_id,
    recipe_version_id: r.recipe_version_id,
    recipe_name: recipe?.name ?? 'Receta',
    output_item_id: outputItem?.id ?? recipe?.output_item_id,
    output_item_name: outputItem?.name ?? recipe?.name ?? 'Producto',
    status: r.status,
    planned_yield_quantity: String(r.planned_yield_quantity),
    planned_yield_unit_id: r.planned_yield_unit_id,
    planned_yield_unit_code: plannedUnit?.code ?? '',
    actual_yield_quantity: r.actual_yield_quantity !== null && r.actual_yield_quantity !== undefined ? String(r.actual_yield_quantity) : null,
    actual_yield_unit_id: r.actual_yield_unit_id,
    actual_yield_unit_code: actualUnit?.code ?? null,
    scheduled_date: r.scheduled_date,
    started_at: r.started_at,
    completed_at: r.completed_at,
    notes: r.notes,
    inputs,
  };
}

export interface StartTargetRunParams {
  runId: string;
  businessId: string;
  targetId: string;
  runScaleTarget: {
    mode: 'yield' | 'output_pieces';
    targetQuantity?: string;
    unitId?: string;
    targetPieces?: string;
  };
  notes?: string | null;
}

/**
 * Invokes the Edge Function start-production-run to instantiate a new physical run.
 */
export async function startTargetProductionRun(
  supabase: SupabaseClient,
  params: StartTargetRunParams
): Promise<{ runId: string; idempotent: boolean }> {
  const { data, error } = await supabase.functions.invoke('start-production-run', {
    body: {
      runId: params.runId,
      businessId: params.businessId,
      targetId: params.targetId,
      runScaleTarget: params.runScaleTarget,
      notes: params.notes ?? null,
    },
  });

  if (error) {
    let errorMessage = error.message;
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (body?.code === 'RECIPE_VERSION_CONFLICT') {
          throw new Error('La receta cambió desde que se planeó esta producción. La versión aplicable no coincide con la versión planeada.');
        }
        if (body?.message) errorMessage = body.message;
      }
    } catch (e: any) {
      if (e.message?.includes('La receta cambió')) throw e;
    }
    throw new Error(errorMessage || 'Error al iniciar la corrida de producción');
  }

  return {
    runId: data?.run_id ?? params.runId,
    idempotent: data?.idempotent === true,
  };
}

/**
 * "Sí, todo igual" quick action:
 * Materializes planned quantities into actual quantities for all nominal inputs that have not yet been confirmed.
 */
export async function confirmPlannedInputsNominal(
  supabase: SupabaseClient,
  inputs: ProductionRunInputDetail[]
): Promise<void> {
  const pendingInputs = inputs.filter((i) => !i.is_unplanned && i.actual_quantity === null);
  if (pendingInputs.length === 0) return;

  const updates = pendingInputs.map((input) =>
    supabase
      .from('production_run_inputs')
      .update({
        actual_quantity: String(input.planned_quantity),
        actual_unit_id: input.planned_unit_id,
      })
      .eq('id', input.id)
  );

  const results = await Promise.all(updates);
  const failure = results.find((r) => r.error);
  if (failure?.error) {
    throw new Error(`Error al confirmar consumos nominales: ${failure.error.message}`);
  }
}

/**
 * Updates actual consumption and notes for an individual input.
 */
export async function updateRunInputActual(
  supabase: SupabaseClient,
  inputId: string,
  actualQuantity: string | null,
  actualUnitId: string | null,
  notes: string | null
): Promise<void> {
  const { error } = await supabase
    .from('production_run_inputs')
    .update({
      actual_quantity: actualQuantity !== null && actualQuantity !== undefined ? String(actualQuantity) : null,
      actual_unit_id: actualQuantity !== null && actualQuantity !== undefined ? actualUnitId : null,
      notes: notes ?? null,
    })
    .eq('id', inputId);

  if (error) {
    throw new Error(`Error al actualizar insumo: ${error.message}`);
  }
}

export interface AddUnplannedInputParams {
  inputId: string;
  runId: string;
  itemId: string;
  actualQuantity?: string | null;
  actualUnitId?: string | null;
  notes?: string | null;
}

/**
 * Calls RPC add_unplanned_production_run_input.
 */
export async function addUnplannedInput(
  supabase: SupabaseClient,
  params: AddUnplannedInputParams
): Promise<string> {
  const { data, error } = await supabase.rpc('add_unplanned_production_run_input', {
    p_input_id: params.inputId,
    p_run_id: params.runId,
    p_item_id: params.itemId,
    p_actual_quantity: params.actualQuantity !== null && params.actualQuantity !== undefined ? String(params.actualQuantity) : null,
    p_actual_unit_id: params.actualUnitId ?? null,
    p_notes: params.notes ?? null,
  });

  if (error) {
    throw new Error(`Error al agregar insumo no planeado: ${error.message}`);
  }
  return data;
}

/**
 * Calls RPC delete_unplanned_production_run_input.
 */
export async function deleteUnplannedInput(
  supabase: SupabaseClient,
  inputId: string
): Promise<void> {
  const { error } = await supabase.rpc('delete_unplanned_production_run_input', {
    p_input_id: inputId,
  });

  if (error) {
    throw new Error(`Error al eliminar insumo no planeado: ${error.message}`);
  }
}

export interface CompleteProductionRunParams {
  runId: string;
  actualYieldQuantity: string;
  actualYieldUnitId: string;
  completedAt?: string | null;
  notes?: string | null;
}

/**
 * Calls RPC complete_production_run.
 */
export async function completeProductionRun(
  supabase: SupabaseClient,
  params: CompleteProductionRunParams
): Promise<void> {
  const { error } = await supabase.rpc('complete_production_run', {
    p_run_id: params.runId,
    p_actual_yield_quantity: String(params.actualYieldQuantity),
    p_actual_yield_unit_id: params.actualYieldUnitId,
    p_completed_at: params.completedAt ?? null,
    p_notes: params.notes ?? null,
  });

  if (error) {
    throw new Error(`Error al completar la corrida: ${error.message}`);
  }
}

/**
 * Calls RPC cancel_production_run.
 */
export async function cancelProductionRun(
  supabase: SupabaseClient,
  runId: string,
  notes: string | null
): Promise<void> {
  const { error } = await supabase.rpc('cancel_production_run', {
    p_run_id: runId,
    p_notes: notes ?? null,
  });

  if (error) {
    if (error.message?.includes('physical consumptions') || error.message?.includes('consumptions')) {
      throw new Error(
        'No se puede cancelar una corrida con consumos reales registrados. Si no se consumió nada, ponga las cantidades reales en 0 o vacías.'
      );
    }
    throw new Error(`Error al cancelar la corrida: ${error.message}`);
  }
}

/**
 * Calls RPC update_production_run_notes.
 */
export async function updateProductionRunNotes(
  supabase: SupabaseClient,
  runId: string,
  notes: string | null
): Promise<void> {
  const { error } = await supabase.rpc('update_production_run_notes', {
    p_run_id: runId,
    p_notes: notes ?? null,
  });

  if (error) {
    throw new Error(`Error al actualizar notas: ${error.message}`);
  }
}

/**
 * Loads available items for adding unplanned inputs (active raw materials and pre-mixes).
 */
export async function loadAvailableItems(
  supabase: SupabaseClient,
  businessId: string
): Promise<AvailableItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select(`
      id,
      name,
      kind,
      base_unit_id,
      units:base_unit_id (
        id,
        code,
        dimension_id,
        unit_dimensions (
          id,
          code
        )
      )
    `)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Error al cargar insumos disponibles: ${error.message}`);
  }

  return (data ?? []).map((item: any) => {
    const unit = Array.isArray(item.units) ? item.units[0] : item.units;
    const dim = unit?.unit_dimensions
      ? Array.isArray(unit.unit_dimensions)
        ? unit.unit_dimensions[0]
        : unit.unit_dimensions
      : null;

    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      base_unit_id: item.base_unit_id,
      base_unit_code: unit?.code ?? '',
      dimension_id: unit?.dimension_id ?? '',
      dimension_code: dim?.code ?? '',
    };
  });
}
