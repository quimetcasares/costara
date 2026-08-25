import { useState, useCallback, useEffect } from 'react';
import type {
  DraftYieldPayload,
  DraftInputPayload,
  DraftPercentageBasePayload,
  RecipeDraftService,
} from '../../data/recipeDraftService.js';
import { isStrictPositiveDecimalString } from '../../lib/decimalValidation.js';
import type { ItemData, UnitData } from '../../domain/calculation/types.js';

export interface FormInputRow {
  readonly id: string; // Stable UUID generated once via crypto.randomUUID()
  readonly itemId: string;
  readonly position: number;
  readonly quantityMode: 'absolute' | 'percentage';
  readonly quantity: string; // decimal string
  readonly unitId: string;
  readonly percentage: string; // decimal string
  readonly costingSource: 'purchased' | 'produced' | null;
  readonly notes: string;
}

export interface FormPercentageBase {
  readonly percentageInputId: string;
  readonly basisInputId: string;
}

export interface FormYieldState {
  readonly referenceYieldQuantity: string;
  readonly referenceYieldUnitId: string;
  readonly portionQuantity: string;
  readonly portionUnitId: string;
  readonly yieldDescription: string;
  readonly notes: string;
}

export interface UseRecipeDraftParams {
  readonly recipeDraftService: RecipeDraftService;
  readonly draftVersionId: string;
  readonly recipeId: string;
  readonly initialVersionNumber: number;
  readonly initialYield: FormYieldState;
  readonly initialInputs: readonly FormInputRow[];
  readonly initialBases: readonly FormPercentageBase[];
  readonly availableItems: readonly ItemData[];
  readonly availableUnits: readonly UnitData[];
  readonly onSaved?: () => void;
  readonly onPublished?: (publishedVersionId: string) => void;
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly inputId?: string;
}

export function useRecipeDraft({
  recipeDraftService,
  draftVersionId,
  recipeId,
  initialVersionNumber,
  initialYield,
  initialInputs,
  initialBases,
  availableItems,
  onSaved,
  onPublished,
}: UseRecipeDraftParams) {
  const [yieldState, setYieldState] = useState<FormYieldState>(initialYield);
  const [inputs, setInputs] = useState<FormInputRow[]>(() => [...initialInputs]);
  const [percentageBases, setPercentageBases] = useState<FormPercentageBase[]>(() => [...initialBases]);

  useEffect(() => {
    setYieldState(initialYield);
    setInputs([...initialInputs]);
    setPercentageBases([...initialBases]);
  }, [draftVersionId, initialYield, initialInputs, initialBases]);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // Yield state modifiers
  const updateYield = useCallback((partial: Partial<FormYieldState>) => {
    setYieldState((prev) => ({ ...prev, ...partial }));
  }, []);

  // Inputs modifiers
  const addInput = useCallback((defaultUnitId?: string) => {
    const newId = crypto.randomUUID();
    setInputs((prev) => [
      ...prev,
      {
        id: newId,
        itemId: '',
        position: prev.length + 1,
        quantityMode: 'absolute',
        quantity: '',
        unitId: defaultUnitId || '',
        percentage: '',
        costingSource: 'purchased',
        notes: '',
      },
    ]);
  }, []);

  const removeInput = useCallback((idToRemove: string) => {
    setInputs((prev) => {
      const filtered = prev.filter((inp) => inp.id !== idToRemove);
      return filtered.map((inp, idx) => ({ ...inp, position: idx + 1 }));
    });

    // Remove any percentage base associations referencing this input
    setPercentageBases((prev) =>
      prev.filter((pb) => pb.percentageInputId !== idToRemove && pb.basisInputId !== idToRemove)
    );
  }, []);

  const updateInput = useCallback((idToUpdate: string, partial: Partial<FormInputRow>) => {
    setInputs((prev) =>
      prev.map((inp) => {
        if (inp.id !== idToUpdate) return inp;
        const updated = { ...inp, ...partial };
        return updated;
      })
    );
  }, []);

  const moveInput = useCallback((index: number, direction: 'up' | 'down') => {
    setInputs((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      return copy.map((inp, idx) => ({ ...inp, position: idx + 1 }));
    });
  }, []);

  // Percentage bases modifiers
  const togglePercentageBase = useCallback((percentageInputId: string, basisInputId: string) => {
    setPercentageBases((prev) => {
      const exists = prev.some(
        (pb) => pb.percentageInputId === percentageInputId && pb.basisInputId === basisInputId
      );
      if (exists) {
        return prev.filter(
          (pb) => !(pb.percentageInputId === percentageInputId && pb.basisInputId === basisInputId)
        );
      }
      return [...prev, { percentageInputId, basisInputId }];
    });
  }, []);

  // Structural Validation for Save
  const validateForSave = useCallback((): boolean => {
    const errors: ValidationError[] = [];

    if (!isStrictPositiveDecimalString(yieldState.referenceYieldQuantity)) {
      errors.push({ field: 'referenceYieldQuantity', message: 'El rendimiento de referencia debe ser un número decimal mayor a 0' });
    }

    if (!yieldState.referenceYieldUnitId) {
      errors.push({ field: 'referenceYieldUnitId', message: 'Selecciona una unidad para el rendimiento' });
    }

    if (yieldState.portionQuantity.trim()) {
      if (!isStrictPositiveDecimalString(yieldState.portionQuantity)) {
        errors.push({ field: 'portionQuantity', message: 'La porción nominal debe ser un número decimal mayor a 0' });
      }
      if (!yieldState.portionUnitId) {
        errors.push({ field: 'portionUnitId', message: 'Selecciona una unidad para la porción' });
      }
    }

    inputs.forEach((inp, idx) => {
      if (!inp.itemId) {
        errors.push({ field: `input_${idx}_item`, message: `Ingrediente #${idx + 1}: Selecciona un insumo`, inputId: inp.id });
      }
      if (inp.quantityMode === 'absolute') {
        if (!isStrictPositiveDecimalString(inp.quantity)) {
          errors.push({ field: `input_${idx}_qty`, message: `Ingrediente #${idx + 1}: Ingresa una cantidad válida > 0`, inputId: inp.id });
        }
        if (!inp.unitId) {
          errors.push({ field: `input_${idx}_unit`, message: `Ingrediente #${idx + 1}: Selecciona una unidad`, inputId: inp.id });
        }
      } else {
        if (!isStrictPositiveDecimalString(inp.percentage)) {
          errors.push({ field: `input_${idx}_pct`, message: `Ingrediente #${idx + 1}: Ingresa un porcentaje válido > 0`, inputId: inp.id });
        }
      }
    });

    setValidationErrors(errors);
    return errors.length === 0;
  }, [yieldState, inputs]);

  // Mathematical & Gate Validation for Publish
  const validateForPublish = useCallback((): boolean => {
    if (!validateForSave()) return false;

    const errors: ValidationError[] = [];

    if (inputs.length === 0) {
      errors.push({ field: 'inputs', message: 'La receta debe contener al menos un ingrediente para publicarse' });
    }

    // Gate A: Check every percentage input has at least one base
    const pctInputs = inputs.filter((inp) => inp.quantityMode === 'percentage');
    for (const pctInp of pctInputs) {
      const hasBase = percentageBases.some((pb) => pb.percentageInputId === pctInp.id);
      if (!hasBase) {
        const item = availableItems.find((it) => it.id === pctInp.itemId);
        const name = item ? item.name : `Ingrediente #${pctInp.position}`;
        errors.push({
          field: `input_${pctInp.id}_base`,
          message: `El ingrediente porcentual "${name}" no tiene ninguna base seleccionada (Gate A)`,
          inputId: pctInp.id,
        });
      }
    }

    // Gate B: Hybrid items (purchasable AND producible) must have costing_source set
    for (const inp of inputs) {
      const item = availableItems.find((it) => it.id === inp.itemId);
      if (item && item.purchasable && item.producible) {
        if (!inp.costingSource) {
          errors.push({
            field: `input_${inp.id}_costing_source`,
            message: `El ingrediente "${item.name}" es híbrido y requiere seleccionar su origen de costeo (Gate B)`,
            inputId: inp.id,
          });
        }
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  }, [validateForSave, inputs, percentageBases, availableItems]);

  // Save Draft action
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!validateForSave()) return false;

    setIsSaving(true);
    setSaveError(null);

    try {
      const yieldPayload: DraftYieldPayload = {
        reference_yield_quantity: yieldState.referenceYieldQuantity.trim(),
        reference_yield_unit_id: yieldState.referenceYieldUnitId,
        portion_quantity: yieldState.portionQuantity.trim() || null,
        portion_unit_id: yieldState.portionQuantity.trim() ? yieldState.portionUnitId : null,
        yield_description: yieldState.yieldDescription.trim() || null,
        notes: yieldState.notes.trim() || null,
      };

      const inputsPayload: DraftInputPayload[] = inputs.map((inp) => ({
        id: inp.id,
        item_id: inp.itemId,
        position: inp.position,
        quantity_mode: inp.quantityMode,
        quantity: inp.quantityMode === 'absolute' ? inp.quantity.trim() : null,
        unit_id: inp.quantityMode === 'absolute' ? inp.unitId : null,
        percentage: inp.quantityMode === 'percentage' ? inp.percentage.trim() : null,
        costing_source: inp.costingSource || null,
        notes: inp.notes.trim() || null,
      }));

      const basesPayload: DraftPercentageBasePayload[] = percentageBases.map((pb) => ({
        percentage_input_id: pb.percentageInputId,
        basis_input_id: pb.basisInputId,
      }));

      await recipeDraftService.saveDraft(draftVersionId, yieldPayload, inputsPayload, basesPayload);
      if (onSaved) onSaved();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el borrador';
      setSaveError(msg);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    validateForSave,
    recipeDraftService,
    draftVersionId,
    yieldState,
    inputs,
    percentageBases,
    onSaved,
  ]);

  // Publish Draft action
  const handlePublish = useCallback(
    async (effectiveFromLocal: string, changeReason?: string): Promise<boolean> => {
      if (!validateForPublish()) return false;

      // First ensure the latest draft changes are saved
      const savedOk = await handleSave();
      if (!savedOk) return false;

      setIsPublishing(true);
      setPublishError(null);

      try {
        const result = await recipeDraftService.publishVersion(
          draftVersionId,
          effectiveFromLocal,
          changeReason || null
        );

        if (onPublished) {
          onPublished(result.recipe_version_id);
        }
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al publicar la receta';
        setPublishError(msg);
        return false;
      } finally {
        setIsPublishing(false);
      }
    },
    [validateForPublish, handleSave, recipeDraftService, draftVersionId, onPublished]
  );

  return {
    recipeId,
    draftVersionId,
    versionNumber: initialVersionNumber,
    yieldState,
    inputs,
    percentageBases,
    validationErrors,
    isSaving,
    isPublishing,
    saveError,
    publishError,
    updateYield,
    addInput,
    removeInput,
    updateInput,
    moveInput,
    togglePercentageBase,
    validateForSave,
    validateForPublish,
    handleSave,
    handlePublish,
  };
}
