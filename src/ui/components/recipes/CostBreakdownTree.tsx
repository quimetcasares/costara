import { useState } from 'react';
import type { CostBreakdownNode } from '../../../domain/calculation/types.js';
import {
  formatMoney,
  formatUnitCost,
  formatQuantityWithUnit,
  formatPercentage,
} from '../../../lib/formatters.js';

export interface CostBreakdownTreeProps {
  readonly nodes: readonly CostBreakdownNode[];
  readonly currencyCode?: string;
}

interface TreeNodeRowProps {
  readonly node: CostBreakdownNode;
  readonly currencyCode: string;
  readonly depth?: number;
}

const costStatusBadge: Record<string, string> = {
  complete: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  incomplete: 'text-amber-700 bg-amber-50 border-amber-200',
  unresolvable: 'text-stone-500 bg-stone-100 border-stone-200',
};

function getStatusBadgeClass(node: CostBreakdownNode): string {
  return costStatusBadge[node.status] || (node.isCostComplete ? costStatusBadge.complete : costStatusBadge.incomplete);
}

function getKindBadgeLabel(kind: string): string {
  const map: Record<string, string> = {
    raw_material: 'Insumo',
    intermediate: 'Preparación',
    finished_product: 'Producto',
    packaging: 'Empaque',
  };
  return map[kind] || kind;
}

function TreeNodeRowDesktop({ node, currencyCode, depth = 0 }: TreeNodeRowProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const hasChildren = !!node.children && node.children.length > 0;
  const badgeClass = getStatusBadgeClass(node);
  const kindBadge = getKindBadgeLabel(node.itemKind);

  return (
    <>
      <tr className={`border-b border-stone-100 hover:bg-stone-50/70 transition-colors ${depth > 0 ? 'bg-stone-50/40' : ''}`}>
        {/* Ingredient Name & Hierarchy */}
        <td className="py-3 px-4 text-xs font-medium text-stone-900">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-5 h-5 flex items-center justify-center rounded-sm bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-bold transition-colors cursor-pointer"
                title={isExpanded ? 'Colapsar sub-receta' : 'Expandir sub-receta'}
              >
                {isExpanded ? '−' : '+'}
              </button>
            ) : depth > 0 ? (
              <span className="w-4 h-4 flex items-center justify-center text-stone-300 text-xs">└</span>
            ) : (
              <span className="w-2" />
            )}

            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-900">{node.itemName}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-stone-100 text-stone-600 border border-stone-200">
                  {kindBadge}
                </span>
                {node.costingSource === 'produced' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                    Producido internamente
                  </span>
                )}
              </div>
              {node.quantityMode === 'percentage' && node.percentage && (
                <span className="text-[11px] text-stone-400 block mt-0.5">
                  Formulación: {formatPercentage(node.percentage)} s/base
                </span>
              )}
            </div>
          </div>
        </td>

        {/* Scaled Quantity */}
        <td className="py-3 px-4 text-xs font-medium text-stone-700 text-right">
          {formatQuantityWithUnit(node.canonicalQuantity, node.canonicalUnitCode)}
        </td>

        {/* Unit Cost (Adaptive precision) */}
        <td className="py-3 px-4 text-xs text-stone-600 text-right">
          {node.unitCostCanonical ? formatUnitCost(node.unitCostCanonical, currencyCode, node.canonicalUnitCode) : '-'}
        </td>

        {/* Line Total Cost */}
        <td className="py-3 px-4 text-xs font-bold text-stone-900 text-right">
          {node.nodeMaterialCost ? formatMoney(node.nodeMaterialCost, currencyCode) : '-'}
        </td>

        {/* Cost Status Badge */}
        <td className="py-3 px-4 text-xs text-center">
          <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${badgeClass}`}>
            {node.status === 'complete' || node.isCostComplete
              ? 'Completo'
              : node.status === 'incomplete'
              ? 'Incompleto'
              : 'Sin costo'}
          </span>
        </td>
      </tr>

      {/* Render children sub-nodes recursively if expanded */}
      {hasChildren &&
        isExpanded &&
        node.children!.map((child, idx) => (
          <TreeNodeRowDesktop
            key={`${child.itemId}_${idx}`}
            node={child}
            currencyCode={currencyCode}
            depth={depth + 1}
          />
        ))}
    </>
  );
}

function TreeNodeCardMobile({ node, currencyCode, depth = 0 }: TreeNodeRowProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const hasChildren = !!node.children && node.children.length > 0;
  const badgeClass = getStatusBadgeClass(node);
  const kindBadge = getKindBadgeLabel(node.itemKind);

  return (
    <div className={`space-y-2 ${depth > 0 ? 'ml-3 pl-3 border-l-2 border-stone-200' : ''}`}>
      <div className="p-3.5 bg-stone-50/70 rounded-xl border border-stone-200 space-y-2.5">
        {/* Header: Name, Expand button, Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {hasChildren && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-5 h-5 flex items-center justify-center rounded-sm bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-bold transition-colors cursor-pointer"
                title={isExpanded ? 'Colapsar sub-receta' : 'Expandir sub-receta'}
              >
                {isExpanded ? '−' : '+'}
              </button>
            )}
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-stone-900 text-xs">{node.itemName}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-stone-100 text-stone-600 border border-stone-200">
                  {kindBadge}
                </span>
                {node.costingSource === 'produced' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                    Producido
                  </span>
                )}
              </div>
              {node.quantityMode === 'percentage' && node.percentage && (
                <span className="text-[11px] text-stone-400 block mt-0.5">
                  Formulación: {formatPercentage(node.percentage)} s/base
                </span>
              )}
            </div>
          </div>

          <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${badgeClass}`}>
            {node.status === 'complete' || node.isCostComplete
              ? 'Completo'
              : node.status === 'incomplete'
              ? 'Incompleto'
              : 'Sin costo'}
          </span>
        </div>

        {/* Metrics Grid: Cantidad, Costo Unitario, Costo Total */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-stone-200/60 text-xs">
          <div>
            <span className="text-[10px] font-medium text-stone-400 block">Cantidad</span>
            <span className="font-semibold text-stone-800">
              {formatQuantityWithUnit(node.canonicalQuantity, node.canonicalUnitCode)}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-medium text-stone-400 block">Costo Unit.</span>
            <span className="text-stone-700">
              {node.unitCostCanonical ? formatUnitCost(node.unitCostCanonical, currencyCode, node.canonicalUnitCode) : '-'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-medium text-stone-400 block">Total Línea</span>
            <span className="font-bold text-stone-900">
              {node.nodeMaterialCost ? formatMoney(node.nodeMaterialCost, currencyCode) : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Render children sub-nodes recursively if expanded */}
      {hasChildren &&
        isExpanded &&
        node.children!.map((child, idx) => (
          <TreeNodeCardMobile
            key={`${child.itemId}_${idx}`}
            node={child}
            currencyCode={currencyCode}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export function CostBreakdownTree({ nodes, currencyCode = 'MXN' }: CostBreakdownTreeProps) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-xs text-stone-500">
        No hay insumos registrados en esta receta.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200 text-[11px] font-bold text-stone-600 uppercase tracking-wider">
              <th className="py-3 px-4">Ingrediente / Sub-receta</th>
              <th className="py-3 px-4 text-right">Cantidad de Lote</th>
              <th className="py-3 px-4 text-right">Costo Unitario</th>
              <th className="py-3 px-4 text-right">Costo Total Línea</th>
              <th className="py-3 px-4 text-center">Estado Costo</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node, idx) => (
              <TreeNodeRowDesktop
                key={`${node.itemId}_${idx}`}
                node={node}
                currencyCode={currencyCode}
                depth={0}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card/Stacked View (Zero horizontal scroll) */}
      <div className="block md:hidden p-4 space-y-3">
        {nodes.map((node, idx) => (
          <TreeNodeCardMobile
            key={`${node.itemId}_${idx}`}
            node={node}
            currencyCode={currencyCode}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}
