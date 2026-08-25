import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RecipeDetailView } from '../../src/ui/views/RecipeDetailView.js';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('RecipeDetailView Role & Authorization UI (BUG 6 regression tests)', () => {
  const mockRecipe = {
    id: 'recipe-1',
    business_id: 'biz-1',
    name: 'Hogaza Rústica',
    output_item_id: 'item-output-1',
    notes: 'Receta artesanal',
    recipe_versions: [
      {
        id: 'v2-id',
        version_number: 2,
        status: 'active',
        reference_yield_quantity: '14000.000000000000',
        reference_yield_unit_id: 'unit-g',
        portion_quantity: '1000.000000000000',
        portion_unit_id: 'unit-g',
        yield_description: 'Masa final',
        notes: null,
        effective_from: '2026-06-15T00:00:00Z',
      },
    ],
  };

  const createMockSupabase = () => {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        const getTableData = () => {
          if (table === 'recipes') {
            return { data: mockRecipe, error: null };
          }
          if (table === 'recipe_versions') {
            return {
              data: {
                id: 'v2-id',
                recipe_id: 'recipe-1',
                business_id: 'biz-1',
                version_number: 2,
                status: 'active',
                reference_yield_quantity: '14000.000000000000',
                reference_yield_unit_id: 'unit-g',
                portion_quantity: '1000.000000000000',
                portion_unit_id: 'unit-g',
                yield_description: 'Masa final',
                notes: null,
                effective_from: '2026-06-15T00:00:00Z',
              },
              error: null,
            };
          }
          if (table === 'units') {
            return {
              data: [{ id: 'unit-g', code: 'g', name: 'Gramo', dimension: 'mass', scale_factor: '1' }],
              error: null,
            };
          }
          return { data: [], error: null };
        };

        const builder: Record<string, unknown> = {};
        builder.select = vi.fn().mockImplementation(() => builder);
        builder.eq = vi.fn().mockImplementation(() => builder);
        builder.in = vi.fn().mockImplementation(() => builder);
        builder.lte = vi.fn().mockImplementation(() => builder);
        builder.gte = vi.fn().mockImplementation(() => builder);
        builder.order = vi.fn().mockImplementation(() => builder);
        builder.single = vi.fn().mockImplementation(() => Promise.resolve(getTableData()));
        builder.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve(getTableData()));
        builder.then = (resolve: (val: unknown) => unknown) => Promise.resolve(resolve(getTableData()));

        return builder;
      }),
    } as unknown as SupabaseClient;
  };

  it('renders "Crear Nueva Versión" button for OWNER role', async () => {
    const supabase = createMockSupabase();

    render(
      <RecipeDetailView
        supabase={supabase}
        businessId="biz-1"
        recipeId="recipe-1"
        userRole="owner"
        businessTimezone="America/Mexico_City"
        onBack={vi.fn()}
        onGoToDraft={vi.fn()}
        onGoToHistory={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hogaza Rústica')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: /Crear Nueva Versión/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Historial de versiones/i })).toBeTruthy();
  });

  it('renders "Crear Nueva Versión" button for ADMIN role', async () => {
    const supabase = createMockSupabase();

    render(
      <RecipeDetailView
        supabase={supabase}
        businessId="biz-1"
        recipeId="recipe-1"
        userRole="admin"
        businessTimezone="America/Mexico_City"
        onBack={vi.fn()}
        onGoToDraft={vi.fn()}
        onGoToHistory={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hogaza Rústica')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: /Crear Nueva Versión/i })).toBeTruthy();
  });

  it('HIDES "Crear Nueva Versión" and all mutation buttons for MEMBER role, preserving read-only controls', async () => {
    const supabase = createMockSupabase();

    render(
      <RecipeDetailView
        supabase={supabase}
        businessId="biz-1"
        recipeId="recipe-1"
        userRole="member"
        businessTimezone="America/Mexico_City"
        onBack={vi.fn()}
        onGoToDraft={vi.fn()}
        onGoToHistory={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hogaza Rústica')).toBeTruthy();
    });

    // Mutation buttons MUST NOT be in the document for member
    expect(screen.queryByRole('button', { name: /Crear Nueva Versión/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar Borrador Activo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Comenzar Formulación/i })).toBeNull();

    // Read-only controls MUST be preserved
    expect(screen.getByRole('button', { name: /Historial de versiones/i })).toBeTruthy();
  });

  it('BUG 10 Regression: creates draft using the current activeVersion (v3), NOT the historical version (v2) resolved by As-Of', async () => {
    let rpcCalledWith: Record<string, unknown> | null = null;

    const rpcFn = vi.fn().mockImplementation((fnName: string, args: Record<string, unknown>) => {
      if (fnName === 'create_recipe_draft_from_version') {
        rpcCalledWith = args;
        return Promise.resolve({
          data: { draft_version_id: 'v4-draft-id', is_new: true, version_number: 4 },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const mockSupabase = {
      rpc: rpcFn,
      from: vi.fn().mockImplementation((table: string) => {
        const getTableData = () => {
          if (table === 'recipes') {
            return { data: mockRecipe, error: null };
          }
          if (table === 'recipe_versions') {
            // When querying by status='active', return active v3
            // When querying by As-Of <= 2026-06-15, return archived v2
            return {
              data: {
                id: 'v3-id',
                recipe_id: 'recipe-1',
                business_id: 'biz-1',
                version_number: 3,
                status: 'active',
                reference_yield_quantity: '14000.000000000000',
                reference_yield_unit_id: 'unit-g',
                portion_quantity: '1000.000000000000',
                portion_unit_id: 'unit-g',
                yield_description: 'Masa final v3',
                notes: null,
                effective_from: '2026-08-19T00:07:00Z',
              },
              error: null,
            };
          }
          if (table === 'units') {
            return {
              data: [{ id: 'unit-g', code: 'g', name: 'Gramo', dimension: 'mass', scale_factor: '1' }],
              error: null,
            };
          }
          return { data: [], error: null };
        };

        const builder: Record<string, unknown> = {};
        builder.select = vi.fn().mockImplementation(() => builder);
        builder.eq = vi.fn().mockImplementation(() => builder);
        builder.in = vi.fn().mockImplementation(() => builder);
        builder.lte = vi.fn().mockImplementation(() => builder);
        builder.gte = vi.fn().mockImplementation(() => builder);
        builder.order = vi.fn().mockImplementation(() => builder);
        builder.limit = vi.fn().mockImplementation(() => builder);
        builder.single = vi.fn().mockImplementation(() => Promise.resolve(getTableData()));
        builder.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve(getTableData()));
        builder.then = (resolve: (val: unknown) => unknown) => Promise.resolve(resolve(getTableData()));

        return builder;
      }),
    } as unknown as SupabaseClient;

    const onGoToDraft = vi.fn();

    render(
      <RecipeDetailView
        supabase={mockSupabase}
        businessId="biz-1"
        recipeId="recipe-1"
        userRole="owner"
        businessTimezone="America/Mexico_City"
        onBack={vi.fn()}
        onGoToDraft={onGoToDraft}
        onGoToHistory={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hogaza Rústica')).toBeTruthy();
    });

    const createBtn = screen.getByRole('button', { name: /Crear Nueva Versión/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(rpcFn).toHaveBeenCalledWith('create_recipe_draft_from_version', {
        p_source_version_id: 'v3-id',
      });
      expect(onGoToDraft).toHaveBeenCalled();
    });

    expect(rpcCalledWith).toEqual({
      p_source_version_id: 'v3-id',
    });
  });
});
