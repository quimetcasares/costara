import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRecipeDataProvider } from '../../data/supabaseRecipeRepository.js';
import { calculatePublishedRecipeAsOf } from '../../domain/calculation/recipeCalculator.js';
import type {
  RecipeCalculationResult,
  ScaleTarget,
  RecipeVersionData,
} from '../../domain/calculation/types.js';
import { RecipeCostSummary } from '../components/recipes/RecipeCostSummary.js';
import { ScalingControls } from '../components/recipes/ScalingControls.js';
import { CostBreakdownTree } from '../components/recipes/CostBreakdownTree.js';
import { IssuesList } from '../components/common/IssuesList.js';
import { formatDate } from '../../lib/formatters.js';
import { getLocalDateString, getEndOfLocalDayAsUtc } from '../../lib/dateUtils.js';
import { createRecipeDraftService } from '../../data/recipeDraftService.js';

export interface RecipeDetailViewProps {
  readonly supabase: SupabaseClient;
  readonly businessId: string;
  readonly recipeId: string;
  readonly userRole: string; // 'owner' | 'admin' | 'member'
  readonly businessTimezone?: string;
  readonly onBack: () => void;
  readonly onGoToDraft: () => void;
  readonly onGoToHistory: () => void;
}

export function RecipeDetailView({
  supabase,
  businessId,
  recipeId,
  userRole,
  businessTimezone = 'America/Mexico_City',
  onBack,
  onGoToDraft,
  onGoToHistory,
}: RecipeDetailViewProps) {
  const [recipe, setRecipe] = useState<{ id: string; name: string; outputItemId: string } | null>(null);
  const [activeVersion, setActiveVersion] = useState<RecipeVersionData | null>(null);
  const [resolvedVersion, setResolvedVersion] = useState<RecipeVersionData | null>(null);
  const [hasDraft, setHasDraft] = useState<boolean>(false);
  const [asOfDate, setAsOfDate] = useState<string>(() => getLocalDateString(new Date(), businessTimezone));
  const [scaleTarget, setScaleTarget] = useState<ScaleTarget | undefined>(undefined);

  const [calculation, setCalculation] = useState<RecipeCalculationResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = userRole === 'owner' || userRole === 'admin';

  // Load recipe base metadata and active version
  const loadRecipeMetadata = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const dataProvider = createSupabaseRecipeDataProvider({ businessId, client: supabase });
      const r = await dataProvider.getRecipeById(recipeId);
      if (!r) throw new Error(`Receta con ID ${recipeId} no encontrada`);
      setRecipe(r);

      // Fetch the true currently active version (status = 'active') as the persistent source for mutations
      const actVer = await dataProvider.getActiveRecipeVersion(recipeId);
      setActiveVersion(actVer);

      // Resolve the version published as of the selected historical date
      const asOf = getEndOfLocalDayAsUtc(asOfDate, businessTimezone);
      const resVer = await dataProvider.getPublishedRecipeVersionAsOf(recipeId, asOf);
      setResolvedVersion(resVer);

      // Check if a draft exists
      const { data: draftRows } = await supabase
        .from('recipe_versions')
        .select('id')
        .eq('recipe_id', recipeId)
        .eq('status', 'draft')
        .limit(1);

      setHasDraft((draftRows || []).length > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la receta');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, businessId, recipeId, asOfDate, businessTimezone]);

  useEffect(() => {
    loadRecipeMetadata();
  }, [loadRecipeMetadata]);

  // Run calculation when metadata, date, or scaleTarget changes
  useEffect(() => {
    if (!recipe || !resolvedVersion) {
      setCalculation(null);
      return;
    }

    let isMounted = true;
    setIsCalculating(true);

    async function runCalc() {
      try {
        const dataProvider = createSupabaseRecipeDataProvider({ businessId, client: supabase });
        const asOf = getEndOfLocalDayAsUtc(asOfDate, businessTimezone);

        const result = await calculatePublishedRecipeAsOf({
          recipeId,
          dataProvider,
          asOf,
          scaleTarget,
        });

        if (isMounted) {
          setCalculation(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error al calcular costos de la receta');
        }
      } finally {
        if (isMounted) setIsCalculating(false);
      }
    }

    runCalc();

    return () => {
      isMounted = false;
    };
  }, [supabase, businessId, recipeId, recipe, resolvedVersion, asOfDate, scaleTarget, businessTimezone]);

  // Action: Create draft from active version (always using activeVersion, never historical resolvedVersion)
  const handleEditOrCreateDraft = async () => {
    if (!canEdit) return;

    if (hasDraft) {
      onGoToDraft();
      return;
    }

    if (!activeVersion) {
      setError('Esta receta no tiene una versión activa para crear un nuevo borrador');
      return;
    }

    setIsCreatingDraft(true);
    setError(null);
    try {
      const draftService = createRecipeDraftService(supabase);
      await draftService.createOrGetDraft(activeVersion.id);
      onGoToDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear borrador');
    } finally {
      setIsCreatingDraft(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-stone-400">
        Cargando receta y versión activa...
      </div>
    );
  }

  if (error && !recipe) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-stone-500 hover:text-stone-800 font-medium cursor-pointer"
        >
          &larr; Volver al catálogo
        </button>
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-medium">
          {error}
        </div>
      </div>
    );
  }

  if (!recipe) return null;

  return (
    <div className="space-y-6">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
            title="Volver al catálogo"
          >
            &larr;
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-stone-900 tracking-tight">{recipe.name}</h2>
              {hasDraft && (
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                  Borrador en curso
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Versión vigente:{' '}
              {activeVersion ? (
                <strong className="font-semibold text-stone-700">
                  v{activeVersion.versionNumber} (desde {formatDate(activeVersion.effectiveFrom)})
                </strong>
              ) : (
                <span className="text-amber-600 italic">Sin versión publicada</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGoToHistory}
            className="text-xs font-semibold px-3.5 py-2 bg-white hover:bg-stone-50 border border-stone-300 text-stone-700 rounded-lg transition-colors shadow-2xs cursor-pointer"
          >
            Historial de versiones
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={handleEditOrCreateDraft}
              disabled={isCreatingDraft}
              className="text-xs font-semibold px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isCreatingDraft ? (
                <span>Preparando borrador...</span>
              ) : hasDraft ? (
                <span>Editar Borrador Activo &rarr;</span>
              ) : (
                <span>Crear Nueva Versión &rarr;</span>
              )}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      {/* If recipe has no active published version */}
      {!activeVersion && (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center space-y-3">
          <h3 className="text-sm font-bold text-stone-800">Esta receta no tiene una versión publicada</h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            Para ver el cálculo de costos y escalado en tiempo real, crea un borrador con la formulación y publícalo.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={handleEditOrCreateDraft}
              className="text-xs font-semibold px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer inline-block mt-2"
            >
              Comenzar Formulación &rarr;
            </button>
          )}
        </div>
      )}

      {activeVersion && (
        <>
          {/* As-Of Date Selector Bar */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-2xs space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-stone-700 block">
                  Fecha de Consulta Histórica (As-Of)
                </span>
                <span className="text-[11px] text-stone-400">
                  Determina qué versión de costos de materia prima y sub-recetas se aplican.
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-semibold text-stone-700 bg-stone-100 border border-stone-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                  {formatDate(`${asOfDate}T12:00:00Z`)}
                </span>
              </div>
            </div>

            {resolvedVersion && activeVersion && resolvedVersion.id !== activeVersion.id && (
              <div className="pt-2 border-t border-stone-100">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                  <span className="font-bold">&#9432;</span>
                  <span>
                    Visualizando versión histórica: <strong>v{resolvedVersion.versionNumber}</strong>. Las nuevas versiones se crearán a partir de la versión activa actual (<strong>v{activeVersion.versionNumber}</strong>).
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Scaling Controls */}
          {resolvedVersion ? (
            <ScalingControls
              referenceYieldQuantity={resolvedVersion.referenceYieldQuantity.toString()}
              referenceYieldUnitCode={calculation?.scaledYield?.unitCode || 'g'}
              referenceYieldUnitId={resolvedVersion.referenceYieldUnitId}
              portionQuantity={resolvedVersion.portionQuantity ? resolvedVersion.portionQuantity.toString() : null}
              initialScaleTarget={scaleTarget}
              onScaleChange={setScaleTarget}
              disabled={isCalculating}
            />
          ) : (
            <div className="bg-white rounded-xl border border-stone-200 p-6 text-center text-xs text-stone-500">
              No existe ninguna versión de esta receta vigente al <strong>{formatDate(`${asOfDate}T12:00:00Z`)}</strong>.
            </div>
          )}

          {/* Calculation Loading Overlay or Results */}
          {isCalculating && (
            <div className="text-center py-4 text-xs text-amber-700 font-medium bg-amber-50 rounded-xl border border-amber-200">
              Recalculando formulación y costos...
            </div>
          )}

          {calculation && (
            <>
              {/* Summary Cards */}
              <RecipeCostSummary calculation={calculation} />

              {/* Issues / Warnings Banner */}
              {calculation.issues.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    Observaciones del Cálculo ({calculation.issues.length})
                  </h3>
                  <IssuesList issues={calculation.issues} />
                </div>
              )}

              {/* Ingredients Hierarchy & Breakdown Tree */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                  Desglose Detallado de Insumos y Costos
                </h3>
                <CostBreakdownTree nodes={calculation.breakdown} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
