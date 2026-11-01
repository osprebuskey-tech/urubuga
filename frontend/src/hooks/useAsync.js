import { useEffect, useState, useCallback } from 'react';

/**
 * Runs `fn(signal)` (which must resolve { data, meta }) whenever `deps` change.
 * Stale responses are ignored and in-flight requests are aborted on change/unmount.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, meta: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve(fn(controller.signal))
      .then((res) => {
        if (!controller.signal.aborted) setState({ data: res?.data ?? null, meta: res?.meta ?? null, error: null, loading: false });
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setState({ data: null, meta: null, error: err, loading: false });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Resolves { data: null } instead of throwing when the API answers with the given error code (e.g. "no profile yet"). */
export async function allowCode(promise, code) {
  try {
    return await promise;
  } catch (err) {
    if (err?.code === code) return { data: null, meta: null };
    throw err;
  }
}
