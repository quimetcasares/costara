import { createClient } from '@supabase/supabase-js';
import { CostaraDecimal } from '@domain/calculation/decimal.ts';
import { resolveRecipeFormula } from '@domain/calculation/formulaResolver.ts';
import { resolveYieldAndOutput } from '@domain/calculation/yieldResolver.ts';
import { applyRecipeScaling } from '@domain/calculation/scalingEngine.ts';
import { toUniversalDimensionBase, fromUniversalDimensionBase } from '@domain/calculation/units.ts';
import type {
  RecipeVersionData,
  RecipeInputData,
  PercentageBaseData,
  UnitData,
  ItemData,
  ScaleTarget,
} from '@domain/calculation/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RunScaleTargetPayload {
  mode: 'yield' | 'output_pieces';
  targetQuantity?: string | number;
  unitId?: string;
  targetPieces?: string | number;
}

interface StartProductionRunBody {
  runId: string;
  businessId: string;
  targetId?: string | null;
  itemId?: string;
  scheduledDate?: string; // YYYY-MM-DD
  runScaleTarget: RunScaleTargetPayload;
  notes?: string | null;
  // Browser must NOT pass recipeVersionId
  recipeVersionId?: unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // 1. User-scoped client for reading data respecting RLS
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Parse request body
    const body: StartProductionRunBody = await req.json();
    const {
      runId,
      businessId,
      targetId,
      itemId,
      scheduledDate,
      runScaleTarget,
      notes,
      recipeVersionId,
    } = body;

    // Strict contract validation: browser must NOT pass recipeVersionId
    if (recipeVersionId !== undefined && recipeVersionId !== null) {
      return new Response(
        JSON.stringify({
          error: 'BAD_REQUEST',
          message: 'recipeVersionId must not be provided by the client',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!runId) {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'runId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!businessId) {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'businessId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!runScaleTarget || typeof runScaleTarget !== 'object') {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'runScaleTarget is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (runScaleTarget.mode !== 'yield' && runScaleTarget.mode !== 'output_pieces') {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'runScaleTarget.mode must be yield or output_pieces' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user membership in business
    const { data: membership, error: memError } = await userClient
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memError || !membership) {
      return new Response(
        JSON.stringify({ error: 'FORBIDDEN', message: 'User is not a member of this business' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load business timezone (multi-tenant aware, strict validation)
    const { data: business, error: bizError } = await userClient
      .from('businesses')
      .select('id, timezone')
      .eq('id', businessId)
      .maybeSingle();

    if (bizError || !business) {
      return new Response(
        JSON.stringify({ error: 'BUSINESS_NOT_FOUND', message: 'Business not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!business.timezone || typeof business.timezone !== 'string' || business.timezone.trim() === '') {
      return new Response(
        JSON.stringify({
          code: 'INVALID_BUSINESS_TIMEZONE',
          message: 'Business timezone is not configured',
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const businessTimezone = business.timezone.trim();

    // Validate IANA timezone with Intl.DateTimeFormat; reject invalid timezones
    let tzFormatter: Intl.DateTimeFormat;
    try {
      tzFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: businessTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return new Response(
        JSON.stringify({
          code: 'INVALID_BUSINESS_TIMEZONE',
          message: `Business timezone "${businessTimezone}" is invalid or unsupported`,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    function getLocalDateString(dateOrIso: Date | string): string {
      const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date provided to getLocalDateString');
      }
      return tzFormatter.format(date);
    }

    let effectiveRecipeVersionId: string;
    let effectiveScheduledDate: string;
    let effectiveItemId: string;

    // 3. Resolve Target (Planned) vs Unplanned Run
    if (targetId) {
      const { data: target, error: targetError } = await userClient
        .from('production_targets')
        .select('id, item_id, recipe_version_id, target_quantity, unit_id, target_date')
        .eq('id', targetId)
        .eq('business_id', businessId)
        .maybeSingle();

      if (targetError || !target) {
        return new Response(
          JSON.stringify({ error: 'TARGET_NOT_FOUND', message: 'Production target not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!target.recipe_version_id) {
        return new Response(
          JSON.stringify({
            code: 'TARGET_RECIPE_VERSION_REQUIRED',
            message: 'Production target has no recipe version assigned',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Locate recipe identity by output_item_id
      const { data: targetRecipe, error: trErr } = await userClient
        .from('recipes')
        .select('id, name, output_item_id')
        .eq('output_item_id', target.item_id)
        .eq('business_id', businessId)
        .maybeSingle();

      if (trErr || !targetRecipe) {
        return new Response(
          JSON.stringify({ error: 'RECIPE_NOT_FOUND', message: 'Recipe for target item not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Resolve applicable published recipe version as of target_date in business timezone
      const { data: publishedVersions, error: pvErr } = await userClient
        .from('recipe_versions')
        .select('id, version_number, status, effective_from')
        .eq('business_id', businessId)
        .eq('recipe_id', targetRecipe.id)
        .in('status', ['active', 'archived'])
        .order('effective_from', { ascending: false })
        .order('version_number', { ascending: false });

      if (pvErr || !publishedVersions) {
        return new Response(
          JSON.stringify({ error: 'DB_ERROR', message: pvErr?.message ?? 'Failed to load recipe versions' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const applicableVersion = publishedVersions.find((v) => {
        if (!v.effective_from) return false;
        const versionLocalDate = getLocalDateString(v.effective_from);
        return versionLocalDate <= target.target_date;
      });

      if (!applicableVersion) {
        return new Response(
          JSON.stringify({
            code: 'NO_RECIPE_AS_OF_DATE',
            message: `No published recipe version found as of target date ${target.target_date} in timezone ${businessTimezone}`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check recipe version conflict between planned target and applicable as of target date
      if (target.recipe_version_id !== applicableVersion.id) {
        return new Response(
          JSON.stringify({
            code: 'RECIPE_VERSION_CONFLICT',
            plannedRecipeVersionId: target.recipe_version_id,
            applicableRecipeVersionId: applicableVersion.id,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      effectiveRecipeVersionId = target.recipe_version_id;
      effectiveScheduledDate = target.target_date;
      effectiveItemId = target.item_id;
    } else {
      // Unplanned run: itemId and scheduledDate are required from browser
      if (!itemId) {
        return new Response(
          JSON.stringify({ error: 'BAD_REQUEST', message: 'itemId is required for unplanned runs' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!scheduledDate) {
        return new Response(
          JSON.stringify({ error: 'BAD_REQUEST', message: 'scheduledDate is required for unplanned runs' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 1. Locate recipe identity by output_item_id = itemId
      const { data: recipe, error: rErr } = await userClient
        .from('recipes')
        .select('id, name, output_item_id')
        .eq('output_item_id', itemId)
        .eq('business_id', businessId)
        .maybeSingle();

      if (rErr || !recipe) {
        return new Response(
          JSON.stringify({ error: 'RECIPE_NOT_FOUND', message: `No recipe found for item ${itemId}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 2. Resolve published applicable recipe_version asOf(scheduledDate) in business timezone
      const { data: publishedVersions, error: pvErr } = await userClient
        .from('recipe_versions')
        .select('id, version_number, status, effective_from')
        .eq('business_id', businessId)
        .eq('recipe_id', recipe.id)
        .in('status', ['active', 'archived'])
        .order('effective_from', { ascending: false })
        .order('version_number', { ascending: false });

      if (pvErr || !publishedVersions) {
        return new Response(
          JSON.stringify({ error: 'DB_ERROR', message: pvErr?.message ?? 'Failed to load recipe versions' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const applicableVersion = publishedVersions.find((v) => {
        if (!v.effective_from) return false;
        const versionLocalDate = getLocalDateString(v.effective_from);
        return versionLocalDate <= scheduledDate;
      });

      if (!applicableVersion) {
        return new Response(
          JSON.stringify({
            code: 'NO_RECIPE_AS_OF_DATE',
            message: `No published recipe version found as of scheduledDate ${scheduledDate} in timezone ${businessTimezone}`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      effectiveRecipeVersionId = applicableVersion.id;
      effectiveScheduledDate = scheduledDate;
      effectiveItemId = itemId;
    }

    // 4. Fetch full Recipe Version, Output Item, and units
    const { data: versionData, error: versionError } = await userClient
      .from('recipe_versions')
      .select(`
        id,
        recipe_id,
        version_number,
        status,
        reference_yield_quantity,
        reference_yield_unit_id,
        portion_quantity,
        portion_unit_id,
        effective_from,
        recipes!inner (
          id,
          name,
          output_item_id
        )
      `)
      .eq('id', effectiveRecipeVersionId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (versionError || !versionData) {
      return new Response(
        JSON.stringify({ error: 'RECIPE_VERSION_NOT_FOUND', message: 'Recipe version not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recipe = versionData.recipes as unknown as { id: string; name: string; output_item_id: string };

    // Fetch all units and output item
    const [unitsRes, outputItemRes, inputsRes, basesRes] = await Promise.all([
      userClient.from('units').select('id, code, name_singular, name_plural, symbol, dimension_id, factor_to_base, is_base, unit_dimensions(code)'),
      userClient.from('items').select('id, name, kind, base_unit_id').eq('id', effectiveItemId).single(),
      userClient
        .from('recipe_inputs')
        .select('id, item_id, position, quantity_mode, quantity, unit_id, percentage, costing_source, notes')
        .eq('recipe_version_id', effectiveRecipeVersionId)
        .order('position', { ascending: true }),
      userClient
        .from('recipe_input_percentage_bases')
        .select('percentage_input_id, basis_input_id')
        .eq('business_id', businessId),
    ]);

    if (unitsRes.error || !unitsRes.data) {
      throw new Error(`Failed to load units: ${unitsRes.error?.message}`);
    }
    if (outputItemRes.error || !outputItemRes.data) {
      throw new Error(`Failed to load output item: ${outputItemRes.error?.message}`);
    }
    if (inputsRes.error || !inputsRes.data) {
      throw new Error(`Failed to load recipe inputs: ${inputsRes.error?.message}`);
    }

    const rawUnits = unitsRes.data;
    const outputItem = outputItemRes.data;
    const recipeInputs = inputsRes.data;
    const percentageBases = basesRes.data ?? [];

    const unitsMap = new Map<string, UnitData>();
    for (const u of rawUnits) {
      const dim = u.unit_dimensions as unknown as { code: string };
      unitsMap.set(u.id, {
        id: u.id,
        code: u.code,
        nameSingular: u.name_singular,
        namePlural: u.name_plural,
        symbol: u.symbol,
        dimensionId: u.dimension_id,
        dimensionCode: dim.code as UnitData['dimensionCode'],
        factorToBase: new CostaraDecimal(String(u.factor_to_base)),
        isBase: u.is_base,
      });
    }

    const outputBaseUnit = unitsMap.get(outputItem.base_unit_id);
    if (!outputBaseUnit) {
      throw new Error(`Base unit not found for output item ${outputItem.id}`);
    }

    // Validate runScaleTarget against output item & units
    if (runScaleTarget.mode === 'yield') {
      if (!runScaleTarget.targetQuantity || Number(runScaleTarget.targetQuantity) <= 0) {
        return new Response(
          JSON.stringify({ error: 'INVALID_SCALE_TARGET', message: 'targetQuantity must be positive in yield mode' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!runScaleTarget.unitId) {
        return new Response(
          JSON.stringify({ error: 'INVALID_SCALE_TARGET', message: 'unitId is required in yield mode' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const scaleUnit = unitsMap.get(runScaleTarget.unitId);
      if (!scaleUnit) {
        return new Response(
          JSON.stringify({ error: 'UNIT_NOT_FOUND', message: `Unit ${runScaleTarget.unitId} not found` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const isCompatible = scaleUnit.dimensionCode === outputBaseUnit.dimensionCode;

      if (!isCompatible) {
        return new Response(
          JSON.stringify({
            code: 'INCOMPATIBLE_SCALE_TARGET_DIMENSION',
            message: `Scale unit dimension ${scaleUnit.dimensionCode} does not match output item dimension ${outputBaseUnit.dimensionCode}`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (runScaleTarget.mode === 'output_pieces') {
      if (!runScaleTarget.targetPieces || Number(runScaleTarget.targetPieces) <= 0) {
        return new Response(
          JSON.stringify({ error: 'INVALID_SCALE_TARGET', message: 'targetPieces must be positive in output_pieces mode' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (outputBaseUnit.dimensionCode !== 'count') {
        return new Response(
          JSON.stringify({
            code: 'INCOMPATIBLE_SCALE_TARGET_MODE',
            message: 'output_pieces mode can only be used for items with count base unit',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch items involved in inputs
    const inputItemIds = Array.from(new Set(recipeInputs.map((i) => i.item_id)));
    const allItemIds = Array.from(new Set([recipe.output_item_id, ...inputItemIds]));

    const { data: itemsData, error: itmsError } = await userClient
      .from('items')
      .select('id, name, kind, base_unit_id')
      .in('id', allItemIds);

    if (itmsError || !itemsData) {
      throw new Error(`Failed to load items: ${itmsError?.message}`);
    }

    const itemsMap = new Map<string, ItemData>();
    for (const itm of itemsData) {
      const bUnit = unitsMap.get(itm.base_unit_id);
      if (!bUnit) throw new Error(`Base unit not found for item ${itm.id}`);
      itemsMap.set(itm.id, {
        id: itm.id,
        name: itm.name,
        kind: itm.kind,
        baseUnitId: itm.base_unit_id,
        baseUnitCode: bUnit.code,
        baseDimensionCode: bUnit.dimensionCode,
      });
    }

    // 5. Execute Domain Calculation Engine
    const domainInputs: RecipeInputData[] = recipeInputs.map((ri) => ({
      id: ri.id,
      businessId,
      recipeVersionId: effectiveRecipeVersionId,
      itemId: ri.item_id,
      position: ri.position,
      quantityMode: ri.quantity_mode,
      quantity: ri.quantity !== null ? new CostaraDecimal(String(ri.quantity)) : null,
      unitId: ri.unit_id,
      percentage: ri.percentage !== null ? new CostaraDecimal(String(ri.percentage)) : null,
      costingSource: ri.costingSource ?? null,
      notes: ri.notes ?? null,
    }));

    const domainBases: PercentageBaseData[] = percentageBases.map((pb) => ({
      percentageInputId: pb.percentage_input_id,
      basisInputId: pb.basis_input_id,
    }));

    const formulaResult = resolveRecipeFormula({
      inputs: domainInputs,
      percentageBases: domainBases,
      unitsMap,
      itemsMap,
    });

    if (formulaResult.status === 'error') {
      return new Response(
        JSON.stringify({
          error: 'FORMULA_RESOLUTION_FAILED',
          issues: formulaResult.issues,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const domainVersion: RecipeVersionData = {
      id: versionData.id,
      businessId,
      recipeId: versionData.recipe_id,
      versionNumber: versionData.version_number,
      status: versionData.status,
      referenceYieldQuantity: new CostaraDecimal(String(versionData.reference_yield_quantity)),
      referenceYieldUnitId: versionData.reference_yield_unit_id,
      portionQuantity: versionData.portion_quantity ? new CostaraDecimal(String(versionData.portion_quantity)) : null,
      portionUnitId: versionData.portion_unit_id ?? null,
      effectiveFrom: versionData.effective_from ? new Date(versionData.effective_from) : null,
    };

    const yieldResult = resolveYieldAndOutput({
      recipeVersion: domainVersion,
      outputItem: itemsMap.get(recipe.output_item_id)!,
      unitsMap,
    });

    if (!yieldResult.isOutputQuantityResolvable) {
      return new Response(
        JSON.stringify({
          error: 'YIELD_RESOLUTION_FAILED',
          issues: yieldResult.issues,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build domain ScaleTarget
    let scaleTarget: ScaleTarget;
    if (runScaleTarget.mode === 'output_pieces') {
      if (yieldResult.theoreticalPortions) {
        scaleTarget = {
          mode: 'output_pieces',
          targetPieces: new CostaraDecimal(String(runScaleTarget.targetPieces)),
        };
      } else {
        scaleTarget = {
          mode: 'yield',
          targetQuantity: new CostaraDecimal(String(runScaleTarget.targetPieces)),
          unitId: outputItem.base_unit_id,
        };
      }
    } else {
      scaleTarget = {
        mode: 'yield',
        targetQuantity: new CostaraDecimal(String(runScaleTarget.targetQuantity)),
        unitId: runScaleTarget.unitId!,
      };
    }

    const scalingResult = applyRecipeScaling({
      scaleTarget,
      referenceYield: yieldResult.referenceYield,
      theoreticalPortions: yieldResult.theoreticalPortions,
      resolvedInputs: formulaResult.resolvedInputs,
      unitsMap,
      recipeId: recipe.id,
      recipeVersionId: effectiveRecipeVersionId,
    });

    if (!scalingResult.isSuccess) {
      return new Response(
        JSON.stringify({
          error: 'SCALING_FAILED',
          issues: scalingResult.issues,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Prepare Snapshot Inputs normalized to each item's base unit
    const inputsSnapshot: Array<{
      recipe_input_id: string;
      item_id: string;
      position: number;
      planned_quantity: string;
      planned_unit_id: string;
      notes: string | null;
    }> = [];

    for (const input of recipeInputs) {
      const canonicalQty = scalingResult.scaledInputsById.get(input.id);
      if (!canonicalQty || canonicalQty.isZero() || !canonicalQty.isPositive()) {
        return new Response(
          JSON.stringify({
            error: 'INPUT_UNDERFLOW',
            message: `Planned quantity underflow for input ${input.id}`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const inputItem = itemsMap.get(input.item_id);
      if (!inputItem) throw new Error(`Input item ${input.item_id} not found`);
      const inputBaseUnit = unitsMap.get(inputItem.baseUnitId);
      if (!inputBaseUnit) throw new Error(`Base unit not found for item ${input.item_id}`);

      const normalizedQty = fromUniversalDimensionBase(canonicalQty, inputBaseUnit);

      inputsSnapshot.push({
        recipe_input_id: input.id,
        item_id: input.item_id,
        position: input.position,
        planned_quantity: normalizedQty.toString(),
        planned_unit_id: inputBaseUnit.id,
        notes: input.notes ?? null,
      });
    }

    // Normalize planned yield quantity to output item base unit
    let normalizedYieldQty: CostaraDecimal;
    if (runScaleTarget.mode === 'output_pieces') {
      normalizedYieldQty = new CostaraDecimal(String(runScaleTarget.targetPieces));
    } else {
      const scaleUnit = unitsMap.get(runScaleTarget.unitId!)!;
      if (scaleUnit.id === outputBaseUnit.id) {
        normalizedYieldQty = new CostaraDecimal(String(runScaleTarget.targetQuantity));
      } else {
        const canonicalYield = toUniversalDimensionBase(new CostaraDecimal(String(runScaleTarget.targetQuantity)), scaleUnit);
        normalizedYieldQty = fromUniversalDimensionBase(canonicalYield, outputBaseUnit);
      }
    }

    // 7. Call Transactional Database RPC with Service Role Client
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: rpcResult, error: rpcError } = await serviceClient.rpc(
      'start_production_run_from_snapshot',
      {
        p_run_id: runId,
        p_business_id: businessId,
        p_production_target_id: targetId ?? null,
        p_recipe_version_id: effectiveRecipeVersionId,
        p_planned_yield_quantity: normalizedYieldQty.toString(),
        p_planned_yield_unit_id: outputBaseUnit.id,
        p_scheduled_date: effectiveScheduledDate,
        p_created_by: user.id,
        p_notes: notes ?? null,
        p_inputs: inputsSnapshot,
      }
    );

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: 'DB_ERROR', message: rpcError.message, details: rpcError.details }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isIdempotent = rpcResult?.idempotent === true;
    return new Response(JSON.stringify(rpcResult), {
      status: isIdempotent ? 200 : 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
