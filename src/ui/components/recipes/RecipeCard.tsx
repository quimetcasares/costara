import { formatQuantityWithUnit, formatPortions, formatDate } from '../../../lib/formatters.js';
import { computePortionsCount } from '../../../lib/decimalValidation.js';

export interface RecipeCardSummary {
  readonly id: string;
  readonly name: string;
  readonly outputItemName: string;
  readonly activeVersionNumber?: number | null;
  readonly activeYieldQuantity?: string | null;
  readonly activeYieldUnitCode?: string | null;
  readonly activePortionQuantity?: string | null;
  readonly activePortionUnitCode?: string | null;
  readonly activeEffectiveFrom?: string | null;
  readonly hasDraft?: boolean;
}

export interface RecipeCardProps {
  readonly recipe: RecipeCardSummary;
  readonly onClick: () => void;
}

export function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  const isFormulated = !recipe.activeVersionNumber ? false : true;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs hover:shadow-md hover:border-amber-400 transition-all cursor-pointer flex flex-col justify-between"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-stone-900 text-base group-hover:text-amber-700">
            {recipe.name}
          </h3>
          {recipe.hasDraft && (
            <span className="shrink-0 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold px-2 py-0.5 rounded-full">
              Borrador en curso
            </span>
          )}
        </div>

        <p className="text-xs text-stone-500 mt-1">
          Producto: <span className="font-medium text-stone-700">{recipe.outputItemName}</span>
        </p>

        {isFormulated ? (
          <div className="mt-4 pt-4 border-t border-stone-100 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-stone-400 block text-[11px]">Rendimiento activo (v{recipe.activeVersionNumber})</span>
              <span className="font-semibold text-stone-800">
                {formatQuantityWithUnit(recipe.activeYieldQuantity, recipe.activeYieldUnitCode)}
              </span>
            </div>
            <div>
              <span className="text-stone-400 block text-[11px]">Porción nominal</span>
              <span className="font-semibold text-stone-800">
                {recipe.activePortionQuantity
                  ? formatPortions(
                      computePortionsCount(recipe.activeYieldQuantity, recipe.activePortionQuantity)
                    )
                  : 'A granel'}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-stone-100 text-xs text-amber-700 bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60">
            Sin versión publicada
          </div>
        )}
      </div>

      {isFormulated && recipe.activeEffectiveFrom && (
        <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
          <span>Vigente desde: {formatDate(recipe.activeEffectiveFrom)}</span>
          <span className="text-amber-600 font-medium group-hover:translate-x-0.5 transition-transform">
            Ver detalle &rarr;
          </span>
        </div>
      )}
    </div>
  );
}
