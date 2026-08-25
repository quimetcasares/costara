import { useState, useEffect } from 'react';
import { CostaraDecimal } from '../../../domain/calculation/decimal.js';
import type { ScaleTarget } from '../../../domain/calculation/types.js';
import {
  isStrictPositiveDecimalString,
  computePortionsCount,
} from '../../../lib/decimalValidation.js';

export interface ScalingControlsProps {
  readonly referenceYieldQuantity: string;
  readonly referenceYieldUnitCode: string;
  readonly referenceYieldUnitId: string;
  readonly portionQuantity?: string | null;
  readonly initialScaleTarget?: ScaleTarget;
  readonly onScaleChange: (target: ScaleTarget | undefined) => void;
  readonly disabled?: boolean;
}

export function ScalingControls({
  referenceYieldQuantity,
  referenceYieldUnitCode,
  referenceYieldUnitId,
  portionQuantity,
  initialScaleTarget,
  onScaleChange,
  disabled = false,
}: ScalingControlsProps) {
  const hasDiscretePortions = isStrictPositiveDecimalString(portionQuantity);

  const [mode, setMode] = useState<'yield' | 'portions'>(() => {
    if (initialScaleTarget?.mode === 'output_pieces' && hasDiscretePortions) return 'portions';
    return 'yield';
  });

  const [targetQuantity, setTargetQuantity] = useState<string>(() => {
    if (initialScaleTarget?.mode === 'yield') return initialScaleTarget.targetQuantity.toString();
    return referenceYieldQuantity || '1000';
  });

  const [targetPortions, setTargetPortions] = useState<string>(() => {
    if (initialScaleTarget?.mode === 'output_pieces') return initialScaleTarget.targetPieces.toString();
    return computePortionsCount(referenceYieldQuantity, portionQuantity) || '10';
  });

  const [isScaled, setIsScaled] = useState<boolean>(!initialScaleTarget ? false : true);

  useEffect(() => {
    if (!isScaled) {
      onScaleChange(undefined);
      return;
    }

    if (mode === 'portions' && hasDiscretePortions) {
      if (isStrictPositiveDecimalString(targetPortions)) {
        onScaleChange({
          mode: 'output_pieces',
          targetPieces: new CostaraDecimal(targetPortions.trim()),
        });
      }
    } else {
      if (isStrictPositiveDecimalString(targetQuantity)) {
        onScaleChange({
          mode: 'yield',
          targetQuantity: new CostaraDecimal(targetQuantity.trim()),
          unitId: referenceYieldUnitId,
          unitCode: referenceYieldUnitCode,
        });
      }
    }
  }, [isScaled, mode, targetQuantity, targetPortions, hasDiscretePortions, referenceYieldUnitId, referenceYieldUnitCode, onScaleChange]);

  const handleReset = () => {
    setIsScaled(false);
    setTargetQuantity(referenceYieldQuantity);
    if (hasDiscretePortions) {
      setTargetPortions(computePortionsCount(referenceYieldQuantity, portionQuantity) || '10');
    }
    onScaleChange(undefined);
  };

  const handleMultiplier = (factor: number) => {
    setIsScaled(true);
    const mult = new CostaraDecimal(factor);
    if (mode === 'portions' && hasDiscretePortions && isStrictPositiveDecimalString(portionQuantity)) {
      const basePortions = new CostaraDecimal(referenceYieldQuantity).dividedBy(new CostaraDecimal(portionQuantity!));
      setTargetPortions(basePortions.times(mult).toString());
    } else {
      const baseYield = new CostaraDecimal(referenceYieldQuantity);
      setTargetQuantity(baseYield.times(mult).toString());
    }
  };

  return (
    <div className="bg-stone-50/80 rounded-xl border border-stone-200 p-5 space-y-4 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-800">
            Escalado Dinámico de Producción
          </h3>
          <p className="text-[11px] text-stone-500">
            Calcula proporciones e insumos para el lote de producción deseado.
          </p>
        </div>

        {isScaled && (
          <button
            type="button"
            onClick={handleReset}
            disabled={disabled}
            className="text-xs font-semibold text-amber-700 hover:text-amber-800 underline cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          >
            Restablecer a receta base (1x)
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* Scaling Mode Selector (only when discrete portions exist) */}
        {hasDiscretePortions && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-600">Escalar por:</span>
            <div className="inline-flex rounded-lg border border-stone-300 p-0.5 bg-white">
              <button
                type="button"
                onClick={() => setMode('yield')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'yield'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Rendimiento de Masa / Volumen
              </button>
              <button
                type="button"
                onClick={() => setMode('portions')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'portions'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Cantidad de Piezas / Porciones
              </button>
            </div>
          </div>
        )}

        {/* Inputs and Quick Multipliers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
          {mode === 'portions' && hasDiscretePortions ? (
            <div>
              <label className="block text-[11px] font-bold text-stone-700 mb-1">
                Piezas a Producir
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={targetPortions}
                  disabled={disabled}
                  onChange={(e) => {
                    setIsScaled(true);
                    setTargetPortions(e.target.value);
                  }}
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                  placeholder="ej. 28"
                />
                <span className="absolute right-3 top-1.5 text-xs text-stone-400 font-medium pointer-events-none">
                  piezas
                </span>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-bold text-stone-700 mb-1">
                Rendimiento Objetivo
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={targetQuantity}
                  disabled={disabled}
                  onChange={(e) => {
                    setIsScaled(true);
                    setTargetQuantity(e.target.value);
                  }}
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                  placeholder="ej. 5000"
                />
                <span className="absolute right-3 top-1.5 text-xs text-stone-400 font-medium pointer-events-none">
                  {referenceYieldUnitCode}
                </span>
              </div>
            </div>
          )}

          {/* Quick preset buttons */}
          <div className="sm:col-span-1 md:col-span-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-500 font-medium mr-1">Multiplicadores rápidos:</span>
            {[
              { label: '0.5x (Mitad)', factor: 0.5 },
              { label: '2x (Doble)', factor: 2 },
              { label: '5x', factor: 5 },
              { label: '10x', factor: 10 },
            ].map(({ label, factor }) => (
              <button
                key={factor}
                type="button"
                onClick={() => handleMultiplier(factor)}
                disabled={disabled}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
