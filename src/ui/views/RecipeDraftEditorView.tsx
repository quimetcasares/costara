import { useState, useEffect, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRecipeDataProvider } from '../../data/supabaseRecipeRepository.js';
import { createRecipeDraftService } from '../../data/recipeDraftService.js';
import {
  useRecipeDraft,
  type FormInputRow,
  type FormPercentageBase,
  type FormYieldState,
} from '../hooks/useRecipeDraft.js';
import { useDraftPreview } from '../hooks/useDraftPreview.js';
import { DraftYieldSection } from '../components/draft/DraftYieldSection.js';
import { DraftInputsTable } from '../components/draft/DraftInputsTable.js';
import { DraftDiffViewer } from '../components/draft/DraftDiffViewer.js';
import { RecipeCostSummary } from '../components/recipes/RecipeCostSummary.js';
import { IssuesList } from '../components/common/IssuesList.js';
import { PublishModal } from '../components/recipes/PublishModal.js';
import type {
  ItemData,
  UnitData,
  RecipeVersionData,
  RecipeInputData,
  RecipeCalculationResult,
  RecipeVersionDraftInput,
  RecipeInputDraftInput,
  PercentageBaseDraftInput,
} from '../../domain/calculation/types.js';
import { calculatePublishedRecipeAsOf } from '../../domain/calculation/recipeCalculator.js';
import { CostaraDecimal } from '../../domain/calculation/decimal.js';

export interface RecipeDraftEditorViewProps {
  readonly supabase: SupabaseClient;
  readonly businessId: string;
  readonly recipeId: string;
  readonly businessTimezone: string;
  readonly onBack: () => void;
  readonly onPublished: (publishedVersionId: string) => void;
}

export function RecipeDraftEditorView({
  supabase,
  businessId,
  recipeId,
  businessTimezone,
  onBack,
  onPublished,
}: RecipeDraftEditorViewProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [recipeName, setRecipeName] = useState<string>('');
  const [outputItemId, setOutputItemId] = useState<string>('');
  const [outputItemName, setOutputItemName] = useState<string>('');

  const [draftVersionId, setDraftVersionId] = useState<string>('');
  const [draftVersionNumber, setDraftVersionNumber] = useState<number>(1);
  const [initialYield, setInitialYield] = useState<FormYieldState | null>(null);
  const [initialInputs, setInitialInputs] = useState<FormInputRow[]>([]);
  const [initialBases, setInitialBases] = useState<FormPercentageBase[]>([]);

  const [activeVersion, setActiveVersion] = useState<RecipeVersionData | null>(null);
  const [activeInputs, setActiveInputs] = useState<RecipeInputData[]>([]);
  const [activeCalculation, setActiveCalculation] = useState<RecipeCalculationResult | null>(null);

  const [availableItems, setAvailableItems] = useState<readonly ItemData[]>([]);
  const [availableUnits, setAvailableUnits] = useState<readonly UnitData[]>([]);

  const draftService = useMemo(() => createRecipeDraftService(supabase), [supabase]);
  const dataProvider = useMemo(
    () => createSupabaseRecipeDataProvider({ businessId, client: supabase }),
    [supabase, businessId]
  );

  // Initial Data Loading: active version, draft version, items, units
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setLoadingError(null);

      try {
        const recipe = await dataProvider.getRecipeById(recipeId);
        if (!recipe) throw new Error(`Receta con ID ${recipeId} no encontrada`);
        if (!isMounted) return;

        setRecipeName(recipe.name);
        setOutputItemId(recipe.outputItemId ?? '');

        const outItem = await dataProvider.getItem(recipe.outputItemId);
        if (outItem && isMounted) setOutputItemName(outItem.name);

        // Fetch catalog units via dataProvider and items from supabase
        const [allUnits, itemsRes] = await Promise.all([
          dataProvider.getAllUnits(),
          supabase
            .from('items')
            .select('id, business_id, name, kind, base_unit_id, purchasable, producible, sellable')
            .eq('business_id', businessId)
            .order('name'),
        ]);

        if (itemsRes.error) throw new Error(itemsRes.error.message);

        type RawItemRow = {
          id: string;
          business_id: string;
          name: string;
          kind: 'raw_material' | 'intermediate' | 'finished_product' | 'packaging';
          base_unit_id: string;
          purchasable: boolean;
          producible: boolean;
          sellable: boolean;
        };

        const allItems: ItemData[] = (itemsRes.data || []).map((it: RawItemRow) => ({
          id: it.id,
          businessId: it.business_id,
          name: it.name,
          kind: it.kind,
          baseUnitId: it.base_unit_id,
          purchasable: it.purchasable,
          producible: it.producible,
          sellable: it.sellable,
          trackInventory: true,
          isActive: true,
        }));

        if (!isMounted) return;
        setAvailableItems(allItems);
        setAvailableUnits(allUnits);

        // Load active version & calculation for diff comparison
        const now = new Date();
        const actVer = await dataProvider.getActiveRecipeVersion(recipeId);
        if (actVer && isMounted) {
          setActiveVersion(actVer);
          const actInps = await dataProvider.getRecipeInputs(actVer.id);
          setActiveInputs([...actInps]);

          const actCalc = await calculatePublishedRecipeAsOf({
            recipeId,
            dataProvider,
            asOf: now,
          });
          if (isMounted) setActiveCalculation(actCalc);
        }

        // Find or create draft version
        const { data: draftRows, error: dErr } = await supabase
          .from('recipe_versions')
          .select('id, version_number')
          .eq('recipe_id', recipeId)
          .eq('status', 'draft')
          .limit(1);

        if (dErr) throw new Error(dErr.message);

        let draftId: string;
        let draftVerNum: number;

        if (draftRows && draftRows.length > 0) {
          draftId = draftRows[0].id;
          draftVerNum = draftRows[0].version_number;
        } else {
          // Idempotently create draft from active version if no draft exists
          const res = await draftService.createOrGetDraft(actVer?.id);
          draftId = res.draft_version_id;
          draftVerNum = res.version_number;
        }

        if (!isMounted) return;
        setDraftVersionId(draftId);
        setDraftVersionNumber(draftVerNum);

        // Load draft details and inputs
        const { data: draftDetails, error: dtErr } = await supabase
          .from('recipe_versions')
          .select(`
            reference_yield_quantity,
            reference_yield_unit_id,
            portion_quantity,
            portion_unit_id,
            yield_description,
            notes
          `)
          .eq('id', draftId)
          .single();

        if (dtErr) throw new Error(dtErr.message);

        // Load draft recipe_inputs
        const { data: draftInputsData, error: inpsErr } = await supabase
          .from('recipe_inputs')
          .select(`
            id,
            item_id,
            position,
            quantity_mode,
            quantity,
            unit_id,
            percentage,
            costing_source,
            notes
          `)
          .eq('recipe_version_id', draftId)
          .order('position', { ascending: true });

        if (inpsErr) throw new Error(inpsErr.message);

        // Load percentage bases
        const inputIds = (draftInputsData || []).map((i) => i.id);
        let draftBasesData: Array<{ percentage_input_id: string; basis_input_id: string }> = [];

        if (inputIds.length > 0) {
          const { data: bases, error: bErr } = await supabase
            .from('recipe_input_percentage_bases')
            .select('percentage_input_id, basis_input_id')
            .in('percentage_input_id', inputIds);

          if (bErr) throw new Error(bErr.message);
          draftBasesData = bases || [];
        }

        if (!isMounted) return;

        setInitialYield({
          referenceYieldQuantity: draftDetails.reference_yield_quantity ? String(draftDetails.reference_yield_quantity) : '1000',
          referenceYieldUnitId: draftDetails.reference_yield_unit_id || allUnits[0]?.id || '',
          portionQuantity: draftDetails.portion_quantity ? String(draftDetails.portion_quantity) : '',
          portionUnitId: draftDetails.portion_unit_id || '',
          yieldDescription: draftDetails.yield_description || '',
          notes: draftDetails.notes || '',
        });

        type RawDraftInputRow = {
          id: string;
          item_id: string;
          position: number;
          quantity_mode: 'absolute' | 'percentage';
          quantity?: string | null;
          unit_id?: string | null;
          percentage?: string | null;
          costing_source?: 'purchased' | 'produced' | null;
          notes?: string | null;
        };

        setInitialInputs(
          (draftInputsData || []).map((row: RawDraftInputRow) => ({
            id: row.id,
            itemId: row.item_id,
            position: row.position,
            quantityMode: row.quantity_mode,
            quantity: row.quantity ? String(row.quantity) : '',
            unitId: row.unit_id || '',
            percentage: row.percentage ? String(row.percentage) : '',
            costingSource: row.costing_source || 'purchased',
            notes: row.notes || '',
          }))
        );

        setInitialBases(
          draftBasesData.map((b) => ({
            percentageInputId: b.percentage_input_id,
            basisInputId: b.basis_input_id,
          }))
        );
      } catch (err) {
        if (isMounted) {
          setLoadingError(err instanceof Error ? err.message : 'Error al cargar datos del borrador');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [supabase, businessId, recipeId, draftService, dataProvider]);

  if (isLoading || !initialYield || !draftVersionId) {
    return (
      <div className="p-12 text-center text-xs text-stone-400">
        Preparando editor de borrador...
      </div>
    );
  }

  if (loadingError) {
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
          {loadingError}
        </div>
      </div>
    );
  }

  return (
    <RecipeDraftEditorForm
      key={draftVersionId}
      draftService={draftService}
      dataProvider={dataProvider}
      businessId={businessId}
      recipeId={recipeId}
      recipeName={recipeName}
      outputItemId={outputItemId}
      outputItemName={outputItemName}
      draftVersionId={draftVersionId}
      draftVersionNumber={draftVersionNumber}
      initialYield={initialYield}
      initialInputs={initialInputs}
      initialBases={initialBases}
      activeVersion={activeVersion}
      activeInputs={activeInputs}
      activeCalculation={activeCalculation}
      availableItems={availableItems}
      availableUnits={availableUnits}
      businessTimezone={businessTimezone}
      onBack={onBack}
      onPublished={onPublished}
    />
  );
}

interface RecipeDraftEditorFormProps {
  readonly draftService: ReturnType<typeof createRecipeDraftService>;
  readonly dataProvider: ReturnType<typeof createSupabaseRecipeDataProvider>;
  readonly businessId: string;
  readonly recipeId: string;
  readonly recipeName: string;
  readonly outputItemId: string;
  readonly outputItemName: string;
  readonly draftVersionId: string;
  readonly draftVersionNumber: number;
  readonly initialYield: FormYieldState;
  readonly initialInputs: FormInputRow[];
  readonly initialBases: FormPercentageBase[];
  readonly activeVersion: RecipeVersionData | null;
  readonly activeInputs: RecipeInputData[];
  readonly activeCalculation: RecipeCalculationResult | null;
  readonly availableItems: readonly ItemData[];
  readonly availableUnits: readonly UnitData[];
  readonly businessTimezone: string;
  readonly onBack: () => void;
  readonly onPublished: (publishedVersionId: string) => void;
}

function RecipeDraftEditorForm({
  draftService,
  dataProvider,
  businessId,
  recipeId,
  recipeName,
  outputItemId,
  outputItemName,
  draftVersionId,
  draftVersionNumber,
  initialYield,
  initialInputs,
  initialBases,
  activeVersion,
  activeInputs,
  activeCalculation,
  availableItems,
  availableUnits,
  businessTimezone,
  onBack,
  onPublished,
}: RecipeDraftEditorFormProps) {
  const [isPublishModalOpen, setIsPublishModalOpen] = useState<boolean>(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<boolean>(false);

  // Draft State Hook (manages form state, stable UUIDs, validation)
  const draft = useRecipeDraft({
    recipeDraftService: draftService,
    draftVersionId,
    recipeId,
    initialVersionNumber: draftVersionNumber,
    initialYield,
    initialInputs,
    initialBases,
    availableItems,
    availableUnits,
    onSaved: () => {
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 3000);
    },
    onPublished: (pubId) => {
      onPublished(pubId);
    },
  });

  // Prepare input structures for domain preview calculation
  const previewDraftVersion: RecipeVersionDraftInput = useMemo(
    () => ({
      id: draftVersionId,
      businessId,
      recipeId,
      versionNumber: draftVersionNumber,
      status: 'draft',
      referenceYieldQuantity: draft.yieldState.referenceYieldQuantity
        ? new CostaraDecimal(draft.yieldState.referenceYieldQuantity)
        : new CostaraDecimal(0),
      referenceYieldUnitId: draft.yieldState.referenceYieldUnitId,
      portionQuantity: draft.yieldState.portionQuantity
        ? new CostaraDecimal(draft.yieldState.portionQuantity)
        : null,
      portionUnitId: draft.yieldState.portionUnitId || null,
      yieldDescription: draft.yieldState.yieldDescription || null,
      notes: draft.yieldState.notes || null,
    }),
    [draftVersionId, businessId, recipeId, draftVersionNumber, draft.yieldState]
  );

  const previewInputs: RecipeInputDraftInput[] = useMemo(
    () =>
      draft.inputs.map((inp) => ({
        id: inp.id,
        recipeVersionId: draftVersionId,
        itemId: inp.itemId,
        position: inp.position,
        quantityMode: inp.quantityMode,
        quantity:
          inp.quantityMode === 'absolute' && inp.quantity
            ? new CostaraDecimal(inp.quantity)
            : null,
        unitId: inp.quantityMode === 'absolute' ? inp.unitId : null,
        percentage:
          inp.quantityMode === 'percentage' && inp.percentage
            ? new CostaraDecimal(inp.percentage)
            : null,
        costingSource: inp.costingSource,
        notes: inp.notes || null,
      })),
    [draft.inputs, draftVersionId]
  );

  const previewBases: PercentageBaseDraftInput[] = useMemo(
    () =>
      draft.percentageBases.map((pb) => ({
        percentageInputId: pb.percentageInputId,
        basisInputId: pb.basisInputId,
      })),
    [draft.percentageBases]
  );

  // Reactive Preview Hook (debounced ~300ms calculation)
  const now = useMemo(() => new Date(), []);
  const preview = useDraftPreview({
    dataProvider,
    asOf: now,
    draftVersion: previewDraftVersion,
    inputs: previewInputs,
    percentageBases: previewBases,
    recipeName,
    outputItemId,
    outputItemName,
    debounceMs: 300,
  });

  const calculationToDisplay = preview.result || preview.lastValidResult;

  const handleOpenPublish = () => {
    if (draft.validateForPublish()) {
      setIsPublishModalOpen(true);
    }
  };

  const handleConfirmPublish = async (
    effectiveFromLocal: string,
    changeReason?: string
  ): Promise<boolean> => {
    return await draft.handlePublish(effectiveFromLocal, changeReason);
  };

  return (
    <div className="space-y-6 pb-20 sm:pb-0">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:sticky sm:top-16 bg-stone-100 sm:bg-stone-100/95 sm:backdrop-blur-xs py-2 sm:py-3 z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 rounded-lg transition-colors cursor-pointer"
            title="Volver a la receta"
          >
            &larr;
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-stone-900 tracking-tight">
                Editar Borrador (v{draftVersionNumber})
              </h2>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Receta: <strong className="font-semibold text-stone-700">{recipeName}</strong> · Producto:{' '}
              <strong className="font-semibold text-stone-700">{outputItemName}</strong>
            </p>
          </div>
        </div>

        {/* Desktop Action Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          {saveSuccessNotice && (
            <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
              ✓ Guardado correctamente
            </span>
          )}

          <button
            type="button"
            onClick={() => draft.handleSave()}
            disabled={draft.isSaving || draft.isPublishing}
            className="text-xs font-semibold px-4 py-2 bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 rounded-lg transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
          >
            {draft.isSaving ? 'Guardando...' : 'Guardar Borrador'}
          </button>

          <button
            type="button"
            onClick={handleOpenPublish}
            disabled={draft.isSaving || draft.isPublishing}
            className="text-xs font-semibold px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {draft.isPublishing ? 'Publicando...' : 'Publicar Versión →'}
          </button>
        </div>
      </div>

      {/* Mobile Bottom Fixed Actions Bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-xs border-t border-stone-200 shadow-lg z-20 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => draft.handleSave()}
          disabled={draft.isSaving || draft.isPublishing}
          className="flex-1 text-xs font-semibold py-2.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-lg text-center transition-colors disabled:opacity-50"
        >
          {draft.isSaving ? 'Guardando...' : 'Guardar'}
        </button>

        <button
          type="button"
          onClick={handleOpenPublish}
          disabled={draft.isSaving || draft.isPublishing}
          className="flex-1 text-xs font-semibold py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-center transition-colors shadow-xs disabled:opacity-50"
        >
          {draft.isPublishing ? 'Publicando...' : 'Publicar →'}
        </button>
      </div>

      {saveSuccessNotice && (
        <div className="sm:hidden p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold text-center">
          ✓ Guardado correctamente
        </div>
      )}

      {/* Validation Errors & Server Messages */}
      {draft.validationErrors.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1 text-xs text-red-900">
          <p className="font-bold">Corrige los siguientes detalles para continuar:</p>
          <ul className="list-disc list-inside space-y-0.5 text-red-800">
            {draft.validationErrors.map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}

      {draft.saveError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-medium">
          {draft.saveError}
        </div>
      )}

      {draft.publishError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-medium">
          {draft.publishError}
        </div>
      )}

      {/* 1. Yield & Portions Section */}
      <DraftYieldSection
        yieldState={draft.yieldState}
        onChange={draft.updateYield}
        availableUnits={availableUnits}
        disabled={draft.isSaving || draft.isPublishing}
      />

      {/* 2. Inputs & Percentage Bases Table */}
      <DraftInputsTable
        inputs={draft.inputs}
        percentageBases={draft.percentageBases}
        availableItems={availableItems}
        availableUnits={availableUnits}
        onAddInput={draft.addInput}
        onRemoveInput={draft.removeInput}
        onUpdateInput={draft.updateInput}
        onMoveInput={draft.moveInput}
        onTogglePercentageBase={draft.togglePercentageBase}
        disabled={draft.isSaving || draft.isPublishing}
      />

      {/* 3. Live Calculation Cost Summary Preview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
            Previsualización en Tiempo Real del Costo
          </h3>
          {preview.isCalculating && (
            <span className="text-xs text-amber-700 font-medium animate-pulse">
              Recalculando...
            </span>
          )}
        </div>

        {calculationToDisplay ? (
          <>
            <RecipeCostSummary
              calculation={calculationToDisplay}
              yieldDescription={draft.yieldState.yieldDescription}
            />

            {calculationToDisplay.issues.length > 0 && (
              <IssuesList issues={calculationToDisplay.issues} />
            )}
          </>
        ) : (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-xs text-stone-400">
            {preview.calculationError ? (
              <span className="text-red-600 font-medium">{preview.calculationError}</span>
            ) : (
              'Ingresa ingredientes para previsualizar el costo en tiempo real.'
            )}
          </div>
        )}
      </div>

      {/* 4. Side-by-side Formulation Diff vs Active Version */}
      <DraftDiffViewer
        activeVersion={activeVersion}
        activeInputs={activeInputs}
        activeCalculation={activeCalculation}
        draftYield={draft.yieldState}
        draftInputs={draft.inputs}
        draftCalculation={calculationToDisplay}
        availableItems={availableItems}
        availableUnits={availableUnits}
      />

      {/* Atomic Publish Modal */}
      <PublishModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        onConfirmPublish={handleConfirmPublish}
        versionNumber={draftVersionNumber}
        businessTimezone={businessTimezone}
        isPublishing={draft.isPublishing}
        publishError={draft.publishError}
      />
    </div>
  );
}
