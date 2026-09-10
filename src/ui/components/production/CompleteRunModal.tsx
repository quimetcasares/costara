import { useState, useEffect } from 'react';
import type { ProductionRunDetail } from '../../../data/productionExecutionService.js';
import { CostaraDecimal } from '../../../domain/calculation/decimal.js';
import { formatUnit, formatQuantity } from '../../../lib/formatters.js';

export interface CompleteRunModalProps {
  readonly run: ProductionRunDetail;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (params: {
    actualYieldQuantity: string;
    notes: string;
  }) => Promise<void>;
  readonly onFillPendingWithPlanned?: () => Promise<void>;
}

export function CompleteRunModal({
  run,
  isOpen,
  onClose,
  onConfirm,
  onFillPendingWithPlanned,
}: CompleteRunModalProps) {
  const [yieldQty, setYieldQty] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [confirmZeroLoss, setConfirmZeroLoss] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fillingNominal, setFillingNominal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingInputs = run.inputs.filter((i) => i.actual_quantity === null);
  const hasPendingInputs = pendingInputs.length > 0;

  useEffect(() => {
    if (isOpen) {
      setYieldQty(formatQuantity(run.planned_yield_quantity));
      setNotes(run.notes ?? '');
      setConfirmZeroLoss(false);
      setError(null);
      setLoading(false);
      setFillingNominal(false);
    }
  }, [isOpen, run]);

  if (!isOpen) return null;

  let validYieldDec: CostaraDecimal | null = null;
  const trimmedYield = yieldQty.trim();
  if (trimmedYield !== '') {
    try {
      const parsed = new CostaraDecimal(trimmedYield);
      if (!parsed.isNaN() && parsed.greaterThanOrEqualTo(0)) {
        validYieldDec = parsed;
      }
    } catch {
      validYieldDec = null;
    }
  }

  const isZeroYield = validYieldDec !== null && validYieldDec.isZero();

  const handleFillPending = async () => {
    if (!onFillPendingWithPlanned) return;
    setFillingNominal(true);
    setError(null);
    try {
      await onFillPendingWithPlanned();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al llenar insumos pendientes');
    } finally {
      setFillingNominal(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (hasPendingInputs) {
      setError('Hay insumos sin consumo real confirmado. Resuélvelos antes de terminar la corrida.');
      return;
    }

    if (!validYieldDec) {
      setError('El rendimiento real debe ser un número mayor o igual a cero.');
      return;
    }

    if (isZeroYield && !confirmZeroLoss) {
      setError('Debes marcar la casilla para confirmar que el rendimiento fue 0 (pérdida total).');
      return;
    }

    setLoading(true);
    try {
      await onConfirm({
        actualYieldQuantity: validYieldDec.toString(),
        notes: notes.trim(),
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al completar la corrida de producción.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-run-modal-title"
      >
        <div className="px-6 pt-6 pb-4 border-b border-stone-100">
          <div className="flex items-center justify-between">
            <h3 id="complete-run-modal-title" className="text-lg font-bold text-stone-900">
              Terminar corrida de producción
            </h3>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="text-stone-400 hover:text-stone-600 p-2 rounded-lg cursor-pointer"
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {run.output_item_name} · Meta planeada: {formatQuantity(run.planned_yield_quantity)} {formatUnit(run.planned_yield_unit_code, run.planned_yield_quantity)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          {hasPendingInputs && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <span>⚠️</span>
                <span>Faltan insumos por confirmar consumo</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Hay {pendingInputs.length} {pendingInputs.length === 1 ? 'insumo' : 'insumos'} sin consumo real registrado. La base de datos no permite completar la producción si quedan insumos pendientes.
              </p>
              {onFillPendingWithPlanned && (
                <button
                  type="button"
                  onClick={handleFillPending}
                  disabled={fillingNominal || loading}
                  className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold text-[11px] cursor-pointer transition-colors shadow-xs flex items-center justify-center gap-2"
                >
                  {fillingNominal ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Confirmando consumos planeados...</span>
                    </>
                  ) : (
                    <span>Confirmar todos los pendientes con valor planeado</span>
                  )}
                </button>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Rendimiento real obtenido ({formatUnit(run.planned_yield_unit_code)}) *
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                required
                value={yieldQty}
                onChange={(e) => setYieldQty(e.target.value)}
                placeholder="0"
                disabled={loading || hasPendingInputs}
                className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl text-base font-semibold text-stone-900 focus:outline-hidden focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-200 min-h-[44px] disabled:opacity-50"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-500 pointer-events-none">
                {formatUnit(run.planned_yield_unit_code, yieldQty)}
              </span>
            </div>
            <p className="text-[11px] text-stone-500 mt-1">
              Cantidad final obtenida en esta corrida.
            </p>
          </div>

          {isZeroYield && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 space-y-2">
              <p className="font-bold text-red-800">
                Aviso: Rendimiento capturado en 0
              </p>
              <p className="text-[11px] text-red-700 leading-relaxed">
                Se registrará una corrida completada con rendimiento final de 0. Los insumos consumidos se conservarán como hechos reales, pero no se generará entrada de producto terminado.
              </p>
              <label className="flex items-start gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmZeroLoss}
                  onChange={(e) => setConfirmZeroLoss(e.target.checked)}
                  className="mt-0.5 rounded-sm text-red-600 focus:ring-red-500"
                />
                <span className="text-[11px] font-semibold text-red-800">
                  Confirmo que el rendimiento final de esta corrida fue 0.
                </span>
              </label>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Notas finales de cierre (opcional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones sobre la corrida..."
              disabled={loading || hasPendingInputs}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-hidden focus:border-emerald-500 focus:bg-white resize-none disabled:opacity-50"
            />
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || hasPendingInputs || (isZeroYield && !confirmZeroLoss)}
              className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Completando...</span>
                </>
              ) : (
                <span>Completar corrida</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
