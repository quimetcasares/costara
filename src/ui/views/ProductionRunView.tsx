import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDateTime, formatOperationalDate } from '../../lib/dateUtils.js';
import { formatUnit, formatQuantity } from '../../lib/formatters.js';
import { CostaraDecimal } from '../../domain/calculation/decimal.js';
import {
  loadProductionRun,
  loadAvailableItems,
  confirmPlannedInputsNominal,
  updateRunInputActual,
  addUnplannedInput,
  deleteUnplannedInput,
  completeProductionRun,
  cancelProductionRun,
  updateProductionRunNotes,
  type ProductionRunDetail,
  type ProductionRunInputDetail,
  type AvailableItem,
} from '../../data/productionExecutionService.js';
import { AddUnplannedInputModal } from '../components/production/AddUnplannedInputModal.js';
import { CompleteRunModal } from '../components/production/CompleteRunModal.js';
import { CancelRunModal } from '../components/production/CancelRunModal.js';
import { DeleteUnplannedInputModal } from '../components/production/DeleteUnplannedInputModal.js';

export interface ProductionRunViewProps {
  readonly supabase: SupabaseClient;
  readonly businessId: string;
  readonly businessTimezone?: string;
  readonly runId: string;
  readonly onBack: (scheduledDate?: string) => void;
  readonly onComplete?: (scheduledDate: string) => void;
  readonly onCancel?: (scheduledDate: string) => void;
}

export function ProductionRunView({
  supabase,
  businessId,
  businessTimezone,
  runId,
  onBack,
  onComplete,
  onCancel,
}: ProductionRunViewProps) {
  const [run, setRun] = useState<ProductionRunDetail | null>(null);
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Notes editing state
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState('');

  // Exception editing mode state
  const [isEditingExceptions, setIsEditingExceptions] = useState(false);

  // Row inline edit state (map of inputId -> { actualQty: string, notes: string })
  const [inputEdits, setInputEdits] = useState<Record<string, { actualQty: string; notes: string }>>({});

  // Modals state
  const [isAddUnplannedOpen, setIsAddUnplannedOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [inputToDelete, setInputToDelete] = useState<ProductionRunInputDetail | null>(null);

  const fetchRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [runData, itemsData] = await Promise.all([
        loadProductionRun(supabase, businessId, runId),
        loadAvailableItems(supabase, businessId),
      ]);
      setRun(runData);
      setAvailableItems(itemsData);
      setEditedNotes(runData.notes ?? '');

      // Initialize inline edit state
      const initialEdits: Record<string, { actualQty: string; notes: string }> = {};
      for (const inp of runData.inputs) {
        initialEdits[inp.id] = {
          actualQty: inp.actual_quantity !== null ? formatQuantity(inp.actual_quantity) : '',
          notes: inp.notes ?? '',
        };
      }
      setInputEdits(initialEdits);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al cargar la corrida.');
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, businessId, runId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  const showSuccess = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 4000);
  };

  // "Sí, todo igual" quick action
  const handleConfirmAllPlanned = async () => {
    if (!run) return;
    setActionLoading(true);
    setError(null);
    try {
      await confirmPlannedInputsNominal(supabase, run.inputs);
      await fetchRun();
      setIsEditingExceptions(false);
      showSuccess('Se confirmaron todos los insumos planeados como consumo real.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al confirmar insumos planeados.');
    } finally {
      setActionLoading(false);
    }
  };

  // "Hubo cambios" action: materializes planned values and enables exception editing
  const handleChangesClick = async () => {
    if (!run) return;
    setActionLoading(true);
    setError(null);
    try {
      await confirmPlannedInputsNominal(supabase, run.inputs);
      await fetchRun();
      setIsEditingExceptions(true);
      showSuccess('Cantidades planeadas precargadas. Modifica únicamente los insumos que hayan variado.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al precargar insumos.');
    } finally {
      setActionLoading(false);
    }
  };

  // Save individual row actual quantity and notes
  const handleSaveRow = async (input: ProductionRunInputDetail) => {
    const edit = inputEdits[input.id];
    if (!edit) return;

    const trimmed = edit.actualQty.trim();
    let qtyToSave: string | null = null;
    if (trimmed !== '') {
      try {
        const dec = new CostaraDecimal(trimmed);
        if (dec.isNaN() || dec.lessThan(0)) {
          setError('La cantidad consumida debe ser mayor o igual a cero.');
          return;
        }
        qtyToSave = dec.toString();
      } catch {
        setError('La cantidad consumida debe ser un número válido mayor o igual a cero.');
        return;
      }
    }

    const unitId = qtyToSave !== null ? (input.actual_unit_id ?? input.planned_unit_id) : null;

    setActionLoading(true);
    setError(null);
    try {
      await updateRunInputActual(supabase, input.id, qtyToSave, unitId, edit.notes.trim() || null);
      await fetchRun();
      showSuccess(`Consumo de ${input.item_name} guardado.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar insumo.');
    } finally {
      setActionLoading(false);
    }
  };

  // Save run notes
  const handleSaveNotes = async () => {
    if (!run) return;
    setActionLoading(true);
    setError(null);
    try {
      await updateProductionRunNotes(supabase, run.id, editedNotes.trim() || null);
      setIsEditingNotes(false);
      await fetchRun();
      showSuccess('Notas de la corrida actualizadas.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al actualizar notas.');
    } finally {
      setActionLoading(false);
    }
  };

  // Add unplanned input confirm
  const handleAddUnplannedConfirm = async (params: {
    itemId: string;
    actualQuantity: string;
    actualUnitId: string;
    notes: string;
  }) => {
    if (!run) return;
    const inputId = crypto.randomUUID();
    await addUnplannedInput(supabase, {
      inputId,
      runId: run.id,
      itemId: params.itemId,
      actualQuantity: params.actualQuantity,
      actualUnitId: params.actualUnitId,
      notes: params.notes || null,
    });
    setIsAddUnplannedOpen(false);
    await fetchRun();
    showSuccess('Insumo no planeado agregado a la corrida.');
  };

  // Delete unplanned input trigger
  const handleDeleteUnplanned = (input: ProductionRunInputDetail) => {
    setInputToDelete(input);
  };

  const handleConfirmDeleteUnplanned = async () => {
    if (!inputToDelete) return;
    setActionLoading(true);
    setError(null);
    try {
      await deleteUnplannedInput(supabase, inputToDelete.id);
      setInputToDelete(null);
      await fetchRun();
      showSuccess('Insumo no planeado eliminado.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al eliminar insumo.');
    } finally {
      setActionLoading(false);
    }
  };

  // Complete run confirm
  const handleCompleteConfirm = async (params: {
    actualYieldQuantity: string;
    notes: string;
  }) => {
    if (!run) return;
    await completeProductionRun(supabase, {
      runId: run.id,
      actualYieldQuantity: params.actualYieldQuantity,
      actualYieldUnitId: run.planned_yield_unit_id,
      notes: params.notes || null,
    });
    setIsCompleteOpen(false);
    if (onComplete) {
      onComplete(run.scheduled_date);
    } else {
      onBack(run.scheduled_date);
    }
  };

  // Cancel run confirm
  const handleCancelConfirm = async (notes: string) => {
    if (!run) return;
    await cancelProductionRun(supabase, run.id, notes);
    setIsCancelOpen(false);
    if (onCancel) {
      onCancel(run.scheduled_date);
    } else {
      onBack(run.scheduled_date);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center space-y-3 max-w-4xl mx-auto">
        <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-stone-500 font-medium animate-pulse">
          Cargando detalle de la corrida...
        </p>
      </div>
    );
  }

  if (error && !run) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700">
          <h2 className="font-bold text-sm text-red-900">Error al cargar la corrida</h2>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={() => onBack()}
            className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl font-bold cursor-pointer"
          >
            ← Volver a producción
          </button>
        </div>
      </div>
    );
  }

  if (!run) return null;

  const isInProgress = run.status === 'in_progress';
  const isCompleted = run.status === 'completed';
  const isCancelled = run.status === 'cancelled';

  const pendingInputs = run.inputs.filter((i) => i.actual_quantity === null);
  const hasPendingInputs = pendingInputs.length > 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* 1. Back Navigation & Header */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onBack(run.scheduled_date)}
          className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1.5 py-2 px-3 rounded-xl hover:bg-stone-200/60 transition-colors cursor-pointer min-h-[44px]"
        >
          <span>←</span>
          <span>Volver al día de producción</span>
        </button>

        <div className="flex items-center gap-2">
          {isInProgress && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
              En taller
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
              <span>✓</span>
              Corrida terminada
            </span>
          )}
          {isCancelled && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-600 border border-stone-300 shadow-xs">
              Corrida cancelada
            </span>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-medium flex items-center gap-2 shadow-xs">
          <span>✓</span>
          <span>{successNotice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-medium flex items-start gap-2 shadow-xs">
          <span>⚠️</span>
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* 2. Run Details Card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              {run.output_item_name}
            </h1>
            <p className="text-xs text-stone-500 font-medium mt-0.5">
              Receta: {run.recipe_name}
            </p>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                Lote planeado
              </span>
              <span className="text-lg font-black text-stone-900">
                {formatQuantity(run.planned_yield_quantity)} {formatUnit(run.planned_yield_unit_code, run.planned_yield_quantity)}
              </span>
            </div>

            {isCompleted && run.actual_yield_quantity !== null && (
              <div className="border-l border-stone-200 pl-4">
                <span className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                  Rendimiento real
                </span>
                <span className="text-lg font-black text-emerald-800">
                  {formatQuantity(run.actual_yield_quantity)} {formatUnit(run.actual_yield_unit_code ?? run.planned_yield_unit_code, run.actual_yield_quantity)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Timestamps & Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/60">
            <span className="block text-[11px] text-stone-500 font-medium">Fecha programada</span>
            <span className="font-bold text-stone-800">{formatOperationalDate(run.scheduled_date, 'short')}</span>
          </div>

          <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/60">
            <span className="block text-[11px] text-stone-500 font-medium">Hora de inicio</span>
            <span className="font-bold text-stone-800">{formatDateTime(run.started_at, businessTimezone)}</span>
          </div>

          {isCompleted && (
            <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/60">
              <span className="block text-[11px] text-stone-500 font-medium">Hora de cierre</span>
              <span className="font-bold text-stone-800">{formatDateTime(run.completed_at, businessTimezone)}</span>
            </div>
          )}

          <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/60 col-span-2 sm:col-span-1">
            <span className="block text-[11px] text-stone-500 font-medium">Insumos totales</span>
            <span className="font-bold text-stone-800">
              {run.inputs.length} insumos ({run.inputs.filter((i) => i.is_unplanned).length} no planeados)
            </span>
          </div>
        </div>

        {/* Notes section */}
        <div className="pt-2 border-t border-stone-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700">Notas de la corrida</span>
            {isInProgress && !isEditingNotes && (
              <button
                type="button"
                onClick={() => setIsEditingNotes(true)}
                className="text-xs text-amber-700 hover:text-amber-800 font-bold cursor-pointer"
              >
                Editar notas
              </button>
            )}
          </div>

          {isEditingNotes ? (
            <div className="mt-2 space-y-2">
              <textarea
                rows={2}
                value={editedNotes}
                onChange={(e) => setEditedNotes(e.target.value)}
                placeholder="Notas de taller o incidentes..."
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-hidden focus:border-amber-500 focus:bg-white resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingNotes(false);
                    setEditedNotes(run.notes ?? '');
                  }}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-800 font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-stone-600 mt-1 italic">
              {run.notes || 'Sin notas registradas.'}
            </p>
          )}
        </div>
      </div>

      {/* 3. Action Bar for In Progress */}
      {isInProgress && (
        <div className="space-y-3">
          {hasPendingInputs ? (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-black text-amber-950">
                    ¿Usaste las cantidades planeadas?
                  </h2>
                  <p className="text-xs text-amber-800/90 leading-relaxed">
                    Confirma rápidamente si la pesada en báscula coincidió con la receta o si hubo ajustes en taller.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* "Sí, todo igual" button */}
                  <button
                    type="button"
                    onClick={handleConfirmAllPlanned}
                    disabled={actionLoading}
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer min-h-[44px] flex items-center gap-2"
                  >
                    <span>✓</span>
                    <span>Sí, todo igual</span>
                  </button>

                  {/* "Hubo cambios" button */}
                  <button
                    type="button"
                    onClick={handleChangesClick}
                    disabled={actionLoading}
                    className="py-2.5 px-4 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer min-h-[44px] flex items-center gap-2"
                  >
                    <span>✏️</span>
                    <span>Hubo cambios</span>
                  </button>

                  {/* Add unplanned button */}
                  <button
                    type="button"
                    onClick={() => setIsAddUnplannedOpen(true)}
                    disabled={actionLoading}
                    className="py-2.5 px-3.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-colors cursor-pointer min-h-[44px] flex items-center gap-1.5"
                  >
                    <span>➕</span>
                    <span>Insumo no planeado</span>
                  </button>
                </div>
              </div>
            </div>
          ) : isEditingExceptions ? (
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="text-xs text-stone-700 space-y-0.5">
                <span className="font-bold text-stone-900 block">Edita solo lo que cambió</span>
                <span>Las cantidades planeadas ya fueron cargadas.</span>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setIsAddUnplannedOpen(true)}
                  disabled={actionLoading}
                  className="py-2 px-3.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-colors cursor-pointer min-h-[44px] flex items-center gap-1.5"
                >
                  <span>➕</span>
                  <span>Insumo no planeado</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="text-xs text-stone-600">
                <span>Consumo registrado. Puedes modificar cualquier insumo individualmente si requieres hacer ajustes.</span>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setIsAddUnplannedOpen(true)}
                  disabled={actionLoading}
                  className="py-2 px-3.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-colors cursor-pointer min-h-[44px] flex items-center gap-1.5"
                >
                  <span>➕</span>
                  <span>Insumo no planeado</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Inputs Table / Workshop Cards */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              Insumos de la corrida ({run.inputs.length})
            </h2>
            <p className="text-xs text-stone-500">
              Cantidades planeadas y consumo real
            </p>
          </div>

          {isInProgress && hasPendingInputs && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
              {pendingInputs.length} {pendingInputs.length === 1 ? 'pendiente' : 'pendientes'} por confirmar
            </span>
          )}
        </div>

        {/* Desktop Table Layout */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-stone-700">
            <thead className="bg-stone-50 text-stone-500 font-bold uppercase tracking-wider border-b border-stone-200 text-[11px]">
              <tr>
                <th className="px-4 py-3">Insumo</th>
                <th className="px-4 py-3">Planeado</th>
                <th className="px-4 py-3 w-48">Consumo Real</th>
                <th className="px-4 py-3">Diferencia</th>
                <th className="px-4 py-3">Notas</th>
                {isInProgress && <th className="px-4 py-3 text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {run.inputs.map((inp) => {
                const edit = inputEdits[inp.id] ?? { actualQty: '', notes: '' };
                const persistedActualStr = inp.actual_quantity !== null ? formatQuantity(inp.actual_quantity) : '';
                const persistedNotesStr = inp.notes ?? '';
                const isChanged = edit.actualQty !== persistedActualStr || edit.notes !== persistedNotesStr;

                // Live quantity calculation for difference
                let effectiveQtyDec: CostaraDecimal | null = null;
                if (isInProgress) {
                  const trimmed = edit.actualQty.trim();
                  if (trimmed !== '') {
                    try {
                      const parsed = new CostaraDecimal(trimmed);
                      if (!parsed.isNaN() && parsed.greaterThanOrEqualTo(0)) {
                        effectiveQtyDec = parsed;
                      }
                    } catch {
                      effectiveQtyDec = null;
                    }
                  }
                } else if (inp.actual_quantity !== null) {
                  effectiveQtyDec = new CostaraDecimal(inp.actual_quantity);
                }

                // Live difference
                let liveDiffDec: CostaraDecimal | null = null;
                if (effectiveQtyDec !== null && inp.planned_quantity !== null && inp.planned_quantity !== undefined) {
                  try {
                    const plannedDec = new CostaraDecimal(inp.planned_quantity);
                    liveDiffDec = effectiveQtyDec.minus(plannedDec);
                  } catch {
                    liveDiffDec = null;
                  }
                }

                return (
                  <tr key={inp.id} className="hover:bg-stone-50/50 transition-colors">
                    {/* Item */}
                    <td className="px-4 py-3 font-semibold text-stone-900">
                      <div className="flex items-center gap-2">
                        <span>{inp.item_name}</span>
                        {inp.is_unplanned && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            No planeado
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Planned */}
                    <td className="px-4 py-3 font-medium text-stone-600">
                      {inp.is_unplanned ? (
                        <span className="text-stone-400">-</span>
                      ) : (
                        <span>
                          {formatQuantity(inp.planned_quantity)} {formatUnit(inp.planned_unit_code, inp.planned_quantity)}
                        </span>
                      )}
                    </td>

                    {/* Actual */}
                    <td className="px-4 py-2.5">
                      {isInProgress ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={edit.actualQty}
                            onChange={(e) =>
                              setInputEdits({
                                ...inputEdits,
                                [inp.id]: { ...edit, actualQty: e.target.value },
                              })
                            }
                            placeholder="Cantidad usada"
                            className="w-32 px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-hidden focus:border-amber-500 focus:bg-white"
                          />
                          <span className="text-xs font-semibold text-stone-500">
                            {formatUnit(inp.actual_unit_code ?? inp.planned_unit_code, edit.actualQty)}
                          </span>
                        </div>
                      ) : (
                        <span className="font-bold text-stone-900">
                          {inp.actual_quantity !== null
                            ? `${formatQuantity(inp.actual_quantity)} ${formatUnit(inp.actual_unit_code ?? inp.planned_unit_code, inp.actual_quantity)}`
                            : '-'}
                        </span>
                      )}
                    </td>

                    {/* Difference */}
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {effectiveQtyDec === null ? (
                          <span className="text-stone-400 italic">Pendiente</span>
                        ) : inp.is_unplanned ? (
                          <span className="text-amber-700 font-bold">Adicional</span>
                        ) : liveDiffDec !== null && liveDiffDec.isZero() ? (
                          <span className="text-emerald-700 font-bold">Exacto</span>
                        ) : liveDiffDec !== null && liveDiffDec.greaterThan(0) ? (
                          <span className="text-amber-700 font-bold">
                            +{formatQuantity(liveDiffDec)} {formatUnit(inp.actual_unit_code ?? inp.planned_unit_code, liveDiffDec)}
                          </span>
                        ) : liveDiffDec !== null ? (
                          <span className="text-indigo-700 font-bold">
                            {formatQuantity(liveDiffDec)} {formatUnit(inp.actual_unit_code ?? inp.planned_unit_code, liveDiffDec)}
                          </span>
                        ) : null}

                        {isChanged && isInProgress && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Sin guardar
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Notes */}
                    <td className="px-4 py-2.5">
                      {isInProgress ? (
                        <input
                          type="text"
                          value={edit.notes}
                          onChange={(e) =>
                            setInputEdits({
                              ...inputEdits,
                              [inp.id]: { ...edit, notes: e.target.value },
                            })
                          }
                          placeholder="Nota..."
                          className="w-full px-2 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 focus:outline-hidden focus:border-amber-500"
                        />
                      ) : (
                        <span className="text-stone-500">{inp.notes || '-'}</span>
                      )}
                    </td>

                    {/* Actions */}
                    {isInProgress && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isChanged && (
                            <button
                              type="button"
                              onClick={() => handleSaveRow(inp)}
                              disabled={actionLoading}
                              className="py-1 px-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                              title="Guardar cambios"
                            >
                              Guardar
                            </button>
                          )}
                          {inp.is_unplanned && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUnplanned(inp)}
                              disabled={actionLoading}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                              title="Eliminar insumo no planeado"
                              aria-label="Eliminar insumo no planeado"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Card Layout */}
        <div className="md:hidden divide-y divide-stone-100">
          {run.inputs.map((inp) => {
            const edit = inputEdits[inp.id] ?? { actualQty: '', notes: '' };
            const persistedActualStr = inp.actual_quantity !== null ? formatQuantity(inp.actual_quantity) : '';
            const persistedNotesStr = inp.notes ?? '';
            const isChanged = edit.actualQty !== persistedActualStr || edit.notes !== persistedNotesStr;

            // Live quantity calculation for difference
            let effectiveQtyDec: CostaraDecimal | null = null;
            if (isInProgress) {
              const trimmed = edit.actualQty.trim();
              if (trimmed !== '') {
                try {
                  const parsed = new CostaraDecimal(trimmed);
                  if (!parsed.isNaN() && parsed.greaterThanOrEqualTo(0)) {
                    effectiveQtyDec = parsed;
                  }
                } catch {
                  effectiveQtyDec = null;
                }
              }
            } else if (inp.actual_quantity !== null) {
              effectiveQtyDec = new CostaraDecimal(inp.actual_quantity);
            }

            // Live difference
            let liveDiffDec: CostaraDecimal | null = null;
            if (effectiveQtyDec !== null && inp.planned_quantity !== null && inp.planned_quantity !== undefined) {
              try {
                const plannedDec = new CostaraDecimal(inp.planned_quantity);
                liveDiffDec = effectiveQtyDec.minus(plannedDec);
              } catch {
                liveDiffDec = null;
              }
            }

            return (
              <div key={inp.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-stone-900 text-sm">
                    {inp.item_name}
                  </div>
                  {inp.is_unplanned && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      No planeado
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/60">
                    <span className="block text-[10px] text-stone-500 uppercase font-semibold">
                      Planeado
                    </span>
                    <span className="font-bold text-stone-800">
                      {inp.is_unplanned ? '-' : `${formatQuantity(inp.planned_quantity)} ${formatUnit(inp.planned_unit_code, inp.planned_quantity)}`}
                    </span>
                  </div>

                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/60">
                    <div className="flex items-center justify-between">
                      <span className="block text-[10px] text-stone-500 uppercase font-semibold">
                        Diferencia
                      </span>
                      {isChanged && isInProgress && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          Sin guardar
                        </span>
                      )}
                    </div>
                    <span className="font-bold">
                      {effectiveQtyDec === null ? (
                        <span className="text-stone-400 italic">Pendiente</span>
                      ) : inp.is_unplanned ? (
                        <span className="text-amber-700">Adicional</span>
                      ) : liveDiffDec !== null && liveDiffDec.isZero() ? (
                        <span className="text-emerald-700">Exacto</span>
                      ) : liveDiffDec !== null && liveDiffDec.greaterThan(0) ? (
                        <span className="text-amber-700">+{formatQuantity(liveDiffDec)} {formatUnit(inp.actual_unit_code ?? inp.planned_unit_code, liveDiffDec)}</span>
                      ) : liveDiffDec !== null ? (
                        <span className="text-indigo-700">{formatQuantity(liveDiffDec)} {formatUnit(inp.actual_unit_code ?? inp.planned_unit_code, liveDiffDec)}</span>
                      ) : null}
                    </span>
                  </div>
                </div>

                {isInProgress ? (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        Consumo real ({formatUnit(inp.actual_unit_code ?? inp.planned_unit_code)})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={edit.actualQty}
                        onChange={(e) =>
                          setInputEdits({
                            ...inputEdits,
                            [inp.id]: { ...edit, actualQty: e.target.value },
                          })
                        }
                        placeholder="Cantidad usada"
                        className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm font-bold text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-hidden focus:border-amber-500 min-h-[44px]"
                      />
                    </div>

                    <div>
                      <input
                        type="text"
                        value={edit.notes}
                        onChange={(e) =>
                          setInputEdits({
                            ...inputEdits,
                            [inp.id]: { ...edit, notes: e.target.value },
                          })
                        }
                        placeholder="Nota sobre la diferencia..."
                        className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 focus:outline-hidden focus:border-amber-500"
                      />
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      {inp.is_unplanned && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUnplanned(inp)}
                          disabled={actionLoading}
                          className="py-2 px-3 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl cursor-pointer"
                          aria-label="Eliminar insumo no planeado"
                        >
                          Eliminar
                        </button>
                      )}
                      {isChanged && (
                        <button
                          type="button"
                          onClick={() => handleSaveRow(inp)}
                          disabled={actionLoading}
                          className="py-2 px-4 bg-amber-600 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs min-h-[44px]"
                        >
                          Guardar consumo
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs">
                    <span className="text-stone-500">Real: </span>
                    <strong className="text-stone-900">
                      {inp.actual_quantity !== null
                        ? `${formatQuantity(inp.actual_quantity)} ${formatUnit(inp.actual_unit_code ?? inp.planned_unit_code, inp.actual_quantity)}`
                        : '-'}
                    </strong>
                    {inp.notes && <span className="ml-2 text-stone-500 italic">({inp.notes})</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Completion & Cancellation Controls */}
      {isInProgress && (
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-stone-200">
          <div>
            <button
              type="button"
              onClick={() => setIsCancelOpen(true)}
              className="text-xs text-stone-500 hover:text-red-700 font-semibold py-2 px-3 rounded-xl hover:bg-red-50 transition-colors cursor-pointer min-h-[44px]"
            >
              Cancelar corrida...
            </button>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setIsCompleteOpen(true)}
              className="w-full sm:w-auto py-3.5 px-8 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-bold rounded-2xl shadow-sm transition-colors cursor-pointer min-h-[48px] flex items-center justify-center gap-2"
            >
              <span>✓</span>
              <span>Terminar producción</span>
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddUnplannedInputModal
        isOpen={isAddUnplannedOpen}
        onClose={() => setIsAddUnplannedOpen(false)}
        availableItems={availableItems}
        onConfirm={handleAddUnplannedConfirm}
      />

      <CompleteRunModal
        run={run}
        isOpen={isCompleteOpen}
        onClose={() => setIsCompleteOpen(false)}
        onConfirm={handleCompleteConfirm}
        onFillPendingWithPlanned={handleConfirmAllPlanned}
      />

      <CancelRunModal
        run={run}
        isOpen={isCancelOpen}
        onClose={() => setIsCancelOpen(false)}
        onConfirm={handleCancelConfirm}
      />

      <DeleteUnplannedInputModal
        isOpen={Boolean(inputToDelete)}
        input={inputToDelete}
        onClose={() => setInputToDelete(null)}
        onConfirm={handleConfirmDeleteUnplanned}
      />
    </div>
  );
}
