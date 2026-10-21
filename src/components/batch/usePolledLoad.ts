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
  refresh: (silent?: boolean) => Promise<void>;
}

// Loads once, then re-loads every intervalMs for as long as shouldPoll says the data can still change. `load` must be
// stable (useCallback) — a new one starts over.
export function usePolledLoad<T>(
  load: () => Promise<T>,
  shouldPoll: (data: T) => boolean,
  intervalMs: number,
  failureMessage: string,
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
      setData(result);
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
  }, [load, begin, failureMessage]);

  useEffect(() => {
    setData(null);
    setLastUpdated(null);
    refresh();
  }, [refresh]);

  const live = data !== null && shouldPoll(data);
  useEffect(() => {
    if (!live) return;
    const interval = setInterval(() => refresh(true), intervalMs);
    return () => clearInterval(interval);
  }, [live, refresh, intervalMs]);

  return { data, loading, error, failing, lastUpdated, live, refresh };
}
