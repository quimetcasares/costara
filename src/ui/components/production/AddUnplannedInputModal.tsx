import { useState, useEffect } from 'react';
import type { AvailableItem } from '../../../data/productionExecutionService.js';
import { CostaraDecimal } from '../../../domain/calculation/decimal.js';
import { formatUnit } from '../../../lib/formatters.js';

export interface AddUnplannedInputModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly availableItems: AvailableItem[];
  readonly onConfirm: (params: {
    itemId: string;
    actualQuantity: string;
    actualUnitId: string;
    notes: string;
  }) => Promise<void>;
}

export function AddUnplannedInputModal({
  isOpen,
  onClose,
  availableItems,
  onConfirm,
}: AddUnplannedInputModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedItemId('');
      setQuantity('');
      setNotes('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedItem = availableItems.find((i) => i.id === selectedItemId);
  const filteredItems = availableItems.filter((i) =>
    i.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  let validQuantityDec: CostaraDecimal | null = null;
  const trimmedQty = quantity.trim();
  if (trimmedQty !== '') {
    try {
      const parsed = new CostaraDecimal(trimmedQty);
      if (!parsed.isNaN() && parsed.greaterThan(0)) {
        validQuantityDec = parsed;
      }
    } catch {
      validQuantityDec = null;
    }
  }
  const isValidQty = validQuantityDec !== null;
  const isSubmitDisabled = loading || !selectedItemId || !isValidQty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedItemId || !selectedItem) {
      setError('Selecciona un insumo de la lista.');
      return;
    }

    if (!validQuantityDec) {
      setError('La cantidad debe ser mayor a cero.');
      return;
    }

    setLoading(true);
    try {
      await onConfirm({
        itemId: selectedItemId,
        actualQuantity: validQuantityDec.toString(),
        actualUnitId: selectedItem.base_unit_id,
        notes: notes.trim(),
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al agregar el insumo no planeado.');
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
        aria-labelledby="add-unplanned-input-title"
      >
        <div className="px-6 pt-6 pb-4 border-b border-stone-100">
          <div className="flex items-center justify-between">
            <h3 id="add-unplanned-input-title" className="text-lg font-bold text-stone-900">
              Agregar insumo no planeado
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
            Registra materias primas adicionales usadas en taller por ajuste o contingencia.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Buscar insumo *
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre..."
              disabled={loading}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-hidden focus:border-amber-500 focus:bg-white min-h-[44px]"
            />

            {/* Results list */}
            <div className="mt-1.5 max-h-36 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100 bg-white">
              {filteredItems.length === 0 ? (
                <div className="p-3 text-center text-xs text-stone-400">
                  No se encontraron insumos
                </div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between text-xs transition-colors cursor-pointer min-h-[44px] ${
                      selectedItemId === item.id
                        ? 'bg-amber-100 text-amber-900 font-bold'
                        : 'hover:bg-stone-50 text-stone-800'
                    }`}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="text-[11px] text-stone-500 font-normal shrink-0 ml-2">
                      {formatUnit(item.base_unit_code)}
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Selected feedback */}
            <div className="mt-2">
              {selectedItem ? (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-500 block">
                      Insumo seleccionado
                    </span>
                    <strong className="text-amber-900">{selectedItem.name}</strong>
                  </div>
                  <span className="text-xs font-semibold text-amber-800">
                    Unidad: {formatUnit(selectedItem.base_unit_code)}
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-stone-400 italic">
                  Selecciona un insumo de la lista
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Cantidad consumida *
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0.000001"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ej. 0.250"
                disabled={loading || !selectedItemId}
                className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl text-base font-semibold text-stone-900 focus:outline-hidden focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-200 min-h-[44px] disabled:opacity-50"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-500 pointer-events-none">
                {formatUnit(selectedItem?.base_unit_code ?? '', quantity)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Motivo o notas del ajuste
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Se añadió por ajuste de hidratación en taller"
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
              disabled={isSubmitDisabled}
              className="flex-1 py-3 px-4 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Agregando...</span>
                </>
              ) : (
                <span>Agregar insumo</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
