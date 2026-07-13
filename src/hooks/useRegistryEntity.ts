import { useEffect, useState } from 'react';

export function useRegistryEntity<T>(
  fetchFn: () => Promise<T[]>,
  deps: unknown[],
): { data: T | null; isLoading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetchFn()
      .then(rows => setData(rows[0] ?? null))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setIsLoading(false));
  }, deps);

  return { data, isLoading, error };
}
