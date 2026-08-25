import type { FormYieldState } from '../../hooks/useRecipeDraft.js';
import type { UnitData } from '../../../domain/calculation/types.js';

export interface DraftYieldSectionProps {
  readonly yieldState: FormYieldState;
  readonly onChange: (partial: Partial<FormYieldState>) => void;
  readonly availableUnits: readonly UnitData[];
  readonly disabled?: boolean;
}

export function DraftYieldSection({
  yieldState,
  onChange,
  availableUnits,
  disabled = false,
}: DraftYieldSectionProps) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs">
      <h3 className="text-sm font-bold text-stone-900 mb-4 pb-2 border-b border-stone-100">
        Rendimiento y Porciones del Lote Base
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Reference Yield Quantity */}
        <div className="md:col-span-4">
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Rendimiento total de referencia <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            required
            value={yieldState.referenceYieldQuantity}
            onChange={(e) => onChange({ referenceYieldQuantity: e.target.value })}
            disabled={disabled}
            placeholder="14000"
            className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-medium text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>

        {/* Reference Yield Unit */}
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Unidad de rendimiento <span className="text-red-500">*</span>
          </label>
          <select
            value={yieldState.referenceYieldUnitId}
            onChange={(e) => onChange({ referenceYieldUnitId: e.target.value })}
            disabled={disabled}
            className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-medium text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          >
            <option value="">Selecciona unidad...</option>
            {availableUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nameSingular} ({u.code})
              </option>
            ))}
          </select>
        </div>

        {/* Portion Quantity */}
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Porción nominal por pieza <span className="text-stone-400 font-normal">(Opcional)</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={yieldState.portionQuantity}
            onChange={(e) => onChange({ portionQuantity: e.target.value })}
            disabled={disabled}
            placeholder="1000 (para 14 piezas)"
            className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-medium text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>

        {/* Portion Unit */}
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Unidad porción
          </label>
          <select
            value={yieldState.portionUnitId}
            onChange={(e) => onChange({ portionUnitId: e.target.value })}
            disabled={disabled || !yieldState.portionQuantity}
            className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-medium text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-stone-50 disabled:text-stone-400"
          >
            <option value="">Misma unidad...</option>
            {availableUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
              </option>
            ))}
          </select>
        </div>

        {/* Yield Description */}
        <div className="md:col-span-6">
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Descripción de rendimiento <span className="text-stone-400 font-normal">(Opcional)</span>
          </label>
          <input
            type="text"
            value={yieldState.yieldDescription}
            onChange={(e) => onChange({ yieldDescription: e.target.value })}
            disabled={disabled}
            placeholder="Ej. Masa cruda lista para formado"
            className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>

        {/* Notes */}
        <div className="md:col-span-6">
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Notas de la versión <span className="text-stone-400 font-normal">(Opcional)</span>
          </label>
          <input
            type="text"
            value={yieldState.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            disabled={disabled}
            placeholder="Ej. Formulación con mayor hidratación"
            className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>
      </div>
    </div>
  );
}
