import { useState } from 'react';
import type { ProductionRunInputDetail } from '../../../data/productionExecutionService.js';

export interface DeleteUnplannedInputModalProps {
  readonly input: ProductionRunInputDetail | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
}

export function DeleteUnplannedInputModal({
  input,
  isOpen,
  onClose,
  onConfirm,
}: DeleteUnplannedInputModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !input) return null;

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el insumo adicional.');
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
        aria-labelledby="delete-input-modal-title"
      >
        <div className="px-6 pt-6 pb-4 border-b border-stone-100">
          <div className="flex items-center justify-between">
            <h3 id="delete-input-modal-title" className="text-lg font-bold text-red-900">
              Eliminar insumo adicional
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
            Se removerá el registro de este insumo de la corrida actual.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          <div className="p-3.5 bg-stone-100 border border-stone-200 rounded-xl text-xs text-stone-700 space-y-1">
            <p className="font-bold text-stone-800">
              ¿Quieres eliminar "{input.item_name}" de esta corrida?
            </p>
            <p className="text-[11px] text-stone-500">
              Se eliminará este insumo adicional de la corrida. Puedes volver a agregarlo mientras la corrida siga en taller.
            </p>
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
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Eliminando...</span>
                </>
              ) : (
                <span>Eliminar insumo</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
