import { useState, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatDate,
  formatDateTime,
  formatQuantityWithUnit,
  formatPortions,
  formatPercentage,
} from '../../lib/formatters.js';
import { computePortionsCount } from '../../lib/decimalValidation.js';

export interface RecipeHistoryViewProps {
  readonly supabase: SupabaseClient;
  readonly businessId: string;
  readonly recipeId: string;
  readonly onBack: () => void;
}

interface HistoricalVersion {
  id: string;
  version_number: number;
  status: 'active' | 'archived' | 'draft';
  reference_yield_quantity: string;
  reference_yield_unit_code: string;
  portion_quantity?: string | null;
  portion_unit_code?: string | null;
  yield_description?: string | null;
  change_reason?: string | null;
  notes?: string | null;
  effective_from?: string | null;
  created_at: string;
  inputs: Array<{
    id: string;
    item_name: string;
    position: number;
    quantity_mode: 'absolute' | 'percentage';
    quantity?: string | null;
    unit_code?: string | null;
    percentage?: string | null;
    costing_source?: string | null;
  }>;
}

export function RecipeHistoryView({
  supabase,
  businessId,
  recipeId,
  onBack,
}: RecipeHistoryViewProps) {
  const [recipeName, setRecipeName] = useState<string>('');
  const [outputItemName, setOutputItemName] = useState<string>('');
  const [versions, setVersions] = useState<HistoricalVersion[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch recipe base info
        const { data: recipeData, error: rErr } = await supabase
          .from('recipes')
          .select('id, name, output_item:items!fk_recipes_output_item_business(name)')
          .eq('id', recipeId)
          .eq('business_id', businessId)
          .single();

        if (rErr) throw new Error(rErr.message);

        const outItem = Array.isArray(recipeData.output_item)
          ? recipeData.output_item[0]
          : recipeData.output_item;

        if (isMounted) {
          setRecipeName(recipeData.name);
          setOutputItemName(outItem?.name || '');
        }

        // Fetch all recipe versions with units and inputs
        const { data: versionsData, error: vErr } = await supabase
          .from('recipe_versions')
          .select(`
            id,
            version_number,
            status,
            reference_yield_quantity,
            reference_yield_unit:units!recipe_versions_reference_yield_unit_id_fkey(code),
            portion_quantity,
            portion_unit:units!recipe_versions_portion_unit_id_fkey(code),
            yield_description,
            change_reason,
            notes,
            effective_from,
            created_at,
            recipe_inputs(
              id,
              position,
              quantity_mode,
              quantity,
              percentage,
              costing_source,
              item:items!fk_recipe_inputs_item_business(name),
              unit:units!recipe_inputs_unit_id_fkey(code)
            )
          `)
          .eq('recipe_id', recipeId)
          .order('version_number', { ascending: false });

        if (vErr) throw new Error(vErr.message);

        if (!isMounted) return;

        type RawInput = {
          id: string;
          position: number;
          quantity_mode: 'absolute' | 'percentage';
          quantity?: string | null;
          percentage?: string | null;
          costing_source?: string | null;
          item?: { name?: string } | Array<{ name?: string }> | null;
          unit?: { code?: string } | Array<{ code?: string }> | null;
        };

        type RawVersion = {
          id: string;
          version_number: number;
          status: string;
          reference_yield_quantity?: string | null;
          reference_yield_unit?: { code?: string } | Array<{ code?: string }> | null;
          portion_quantity?: string | null;
          portion_unit?: { code?: string } | Array<{ code?: string }> | null;
          yield_description?: string | null;
          change_reason?: string | null;
          notes?: string | null;
          effective_from?: string | null;
          created_at: string;
          recipe_inputs?: RawInput[] | null;
        };

        const mapped: HistoricalVersion[] = (versionsData || []).map((ver: RawVersion) => {
          const refUnit = Array.isArray(ver.reference_yield_unit)
            ? ver.reference_yield_unit[0]
            : ver.reference_yield_unit;

          const portUnit = Array.isArray(ver.portion_unit)
            ? ver.portion_unit[0]
            : ver.portion_unit;

          const sortedInputs = [...(ver.recipe_inputs || [])].sort((a, b) => a.position - b.position);

          return {
            id: ver.id,
            version_number: ver.version_number,
            status: ver.status as 'active' | 'archived' | 'draft',
            reference_yield_quantity: ver.reference_yield_quantity ? String(ver.reference_yield_quantity) : '0',
            reference_yield_unit_code: refUnit?.code || '',
            portion_quantity: ver.portion_quantity ? String(ver.portion_quantity) : null,
            portion_unit_code: portUnit?.code || null,
            yield_description: ver.yield_description,
            change_reason: ver.change_reason,
            notes: ver.notes,
            effective_from: ver.effective_from,
            created_at: ver.created_at,
            inputs: sortedInputs.map((inp) => {
              const it = Array.isArray(inp.item) ? inp.item[0] : inp.item;
              const un = Array.isArray(inp.unit) ? inp.unit[0] : inp.unit;
              return {
                id: inp.id,
                item_name: it?.name || 'Insumo sin nombre',
                position: inp.position,
                quantity_mode: inp.quantity_mode,
                quantity: inp.quantity ? String(inp.quantity) : null,
                unit_code: un?.code || null,
                percentage: inp.percentage ? String(inp.percentage) : null,
                costing_source: inp.costing_source,
              };
            }),
          };
        });

        setVersions(mapped);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error al cargar historial de versiones');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [supabase, businessId, recipeId]);

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-stone-400">
        Cargando historial de versiones...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-stone-500 hover:text-stone-800 font-medium cursor-pointer"
        >
          &larr; Volver a la receta
        </button>
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-medium">
          {error}
        </div>
      </div>
    );
  }

  const statusBadge = (status: 'active' | 'archived' | 'draft') => {
    switch (status) {
      case 'active':
        return (
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
            Vigente (Activa)
          </span>
        );
      case 'archived':
        return (
          <span className="bg-stone-100 text-stone-600 border border-stone-300 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
            Archivada (Histórica)
          </span>
        );
      case 'draft':
        return (
          <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
            Borrador en curso
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
            title="Volver a la receta"
          >
            &larr;
          </button>
          <div>
            <h2 className="text-xl font-extrabold text-stone-900 tracking-tight">
              Historial de Versiones: {recipeName}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Producto resultante: <strong className="font-semibold text-stone-700">{outputItemName}</strong> · Registro inmutable de formulaciones
            </p>
          </div>
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-12 text-center text-xs text-stone-500">
          No hay versiones registradas para esta receta.
        </div>
      ) : (
        <div className="space-y-4">
          {versions.map((ver) => (
            <div
              key={ver.id}
              className={`bg-white rounded-xl border p-6 transition-shadow ${
                ver.status === 'active'
                  ? 'border-emerald-300 ring-2 ring-emerald-500/10 shadow-xs'
                  : ver.status === 'draft'
                  ? 'border-indigo-300 ring-2 ring-indigo-500/10 shadow-xs'
                  : 'border-stone-200 shadow-2xs'
              }`}
            >
              {/* Version Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-base font-extrabold text-stone-900">
                    Versión {ver.version_number}
                  </span>
                  {statusBadge(ver.status)}
                </div>

                <div className="text-xs text-stone-400">
                  {ver.status === 'active' && ver.effective_from ? (
                    <span>
                      Publicada:{' '}
                      <strong className="text-stone-700">{formatDate(ver.effective_from)}</strong>
                    </span>
                  ) : ver.status === 'archived' && ver.effective_from ? (
                    <span>
                      Vigencia desde:{' '}
                      <strong className="text-stone-600">{formatDate(ver.effective_from)}</strong>
                    </span>
                  ) : (
                    <span>
                      Creado:{' '}
                      <strong className="text-stone-600">{formatDateTime(ver.created_at)}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Yield & Portions Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                  <span className="text-stone-400 block text-[11px]">Rendimiento del lote</span>
                  <span className="font-bold text-stone-800 block mt-0.5">
                    {formatQuantityWithUnit(ver.reference_yield_quantity, ver.reference_yield_unit_code)}
                  </span>
                </div>

                <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                  <span className="text-stone-400 block text-[11px]">Porciones estimadas</span>
                  <span className="font-bold text-stone-800 block mt-0.5">
                    {ver.portion_quantity
                      ? formatPortions(
                          computePortionsCount(ver.reference_yield_quantity, ver.portion_quantity)
                        )
                      : 'A granel (sin porciones)'}
                  </span>
                </div>

                <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                  <span className="text-stone-400 block text-[11px]">Motivo del cambio</span>
                  <span className="font-medium text-stone-800 block mt-0.5 italic">
                    {ver.change_reason || 'Sin motivo registrado'}
                  </span>
                </div>
              </div>

              {/* Formulation Ingredients Summary */}
              <div className="pt-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">
                  Formulación ({ver.inputs.length} ingredientes)
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-stone-100 text-[10px] uppercase font-semibold text-stone-400">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Ingrediente</th>
                        <th className="py-2 px-3">Modo</th>
                        <th className="py-2 px-3 text-right">Cantidad / Porcentaje</th>
                        <th className="py-2 px-3">Origen Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ver.inputs.map((inp) => (
                        <tr key={inp.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                          <td className="py-2 px-3 text-stone-400 font-mono text-[11px]">
                            {inp.position}
                          </td>
                          <td className="py-2 px-3 font-semibold text-stone-800">
                            {inp.item_name}
                          </td>
                          <td className="py-2 px-3 text-stone-500 text-[11px]">
                            {inp.quantity_mode === 'absolute' ? 'Fijo (Masa/Vol)' : 'Porcentual s/base'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-medium text-stone-700">
                            {inp.quantity_mode === 'absolute'
                              ? formatQuantityWithUnit(inp.quantity, inp.unit_code)
                              : formatPercentage(inp.percentage)}
                          </td>
                          <td className="py-2 px-3 text-stone-500 text-[11px]">
                            {inp.costing_source === 'produced' ? (
                              <span className="text-indigo-700 font-medium bg-indigo-50 px-1.5 py-0.5 rounded-sm border border-indigo-200 text-[10px]">
                                Producido
                              </span>
                            ) : (
                              'Comprado'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
