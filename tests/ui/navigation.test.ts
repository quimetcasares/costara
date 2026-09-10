import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { parseHash, useNavigation } from '../../src/ui/hooks/useNavigation.js';

describe('useNavigation parseHash routing (M2C.1)', () => {
  it('defaults to production-day on empty hash or #/ or #/production', () => {
    expect(parseHash('')).toEqual({ name: 'production-day' });
    expect(parseHash('#')).toEqual({ name: 'production-day' });
    expect(parseHash('#/')).toEqual({ name: 'production-day' });
    expect(parseHash('#/production')).toEqual({ name: 'production-day' });
    expect(parseHash('#production')).toEqual({ name: 'production-day' });
  });

  it('routes to production-day with calendar date parameter', () => {
    expect(parseHash('#/production/2026-09-09')).toEqual({
      name: 'production-day',
      date: '2026-09-09',
    });
  });

  it('routes to production-run with runId parameter', () => {
    const runId = 'e2e6c518-e3bc-40ea-a0a1-a0d0d5d41c10';
    expect(parseHash(`#/production/runs/${runId}`)).toEqual({
      name: 'production-run',
      runId,
    });
  });

  it('preserves existing recipe catalog and detail routes', () => {
    expect(parseHash('#/recipes')).toEqual({ name: 'recipe-list' });
    expect(parseHash('#/recipes/rec-123')).toEqual({
      name: 'recipe-detail',
      recipeId: 'rec-123',
    });
    expect(parseHash('#/recipes/rec-123/draft')).toEqual({
      name: 'recipe-draft',
      recipeId: 'rec-123',
    });
    expect(parseHash('#/recipes/rec-123/history')).toEqual({
      name: 'recipe-history',
      recipeId: 'rec-123',
    });
  });

  it('returns not-found for unknown or malformed paths', () => {
    expect(parseHash('#/inventory')).toEqual({ name: 'not-found' });
    expect(parseHash('#/production/invalid-date-format')).toEqual({ name: 'not-found' });
    expect(parseHash('#/production/runs')).toEqual({ name: 'not-found' });
  });

  it('useNavigation.toProductionDay sets hash to specific operational date', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => {
      result.current.toProductionDay('2026-09-09');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(window.location.hash).toBe('#/production/2026-09-09');
    expect(result.current.route).toEqual({
      name: 'production-day',
      date: '2026-09-09',
    });
  });

  it('useNavigation.toProductionDay without argument sets hash to #/production', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => {
      result.current.toProductionDay();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(window.location.hash).toBe('#/production');
    expect(result.current.route).toEqual({
      name: 'production-day',
    });
  });
});
