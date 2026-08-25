import type { SupabaseClient } from '@supabase/supabase-js';

export interface DraftYieldPayload {
  readonly reference_yield_quantity: string;
  readonly reference_yield_unit_id: string;
  readonly portion_quantity?: string | null;
  readonly portion_unit_id?: string | null;
  readonly yield_description?: string | null;
  readonly notes?: string | null;
}

export interface DraftInputPayload {
  readonly id: string;
  readonly item_id: string;
  readonly position: number;
  readonly quantity_mode: 'absolute' | 'percentage';
  readonly quantity?: string | null;
  readonly unit_id?: string | null;
  readonly percentage?: string | null;
  readonly costing_source?: 'purchased' | 'produced' | null;
  readonly notes?: string | null;
}

export interface DraftPercentageBasePayload {
  readonly percentage_input_id: string;
  readonly basis_input_id: string;
}

export interface RecipeDraftService {
  createOrGetDraft(sourceVersionId?: string | null): Promise<{ draft_version_id: string; is_new: boolean; version_number: number }>;
  saveDraft(
    draftVersionId: string,
    yieldData: DraftYieldPayload,
    inputs: readonly DraftInputPayload[],
    percentageBases: readonly DraftPercentageBasePayload[]
  ): Promise<{ recipe_version_id: string; saved: boolean }>;
  publishVersion(
    draftVersionId: string,
    effectiveFromLocal: string,
    changeReason?: string | null
  ): Promise<{ recipe_version_id: string; archived_version_id: string | null; published: boolean; effective_from: string }>;
}

export class SupabaseRecipeDraftService implements RecipeDraftService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async createOrGetDraft(sourceVersionId?: string | null): Promise<{ draft_version_id: string; is_new: boolean; version_number: number }> {
    const { data, error } = await this.client.rpc('create_recipe_draft_from_version', {
      p_source_version_id: sourceVersionId || null,
    });

    if (error) {
      throw new Error(`Failed to create/get recipe draft: ${error.message}`);
    }

    return data as { draft_version_id: string; is_new: boolean; version_number: number };
  }

  async saveDraft(
    draftVersionId: string,
    yieldData: DraftYieldPayload,
    inputs: readonly DraftInputPayload[],
    percentageBases: readonly DraftPercentageBasePayload[]
  ): Promise<{ recipe_version_id: string; saved: boolean }> {
    const { data, error } = await this.client.rpc('save_recipe_draft', {
      p_recipe_version_id: draftVersionId,
      p_yield_data: yieldData,
      p_inputs: inputs,
      p_percentage_bases: percentageBases,
    });

    if (error) {
      throw new Error(`Failed to save recipe draft: ${error.message}`);
    }

    return data as { recipe_version_id: string; saved: boolean };
  }

  async publishVersion(
    draftVersionId: string,
    effectiveFromLocal: string,
    changeReason?: string | null
  ): Promise<{ recipe_version_id: string; archived_version_id: string | null; published: boolean; effective_from: string }> {
    const { data, error } = await this.client.rpc('publish_recipe_version', {
      p_recipe_version_id: draftVersionId,
      p_effective_from_local: effectiveFromLocal,
      p_change_reason: changeReason || null,
    });

    if (error) {
      throw new Error(`Failed to publish recipe version: ${error.message}`);
    }

    return data as { recipe_version_id: string; archived_version_id: string | null; published: boolean; effective_from: string };
  }
}

export function createRecipeDraftService(supabase: SupabaseClient): RecipeDraftService {
  return new SupabaseRecipeDraftService(supabase);
}
