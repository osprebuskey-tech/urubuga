import { useEffect, useState } from 'react';
import { catalogApi } from '../services/catalogApi';

// Categories change rarely and are needed on many pages, so they are fetched once and shared.
let cache = null;
let inflight = null;

function load() {
  if (!inflight) {
    inflight = catalogApi
      .categories()
      .then((res) => { cache = res.data; return cache; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export const invalidateCategories = () => { cache = null; };

export function useCategories() {
  const [state, setState] = useState({ categories: cache || [], loading: !cache, error: null });

  useEffect(() => {
    if (cache) { setState({ categories: cache, loading: false, error: null }); return undefined; }
    let alive = true;
    load()
      .then((categories) => alive && setState({ categories, loading: false, error: null }))
      .catch((error) => alive && setState({ categories: [], loading: false, error }));
    return () => { alive = false; };
  }, []);

  return state;
}
