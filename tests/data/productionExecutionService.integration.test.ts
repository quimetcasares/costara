import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  loadProductionDay,
  loadProductionRun,
  startTargetProductionRun,
} from '../../src/data/productionExecutionService.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('productionExecutionService Integration Tests with Live Supabase (M2C.1)', () => {
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const businessId = 'a0000000-0000-0000-0000-0000000000ff';
  const targetDate = '2026-09-09';

  beforeAll(async () => {
    const { error: authErr } = await userClient.auth.signInWithPassword({
      email: 'a@costara.local',
      password: 'password123',
    });
    if (authErr) throw new Error(`Auth failed: ${authErr.message}`);
  });

  it('loadProductionDay executes real PostgREST query without embedding errors and loads targets', async () => {
    const dayData = await loadProductionDay(userClient, businessId, targetDate);

    expect(dayData).toBeDefined();
    expect(dayData.targets.length).toBe(2);

    const sourdoughTarget = dayData.targets.find((t) => t.item_name === 'Masa Madre Activa');
    expect(sourdoughTarget).toBeDefined();
    expect(sourdoughTarget?.target_quantity).toBe('2000');
    expect(sourdoughTarget?.unit_code).toBe('g');

    const panDeDeusTarget = dayData.targets.find((t) => t.item_name === 'Pan de Deus con Crema de Limón');
    expect(panDeDeusTarget).toBeDefined();
    expect(panDeDeusTarget?.target_quantity).toBe('8');
    expect(panDeDeusTarget?.unit_code).toBe('piece');
  });

  it('scales Pan de Deus to 4 pieces with exact 0.5 scale factor across all inputs', async () => {
    const dayData = await loadProductionDay(userClient, businessId, targetDate);
    const target = dayData.targets.find((t) => t.item_name === 'Pan de Deus con Crema de Limón');
    expect(target).toBeDefined();

    const runId = crypto.randomUUID();

    try {
      const result = await startTargetProductionRun(userClient, {
        runId,
        businessId,
        targetId: target!.id,
        runScaleTarget: {
          mode: 'output_pieces',
          targetPieces: '4',
        },
        notes: 'Test snapshot scaling 0.5',
      });

      expect(result.runId).toBe(runId);
      expect(result.idempotent).toBe(false);

      const run = await loadProductionRun(userClient, businessId, runId);
      expect(run.planned_yield_quantity).toBe('4');
      expect(run.planned_yield_unit_code).toBe('piece');
      expect(run.inputs.length).toBe(12);

      const inputByName = new Map(run.inputs.map((i) => [i.item_name, i]));

      // 1. Subpreparación Esponja (229 g nominal * 0.5 = 114.5 g)
      const sponge = inputByName.get('Esponja Pan de Deus');
      expect(sponge).toBeDefined();
      expect(sponge?.planned_quantity).toBe('114.5');
      expect(sponge?.planned_unit_code).toBe('g');

      // 2. Harina de Trigo (190 g nominal * 0.5 = 95 g)
      const flour = inputByName.get('Harina de Trigo Panara');
      expect(flour).toBeDefined();
      expect(flour?.planned_quantity).toBe('95');
      expect(flour?.planned_unit_code).toBe('g');

      // 3. Agua (45 g nominal * 0.5 = 22.5 g)
      const water = inputByName.get('Agua Purificada Panara');
      expect(water).toBeDefined();
      expect(water?.planned_quantity).toBe('22.5');
      expect(water?.planned_unit_code).toBe('g');

      // 4. Sal (4 g nominal * 0.5 = 2 g)
      const salt = inputByName.get('Sal Fina Panara');
      expect(salt).toBeDefined();
      expect(salt?.planned_quantity).toBe('2');
      expect(salt?.planned_unit_code).toBe('g');

      // 5. Azúcar (43 g nominal * 0.5 = 21.5 g)
      const sugar = inputByName.get('Azúcar Estándar Panara');
      expect(sugar).toBeDefined();
      expect(sugar?.planned_quantity).toBe('21.5');
      expect(sugar?.planned_unit_code).toBe('g');

      // 6. Mantequilla (30 g nominal * 0.5 = 15 g)
      const butter = inputByName.get('Mantequilla sin Sal Panara');
      expect(butter).toBeDefined();
      expect(butter?.planned_quantity).toBe('15');
      expect(butter?.planned_unit_code).toBe('g');

      // 7. Huevo (2 piece nominal * 0.5 = 1 piece)
      const egg = inputByName.get('Huevo Fresco Panara');
      expect(egg).toBeDefined();
      expect(egg?.planned_quantity).toBe('1');
      expect(egg?.planned_unit_code).toBe('piece');

      // 8. Limón Amarillo (0.5 piece nominal * 0.5 = 0.25 piece)
      const lemon = inputByName.get('Limón Amarillo Panara');
      expect(lemon).toBeDefined();
      expect(lemon?.planned_quantity).toBe('0.25');
      expect(lemon?.planned_unit_code).toBe('piece');

      // 9. Naranja (0.5 piece nominal * 0.5 = 0.25 piece)
      const orange = inputByName.get('Naranja Panara');
      expect(orange).toBeDefined();
      expect(orange?.planned_quantity).toBe('0.25');
      expect(orange?.planned_unit_code).toBe('piece');

      // 10. Extracto de Vainilla (3 g nominal * 0.5 = 1.5 g)
      const vanilla = inputByName.get('Extracto de Vainilla Panara');
      expect(vanilla).toBeDefined();
      expect(vanilla?.planned_quantity).toBe('1.5');
      expect(vanilla?.planned_unit_code).toBe('g');

      // 11. Crema de Limón (280 g nominal * 0.5 = 140 g)
      const lemonCream = inputByName.get('Crema de Limón');
      expect(lemonCream).toBeDefined();
      expect(lemonCream?.planned_quantity).toBe('140');
      expect(lemonCream?.planned_unit_code).toBe('g');

      // 12. Brillo de Huevo (120 g nominal * 0.5 = 60 g)
      const eggWash = inputByName.get('Brillo de Huevo');
      expect(eggWash).toBeDefined();
      expect(eggWash?.planned_quantity).toBe('60');
      expect(eggWash?.planned_unit_code).toBe('g');
    } finally {
      // Crucial: Clean up test run so demo remains completely clean (0 runs)
      await adminClient.from('production_run_inputs').delete().eq('production_run_id', runId);
      await adminClient.from('production_runs').delete().eq('id', runId);
    }
  });
});
