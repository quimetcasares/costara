import type { FormYieldState, FormInputRow } from '../../hooks/useRecipeDraft.js';
import type {
  RecipeCalculationResult,
  ItemData,
  UnitData,
  RecipeVersionData,
  RecipeInputData,
} from '../../../domain/calculation/types.js';
import {
  formatMoney,
  formatQuantityWithUnit,
  formatPercentage,
} from '../../../lib/formatters.js';

export interface DraftDiffViewerProps {
  readonly activeVersion?: RecipeVersionData | null;
  readonly activeInputs?: readonly RecipeInputData[];
  readonly activeCalculation?: RecipeCalculationResult | null;
  readonly draftYield: FormYieldState;
  readonly draftInputs: readonly FormInputRow[];
  readonly draftCalculation?: RecipeCalculationResult | null;
  readonly availableItems: readonly ItemData[];
  readonly availableUnits: readonly UnitData[];
  readonly currencyCode?: string;
}

export function DraftDiffViewer({
  activeVersion,
  activeInputs = [],
  activeCalculation,
  draftYield,
  draftInputs,
  draftCalculation,
  availableItems,
  availableUnits,
  currencyCode = 'MXN',
}: DraftDiffViewerProps) {
  if (!activeVersion) {
    return (
      <div className="bg-stone-50 rounded-xl border border-stone-200 p-5 text-xs text-stone-500">
        Esta receta no cuenta con una versión activa previa para comparar cambios.
      </div>
    );
  }

  const activeUnit = availableUnits.find((u) => u.id === activeVersion.referenceYieldUnitId);
  const draftUnit = availableUnits.find((u) => u.id === draftYield.referenceYieldUnitId);

  // Compare inputs
  const diffRows: Array<{
    itemName: string;
    status: 'unchanged' | 'modified' | 'added' | 'removed';
    activeDesc?: string;
    draftDesc?: string;
  }> = [];

  // 1. Process active inputs against draft
  activeInputs.forEach((actInp) => {
    const item = availableItems.find((it) => it.id === actInp.itemId);
    const itemName = item?.name || 'Ingrediente';
    const actUnit = availableUnits.find((u) => u.id === actInp.unitId);

    const actDesc =
      actInp.quantityMode === 'absolute'
        ? `${actInp.quantity} ${actUnit?.code || ''}`
        : `${formatPercentage(actInp.percentage)} s/base`;

    // Find corresponding draft input by itemId
    const matchingDraft = draftInputs.find((d) => d.itemId === actInp.itemId);

    if (!matchingDraft) {
      diffRows.push({
        itemName,
        status: 'removed',
        activeDesc: actDesc,
      });
    } else {
      const dUnit = availableUnits.find((u) => u.id === matchingDraft.unitId);
      const dDesc =
        matchingDraft.quantityMode === 'absolute'
          ? `${matchingDraft.quantity} ${dUnit?.code || ''}`
          : `${matchingDraft.percentage}% s/base`;

      const isModified =
        matchingDraft.quantityMode !== actInp.quantityMode ||
        (matchingDraft.quantityMode === 'absolute' &&
          (matchingDraft.quantity !== String(actInp.quantity ?? '') || matchingDraft.unitId !== actInp.unitId)) ||
        (matchingDraft.quantityMode === 'percentage' &&
          matchingDraft.percentage !== String(actInp.percentage ?? ''));

      diffRows.push({
        itemName,
        status: isModified ? 'modified' : 'unchanged',
        activeDesc: actDesc,
        draftDesc: dDesc,
      });
    }
  });

  // 2. Find newly added draft inputs
  draftInputs.forEach((dInp) => {
    const inActive = activeInputs.some((a) => a.itemId === dInp.itemId);
    if (!inActive) {
      const item = availableItems.find((it) => it.id === dInp.itemId);
      const itemName = item?.name || 'Nuevo Ingrediente';
      const dUnit = availableUnits.find((u) => u.id === dInp.unitId);
      const dDesc =
        dInp.quantityMode === 'absolute'
          ? `${dInp.quantity} ${dUnit?.code || ''}`
          : `${dInp.percentage}% s/base`;

      diffRows.push({
        itemName,
        status: 'added',
        draftDesc: dDesc,
      });
    }
  });

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs">
      <div className="p-4 bg-stone-50/80 border-b border-stone-200 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700">
          Comparativa: Versión Activa (v{activeVersion.versionNumber}) vs Borrador
        </h4>
      </div>

      <div className="p-5 space-y-5">
        {/* Cost & Yield Metric Diff */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
            <span className="text-[11px] font-semibold text-stone-500 block">Rendimiento Base</span>
            <div className="flex items-center gap-3 mt-1 text-sm font-bold">
              <span className="text-stone-500 line-through">
                {formatQuantityWithUnit(activeVersion.referenceYieldQuantity, activeUnit?.code)}
              </span>
              <span className="text-stone-400">&rarr;</span>
              <span className="text-amber-800">
                {formatQuantityWithUnit(draftYield.referenceYieldQuantity, draftUnit?.code)}
              </span>
            </div>
          </div>

          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
            <span className="text-[11px] font-semibold text-stone-500 block">Costo Total del Lote</span>
            <div className="flex items-center gap-3 mt-1 text-sm font-bold">
              <span className="text-stone-500">
                {activeCalculation ? formatMoney(activeCalculation.knownBatchMaterialCost, currencyCode) : '-'}
              </span>
              <span className="text-stone-400">&rarr;</span>
              <span className="text-amber-800">
                {draftCalculation ? formatMoney(draftCalculation.knownBatchMaterialCost, currencyCode) : 'Calculando...'}
              </span>
            </div>
          </div>
        </div>

        {/* Inputs List Diff - Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold text-[11px] uppercase tracking-wider">
                <th className="py-2.5 px-3">Ingrediente</th>
                <th className="py-2.5 px-3">Versión Activa</th>
                <th className="py-2.5 px-3">Borrador</th>
                <th className="py-2.5 px-3 text-center">Cambio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {diffRows.map((row, idx) => {
                const badge = {
                  unchanged: { text: 'Sin cambio', class: 'bg-stone-100 text-stone-600' },
                  modified: { text: 'Modificado', class: 'bg-amber-100 text-amber-800 border-amber-300' },
                  added: { text: 'Nuevo', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
                  removed: { text: 'Eliminado', class: 'bg-red-100 text-red-800 border-red-300' },
                }[row.status];

                return (
                  <tr key={idx} className="hover:bg-stone-50/50">
                    <td className="py-2.5 px-3 font-semibold text-stone-900">{row.itemName}</td>
                    <td className="py-2.5 px-3 text-stone-600">
                      {row.activeDesc ? (
                        <span className={row.status === 'removed' ? 'line-through text-red-500' : ''}>
                          {row.activeDesc}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-stone-900 font-medium">
                      {row.draftDesc ? (
                        <span className={row.status === 'added' ? 'text-emerald-700 font-bold' : row.status === 'modified' ? 'text-amber-800 font-bold' : ''}>
                          {row.draftDesc}
                        </span>
                      ) : (
                        <span className="text-stone-400 italic">Eliminado</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.class}`}>
                        {badge.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Inputs List Diff - Mobile Stacked Cards View (Zero horizontal scroll) */}
        <div className="block sm:hidden space-y-3">
          {diffRows.map((row, idx) => {
            const badge = {
              unchanged: { text: 'Sin cambio', class: 'bg-stone-100 text-stone-600 border-stone-200' },
              modified: { text: 'Modificado', class: 'bg-amber-100 text-amber-800 border-amber-300' },
              added: { text: 'Nuevo', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
              removed: { text: 'Eliminado', class: 'bg-red-100 text-red-800 border-red-300' },
            }[row.status];

            return (
              <div key={idx} className="p-3 bg-stone-50/80 rounded-xl border border-stone-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-stone-900 text-xs">{row.itemName}</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${badge.class}`}>
                    {badge.text}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-200/60 text-xs">
                  <div>
                    <span className="text-[10px] text-stone-400 font-medium block">Versión activa</span>
                    <span className={`font-medium ${row.status === 'removed' ? 'line-through text-red-500' : 'text-stone-600'}`}>
                      {row.activeDesc || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 font-medium block">Borrador</span>
                    <span className={`font-bold ${row.status === 'added' ? 'text-emerald-700' : row.status === 'modified' ? 'text-amber-800' : 'text-stone-900'}`}>
                      {row.draftDesc || <span className="text-stone-400 italic font-normal">Eliminado</span>}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
