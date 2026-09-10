import { useState, useEffect } from 'react';
import type { ProductionTargetWithRuns } from '../../../data/productionExecutionService.js';
import { CostaraDecimal } from '../../../domain/calculation/decimal.js';
import { formatUnit, formatQuantity } from '../../../lib/formatters.js';

export interface StartRunModalProps {
  readonly target: ProductionTargetWithRuns | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (params: { targetQuantity: string; notes: string }) => Promise<void>;
}

export function StartRunModal({
  target,
  isOpen,
  onClose,
  onConfirm,
}: StartRunModalProps) {
  const [quantity, setQuantity] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target && isOpen) {
      // Suggest remaining quantity if > 0, otherwise full target quantity
      let suggested = target.target_quantity;
      try {
        const remDec = new CostaraDecimal(target.suggested_remaining_quantity);
        if (!remDec.isNaN() && remDec.greaterThan(0)) {
          suggested = target.suggested_remaining_quantity;
        }
      } catch {
        suggested = target.target_quantity;
      }
      setQuantity(formatQuantity(suggested));
      setNotes('');
      setError(null);
      setLoading(false);
    }
  }, [target, isOpen]);

  if (!isOpen || !target) return null;

  const completedYieldDec = (() => {
    try {
      return target ? new CostaraDecimal(target.total_completed_yield) : null;
    } catch {
      return null;
    }
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let validQtyDec: CostaraDecimal | null = null;
    const trimmedQty = quantity.trim();
    if (trimmedQty !== '') {
      try {
        const parsed = new CostaraDecimal(trimmedQty);
        if (!parsed.isNaN() && parsed.greaterThan(0)) {
          validQtyDec = parsed;
        }
      } catch {
        validQtyDec = null;
      }
    }

    if (!validQtyDec) {
      setError('La cantidad a producir debe ser mayor a cero.');
      return;
    }

    setLoading(true);
    try {
      await onConfirm({ targetQuantity: validQtyDec.toString(), notes: notes.trim() });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al iniciar la corrida de producción.');
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
        aria-labelledby="start-run-modal-title"
      >
        <div className="px-6 pt-6 pb-4 border-b border-stone-100">
          <div className="flex items-center justify-between">
            <h3 id="start-run-modal-title" className="text-lg font-bold text-stone-900">
              {target.active_or_completed_runs_count > 0 ? 'Iniciar otro lote' : 'Iniciar corrida de producción'}
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
            {target.item_name} · Meta total: {formatQuantity(target.target_quantity)} {formatUnit(target.unit_code, target.target_quantity)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 space-y-1">
            <div className="flex justify-between font-medium">
              <span>Restante sugerido:</span>
              <span className="font-bold">
                {formatQuantity(target.suggested_remaining_quantity)} {formatUnit(target.unit_code, target.suggested_remaining_quantity)}
              </span>
            </div>
            {completedYieldDec && completedYieldDec.greaterThan(0) && (
              <p className="text-[11px] text-amber-800/90">
                Ya se completaron {formatQuantity(target.total_completed_yield)} {formatUnit(target.unit_code, target.total_completed_yield)} en {target.completed_runs_count === 1 ? '1 lote previo' : `${target.completed_runs_count} lotes previos`}.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Cantidad para este lote ({formatUnit(target.unit_code)}) *
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0.000001"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ej. 7"
                disabled={loading}
                className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl text-base font-semibold text-stone-900 focus:outline-hidden focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-200 min-h-[44px]"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-500 pointer-events-none">
                {formatUnit(target.unit_code, quantity)}
              </span>
            </div>
            <p className="text-[11px] text-stone-500 mt-1">
              Puedes dividir la meta en varios lotes físicos de taller.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Notas del lote (opcional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Primer lote matutino, masa fría"
              disabled={loading}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-hidden focus:border-amber-500 focus:bg-white resize-none"
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
              disabled={loading}
              className="flex-1 py-3 px-4 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Iniciando...</span>
                </>
              ) : (
                <span>Iniciar lote</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
