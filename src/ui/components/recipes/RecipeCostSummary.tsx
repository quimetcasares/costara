import type { RecipeCalculationResult } from '../../../domain/calculation/types.js';
import {
  formatMoney,
  formatQuantityWithUnit,
  formatPortions,
  formatDecimal,
} from '../../../lib/formatters.js';

export interface RecipeCostSummaryProps {
  readonly calculation: RecipeCalculationResult;
  readonly currencyCode?: string;
}

export function RecipeCostSummary({ calculation, currencyCode = 'MXN' }: RecipeCostSummaryProps) {
  const {
    knownBatchMaterialCost,
    scaledYield,
    scaledPortions,
    status,
    scaleFactor,
    isCostComplete,
  } = calculation;

  const costPerMassVolumeUnit =
    scaledYield?.quantity && scaledYield.quantity.greaterThan(0) && knownBatchMaterialCost
      ? knownBatchMaterialCost.dividedBy(scaledYield.quantity)
      : undefined;

  const costPerPortion =
    scaledPortions && scaledPortions.greaterThan(0) && knownBatchMaterialCost
      ? knownBatchMaterialCost.dividedBy(scaledPortions)
      : undefined;

  const statusBadgeMap: Record<'complete' | 'incomplete' | 'unresolvable' | 'error', { text: string; bg: string; dot: string }> = {
    complete: {
      text: 'Costo Completo',
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      dot: 'bg-emerald-500',
    },
    incomplete: {
      text: 'Costo Incompleto (Faltan precios)',
      bg: 'bg-amber-50 text-amber-800 border-amber-300',
      dot: 'bg-amber-500',
    },
    unresolvable: {
      text: 'No Calculable',
      bg: 'bg-red-50 text-red-800 border-red-300',
      dot: 'bg-red-500',
    },
    error: {
      text: 'Error en Cálculo',
      bg: 'bg-red-50 text-red-800 border-red-300',
      dot: 'bg-red-500',
    },
  };

  const statusBadge =
    statusBadgeMap[status] ||
    (isCostComplete ? statusBadgeMap.complete : statusBadgeMap.incomplete);

  const isScaled = scaleFactor && !scaleFactor.equals(1);

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-stone-100">
        <div>
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">
            Costo Total del Lote {isScaled ? `(Escalado ${formatDecimal(scaleFactor, 2)}x)` : '(Base 1x)'}
          </span>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-3xl font-extrabold text-stone-900 tracking-tight">
              {formatMoney(knownBatchMaterialCost, currencyCode)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${statusBadge.bg}`}>
            <span className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
            <span>{statusBadge.text}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5">
        <div className="bg-stone-50/80 rounded-lg p-3.5 border border-stone-100">
          <span className="text-[11px] font-medium text-stone-500 block">Rendimiento de salida</span>
          <span className="text-base font-bold text-stone-800 block mt-0.5">
            {formatQuantityWithUnit(scaledYield?.quantity, scaledYield?.unitCode)}
          </span>
        </div>

        <div className="bg-stone-50/80 rounded-lg p-3.5 border border-stone-100">
          <span className="text-[11px] font-medium text-stone-500 block">
            Costo por unidad de masa/volumen
          </span>
          <span className="text-base font-bold text-stone-800 block mt-0.5">
            {costPerMassVolumeUnit
              ? formatMoney(costPerMassVolumeUnit, currencyCode, scaledYield?.unitCode)
              : '-'}
          </span>
        </div>

        <div className="bg-stone-50/80 rounded-lg p-3.5 border border-stone-100">
          <span className="text-[11px] font-medium text-stone-500 block">
            {scaledPortions ? `Costo por porción (${formatPortions(scaledPortions)})` : 'Porciones discretas'}
          </span>
          <span className="text-base font-bold text-stone-800 block mt-0.5">
            {costPerPortion
              ? formatMoney(costPerPortion, currencyCode, 'pieza')
              : scaledPortions
              ? '-'
              : 'A granel (sin porciones)'}
          </span>
        </div>
      </div>
    </div>
  );
}
