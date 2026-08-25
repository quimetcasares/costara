import { useState, useEffect, useRef } from 'react';
import type { RecipeDataProvider } from '../../domain/data/types.js';
import type {
  RecipeVersionDraftInput,
  RecipeInputDraftInput,
  PercentageBaseData,
  RecipeCalculationResult,
  ScaleTarget,
} from '../../domain/calculation/types.js';
import { calculateRecipeDraftPreview } from '../../domain/calculation/recipeCalculator.js';
import { isStrictPositiveDecimalString } from '../../lib/decimalValidation.js';

export interface UseDraftPreviewParams {
  readonly dataProvider: RecipeDataProvider | null;
  readonly asOf: Date;
  readonly draftVersion: RecipeVersionDraftInput | null;
  readonly inputs: readonly RecipeInputDraftInput[];
  readonly percentageBases: readonly PercentageBaseData[];
  readonly scaleTarget?: ScaleTarget;
  readonly recipeName?: string;
  readonly outputItemId?: string;
  readonly outputItemName?: string;
  readonly debounceMs?: number;
}

export interface UseDraftPreviewResult {
  readonly result: RecipeCalculationResult | null;
  readonly lastValidResult: RecipeCalculationResult | null;
  readonly isCalculating: boolean;
  readonly calculationError: string | null;
}

export function useDraftPreview({
  dataProvider,
  asOf,
  draftVersion,
  inputs,
  percentageBases,
  scaleTarget,
  recipeName,
  outputItemId,
  outputItemName,
  debounceMs = 300,
}: UseDraftPreviewParams): UseDraftPreviewResult {
  const [result, setResult] = useState<RecipeCalculationResult | null>(null);
  const [lastValidResult, setLastValidResult] = useState<RecipeCalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  const seqRef = useRef<number>(0);

  useEffect(() => {
    if (!dataProvider || !draftVersion || !outputItemId) {
      setResult(null);
      setIsCalculating(false);
      setCalculationError(null);
      return;
    }

    // Basic validity check before running calculation:
    // referenceYieldQuantity must be a valid positive decimal
    const refYieldStr = String(draftVersion.referenceYieldQuantity ?? '');
    if (!isStrictPositiveDecimalString(refYieldStr)) {
      setIsCalculating(false);
      return;
    }

    setIsCalculating(true);
    const currentSeq = ++seqRef.current;

    const timer = setTimeout(async () => {
      try {
        const calcResult = await calculateRecipeDraftPreview({
          dataProvider,
          asOf,
          draftVersion,
          inputs,
          percentageBases,
          scaleTarget,
          recipeName,
          outputItemId,
          outputItemName,
        });

        // Only update state if this is still the latest calculation sequence
        if (currentSeq === seqRef.current) {
          setResult(calcResult);
          setLastValidResult(calcResult);
          setCalculationError(null);
          setIsCalculating(false);
        }
      } catch (err) {
        if (currentSeq === seqRef.current) {
          const msg = err instanceof Error ? err.message : 'Error desconocido al calcular previsualización';
          setCalculationError(msg);
          setIsCalculating(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [
    dataProvider,
    asOf,
    draftVersion,
    inputs,
    percentageBases,
    scaleTarget,
    recipeName,
    outputItemId,
    outputItemName,
    debounceMs,
  ]);

  return {
    result,
    lastValidResult,
    isCalculating,
    calculationError,
  };
}
