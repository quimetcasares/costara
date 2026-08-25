import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createRecipeDraftService } from '../recipeDraftService.js';
import { createSupabaseRecipeDataProvider } from '../supabaseRecipeRepository.js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM0MTI4MDB9.CRXP1A_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('RecipeDraftService Frontend RPC Integration (BUG 4 & BUG 7 isolation)', () => {
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const ownerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const bizId = 'b0000000-0000-0000-0000-0000000000fe';
  const testOutputItemId = crypto.randomUUID();
  const testRecipeId = crypto.randomUUID();
  const testVersion1Id = crypto.randomUUID();
  const testRawItemId = 'b0000000-0000-0000-0000-0000000000f3'; // Harina B on Biz B
  const testInput1Id = crypto.randomUUID();
  let unitGId: string;

  const cleanup = async () => {
    const { data: vers } = await adminClient.from('recipe_versions').select('id').eq('recipe_id', testRecipeId);
    const verIds = (vers || []).map((v) => v.id);
    if (verIds.length > 0) {
      await adminClient.from('recipe_input_percentage_bases').delete().in('recipe_version_id', verIds);
      await adminClient.from('recipe_inputs').delete().in('recipe_version_id', verIds);
      await adminClient.from('recipe_versions').delete().in('id', verIds);
    }
    await adminClient.from('recipes').delete().eq('id', testRecipeId);
    await adminClient.from('items').delete().eq('id', testOutputItemId);
  };

  beforeAll(async () => {
    await cleanup();

    // 1. Authenticate owner B
    await ownerClient.auth.signInWithPassword({
      email: 'b@costara.local',
      password: 'password123',
    });

    const { data: units } = await adminClient.from('units').select('id, code').eq('code', 'g').single();
    unitGId = units?.id ?? '';

    const { error: e1 } = await adminClient.from('items').upsert({
      id: testOutputItemId,
      business_id: bizId,
      name: 'Ephemeral RPC Test Product',
      kind: 'finished_product',
      base_unit_id: unitGId,
      purchasable: false,
      producible: true,
      sellable: true,
    });
    if (e1) throw new Error(`e1: ${e1.message}`);

    const { error: e2 } = await adminClient.from('recipes').upsert({
      id: testRecipeId,
      business_id: bizId,
      name: 'Ephemeral RPC Test Recipe',
      output_item_id: testOutputItemId,
      is_active: true,
    });
    if (e2) throw new Error(`e2: ${e2.message}`);

    const { error: e3 } = await adminClient.from('recipe_versions').insert({
      id: testVersion1Id,
      business_id: bizId,
      recipe_id: testRecipeId,
      version_number: 1,
      status: 'draft',
      reference_yield_quantity: '1000.000000000000',
      reference_yield_unit_id: unitGId,
      portion_quantity: '100.000000000000',
      portion_unit_id: unitGId,
    });
    if (e3) throw new Error(`e3: ${e3.message}`);

    const { error: e4 } = await adminClient.from('recipe_inputs').insert({
      id: testInput1Id,
      business_id: bizId,
      recipe_version_id: testVersion1Id,
      item_id: testRawItemId,
      position: 1,
      quantity_mode: 'absolute',
      quantity: '800.000000000000',
      unit_id: unitGId,
      costing_source: 'purchased',
    });
    if (e4) throw new Error(`e4: ${e4.message}`);

    const { error: pubErr } = await adminClient.rpc('publish_recipe_version', {
      p_recipe_version_id: testVersion1Id,
      p_effective_from_local: '2026-01-01 00:00:00',
      p_change_reason: 'Initial test publish',
    });
    if (pubErr) throw new Error(`pubErr: ${pubErr.message}`);
  });

  afterAll(async () => {
    // Deterministically delete all ephemeral test records (BUG 7)
    await adminClient.from('recipe_input_percentage_bases').delete().eq('recipe_id', testRecipeId);
    await adminClient.from('recipe_inputs').delete().eq('item_id', testRawItemId).eq('business_id', bizId);
    await adminClient.from('recipe_versions').delete().eq('recipe_id', testRecipeId);
    await adminClient.from('recipes').delete().eq('id', testRecipeId);
    await adminClient.from('items').delete().eq('id', testOutputItemId);
  });

  it('calls save_recipe_draft and publish_recipe_version with exact matching parameter signatures on ephemeral fixture', async () => {
    const draftService = createRecipeDraftService(ownerClient);

    // 1. createOrGetDraft from testVersion1Id
    const draftRes = await draftService.createOrGetDraft(testVersion1Id);
    expect(draftRes.draft_version_id).toBeDefined();
    expect(draftRes.version_number).toBe(2);

    // Fetch cloned inputs for draft
    const { data: currentInps } = await ownerClient
      .from('recipe_inputs')
      .select('*')
      .eq('recipe_version_id', draftRes.draft_version_id);

    const inputsPayload = (currentInps || []).map((inp) => ({
      id: inp.id,
      item_id: inp.item_id,
      position: inp.position,
      quantity_mode: inp.quantity_mode as 'absolute' | 'percentage',
      quantity: '950',
      unit_id: inp.unit_id,
      percentage: null,
      costing_source: inp.costing_source as 'purchased' | 'produced' | null,
      notes: 'Updated ephemeral quantity',
    }));

    // 2. saveDraft - Exact matching parameter signature
    const saveRes = await draftService.saveDraft(
      draftRes.draft_version_id,
      {
        reference_yield_quantity: '1200',
        reference_yield_unit_id: unitGId,
        portion_quantity: '120',
        portion_unit_id: unitGId,
        yield_description: 'Masa actualizada',
        notes: 'Test save payload',
      },
      inputsPayload,
      []
    );

    expect(saveRes.saved).toBe(true);
    expect(saveRes.recipe_version_id).toBe(draftRes.draft_version_id);

    // 3. publishVersion - Past date rejection test confirming exact RPC parameter signatures
    await expect(
      draftService.publishVersion(
        draftRes.draft_version_id,
        '2020-01-01 10:00:00',
        'Intento de publicación retroactiva'
      )
    ).rejects.toThrow(/effective_from must be later than all existing published versions/);
  });

  it('BUG 10 Regression: multi-version recipe lifecycle correctly separates activeVersion from historical As-Of resolved versions', async () => {
    const draftService = createRecipeDraftService(ownerClient);
    const dataProvider = createSupabaseRecipeDataProvider({ businessId: bizId, client: ownerClient });

    // Step 1: Create and publish Version 2 from Version 1
    const v2DraftRes = await draftService.createOrGetDraft(testVersion1Id);
    expect(v2DraftRes.version_number).toBe(2);

    await draftService.publishVersion(
      v2DraftRes.draft_version_id,
      '2026-02-01 00:00:00',
      'Publishing v2'
    );

    // Step 2: Create and publish Version 3 from Version 2
    const v3DraftRes = await draftService.createOrGetDraft(v2DraftRes.draft_version_id);
    expect(v3DraftRes.version_number).toBe(3);

    await draftService.publishVersion(
      v3DraftRes.draft_version_id,
      '2026-03-01 00:00:00',
      'Publishing v3'
    );

    // Current State in DB:
    // v1: archived
    // v2: archived
    // v3: active

    // Verify dataProvider resolves activeVersion vs historical versions correctly
    const activeVer = await dataProvider.getActiveRecipeVersion(testRecipeId);
    expect(activeVer).not.toBeNull();
    expect(activeVer?.versionNumber).toBe(3);
    expect(activeVer?.status).toBe('active');

    const v2Historical = await dataProvider.getPublishedRecipeVersionAsOf(
      testRecipeId,
      new Date('2026-02-15T00:00:00Z')
    );
    expect(v2Historical).not.toBeNull();
    expect(v2Historical?.versionNumber).toBe(2);
    expect(v2Historical?.status).toBe('archived');

    const v1Historical = await dataProvider.getPublishedRecipeVersionAsOf(
      testRecipeId,
      new Date('2026-01-15T00:00:00Z')
    );
    expect(v1Historical).not.toBeNull();
    expect(v1Historical?.versionNumber).toBe(1);
    expect(v1Historical?.status).toBe('archived');

    // Case 1 & Backend Protection: Attempting to create draft from historical archived v2 MUST fail
    await expect(
      draftService.createOrGetDraft(v2Historical!.id)
    ).rejects.toThrow(/Source version must be active to create a new draft\. Status: archived/);

    // Attempting to create draft from historical archived v1 MUST fail
    await expect(
      draftService.createOrGetDraft(v1Historical!.id)
    ).rejects.toThrow(/Source version must be active to create a new draft\. Status: archived/);

    // Case 2: Creating draft using activeVersion (v3) succeeds and yields version 4
    const v4DraftRes = await draftService.createOrGetDraft(activeVer!.id);
    expect(v4DraftRes.version_number).toBe(4);
    expect(v4DraftRes.is_new).toBe(true);
    expect(v4DraftRes.draft_version_id).toBeDefined();

    // Case 3 (Idempotency): Calling createOrGetDraft again returns the existing v4 draft
    const v4DraftRetry = await draftService.createOrGetDraft(activeVer!.id);
    expect(v4DraftRetry.version_number).toBe(4);
    expect(v4DraftRetry.is_new).toBe(false);
    expect(v4DraftRetry.draft_version_id).toBe(v4DraftRes.draft_version_id);
  });
});
