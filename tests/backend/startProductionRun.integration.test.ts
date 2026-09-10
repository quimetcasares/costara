import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM0MTI4MDB9.CRXP1A_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('M2C.0 Backend Integration: Production Execution Foundations & Stock', () => {
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ownerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: 'sb-owner-test', persistSession: true },
  });
  const otherClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: 'sb-other-test', persistSession: true },
  });

  const bizId = 'b0000000-0000-0000-0000-0000000000c0'; // M2C Test Bakery (isolated from Panara)

  let ownerUserId: string;
  let unitGId: string;
  let unitKgId: string;
  let unitPieceId: string;

  // Item IDs
  const testBaguetteItemId = crypto.randomUUID(); // count
  const testDoughItemId = crypto.randomUUID();    // mass
  const testFlourItemId = crypto.randomUUID();    // mass
  const testWaterItemId = crypto.randomUUID();    // mass
  const testSaltItemId = crypto.randomUUID();     // mass
  const testInactiveItemId = crypto.randomUUID(); // mass (inactive)

  // Baguette Recipe: V1 (archived 2026-01-01), V2 (active 2026-06-01)
  const testBaguetteRecipeId = crypto.randomUUID();
  const testBaguetteV1Id = crypto.randomUUID();
  const testBaguetteV2Id = crypto.randomUUID();

  // Dough Recipe: V1 (active 2026-01-01)
  const testDoughRecipeId = crypto.randomUUID();
  const testDoughV1Id = crypto.randomUUID();

  // Plans & Targets
  const testPlanId = crypto.randomUUID();
  const testTarget14KgId = crypto.randomUUID();
  const testTargetConflictId = crypto.randomUUID();
  const testTargetNoVersionId = crypto.randomUUID();

  async function callStartProductionRun(
    payload: Record<string, unknown>,
    token?: string
  ): Promise<{ status: number; body: any }> {
    const authToken = token ?? (await ownerClient.auth.getSession()).data.session?.access_token;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/start-production-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    return { status: res.status, body };
  }

  beforeAll(async () => {
    // 1. Authenticate Owner & Other
    const { data: authA, error: errA } = await ownerClient.auth.signInWithPassword({
      email: 'a@costara.local',
      password: 'password123',
    });
    if (errA) throw new Error(`Auth A error: ${errA.message}`);
    ownerUserId = authA.user.id;

    const { error: errB } = await otherClient.auth.signInWithPassword({
      email: 'b@costara.local',
      password: 'password123',
    });
    if (errB) throw new Error(`Auth B error: ${errB.message}`);

    // 1b. Ensure dedicated test business and owner membership exist
    await adminClient.from('businesses').upsert({
      id: bizId,
      name: 'M2C Test Bakery',
      timezone: 'America/Mexico_City',
      currency_code: 'MXN',
    });
    await adminClient.from('business_members').upsert({
      business_id: bizId,
      user_id: ownerUserId,
      role: 'owner',
    });

    // 2. Fetch units
    const { data: units } = await adminClient.from('units').select('id, code');
    unitGId = units?.find((u) => u.code === 'g')?.id ?? '';
    unitKgId = units?.find((u) => u.code === 'kg')?.id ?? '';
    unitPieceId = units?.find((u) => u.code === 'piece')?.id ?? '';

    // 3. Clean up existing test records
    await adminClient.from('production_run_inputs').delete().eq('business_id', bizId);
    await adminClient.from('production_runs').delete().eq('business_id', bizId);
    await adminClient.from('production_targets').delete().in('id', [testTarget14KgId, testTargetConflictId, testTargetNoVersionId]);
    await adminClient.from('production_plans').delete().eq('id', testPlanId);
    await adminClient.from('recipe_inputs').delete().in('recipe_version_id', [testBaguetteV1Id, testBaguetteV2Id, testDoughV1Id]);
    await adminClient.from('recipe_versions').delete().in('id', [testBaguetteV1Id, testBaguetteV2Id, testDoughV1Id]);
    await adminClient.from('recipes').delete().in('id', [testBaguetteRecipeId, testDoughRecipeId]);
    await adminClient.from('items').delete().in('id', [
      testBaguetteItemId,
      testDoughItemId,
      testFlourItemId,
      testWaterItemId,
      testSaltItemId,
      testInactiveItemId,
    ]);

    // 4. Insert Items
    await adminClient.from('items').upsert([
      { id: testBaguetteItemId, business_id: bizId, name: 'Baguette M2C', kind: 'finished_product', base_unit_id: unitPieceId, purchasable: false, producible: true, sellable: true, track_inventory: true, is_active: true },
      { id: testDoughItemId, business_id: bizId, name: 'Masa Rustica M2C', kind: 'intermediate', base_unit_id: unitGId, purchasable: false, producible: true, sellable: false, track_inventory: true, is_active: true },
      { id: testFlourItemId, business_id: bizId, name: 'Harina Fuerte M2C', kind: 'raw_material', base_unit_id: unitGId, purchasable: true, producible: false, sellable: false, track_inventory: true, is_active: true },
      { id: testWaterItemId, business_id: bizId, name: 'Agua M2C', kind: 'raw_material', base_unit_id: unitGId, purchasable: true, producible: false, sellable: false, track_inventory: true, is_active: true },
      { id: testSaltItemId, business_id: bizId, name: 'Sal Marina M2C', kind: 'raw_material', base_unit_id: unitGId, purchasable: true, producible: false, sellable: false, track_inventory: true, is_active: true },
      { id: testInactiveItemId, business_id: bizId, name: 'Levadura Vieja M2C', kind: 'raw_material', base_unit_id: unitGId, purchasable: true, producible: false, sellable: false, track_inventory: true, is_active: false },
    ]);

    // 5. Insert Baguette Recipe & Versions
    await adminClient.from('recipes').upsert({
      id: testBaguetteRecipeId, business_id: bizId, name: 'Baguette Receta M2C', output_item_id: testBaguetteItemId, is_active: true,
    });

    await adminClient.from('recipe_versions').upsert([
      { id: testBaguetteV1Id, business_id: bizId, recipe_id: testBaguetteRecipeId, version_number: 1, status: 'draft', reference_yield_quantity: 10, reference_yield_unit_id: unitPieceId },
      { id: testBaguetteV2Id, business_id: bizId, recipe_id: testBaguetteRecipeId, version_number: 2, status: 'draft', reference_yield_quantity: 10, reference_yield_unit_id: unitPieceId },
    ]);

    await adminClient.from('recipe_inputs').upsert([
      { id: crypto.randomUUID(), business_id: bizId, recipe_version_id: testBaguetteV1Id, item_id: testFlourItemId, position: 1, quantity_mode: 'absolute', quantity: 5000, unit_id: unitGId },
      { id: crypto.randomUUID(), business_id: bizId, recipe_version_id: testBaguetteV1Id, item_id: testWaterItemId, position: 2, quantity_mode: 'absolute', quantity: 3000, unit_id: unitGId },
      { id: crypto.randomUUID(), business_id: bizId, recipe_version_id: testBaguetteV2Id, item_id: testFlourItemId, position: 1, quantity_mode: 'absolute', quantity: 5200, unit_id: unitGId },
      { id: crypto.randomUUID(), business_id: bizId, recipe_version_id: testBaguetteV2Id, item_id: testWaterItemId, position: 2, quantity_mode: 'absolute', quantity: 3100, unit_id: unitGId },
    ]);

    // Publish V1 with effective_from 2026-01-01, archive it, then publish V2 with 2026-06-01
    const { error: e1 } = await adminClient.from('recipe_versions').update({ status: 'active', effective_from: '2026-01-01T00:00:00Z' }).eq('id', testBaguetteV1Id);
    if (e1) throw new Error(`e1: ${e1.message}`);

    const { error: e2 } = await adminClient.from('recipe_versions').update({ status: 'archived' }).eq('id', testBaguetteV1Id);
    if (e2) throw new Error(`e2: ${e2.message}`);

    const { error: e3 } = await adminClient.from('recipe_versions').update({ status: 'active', effective_from: '2026-06-01T00:00:00Z' }).eq('id', testBaguetteV2Id);
    if (e3) throw new Error(`e3: ${e3.message}`);

    // 6. Insert Dough Recipe (Masa Rústica 14 kg reference yield)
    await adminClient.from('recipes').upsert({
      id: testDoughRecipeId, business_id: bizId, name: 'Masa Rustica Receta M2C', output_item_id: testDoughItemId, is_active: true,
    });

    await adminClient.from('recipe_versions').upsert({
      id: testDoughV1Id, business_id: bizId, recipe_id: testDoughRecipeId, version_number: 1, status: 'draft', reference_yield_quantity: 14000, reference_yield_unit_id: unitGId,
    });

    await adminClient.from('recipe_inputs').upsert([
      { id: crypto.randomUUID(), business_id: bizId, recipe_version_id: testDoughV1Id, item_id: testFlourItemId, position: 1, quantity_mode: 'absolute', quantity: 9000, unit_id: unitGId },
      { id: crypto.randomUUID(), business_id: bizId, recipe_version_id: testDoughV1Id, item_id: testWaterItemId, position: 2, quantity_mode: 'absolute', quantity: 5000, unit_id: unitGId },
    ]);

    await adminClient.from('recipe_versions').update({ status: 'active', effective_from: '2026-01-01T00:00:00Z' }).eq('id', testDoughV1Id);

    // 7. Insert Production Plan & Targets
    await adminClient.from('production_plans').upsert({
      id: testPlanId, business_id: bizId, name: 'Plan Semana 38', start_date: '2026-09-14', end_date: '2026-09-20',
    });

    // Target 1: Masa Rústica 14 kg (unit: kg, quantity: 14) on 2026-09-15
    await adminClient.from('production_targets').upsert({
      id: testTarget14KgId, business_id: bizId, production_plan_id: testPlanId, target_date: '2026-09-15', item_id: testDoughItemId, recipe_version_id: testDoughV1Id, target_quantity: 14, unit_id: unitKgId, position: 1, notes: 'Target 14 kg masa rustica',
    });

    // Target 2: Baguette Planned with V1, but target_date is 2026-09-15 (after V2 became active on 2026-06-01 => Conflict!)
    await adminClient.from('production_targets').upsert({
      id: testTargetConflictId, business_id: bizId, production_plan_id: testPlanId, target_date: '2026-09-15', item_id: testBaguetteItemId, recipe_version_id: testBaguetteV1Id, target_quantity: 20, unit_id: unitPieceId, position: 2, notes: 'Target con version obsoleta',
    });

    // Target 3: Baguette without recipe_version_id assigned
    await adminClient.from('production_targets').upsert({
      id: testTargetNoVersionId, business_id: bizId, production_plan_id: testPlanId, target_date: '2026-09-15', item_id: testBaguetteItemId, recipe_version_id: null, target_quantity: 20, unit_id: unitPieceId, position: 3, notes: 'Target sin receta',
    });
  });

  // ==========================================================================
  // SECTION A: DATABASE FOUNDATIONS & PERMISSIONS
  // ==========================================================================
  describe('Database Foundations & Security Boundary', () => {
    it('rejects direct client INSERT, UPDATE, DELETE on public.production_runs', async () => {
      const { error: insErr } = await ownerClient.from('production_runs').insert({
        business_id: bizId,
        recipe_version_id: testBaguetteV2Id,
        planned_yield_quantity: 10,
        planned_yield_unit_id: unitPieceId,
        scheduled_date: '2026-09-15',
      });
      expect(insErr).toBeDefined();
      expect(insErr?.code).toBe('42501');

      const { error: updErr } = await ownerClient.from('production_runs').update({ notes: 'Hacked' }).eq('business_id', bizId);
      expect(updErr).toBeDefined();
      expect(updErr?.code).toBe('42501');

      const { error: delErr } = await ownerClient.from('production_runs').delete().eq('business_id', bizId);
      expect(delErr).toBeDefined();
      expect(delErr?.code).toBe('42501');
    });

    it('rejects direct client INSERT and DELETE on public.production_run_inputs', async () => {
      const { error: insErr } = await ownerClient.from('production_run_inputs').insert({
        business_id: bizId,
        production_run_id: crypto.randomUUID(),
        item_id: testFlourItemId,
        position: 1,
        planned_quantity: 100,
      });
      expect(insErr).toBeDefined();
      expect(insErr?.code).toBe('42501');

      const { error: delErr } = await ownerClient.from('production_run_inputs').delete().eq('business_id', bizId);
      expect(delErr).toBeDefined();
      expect(delErr?.code).toBe('42501');
    });

    it('rejects start_production_run_from_snapshot when called by client authenticated role', async () => {
      const { error } = await ownerClient.rpc('start_production_run_from_snapshot', {
        p_run_id: crypto.randomUUID(),
        p_business_id: bizId,
        p_production_target_id: testTarget14KgId,
        p_recipe_version_id: testDoughV1Id,
        p_planned_yield_quantity: 7000,
        p_planned_yield_unit_id: unitGId,
        p_scheduled_date: '2026-09-15',
        p_created_by: ownerUserId,
        p_notes: 'Batch 1',
        p_inputs: [],
      });
      expect(error).toBeDefined();
      expect(error?.code).toBe('42501');
    });

    it('returns current inventory stock including zero-movement items and inactive items', async () => {
      const { data: stock, error } = await ownerClient.rpc('get_current_inventory_stock', {
        p_business_id: bizId,
      });
      expect(error).toBeNull();
      expect(stock).toBeDefined();

      const saltStock = stock?.find((s: { item_id: string }) => s.item_id === testSaltItemId);
      expect(saltStock).toBeDefined();
      expect(Number(saltStock.current_stock)).toBe(0);

      const inactiveStock = stock?.find((s: { item_id: string }) => s.item_id === testInactiveItemId);
      expect(inactiveStock).toBeDefined();
      expect(inactiveStock.is_active).toBe(false);

      const { error: bErr } = await otherClient.rpc('get_current_inventory_stock', {
        p_business_id: bizId,
      });
      expect(bErr).toBeDefined();
      expect(bErr?.code).toBe('42501');
    });
  });

  // ==========================================================================
  // SECTION B: EDGE FUNCTION END-TO-END SUITE (15 SCENARIOS)
  // ==========================================================================
  describe('Edge Function start-production-run Contract Suite', () => {
    const run1Id = crypto.randomUUID();
    const run2Id = crypto.randomUUID();
    const runPiecesId = crypto.randomUUID();
    const runUnplannedId = crypto.randomUUID();
    const runHistoricalId = crypto.randomUUID();

    // ------------------------------------------------------------------------
    // TARGET SCENARIOS (1 to 6)
    // ------------------------------------------------------------------------
    it('Scenario 1 & 4: starts run from target with runScaleTarget yield WITHOUT recipeVersionId', async () => {
      // Demonstrates A: Target 14 kg -> corrida 7 kg
      const { status, body } = await callStartProductionRun({
        runId: run1Id,
        businessId: bizId,
        targetId: testTarget14KgId,
        runScaleTarget: {
          mode: 'yield',
          targetQuantity: '7',
          unitId: unitKgId,
        },
        notes: 'Primera corrida de 7 kg de masa rustica',
      });

      expect(status).toBe(201);
      expect(body.run_id).toBe(run1Id);
      expect(body.status).toBe('in_progress');
      expect(body.idempotent).toBe(false);

      // Verify DB record
      const { data: run } = await adminClient
        .from('production_runs')
        .select('id, production_target_id, recipe_version_id, planned_yield_quantity, planned_yield_unit_id')
        .eq('id', run1Id)
        .single();
      expect(run?.production_target_id).toBe(testTarget14KgId);
      expect(run?.recipe_version_id).toBe(testDoughV1Id);
      // Normalized to base unit (g): 7 kg = 7000 g
      expect(Number(run?.planned_yield_quantity)).toBe(7000);
      expect(run?.planned_yield_unit_id).toBe(unitGId);

      // Verify snapshot inputs halved (14kg ref had 9000g flour, 5000g water => 7kg has 4500g, 2500g)
      const { data: inputs } = await adminClient
        .from('production_run_inputs')
        .select('item_id, planned_quantity')
        .eq('production_run_id', run1Id)
        .order('position', { ascending: true });
      expect(inputs?.length).toBe(2);
      expect(Number(inputs?.[0].planned_quantity)).toBe(4500);
      expect(Number(inputs?.[1].planned_quantity)).toBe(2500);
    });

    it('Scenario 5: supports Target Splitting (same target receives second run)', async () => {
      // Demonstrates B: Mismo target -> segunda corrida 7 kg
      const { status, body } = await callStartProductionRun({
        runId: run2Id,
        businessId: bizId,
        targetId: testTarget14KgId,
        runScaleTarget: {
          mode: 'yield',
          targetQuantity: '7',
          unitId: unitKgId,
        },
        notes: 'Segunda corrida de 7 kg del mismo target',
      });

      expect(status).toBe(201);
      expect(body.run_id).toBe(run2Id);
      expect(body.idempotent).toBe(false);

      // Verify both runs reference testTarget14KgId
      const { data: runs } = await adminClient
        .from('production_runs')
        .select('id, production_target_id')
        .eq('production_target_id', testTarget14KgId);
      expect(runs?.length).toBe(2);
    });

    it('Scenario Idempotency: retrying with same runId returns 200 OK idempotent: true', async () => {
      // Demonstrates C: Retry mismo runId -> idempotent true
      const { status, body } = await callStartProductionRun({
        runId: run1Id,
        businessId: bizId,
        targetId: testTarget14KgId,
        runScaleTarget: {
          mode: 'yield',
          targetQuantity: '7',
          unitId: unitKgId,
        },
        notes: 'Retry primera corrida',
      });

      expect(status).toBe(200);
      expect(body.run_id).toBe(run1Id);
      expect(body.idempotent).toBe(true);
    });

    it('Scenario 2: rejects target with NULL recipe_version_id with 422 TARGET_RECIPE_VERSION_REQUIRED', async () => {
      const { status, body } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: bizId,
        targetId: testTargetNoVersionId,
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '10',
        },
      });

      expect(status).toBe(422);
      expect(body.code).toBe('TARGET_RECIPE_VERSION_REQUIRED');
    });

    it('Scenario 3: detects recipe version conflict with 409 RECIPE_VERSION_CONFLICT', async () => {
      // Demonstrates D: Target con recipe conflict -> 409 con planned/applicable IDs
      const { status, body } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: bizId,
        targetId: testTargetConflictId,
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '10',
        },
      });

      expect(status).toBe(409);
      expect(body.code).toBe('RECIPE_VERSION_CONFLICT');
      expect(body.plannedRecipeVersionId).toBe(testBaguetteV1Id);
      expect(body.applicableRecipeVersionId).toBe(testBaguetteV2Id);
    });

    it('Scenario 6: starts run with runScaleTarget mode output_pieces', async () => {
      // Demonstrates F: output_pieces usando runScaleTarget explícito
      // Create a target for Baguette using currently active V2
      const targetV2Id = crypto.randomUUID();
      await adminClient.from('production_targets').insert({
        id: targetV2Id,
        business_id: bizId,
        production_plan_id: testPlanId,
        target_date: '2026-09-16',
        item_id: testBaguetteItemId,
        recipe_version_id: testBaguetteV2Id,
        target_quantity: 15,
        unit_id: unitPieceId,
        position: 1,
      });

      const { status, body } = await callStartProductionRun({
        runId: runPiecesId,
        businessId: bizId,
        targetId: targetV2Id,
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '15',
        },
        notes: 'Corrida escalada a 15 piezas',
      });

      expect(status).toBe(201);
      expect(body.run_id).toBe(runPiecesId);

      const { data: run } = await adminClient
        .from('production_runs')
        .select('planned_yield_quantity, planned_yield_unit_id')
        .eq('id', runPiecesId)
        .single();
      expect(Number(run?.planned_yield_quantity)).toBe(15);
      expect(run?.planned_yield_unit_id).toBe(unitPieceId);
    });

    // ------------------------------------------------------------------------
    // UNPLANNED SCENARIOS (7 to 11)
    // ------------------------------------------------------------------------
    it('Scenario 7, 8, 9: unplanned run resolves recipe by itemId and published version asOf scheduledDate', async () => {
      // Demonstrates E: Producción no planeada por itemId sin recipeVersionId
      const { status, body } = await callStartProductionRun({
        runId: runUnplannedId,
        businessId: bizId,
        itemId: testBaguetteItemId,
        scheduledDate: '2026-09-17',
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '20',
        },
        notes: 'Producción adicional de sábado',
      });

      expect(status).toBe(201);
      expect(body.run_id).toBe(runUnplannedId);

      // Verify resolved recipe_version is V2 (active on 2026-09-17)
      const { data: run } = await adminClient
        .from('production_runs')
        .select('recipe_version_id, production_target_id, planned_yield_quantity')
        .eq('id', runUnplannedId)
        .single();
      expect(run?.production_target_id).toBeNull();
      expect(run?.recipe_version_id).toBe(testBaguetteV2Id);
      expect(Number(run?.planned_yield_quantity)).toBe(20);
    });

    it('Scenario 10: rejects unplanned run with 422 NO_RECIPE_AS_OF_DATE when date precedes versions', async () => {
      const { status, body } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: bizId,
        itemId: testBaguetteItemId,
        scheduledDate: '2020-01-01',
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '10',
        },
      });

      expect(status).toBe(422);
      expect(body.code).toBe('NO_RECIPE_AS_OF_DATE');
    });

    it('Scenario 11: resolves historical published recipe version asOf historical date', async () => {
      // On 2026-03-15, Baguette V1 was effective (2026-01-01) and V2 did not exist yet (2026-06-01)
      const { status, body } = await callStartProductionRun({
        runId: runHistoricalId,
        businessId: bizId,
        itemId: testBaguetteItemId,
        scheduledDate: '2026-03-15',
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '10',
        },
        notes: 'Corrida histórica resuelta con v1',
      });

      expect(status).toBe(201);
      expect(body.run_id).toBe(runHistoricalId);

      const { data: run } = await adminClient
        .from('production_runs')
        .select('recipe_version_id')
        .eq('id', runHistoricalId)
        .single();
      expect(run?.recipe_version_id).toBe(testBaguetteV1Id);
    });

    // ------------------------------------------------------------------------
    // CONTRACT VALIDATION SCENARIOS (12 to 15)
    // ------------------------------------------------------------------------
    it('Scenario 12: rejects client payload that provides recipeVersionId with 400 BAD_REQUEST', async () => {
      const { status, body } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: bizId,
        targetId: testTarget14KgId,
        recipeVersionId: testDoughV1Id, // Client trying to dictate recipeVersionId
        runScaleTarget: {
          mode: 'yield',
          targetQuantity: '7',
          unitId: unitKgId,
        },
      });

      expect(status).toBe(400);
      expect(body.error).toBe('BAD_REQUEST');
      expect(body.message).toContain('recipeVersionId must not be provided by the client');
    });

    it('Scenario 13: rejects malformed runScaleTarget with 400 BAD_REQUEST', async () => {
      const { status: s1 } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: bizId,
        targetId: testTarget14KgId,
        runScaleTarget: null as any,
      });
      expect(s1).toBe(400);

      const { status: s2 } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: bizId,
        targetId: testTarget14KgId,
        runScaleTarget: { mode: 'invalid_mode' as any },
      });
      expect(s2).toBe(400);

      const { status: s3 } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: bizId,
        targetId: testTarget14KgId,
        runScaleTarget: { mode: 'yield', targetQuantity: '-5', unitId: unitKgId },
      });
      expect(s3).toBe(400);
    });

    it('Scenario 14: rejects yield with incompatible dimension with 422 INCOMPATIBLE_SCALE_TARGET_DIMENSION', async () => {
      // Baguette output item base unit is 'piece' (count). Supplying yield in 'kg' (mass) is dimensionally incompatible
      const { status, body } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: bizId,
        itemId: testBaguetteItemId,
        scheduledDate: '2026-09-17',
        runScaleTarget: {
          mode: 'yield',
          targetQuantity: '5',
          unitId: unitKgId, // Incompatible: mass for a count item
        },
      });

      expect(status).toBe(422);
      expect(body.code).toBe('INCOMPATIBLE_SCALE_TARGET_DIMENSION');
    });

    it('Scenario 15: rejects output_pieces for non-count output item with 422 INCOMPATIBLE_SCALE_TARGET_MODE', async () => {
      // Masa Rustica output item base unit is 'g' (mass). Supplying mode output_pieces is incompatible
      const { status, body } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: bizId,
        targetId: testTarget14KgId,
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '14',
        },
      });

      expect(status).toBe(422);
      expect(body.code).toBe('INCOMPATIBLE_SCALE_TARGET_MODE');
    });
  });

  // ==========================================================================
  // SECTION C: POST-START RUN IMMUTABILITY & MUTATIONS
  // ==========================================================================
  describe('Post-Start Target Immutability & Run Input Actuals', () => {
    it('freezes planning intent fields on production_targets once a run is linked', async () => {
      // Attempting to change target_quantity on testTarget14KgId (which now has run1Id and run2Id)
      const { error: errQty } = await adminClient
        .from('production_targets')
        .update({ target_quantity: 25 })
        .eq('id', testTarget14KgId);
      expect(errQty).toBeDefined();
      expect(errQty?.code).toBe('P0001');

      // Attempting to delete target
      const { error: errDel } = await adminClient
        .from('production_targets')
        .delete()
        .eq('id', testTarget14KgId);
      expect(errDel).toBeDefined();
      expect(errDel?.code).toBe('P0001');
    });

    it('allows member to update actual_quantity on nominal lines', async () => {
      // Pick first input line from run1
      const { data: inputRow } = await adminClient
        .from('production_run_inputs')
        .select('id, production_run_id, planned_quantity')
        .eq('business_id', bizId)
        .limit(1)
        .single();
      expect(inputRow).toBeDefined();

      const { error: updErr } = await ownerClient
        .from('production_run_inputs')
        .update({
          actual_quantity: 4600,
          actual_unit_id: unitGId,
          notes: 'Ajuste real por humedad',
        })
        .eq('id', inputRow.id);

      expect(updErr).toBeNull();

      const { data: updated } = await ownerClient
        .from('production_run_inputs')
        .select('actual_quantity, notes')
        .eq('id', inputRow.id)
        .single();
      expect(Number(updated?.actual_quantity)).toBe(4600);
      expect(updated?.notes).toBe('Ajuste real por humedad');
    });

    it('allows member to add and delete unplanned inputs via RPCs', async () => {
      // Get any run
      const { data: run } = await adminClient
        .from('production_runs')
        .select('id')
        .eq('business_id', bizId)
        .limit(1)
        .single();

      const unplannedId = crypto.randomUUID();
      const { data: addRes, error: addErr } = await ownerClient.rpc('add_unplanned_production_run_input', {
        p_input_id: unplannedId,
        p_run_id: run.id,
        p_item_id: testSaltItemId,
        p_actual_quantity: 50,
        p_actual_unit_id: unitGId,
        p_notes: 'Sal de mar extra',
      });
      expect(addErr).toBeNull();
      expect(addRes).toBe(unplannedId);

      // Verify line created
      const { data: line } = await adminClient
        .from('production_run_inputs')
        .select('recipe_input_id, planned_quantity, actual_quantity')
        .eq('id', unplannedId)
        .single();
      expect(line?.recipe_input_id).toBeNull();
      expect(Number(line?.planned_quantity)).toBe(0);
      expect(Number(line?.actual_quantity)).toBe(50);

      // Delete unplanned input
      const { error: delErr } = await ownerClient.rpc('delete_unplanned_production_run_input', {
        p_input_id: unplannedId,
      });
      expect(delErr).toBeNull();

      const { data: gone } = await adminClient
        .from('production_run_inputs')
        .select('id')
        .eq('id', unplannedId)
        .maybeSingle();
      expect(gone).toBeNull();
    });

    it('allows member to update run notes via update_production_run_notes', async () => {
      const { data: run } = await adminClient
        .from('production_runs')
        .select('id')
        .eq('business_id', bizId)
        .limit(1)
        .single();

      const { error } = await ownerClient.rpc('update_production_run_notes', {
        p_run_id: run.id,
        p_notes: 'Nota actualizada por maestro panadero',
      });
      expect(error).toBeNull();

      const { data: updated } = await adminClient
        .from('production_runs')
        .select('notes')
        .eq('id', run.id)
        .single();
      expect(updated?.notes).toBe('Nota actualizada por maestro panadero');
    });
  });

  // ==========================================================================
  // SECTION D: TIMEZONE REGRESSION SUITE (Asia/Tokyo & America/Mexico_City)
  // ==========================================================================
  describe('Timezone Regression Suite (Operational Calendar Date Resolution)', () => {
    const tokyoBizId = 'b0000000-0000-0000-0000-000000000070';
    const tokyoMatchaItemId = crypto.randomUUID();
    const tokyoFlourItemId = crypto.randomUUID();
    const tokyoRecipeId = crypto.randomUUID();
    const tokyoV1Id = crypto.randomUUID();
    const tokyoV2Id = crypto.randomUUID();
    const tokyoPlanId = crypto.randomUUID();

    const targetTokyoV1OnJune1Id = crypto.randomUUID();
    const targetTokyoV2OnJune1Id = crypto.randomUUID();
    const targetTokyoV2OnJune2Id = crypto.randomUUID();
    const targetTokyoV1OnJune2Id = crypto.randomUUID();

    beforeAll(async () => {
      // 1. Setup Tokyo Business (UTC+9)
      await adminClient.from('businesses').upsert({
        id: tokyoBizId,
        name: 'Tokyo Bakery',
        timezone: 'Asia/Tokyo',
        currency_code: 'JPY',
      });

      await adminClient.from('business_members').upsert({
        business_id: tokyoBizId,
        user_id: ownerUserId,
        role: 'owner',
      });

      // 2. Items
      await adminClient.from('items').upsert([
        {
          id: tokyoMatchaItemId,
          business_id: tokyoBizId,
          name: 'Matcha Melonpan',
          kind: 'finished_product',
          base_unit_id: unitPieceId,
          purchasable: false,
          producible: true,
          sellable: true,
          track_inventory: true,
          is_active: true,
        },
        {
          id: tokyoFlourItemId,
          business_id: tokyoBizId,
          name: 'Harina Japonesa',
          kind: 'raw_material',
          base_unit_id: unitGId,
          purchasable: true,
          producible: false,
          sellable: false,
          track_inventory: true,
          is_active: true,
        },
      ]);

      // 3. Recipe & Versions
      await adminClient.from('recipes').upsert({
        id: tokyoRecipeId,
        business_id: tokyoBizId,
        name: 'Receta Matcha Melonpan',
        output_item_id: tokyoMatchaItemId,
        is_active: true,
      });

      // V1: effective from 2026-01-01
      await adminClient.from('recipe_versions').insert({
        id: tokyoV1Id,
        business_id: tokyoBizId,
        recipe_id: tokyoRecipeId,
        version_number: 1,
        status: 'draft',
        reference_yield_quantity: 10,
        reference_yield_unit_id: unitPieceId,
      });

      await adminClient.from('recipe_inputs').insert({
        business_id: tokyoBizId,
        recipe_version_id: tokyoV1Id,
        item_id: tokyoFlourItemId,
        position: 1,
        quantity_mode: 'absolute',
        quantity: 1000,
        unit_id: unitGId,
      });

      await adminClient.from('recipe_versions').update({
        status: 'active',
        effective_from: '2026-01-01T00:00:00Z',
      }).eq('id', tokyoV1Id);

      await adminClient.from('recipe_versions').update({
        status: 'archived',
      }).eq('id', tokyoV1Id);

      // V2: effective from 2026-06-01T15:00:00Z (which is 2026-06-02 00:00:00 in Asia/Tokyo!)
      await adminClient.from('recipe_versions').insert({
        id: tokyoV2Id,
        business_id: tokyoBizId,
        recipe_id: tokyoRecipeId,
        version_number: 2,
        status: 'draft',
        reference_yield_quantity: 10,
        reference_yield_unit_id: unitPieceId,
      });

      await adminClient.from('recipe_inputs').insert({
        business_id: tokyoBizId,
        recipe_version_id: tokyoV2Id,
        item_id: tokyoFlourItemId,
        position: 1,
        quantity_mode: 'absolute',
        quantity: 1100,
        unit_id: unitGId,
      });

      await adminClient.from('recipe_versions').update({
        status: 'active',
        effective_from: '2026-06-01T15:00:00Z',
      }).eq('id', tokyoV2Id);

      // 4. Plan & Targets
      await adminClient.from('production_plans').upsert({
        id: tokyoPlanId,
        business_id: tokyoBizId,
        name: 'Tokyo Plan June 2026',
        start_date: '2026-06-01',
        end_date: '2026-06-07',
      });

      // Target on 2026-06-01 with V1 (expected: matches applicable V1)
      await adminClient.from('production_targets').insert({
        id: targetTokyoV1OnJune1Id,
        business_id: tokyoBizId,
        production_plan_id: tokyoPlanId,
        target_date: '2026-06-01',
        item_id: tokyoMatchaItemId,
        recipe_version_id: tokyoV1Id,
        target_quantity: 10,
        unit_id: unitPieceId,
        position: 1,
      });

      // Target on 2026-06-01 with V2 (expected: CONFLICT because V2 is not effective until June 2 in Tokyo)
      await adminClient.from('production_targets').insert({
        id: targetTokyoV2OnJune1Id,
        business_id: tokyoBizId,
        production_plan_id: tokyoPlanId,
        target_date: '2026-06-01',
        item_id: tokyoMatchaItemId,
        recipe_version_id: tokyoV2Id,
        target_quantity: 10,
        unit_id: unitPieceId,
        position: 2,
      });

      // Target on 2026-06-02 with V2 (expected: matches applicable V2)
      await adminClient.from('production_targets').insert({
        id: targetTokyoV2OnJune2Id,
        business_id: tokyoBizId,
        production_plan_id: tokyoPlanId,
        target_date: '2026-06-02',
        item_id: tokyoMatchaItemId,
        recipe_version_id: tokyoV2Id,
        target_quantity: 10,
        unit_id: unitPieceId,
        position: 3,
      });

      // Target on 2026-06-02 with V1 (expected: CONFLICT because on June 2 V2 is applicable)
      await adminClient.from('production_targets').insert({
        id: targetTokyoV1OnJune2Id,
        business_id: tokyoBizId,
        production_plan_id: tokyoPlanId,
        target_date: '2026-06-02',
        item_id: tokyoMatchaItemId,
        recipe_version_id: tokyoV1Id,
        target_quantity: 10,
        unit_id: unitPieceId,
        position: 4,
      });
    });

    it('Tokyo timezone: on 2026-06-01, V2 (effective 2026-06-01 15:00Z = June 2 Tokyo) is NOT applicable', async () => {
      // 1. Target planned with V1 on June 1 succeeds because V1 is the applicable version
      const { status: s1, body: b1 } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: tokyoBizId,
        targetId: targetTokyoV1OnJune1Id,
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '10',
        },
      });
      expect(s1).toBe(201);
      expect(b1.status).toBe('in_progress');

      // 2. Target planned with V2 on June 1 yields 409 conflict because V1 is applicable in Tokyo
      const { status: s2, body: b2 } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: tokyoBizId,
        targetId: targetTokyoV2OnJune1Id,
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '10',
        },
      });
      expect(s2).toBe(409);
      expect(b2.code).toBe('RECIPE_VERSION_CONFLICT');
      expect(b2.plannedRecipeVersionId).toBe(tokyoV2Id);
      expect(b2.applicableRecipeVersionId).toBe(tokyoV1Id);

      // 3. Unplanned on June 1 resolves V1 (archived), NOT V2
      const unplannedRunId = crypto.randomUUID();
      const { status: s3, body: b3 } = await callStartProductionRun({
        runId: unplannedRunId,
        businessId: tokyoBizId,
        itemId: tokyoMatchaItemId,
        scheduledDate: '2026-06-01',
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '10',
        },
      });
      expect(s3).toBe(201);
      expect(b3.run_id).toBe(unplannedRunId);

      const { data: run } = await adminClient
        .from('production_runs')
        .select('recipe_version_id')
        .eq('id', unplannedRunId)
        .single();
      expect(run?.recipe_version_id).toBe(tokyoV1Id);
    });

    it('Tokyo timezone: on 2026-06-02, V2 IS applicable', async () => {
      // 1. Target planned with V2 on June 2 succeeds
      const { status: s1, body: b1 } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: tokyoBizId,
        targetId: targetTokyoV2OnJune2Id,
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '10',
        },
      });
      expect(s1).toBe(201);
      expect(b1.status).toBe('in_progress');

      // 2. Target planned with V1 on June 2 yields 409 conflict
      const { status: s2, body: b2 } = await callStartProductionRun({
        runId: crypto.randomUUID(),
        businessId: tokyoBizId,
        targetId: targetTokyoV1OnJune2Id,
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '10',
        },
      });
      expect(s2).toBe(409);
      expect(b2.code).toBe('RECIPE_VERSION_CONFLICT');
      expect(b2.plannedRecipeVersionId).toBe(tokyoV1Id);
      expect(b2.applicableRecipeVersionId).toBe(tokyoV2Id);

      // 3. Unplanned on June 2 resolves V2 (active)
      const unplannedRunId = crypto.randomUUID();
      const { status: s3, body: b3 } = await callStartProductionRun({
        runId: unplannedRunId,
        businessId: tokyoBizId,
        itemId: tokyoMatchaItemId,
        scheduledDate: '2026-06-02',
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '10',
        },
      });
      expect(s3).toBe(201);
      expect(b3.run_id).toBe(unplannedRunId);

      const { data: run } = await adminClient
        .from('production_runs')
        .select('recipe_version_id')
        .eq('id', unplannedRunId)
        .single();
      expect(run?.recipe_version_id).toBe(tokyoV2Id);
    });

    it('rejects execution when business.timezone is invalid with 422 INVALID_BUSINESS_TIMEZONE and creates no run', async () => {
      const invalidBizId = crypto.randomUUID();
      await adminClient.from('businesses').insert({
        id: invalidBizId,
        name: 'Mars Bakery',
        timezone: 'Mars/Panara',
        currency_code: 'MXN',
      });

      await adminClient.from('business_members').insert({
        business_id: invalidBizId,
        user_id: ownerUserId,
        role: 'owner',
      });

      const marsItemId = crypto.randomUUID();
      await adminClient.from('items').insert({
        id: marsItemId,
        business_id: invalidBizId,
        name: 'Mars Bread',
        kind: 'finished_product',
        base_unit_id: unitPieceId,
        purchasable: false,
        producible: true,
        sellable: true,
      });

      const marsRunId = crypto.randomUUID();
      try {
        const { status, body } = await callStartProductionRun({
          runId: marsRunId,
          businessId: invalidBizId,
          itemId: marsItemId,
          scheduledDate: '2026-09-15',
          runScaleTarget: {
            mode: 'output_pieces',
            targetPieces: '10',
          },
        });

        expect(status).toBe(422);
        expect(body.code).toBe('INVALID_BUSINESS_TIMEZONE');
        expect(body.message).toContain('Mars/Panara');

        // Assert NO production run was created
        const { data: run } = await adminClient
          .from('production_runs')
          .select('id')
          .eq('id', marsRunId)
          .maybeSingle();
        expect(run).toBeNull();
      } finally {
        await adminClient.from('items').delete().eq('business_id', invalidBizId);
        await adminClient.from('business_members').delete().eq('business_id', invalidBizId);
        await adminClient.from('businesses').delete().eq('id', invalidBizId);
      }
    });
  });

  afterAll(async () => {
    const testBizIds = [bizId, 'b0000000-0000-0000-0000-000000000070'];
    await adminClient.from('production_run_inputs').delete().in('business_id', testBizIds);
    await adminClient.from('production_runs').delete().in('business_id', testBizIds);
    await adminClient.from('production_targets').delete().in('business_id', testBizIds);
    await adminClient.from('production_plans').delete().in('business_id', testBizIds);
    await adminClient.from('recipe_inputs').delete().in('business_id', testBizIds);
    await adminClient.from('recipe_versions').delete().in('business_id', testBizIds);
    await adminClient.from('recipes').delete().in('business_id', testBizIds);
    await adminClient.from('items').delete().in('business_id', testBizIds);
    await adminClient.from('business_members').delete().in('business_id', testBizIds);
    await adminClient.from('businesses').delete().in('id', testBizIds);
  });
});
