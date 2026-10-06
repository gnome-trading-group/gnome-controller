import { useCallback, useRef } from 'react';

// Several loads for the same view can be in flight at once (a poll overlapping a filter change, a slow page landing
// after a fast one, an old session's refresh finishing after navigating to a new one). Only the newest may write
// state, or the screen shows data for a selection the user has already left.
//
// Call begin() when starting a load; the returned isCurrent() is false once a newer load has begun.
export function useLatestRequest(): () => () => boolean {
  const latest = useRef(0);
  return useCallback(() => {
    const id = ++latest.current;
    return () => id === latest.current;
  }, []);
}
