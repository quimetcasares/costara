import { useState, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RecipeCard, type RecipeCardSummary } from '../components/recipes/RecipeCard.js';

export interface RecipeListViewProps {
  readonly supabase: SupabaseClient;
  readonly businessId: string;
  readonly onSelectRecipe: (recipeId: string) => void;
}

export function RecipeListView({
  supabase,
  businessId,
  onSelectRecipe,
}: RecipeListViewProps) {
  const [recipes, setRecipes] = useState<RecipeCardSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    async function loadRecipes() {
      setIsLoading(true);
      setError(null);

      try {
        // Query recipes, output item names, and versions summary (without deep calculations)
        const { data: recipesData, error: rErr } = await supabase
          .from('recipes')
          .select(`
            id,
            name,
            output_item:items!fk_recipes_output_item_business(name),
            recipe_versions(
              id,
              version_number,
              status,
              reference_yield_quantity,
              reference_yield_unit:units!recipe_versions_reference_yield_unit_id_fkey(code),
              portion_quantity,
              portion_unit:units!recipe_versions_portion_unit_id_fkey(code),
              effective_from
            )
          `)
          .eq('business_id', businessId)
          .order('name');

        if (rErr) throw new Error(rErr.message);

        if (!isMounted) return;

        type RawRecipeVersion = {
          id: string;
          version_number: number;
          status: string;
          reference_yield_quantity?: string | null;
          reference_yield_unit?: { code?: string } | Array<{ code?: string }> | null;
          portion_quantity?: string | null;
          portion_unit?: { code?: string } | Array<{ code?: string }> | null;
          effective_from?: string | null;
        };

        type RawRecipeRow = {
          id: string;
          name: string;
          output_item?: { name?: string } | Array<{ name?: string }> | null;
          recipe_versions?: RawRecipeVersion[] | null;
        };

        const summaries: RecipeCardSummary[] = (recipesData || []).map((row: RawRecipeRow) => {
          const versions = row.recipe_versions || [];
          const activeVer = versions.find((v) => v.status === 'active');
          const hasDraft = versions.some((v) => v.status === 'draft');

          const outItemName = Array.isArray(row.output_item)
            ? row.output_item[0]?.name
            : row.output_item?.name;

          const refYieldUnit = activeVer?.reference_yield_unit;
          const refYieldUnitCode = Array.isArray(refYieldUnit)
            ? refYieldUnit[0]?.code
            : refYieldUnit?.code;

          const portionUnit = activeVer?.portion_unit;
          const portionUnitCode = Array.isArray(portionUnit)
            ? portionUnit[0]?.code
            : portionUnit?.code;

          return {
            id: row.id,
            name: row.name,
            outputItemName: outItemName || 'Producto sin asignar',
            activeVersionNumber: activeVer ? activeVer.version_number : null,
            activeYieldQuantity: activeVer?.reference_yield_quantity || null,
            activeYieldUnitCode: refYieldUnitCode || null,
            activePortionQuantity: activeVer?.portion_quantity || null,
            activePortionUnitCode: portionUnitCode || null,
            activeEffectiveFrom: activeVer?.effective_from || null,
            hasDraft,
          };
        });

        setRecipes(summaries);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error al cargar catálogo de recetas');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadRecipes();

    return () => {
      isMounted = false;
    };
  }, [supabase, businessId]);

  const filteredRecipes = recipes.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.outputItemName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-stone-900 tracking-tight">Catálogo de Recetas</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Consulta formulaciones, costos calculados y versiones de producción.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Buscar receta o producto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder-stone-400"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="p-12 text-center text-xs text-stone-400">
          Cargando recetas del negocio...
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-12 text-center space-y-2 shadow-xs">
          <p className="text-sm font-semibold text-stone-700">No se encontraron recetas</p>
          <p className="text-xs text-stone-400">
            {searchQuery
              ? 'No hay recetas que coincidan con la búsqueda actual.'
              : 'Este negocio aún no tiene recetas registradas.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onClick={() => onSelectRecipe(recipe.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
