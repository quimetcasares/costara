import type { FormInputRow, FormPercentageBase } from '../../hooks/useRecipeDraft.js';
import type { ItemData, UnitData } from '../../../domain/calculation/types.js';

export interface DraftInputsTableProps {
  readonly inputs: readonly FormInputRow[];
  readonly percentageBases: readonly FormPercentageBase[];
  readonly availableItems: readonly ItemData[];
  readonly availableUnits: readonly UnitData[];
  readonly onAddInput: () => void;
  readonly onRemoveInput: (id: string) => void;
  readonly onUpdateInput: (id: string, partial: Partial<FormInputRow>) => void;
  readonly onMoveInput: (index: number, direction: 'up' | 'down') => void;
  readonly onTogglePercentageBase: (percentageInputId: string, basisInputId: string) => void;
  readonly disabled?: boolean;
}

export function DraftInputsTable({
  inputs,
  percentageBases,
  availableItems,
  availableUnits,
  onAddInput,
  onRemoveInput,
  onUpdateInput,
  onMoveInput,
  onTogglePercentageBase,
  disabled = false,
}: DraftInputsTableProps) {
  // Potential basis candidates are other absolute inputs in the recipe
  const getBasisCandidates = (currentInputId: string) => {
    return inputs.filter(
      (inp) => inp.id !== currentInputId && inp.quantityMode === 'absolute' && !!inp.itemId
    );
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs">
      <div className="p-5 border-b border-stone-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-stone-900">Ingredientes e Insumos</h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Define cantidades absolutas o porcentajes sobre otros ingredientes base.
          </p>
        </div>

        <button
          type="button"
          onClick={onAddInput}
          disabled={disabled}
          className="text-xs font-semibold px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
        >
          <span>+ Agregar ingrediente</span>
        </button>
      </div>

      {inputs.length === 0 ? (
        <div className="p-12 text-center text-xs text-stone-400">
          No hay ingredientes agregados a este borrador. Haz clic en "Agregar ingrediente" para comenzar.
        </div>
      ) : (
        <div className="divide-y divide-stone-200">
          {inputs.map((inp, idx) => {
            const selectedItem = availableItems.find((it) => it.id === inp.itemId);
            const isHybrid = selectedItem?.purchasable && selectedItem?.producible;
            const basisCandidates = getBasisCandidates(inp.id);
            const isPercentage = inp.quantityMode === 'percentage';

            return (
              <div key={inp.id} className="p-4 sm:p-5 hover:bg-stone-50/50 transition-colors">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  {/* Position & Order Controls */}
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => onMoveInput(idx, 'up')}
                        disabled={disabled || idx === 0}
                        className="text-stone-400 hover:text-stone-700 disabled:opacity-30 p-0.5 text-[10px]"
                        title="Mover arriba"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveInput(idx, 'down')}
                        disabled={disabled || idx === inputs.length - 1}
                        className="text-stone-400 hover:text-stone-700 disabled:opacity-30 p-0.5 text-[10px]"
                        title="Mover abajo"
                      >
                        ▼
                      </button>
                    </div>
                    <span className="w-6 text-center text-xs font-bold text-stone-400">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Item Selector */}
                  <div className="flex-1 min-w-[200px] w-full lg:w-auto">
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      Insumo / Preparación
                    </label>
                    <select
                      value={inp.itemId}
                      onChange={(e) => {
                        const itId = e.target.value;
                        const it = availableItems.find((x) => x.id === itId);
                        onUpdateInput(inp.id, {
                          itemId: itId,
                          unitId: inp.unitId || it?.baseUnitId || '',
                          costingSource: it?.producible && !it?.purchasable ? 'produced' : 'purchased',
                        });
                      }}
                      disabled={disabled}
                      className="w-full bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    >
                      <option value="">Selecciona ingrediente...</option>
                      {availableItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.kind === 'intermediate' ? 'Intermedio' : item.kind === 'raw_material' ? 'Materia Prima' : 'Producto'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Mode Selector */}
                  <div className="w-full lg:w-auto">
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      Modo
                    </label>
                    <div className="flex rounded-lg border border-stone-300 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => onUpdateInput(inp.id, { quantityMode: 'absolute' })}
                        disabled={disabled}
                        className={`text-xs py-1 px-2.5 rounded-md font-medium transition-all ${
                          !isPercentage
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Absoluto
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateInput(inp.id, { quantityMode: 'percentage' })}
                        disabled={disabled}
                        className={`text-xs py-1 px-2.5 rounded-md font-medium transition-all ${
                          isPercentage
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Porcentaje %
                      </button>
                    </div>
                  </div>

                  {/* Quantity / Percentage Inputs */}
                  {!isPercentage ? (
                    <div className="flex items-center gap-2 w-full lg:w-auto">
                      <div className="flex-1 lg:w-28">
                        <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                          Cantidad
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inp.quantity}
                          onChange={(e) => onUpdateInput(inp.id, { quantity: e.target.value })}
                          disabled={disabled}
                          placeholder="1000"
                          className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                          Unidad
                        </label>
                        <select
                          value={inp.unitId}
                          onChange={(e) => onUpdateInput(inp.id, { unitId: e.target.value })}
                          disabled={disabled}
                          className="w-full bg-white border border-stone-300 rounded-lg px-2 py-1.5 text-xs text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Unidad...</option>
                          {availableUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.code}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full lg:w-32">
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Porcentaje %
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inp.percentage}
                          onChange={(e) => onUpdateInput(inp.id, { percentage: e.target.value })}
                          disabled={disabled}
                          placeholder="72"
                          className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400 font-bold">
                          %
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Costing Source Selector (Hybrid items) */}
                  {isHybrid && (
                    <div className="w-full lg:w-32">
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Origen Costo
                      </label>
                      <select
                        value={inp.costingSource || 'purchased'}
                        onChange={(e) =>
                          onUpdateInput(inp.id, {
                            costingSource: e.target.value as 'purchased' | 'produced',
                          })
                        }
                        disabled={disabled}
                        className="w-full bg-white border border-stone-300 rounded-lg px-2 py-1.5 text-xs text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="purchased">Comprado</option>
                        <option value="produced">Producido</option>
                      </select>
                    </div>
                  )}

                  {/* Delete Button */}
                  <div className="flex items-end pb-1">
                    <button
                      type="button"
                      onClick={() => onRemoveInput(inp.id)}
                      disabled={disabled}
                      className="text-stone-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                      title="Eliminar ingrediente"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Percentage Bases Multi-Selection Section */}
                {isPercentage && (
                  <div className="mt-3 pt-3 border-t border-stone-100 bg-amber-50/40 p-3 rounded-lg border border-amber-200/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-amber-900">
                        Selecciona los ingredientes base para calcular este {inp.percentage ? `${inp.percentage}%` : 'porcentaje'}:
                      </span>
                    </div>

                    {basisCandidates.length === 0 ? (
                      <p className="text-[11px] text-stone-400 italic">
                        No hay otros ingredientes con cantidad absoluta registrados para usar como base.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {basisCandidates.map((cand) => {
                          const candItem = availableItems.find((it) => it.id === cand.itemId);
                          const isSelected = percentageBases.some(
                            (pb) => pb.percentageInputId === inp.id && pb.basisInputId === cand.id
                          );

                          return (
                            <label
                              key={cand.id}
                              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border cursor-pointer select-none transition-all ${
                                isSelected
                                  ? 'bg-amber-100 border-amber-400 text-amber-950 font-semibold shadow-2xs'
                                  : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => onTogglePercentageBase(inp.id, cand.id)}
                                disabled={disabled}
                                className="rounded text-amber-600 focus:ring-amber-500"
                              />
                              <span>
                                {candItem?.name || `Ingrediente #${cand.position}`} ({cand.quantity} {availableUnits.find((u) => u.id === cand.unitId)?.code || ''})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
