import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseRecipeDataProvider } from '../../src/data/supabaseRecipeRepository.js';
import { createRecipeDraftService } from '../../src/data/recipeDraftService.js';
import { calculatePublishedRecipeAsOf, calculateRecipeDraftPreview } from '../../src/domain/calculation/recipeCalculator.js';
import { CostaraDecimal } from '../../src/domain/calculation/decimal.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM0MTI4MDB9.CRXP1A_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('M1D Full Vertical Slice Functional Smoke Test', () => {
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  it('runs complete Owner and Member user journeys on live Supabase', async () => {
    // 1. Authenticate as Owner (a@costara.local)
    const ownerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: authData, error: authErr } = await ownerClient.auth.signInWithPassword({
      email: 'a@costara.local',
      password: 'password123',
    });
    expect(authErr).toBeNull();
    expect(authData.user?.email).toBe('a@costara.local');

    // Fetch business context for current user
    const { data: memList, error: memErr } = await ownerClient
      .from('business_members')
      .select('role, business:businesses(id, name, currency_code, timezone)')
      .eq('user_id', authData.user!.id);
    expect(memErr).toBeNull();
    expect(memList).toBeDefined();

    type RawMem = { role: string; business: { id: string; name: string; currency_code: string; timezone: string } | { id: string; name: string; currency_code: string; timezone: string }[] | null };
    const panaraMem = (memList as unknown as RawMem[])?.find((m) => {
      const b = Array.isArray(m.business) ? m.business[0] : m.business;
      return b?.name === 'Panara';
    });
    expect(panaraMem).toBeDefined();
    const business = (Array.isArray(panaraMem!.business) ? panaraMem!.business[0] : panaraMem!.business)!;
    expect(business.name).toBe('Panara');
    expect(panaraMem!.role).toBe('owner');

    // 2. Query Recipe List (Hogaza Rústica)
    const { data: recipes, error: rListErr } = await ownerClient
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
      .eq('business_id', business.id)
      .order('name');
    expect(rListErr).toBeNull();
    expect(recipes?.length).toBeGreaterThanOrEqual(4);

    const hogaza = recipes?.find((r) => r.name.includes('Hogaza'));
    expect(hogaza).toBeDefined();

    // 3. RecipeDetailView: Calculate active version (v2)
    const dataProvider = createSupabaseRecipeDataProvider({ businessId: business.id, client: ownerClient });
    const asOf = new Date('2026-07-01T00:00:00Z');

    const baseCalc = await calculatePublishedRecipeAsOf({
      recipeId: hogaza!.id,
      dataProvider,
      asOf,
    });
    expect(baseCalc).toBeDefined();
    expect(baseCalc.knownBatchMaterialCost.greaterThan(0)).toBe(true);
    expect(baseCalc.scaledPortions?.equals(14)).toBe(true);

    // 4. Scaling by Portions (28 pieces = 2x)
    const scaledPortionsCalc = await calculatePublishedRecipeAsOf({
      recipeId: hogaza!.id,
      dataProvider,
      asOf,
      scaleTarget: {
        mode: 'output_pieces',
        targetPieces: new CostaraDecimal(28),
      },
    });
    expect(scaledPortionsCalc.scaleFactor.equals(2)).toBe(true);
    expect(scaledPortionsCalc.knownBatchMaterialCost.equals(baseCalc.knownBatchMaterialCost.times(2))).toBe(true);

    // 5. Scaling by Yield (7000g = 0.5x)
    const scaledYieldCalc = await calculatePublishedRecipeAsOf({
      recipeId: hogaza!.id,
      dataProvider,
      asOf,
      scaleTarget: {
        mode: 'yield',
        targetQuantity: new CostaraDecimal(7000),
        unitId: baseCalc.referenceYield.unitId,
      },
    });
    expect(scaledYieldCalc.scaleFactor.equals(0.5)).toBe(true);
    expect(scaledYieldCalc.knownBatchMaterialCost.equals(baseCalc.knownBatchMaterialCost.dividedBy(2))).toBe(true);

    // 6. BUG 2 Regression: RecipeHistoryView loads versions using correct FKs
    const { data: historyVersions, error: histErr } = await ownerClient
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
      .eq('recipe_id', hogaza!.id)
      .order('version_number', { ascending: false });

    expect(histErr).toBeNull();
    expect(historyVersions?.length).toBeGreaterThanOrEqual(2);
    const activeHistory = historyVersions?.find((v) => v.status === 'active');
    expect(activeHistory).toBeDefined();
    expect(activeHistory?.recipe_inputs.length).toBe(5);

    // 7. BUG 3 & BUG 7 Isolation: Create draft on an ephemeral recipe on Biz B, verify complete cloned snapshot & calculation preview
    const bizBId = 'b0000000-0000-0000-0000-0000000000fe';
    const ephemOutputItemId = crypto.randomUUID();
    const ephemRecipeId = crypto.randomUUID();
    const ephemVersion1Id = crypto.randomUUID();
    const ephemInput1Id = crypto.randomUUID();
    const flourItemId = 'b0000000-0000-0000-0000-0000000000f3'; // Harina B on Biz B

    const ownerBClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await ownerBClient.auth.signInWithPassword({
      email: 'b@costara.local',
      password: 'password123',
    });

    const { data: gUnit } = await adminClient.from('units').select('id').eq('code', 'g').single();
    const gUnitId = gUnit!.id;
    const { data: kgUnit } = await adminClient.from('units').select('id').eq('code', 'kg').single();

    await adminClient.from('item_cost_versions').upsert({
      id: 'b0000000-0000-0000-0000-000000000095',
      business_id: bizBId,
      item_id: flourItemId,
      cost_amount: '20.000000000000',
      cost_quantity: '1.000000000000',
      unit_id: kgUnit!.id,
      effective_from: '2026-01-01T00:00:00Z',
      notes: 'Smoke Seed Cost Biz B',
    });

    await adminClient.from('items').upsert({
      id: ephemOutputItemId,
      business_id: bizBId,
      name: 'Smoke Ephem Output',
      kind: 'finished_product',
      base_unit_id: gUnitId,
      purchasable: false,
      producible: true,
      sellable: true,
    });

    await adminClient.from('recipes').upsert({
      id: ephemRecipeId,
      business_id: bizBId,
      name: 'Smoke Ephem Recipe',
      output_item_id: ephemOutputItemId,
      is_active: true,
    });

    await adminClient.from('recipe_versions').insert({
      id: ephemVersion1Id,
      business_id: bizBId,
      recipe_id: ephemRecipeId,
      version_number: 1,
      status: 'draft',
      reference_yield_quantity: '1000.000000000000',
      reference_yield_unit_id: gUnitId,
      portion_quantity: '100.000000000000',
      portion_unit_id: gUnitId,
    });

    await adminClient.from('recipe_inputs').insert({
      id: ephemInput1Id,
      business_id: bizBId,
      recipe_version_id: ephemVersion1Id,
      item_id: flourItemId,
      position: 1,
      quantity_mode: 'absolute',
      quantity: '800.000000000000',
      unit_id: gUnitId,
      costing_source: 'purchased',
    });

    await adminClient.rpc('publish_recipe_version', {
      p_recipe_version_id: ephemVersion1Id,
      p_effective_from_local: '2026-01-01 00:00:00',
      p_change_reason: 'Initial smoke publish',
    });

    try {
      const draftServiceB = createRecipeDraftService(ownerBClient);
      const draftRes = await draftServiceB.createOrGetDraft(ephemVersion1Id);
      expect(draftRes.version_number).toBe(2);
      expect(draftRes.draft_version_id).toBeDefined();

      // Query cloned draft from DB
      const { data: draftDetails, error: dtErr } = await ownerBClient
        .from('recipe_versions')
        .select('*')
        .eq('id', draftRes.draft_version_id)
        .single();
      expect(dtErr).toBeNull();
      expect(String(draftDetails.reference_yield_quantity)).toMatch(/^1000/);

      const { data: draftInps, error: dInpsErr } = await ownerBClient
        .from('recipe_inputs')
        .select('*')
        .eq('recipe_version_id', draftRes.draft_version_id)
        .order('position');
      expect(dInpsErr).toBeNull();
      expect(draftInps?.length).toBe(1);

      // Test preview calculation on cloned draft
      const providerB = createSupabaseRecipeDataProvider({ businessId: bizBId, client: ownerBClient });
      const draftCalc = await calculateRecipeDraftPreview({
        dataProvider: providerB,
        asOf,
        draftVersion: {
          id: draftRes.draft_version_id,
          businessId: bizBId,
          recipeId: ephemRecipeId,
          versionNumber: 2,
          status: 'draft',
          referenceYieldQuantity: new CostaraDecimal(draftDetails.reference_yield_quantity),
          referenceYieldUnitId: draftDetails.reference_yield_unit_id,
          portionQuantity: new CostaraDecimal(draftDetails.portion_quantity),
          portionUnitId: draftDetails.portion_unit_id,
        },
        inputs: draftInps!.map((inp) => ({
          id: inp.id,
          recipeVersionId: draftRes.draft_version_id,
          itemId: inp.item_id,
          position: inp.position,
          quantityMode: inp.quantity_mode,
          quantity: inp.quantity ? new CostaraDecimal(inp.quantity) : null,
          unitId: inp.unit_id,
          percentage: null,
          costingSource: inp.costing_source,
        })),
        percentageBases: [],
        recipeName: 'Smoke Ephem Recipe',
        outputItemId: ephemOutputItemId,
      });

      expect(draftCalc.status).toBe('complete');
      expect(draftCalc.knownBatchMaterialCost.greaterThan(0)).toBe(true);

      // Save updated draft via draftService
      const saveResult = await draftServiceB.saveDraft(
        draftRes.draft_version_id,
        {
          reference_yield_quantity: '1200',
          reference_yield_unit_id: gUnitId,
          portion_quantity: '120',
          portion_unit_id: gUnitId,
          notes: 'Borrador modificado en test efímero',
        },
        draftInps!.map((inp) => ({
          id: inp.id,
          item_id: inp.item_id,
          position: inp.position,
          quantity_mode: inp.quantity_mode as 'absolute' | 'percentage',
          quantity: '900',
          unit_id: inp.unit_id,
          percentage: null,
          costing_source: inp.costing_source as 'purchased' | 'produced' | null,
          notes: inp.notes,
        })),
        []
      );
      expect(saveResult.saved).toBe(true);
    } finally {
      // Deterministically remove all ephemeral smoke records
      const { data: staleVers } = await adminClient.from('recipe_versions').select('id').eq('recipe_id', ephemRecipeId);
      const staleVerIds = (staleVers || []).map((v) => v.id);
      if (staleVerIds.length > 0) {
        await adminClient.from('recipe_input_percentage_bases').delete().in('recipe_version_id', staleVerIds);
        await adminClient.from('recipe_inputs').delete().in('recipe_version_id', staleVerIds);
        await adminClient.from('recipe_versions').delete().in('id', staleVerIds);
      }
      await adminClient.from('recipes').delete().eq('id', ephemRecipeId);
      await adminClient.from('items').delete().eq('id', ephemOutputItemId);
    }

    // 8. Member Role Security check
    const memberClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: mAuth, error: mAuthErr } = await memberClient.auth.signInWithPassword({
      email: 'member@costara.local',
      password: 'password123',
    });
    expect(mAuthErr).toBeNull();
    expect(mAuth.user?.email).toBe('member@costara.local');

    // Verify AuthContext membership query correctly resolves role 'member' (BUG 6 regression)
    const { data: memberRows, error: mRowsErr } = await memberClient
      .from('business_members')
      .select('role, user_id, business:businesses(id, name, currency_code, timezone)')
      .eq('user_id', mAuth.user!.id);
    expect(mRowsErr).toBeNull();
    expect(memberRows?.length).toBe(1);
    expect(memberRows![0].role).toBe('member');

    // Member can read & calculate
    const memberDataProvider = createSupabaseRecipeDataProvider({ businessId: business.id, client: memberClient });
    const memberCalc = await calculatePublishedRecipeAsOf({
      recipeId: hogaza!.id,
      dataProvider: memberDataProvider,
      asOf,
    });
    expect(memberCalc.knownBatchMaterialCost.equals(baseCalc.knownBatchMaterialCost)).toBe(true);

    // Member CANNOT create draft (Security Invoker RPC)
    const memberDraftService = createRecipeDraftService(memberClient);
    await expect(memberDraftService.createOrGetDraft(baseCalc.recipeVersionId)).rejects.toThrow(
      /Unauthorized/
    );
  });
});
