import { useState, useEffect, useCallback } from 'react';

export type Route =
  | { name: 'production-day'; date?: string }
  | { name: 'production-run'; runId: string }
  | { name: 'recipe-list' }
  | { name: 'recipe-detail'; recipeId: string }
  | { name: 'recipe-draft'; recipeId: string }
  | { name: 'recipe-history'; recipeId: string }
  | { name: 'not-found' };

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseHash(hash: string): Route {
  const cleanHash = hash.replace(/^#\/?/, '').trim();
  const parts = cleanHash.split('/').filter(Boolean);

  if (parts.length === 0 || (parts.length === 1 && parts[0] === 'production')) {
    return { name: 'production-day' };
  }

  if (parts[0] === 'production') {
    if (parts.length === 2 && DATE_REGEX.test(parts[1])) {
      return { name: 'production-day', date: parts[1] };
    }
    if (parts.length === 3 && parts[1] === 'runs' && parts[2]) {
      return { name: 'production-run', runId: parts[2] };
    }
    return { name: 'not-found' };
  }

  if (parts.length === 1 && parts[0] === 'recipes') {
    return { name: 'recipe-list' };
  }

  if (parts[0] === 'recipes' && parts.length === 2) {
    return { name: 'recipe-detail', recipeId: parts[1] };
  }

  if (parts[0] === 'recipes' && parts.length === 3) {
    if (parts[2] === 'draft') {
      return { name: 'recipe-draft', recipeId: parts[1] };
    }
    if (parts[2] === 'history') {
      return { name: 'recipe-history', recipeId: parts[1] };
    }
  }

  return { name: 'not-found' };
}

export function useNavigation() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((path: string) => {
    const cleanPath = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
    window.location.hash = cleanPath;
  }, []);

  const toProductionDay = useCallback((date?: string) => {
    if (date) {
      navigate(`#/production/${date}`);
    } else {
      navigate('#/production');
    }
  }, [navigate]);

  const toProductionRun = useCallback((runId: string) => {
    navigate(`#/production/runs/${runId}`);
  }, [navigate]);

  const toList = useCallback(() => navigate('#/recipes'), [navigate]);
  const toDetail = useCallback((recipeId: string) => navigate(`#/recipes/${recipeId}`), [navigate]);
  const toDraft = useCallback((recipeId: string) => navigate(`#/recipes/${recipeId}/draft`), [navigate]);
  const toHistory = useCallback((recipeId: string) => navigate(`#/recipes/${recipeId}/history`), [navigate]);

  return {
    route,
    navigate,
    toProductionDay,
    toProductionRun,
    toList,
    toDetail,
    toDraft,
    toHistory,
  };
}
