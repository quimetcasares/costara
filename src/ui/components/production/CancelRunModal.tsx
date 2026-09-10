import { useState, useEffect } from 'react';
import type { ProductionRunDetail } from '../../../data/productionExecutionService.js';
import { CostaraDecimal } from '../../../domain/calculation/decimal.js';
import { formatUnit, formatQuantity } from '../../../lib/formatters.js';

export interface CancelRunModalProps {
  readonly run: ProductionRunDetail;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (notes: string) => Promise<void>;
}

export function CancelRunModal({
  run,
  isOpen,
  onClose,
  onConfirm,
}: CancelRunModalProps) {
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invariant: Cancelled cannot hide physical consumption (> 0)
  const hasPhysicalConsumption = run.inputs.some((i) => {
    if (i.actual_quantity === null) return false;
    try {
      return new CostaraDecimal(i.actual_quantity).greaterThan(0);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isOpen) {
      setNotes('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (hasPhysicalConsumption) {
      setError(
        'No se puede cancelar una corrida con consumos reales registrados. Si no se consumió nada, pon las cantidades reales en 0 o vacías.'
      );
      return;
    }

    if (!notes.trim()) {
      setError('Debes ingresar el motivo de la cancelación.');
      return;
    }

    setLoading(true);
    try {
      await onConfirm(notes.trim());
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al cancelar la corrida.');
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
        aria-labelledby="cancel-run-modal-title"
      >
        <div className="px-6 pt-6 pb-4 border-b border-stone-100">
          <div className="flex items-center justify-between">
            <h3 id="cancel-run-modal-title" className="text-lg font-bold text-red-900">
              Cancelar corrida de producción
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
            {run.output_item_name} · Lote planeado: {formatQuantity(run.planned_yield_quantity)} {formatUnit(run.planned_yield_unit_code, run.planned_yield_quantity)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          {hasPhysicalConsumption ? (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 space-y-2">
              <p className="font-bold flex items-center gap-1 text-red-800">
                <span>⛔</span>
                <span>Corrida bloqueada para cancelación</span>
              </p>
              <p className="text-[11px] leading-relaxed">
                No se puede cancelar una corrida con consumos reales registrados. Si el lote no se preparó físicamente, elimina o vacía las cantidades reales antes de cancelar.
              </p>
            </div>
          ) : (
            <div className="p-3.5 bg-stone-100 border border-stone-200 rounded-xl text-xs text-stone-700 space-y-1">
              <p className="font-bold text-stone-800">
                ¿Seguro que deseas cancelar esta corrida?
              </p>
              <p className="text-[11px]">
                Esta acción marcará la corrida como cancelada. No se generarán movimientos en el inventario.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Motivo de cancelación *
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Falla de equipo, cancelación de pedido..."
              disabled={loading || hasPhysicalConsumption}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-hidden focus:border-red-500 focus:bg-white resize-none disabled:opacity-50"
            />
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[44px]"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={loading || hasPhysicalConsumption}
              className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Cancelando...</span>
                </>
              ) : (
                <span>Confirmar cancelación</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
