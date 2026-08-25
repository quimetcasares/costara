import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RecipeHistoryView } from '../../src/ui/views/RecipeHistoryView.js';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('RecipeHistoryView Component', () => {
  it('loads and displays version history using correct foreign key hints (BUG 2 regression test)', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'recipe-1',
              name: 'Hogaza Rústica',
              output_item: { name: 'Pan Rústico' },
            },
            error: null,
          }),
        };
      }

      if (table === 'recipe_versions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'v2-id',
                version_number: 2,
                status: 'active',
                reference_yield_quantity: '14000.000000000000',
                reference_yield_unit: { code: 'g' },
                portion_quantity: '1000.000000000000',
                portion_unit: { code: 'g' },
                yield_description: 'Masa lista',
                change_reason: 'Ajuste de hidratación',
                notes: 'Notas v2',
                effective_from: '2026-06-15T00:00:00Z',
                created_at: '2026-06-15T00:00:00Z',
                recipe_inputs: [
                  {
                    id: 'inp-1',
                    position: 1,
                    quantity_mode: 'absolute',
                    quantity: '9000.000000000000',
                    percentage: null,
                    costing_source: 'purchased',
                    item: { name: 'Harina de Trigo' },
                    unit: { code: 'g' },
                  },
                ],
              },
              {
                id: 'v1-id',
                version_number: 1,
                status: 'archived',
                reference_yield_quantity: '14000.000000000000',
                reference_yield_unit: { code: 'g' },
                portion_quantity: '1000.000000000000',
                portion_unit: { code: 'g' },
                yield_description: 'Masa inicial',
                change_reason: 'Versión inicial',
                notes: 'Notas v1',
                effective_from: '2026-01-15T00:00:00Z',
                created_at: '2026-01-15T00:00:00Z',
                recipe_inputs: [],
              },
            ],
            error: null,
          }),
        };
      }

      return {
        select: vi.fn().mockReturnThis(),
      };
    });

    const mockSupabase = {
      from: mockFrom,
    } as unknown as SupabaseClient;

    const onBack = vi.fn();

    render(
      <RecipeHistoryView
        supabase={mockSupabase}
        businessId="biz-1"
        recipeId="recipe-1"
        onBack={onBack}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Historial de Versiones: Hogaza Rústica')).toBeTruthy();
    });

    expect(screen.getByText('Versión 2')).toBeTruthy();
    expect(screen.getByText('Vigente (Activa)')).toBeTruthy();
    expect(screen.getByText('Versión 1')).toBeTruthy();
    expect(screen.getByText('Archivada (Histórica)')).toBeTruthy();
    expect(screen.getByText('Harina de Trigo')).toBeTruthy();
  });
});
