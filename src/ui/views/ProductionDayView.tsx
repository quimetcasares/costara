import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isValidIanaTimezone,
  getOperationalToday,
  formatOperationalDate,
  addDaysToDateStr,
} from '../../lib/dateUtils.js';
import { formatUnit, formatQuantity } from '../../lib/formatters.js';
import { CostaraDecimal } from '../../domain/calculation/decimal.js';
import {
  loadProductionDay,
  startTargetProductionRun,
  type ProductionTargetWithRuns,
  type ProductionRunSummary,
  type ProductionDayData,
} from '../../data/productionExecutionService.js';
import { StartRunModal } from '../components/production/StartRunModal.js';

export interface ProductionDayViewProps {
  readonly supabase: SupabaseClient;
  readonly businessId: string;
  readonly businessTimezone?: string | null;
  readonly dateParam?: string;
  readonly onSelectRun: (runId: string) => void;
  readonly onDateChange: (newDate: string) => void;
}

export function ProductionDayView({
  supabase,
  businessId,
  businessTimezone,
  dateParam,
  onSelectRun,
  onDateChange,
}: ProductionDayViewProps) {
  // 1. Strict timezone validation (prohibits silent fallbacks)
  const isTimezoneValid = isValidIanaTimezone(businessTimezone);

  // Compute operational date
  let operationalToday = '';
  if (isTimezoneValid && businessTimezone) {
    try {
      operationalToday = getOperationalToday(businessTimezone);
    } catch {
      // In case of unexpected environment errors
    }
  }

  const currentDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : operationalToday;

  const [data, setData] = useState<ProductionDayData>({ targets: [], unplannedRuns: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [selectedTargetForRun, setSelectedTargetForRun] = useState<ProductionTargetWithRuns | null>(null);

  const fetchData = useCallback(async () => {
    if (!isTimezoneValid || !currentDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await loadProductionDay(supabase, businessId, currentDate);
      setData(res);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al cargar la producción del día.');
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, businessId, currentDate, isTimezoneValid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!isTimezoneValid) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-red-950/40 border border-red-800 text-red-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h2 className="text-base font-bold text-red-100">
                Zona horaria del negocio inválida o no configurada
              </h2>
              <p className="mt-1 text-xs text-red-300 leading-relaxed">
                El negocio tiene configurado: &quot;{businessTimezone || 'vacío'}&quot;. Costara requiere una zona horaria IANA válida para operar la producción con fecha operacional exacta. Por favor contacta al administrador del sistema.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isToday = currentDate === operationalToday;

  const handlePrevDay = () => {
    onDateChange(addDaysToDateStr(currentDate, -1));
  };

  const handleNextDay = () => {
    onDateChange(addDaysToDateStr(currentDate, 1));
  };

  const handleToday = () => {
    if (operationalToday) {
      onDateChange(operationalToday);
    }
  };

  const handleStartRunConfirm = async (params: { targetQuantity: string; notes: string }) => {
    if (!selectedTargetForRun) return;

    const runId = crypto.randomUUID();
    const isPiece = selectedTargetForRun.unit_code === 'piece';
    const result = await startTargetProductionRun(supabase, {
      runId,
      businessId,
      targetId: selectedTargetForRun.id,
      runScaleTarget: isPiece
        ? {
            mode: 'output_pieces',
            targetPieces: params.targetQuantity,
          }
        : {
            mode: 'yield',
            targetQuantity: params.targetQuantity,
            unitId: selectedTargetForRun.unit_id,
          },
      notes: params.notes || null,
    });

    setSelectedTargetForRun(null);
    onSelectRun(result.runId);
  };

  const renderStatusBadge = (status: ProductionRunSummary['status']) => {
    switch (status) {
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
            En taller
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span>✓</span>
            Terminada
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-stone-100 text-stone-600 border border-stone-300">
            Cancelada
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* 1. Date Navigation Header */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-stone-900">
                {formatOperationalDate(currentDate)}
              </h1>
              {isToday && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  Hoy
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 font-medium">
              Día operacional · {businessTimezone}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrevDay}
              className="py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[44px] flex items-center"
              title="Día anterior"
            >
              ← Ayer
            </button>

            {!isToday && (
              <button
                type="button"
                onClick={handleToday}
                className="py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold rounded-xl transition-colors cursor-pointer min-h-[44px] flex items-center"
              >
                Volver a hoy
              </button>
            )}

            <button
              type="button"
              onClick={handleNextDay}
              className="py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[44px] flex items-center"
              title="Día siguiente"
            >
              Mañana →
            </button>

            <div className="relative">
              <input
                type="date"
                value={currentDate}
                onChange={(e) => {
                  if (e.target.value) {
                    onDateChange(e.target.value);
                  }
                }}
                className="py-2 px-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl text-xs font-medium text-stone-700 focus:outline-hidden focus:border-amber-500 cursor-pointer min-h-[44px]"
                title="Seleccionar fecha"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. State Resolution: Loading -> Error -> Empty -> Content */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-stone-500 font-medium animate-pulse">
            Cargando plan de producción del día...
          </p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-red-200 p-8 sm:p-12 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center text-xl font-bold mx-auto">
            ⚠️
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-red-950">
              Error al cargar el día de producción
            </h3>
            <p className="text-xs text-red-700 max-w-md mx-auto leading-relaxed">
              {error}
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={fetchData}
              className="py-2.5 px-5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        </div>
      ) : data.targets.length === 0 && data.unplannedRuns.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center text-xl font-bold mx-auto">
            📋
          </div>
          <h3 className="text-base font-bold text-stone-900">
            No hay metas de producción planeadas para este día
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
            No se encontraron metas de producción programadas para {formatOperationalDate(currentDate)}.
            Selecciona otra fecha en el navegador superior para revisar otros días.
          </p>
        </div>
      ) : (
        /* 3. Production Targets List */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-stone-800 uppercase tracking-wider">
              Metas del día ({data.targets.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {data.targets.map((target) => {
              const targetQty = new CostaraDecimal(String(target.target_quantity));
              const completedYield = new CostaraDecimal(String(target.total_completed_yield));
              const suggestedRemaining = new CostaraDecimal(String(target.suggested_remaining_quantity));
              const isRemainingPositive = suggestedRemaining.greaterThan(0);
              const isOverproduced = completedYield.greaterThan(targetQty);
              const overproducedQty = isOverproduced ? completedYield.minus(targetQty).toString() : '0';
              const rawProgressPct = targetQty.greaterThan(0)
                ? completedYield.dividedBy(targetQty).times(100).round().toNumber()
                : 0;
              const barWidthPct = Math.min(100, Math.max(0, rawProgressPct));
              const isFulfilled = completedYield.equals(targetQty) && targetQty.greaterThan(0);
              const isPartial = completedYield.greaterThan(0) && completedYield.lessThan(targetQty);
              const isZeroCompleted = target.completed_runs_count > 0 && completedYield.isZero();

              return (
                <div
                  key={target.id}
                  className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs hover:border-stone-300 transition-colors space-y-5"
                >
                  {/* Top target header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-black text-stone-900">
                          {target.item_name}
                        </h3>

                        {target.in_progress_runs_count > 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            En taller
                          </span>
                        ) : isOverproduced ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Meta superada
                          </span>
                        ) : isFulfilled ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Meta cumplida (100%)
                          </span>
                        ) : isPartial ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                            Parcial ({rawProgressPct}%)
                          </span>
                        ) : isZeroCompleted ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                            Parcial (0%)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-600 border border-stone-300">
                            Por iniciar
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-stone-500 font-medium">
                        Meta total:{' '}
                        <span className="font-bold text-stone-800">
                          {formatQuantity(target.target_quantity)} {formatUnit(target.unit_code, target.target_quantity)}
                        </span>
                      </p>
                      {target.notes && (
                        <p className="text-[11px] text-stone-400 italic">
                          {target.notes}
                        </p>
                      )}
                    </div>

                    {/* Action Button */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setSelectedTargetForRun(target)}
                        className="w-full sm:w-auto py-2.5 px-5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer min-h-[44px] flex items-center justify-center gap-2"
                      >
                        <span>➕</span>
                        <span>
                          {target.active_or_completed_runs_count === 0 ? 'Iniciar corrida' : 'Iniciar otro lote'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar & Summary */}
                  <div className="space-y-1.5 bg-stone-50 rounded-xl p-3.5 border border-stone-200/70">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-medium text-stone-700">
                      <span>
                        Producido: <strong className="text-stone-900">{formatQuantity(target.total_completed_yield)} {formatUnit(target.unit_code, target.total_completed_yield)}</strong> de{' '}
                        <strong>{formatQuantity(target.target_quantity)} {formatUnit(target.unit_code, target.target_quantity)}</strong>
                      </span>
                      <span>
                        {isOverproduced ? (
                          <span className="text-emerald-700 font-bold">
                            +{formatQuantity(overproducedQty)} {formatUnit(target.unit_code, overproducedQty)} sobre la meta ({rawProgressPct}%)
                          </span>
                        ) : isRemainingPositive ? (
                          <span className="text-amber-800 font-bold">
                            Faltan {formatQuantity(target.suggested_remaining_quantity)} {formatUnit(target.unit_code, target.suggested_remaining_quantity)}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold">Meta cubierta (100%)</span>
                        )}
                      </span>
                    </div>

                    <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          completedYield.greaterThanOrEqualTo(targetQty) ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${barWidthPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Associated Runs */}
                  {target.runs.length > 0 && (
                    <div className="pt-2 border-t border-stone-100 space-y-2">
                      <p className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                        Lotes ({target.runs.length})
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {target.runs.map((run, idx) => (
                          <button
                            key={run.id}
                            type="button"
                            onClick={() => onSelectRun(run.id)}
                            className="p-3 bg-stone-50 hover:bg-amber-50/60 border border-stone-200 hover:border-amber-300 rounded-xl text-left transition-colors cursor-pointer group flex items-center justify-between min-h-[44px]"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-stone-900 group-hover:text-amber-900">
                                  Lote #{idx + 1}
                                </span>
                                <span className="text-xs font-medium text-stone-600">
                                  {formatQuantity(run.planned_yield_quantity)} {formatUnit(run.planned_yield_unit_code, run.planned_yield_quantity)}
                                </span>
                              </div>
                              {run.actual_yield_quantity !== null && (
                                <p className="text-[11px] text-emerald-700 font-medium">
                                  Rendimiento real: {formatQuantity(run.actual_yield_quantity)} {formatUnit(run.actual_yield_unit_code ?? run.planned_yield_unit_code, run.actual_yield_quantity)}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {renderStatusBadge(run.status)}
                              <span className="text-stone-400 group-hover:text-amber-600 text-sm">
                                →
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 4. Unplanned Runs Section */}
          {data.unplannedRuns.length > 0 && (
            <div className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-stone-800 uppercase tracking-wider">
                  Corridas fuera de plan ({data.unplannedRuns.length})
                </h2>
                <span className="text-xs text-stone-500">
                  Iniciadas directamente en taller
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.unplannedRuns.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => onSelectRun(run.id)}
                    className="bg-white p-4 rounded-2xl border border-stone-200 hover:border-amber-300 shadow-xs hover:bg-amber-50/40 text-left transition-colors cursor-pointer group flex items-center justify-between min-h-[44px]"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-stone-900 group-hover:text-amber-900">
                          {run.item_name ?? 'Producto sin target'}
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 font-medium">
                        Planeado: {formatQuantity(run.planned_yield_quantity)} {formatUnit(run.planned_yield_unit_code, run.planned_yield_quantity)}
                        {run.actual_yield_quantity !== null && (
                          <span className="ml-2 text-emerald-700 font-bold">
                            · Real: {formatQuantity(run.actual_yield_quantity)} {formatUnit(run.actual_yield_unit_code ?? run.planned_yield_unit_code, run.actual_yield_quantity)}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {renderStatusBadge(run.status)}
                      <span className="text-stone-400 group-hover:text-amber-600 text-sm">
                        →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Start Run Modal */}
      <StartRunModal
        target={selectedTargetForRun}
        isOpen={Boolean(selectedTargetForRun)}
        onClose={() => setSelectedTargetForRun(null)}
        onConfirm={handleStartRunConfirm}
      />
    </div>
  );
}
