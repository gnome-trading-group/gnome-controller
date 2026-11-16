import { useCallback, useEffect, useState } from 'react';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { errorMessage } from '../../utils/kill-switch';

export interface PolledLoad<T> {
  data: T | null;
  loading: boolean;
  // A load the user asked for failed; a failed background poll keeps the last good data and only sets `failing`.
  error: string | null;
  failing: boolean;
  lastUpdated: Date | null;
  live: boolean;
  // The current poll interval, null until the first load.
  pollMs: number | null;
  refresh: (silent?: boolean) => Promise<void>;
}

// Loads once, then re-loads every intervalMs for as long as shouldPoll says the data can still change. `load` must be
// stable (useCallback) — a new one starts over. intervalMs may depend on the data (a large run polls less often), and
// a poll whose `fingerprint` matches the data shown keeps the old object, so the page doesn't redraw for nothing.
export function usePolledLoad<T>(
  load: () => Promise<T>,
  shouldPoll: (data: T) => boolean,
  intervalMs: number | ((data: T) => number),
  failureMessage: string,
  fingerprint?: (data: T) => string,
): PolledLoad<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const begin = useLatestRequest();

  const refresh = useCallback(async (silent = false) => {
    const isCurrent = begin();
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await load();
      if (!isCurrent()) return;
      setData(prev => (prev !== null && fingerprint && fingerprint(prev) === fingerprint(result) ? prev : result));
      setLastUpdated(new Date());
      setFailing(false);
      setError(null);
    } catch (e) {
      if (!isCurrent()) return;
      setFailing(true);
      if (!silent) setError(errorMessage(e, failureMessage));
    } finally {
      // Not gated on silent: a superseded load skips this, so the newest must clear a spinner it didn't start.
      if (isCurrent()) setLoading(false);
    }
  }, [load, begin, failureMessage, fingerprint]);

  useEffect(() => {
    setData(null);
    setLastUpdated(null);
    refresh();
  }, [refresh]);

  const live = data !== null && shouldPoll(data);
  const pollMs = data === null ? null : typeof intervalMs === 'function' ? intervalMs(data) : intervalMs;
  useEffect(() => {
    if (!live || pollMs === null) return;
    const interval = setInterval(() => refresh(true), pollMs);
    return () => clearInterval(interval);
  }, [live, refresh, pollMs]);

  return { data, loading, error, failing, lastUpdated, live, pollMs, refresh };
}
