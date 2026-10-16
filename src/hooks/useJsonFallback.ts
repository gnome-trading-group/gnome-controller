import { useEffect, useMemo, useState } from 'react';
import { LostField } from '../utils/round-trip';

/**
 * Opens a stored config in JSON when the form would lose part of it (see utils/round-trip). Returning to the form
 * is allowed once the JSON round-trips cleanly, unless the user chooses to drop what doesn't fit.
 */
export function useJsonFallback<T extends object>(stored: T | null, lostOf: (value: T) => LostField[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lost = useMemo(() => (stored ? lostOf(stored) : []), [stored]);
  const [asJson, setAsJson] = useState(false);
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<LostField[]>([]);

  useEffect(() => {
    setAsJson(lost.length > 0);
    setRemaining(lost);
    setJson(stored ? JSON.stringify(stored, null, 2) : '');
    setError(null);
  }, [stored, lost]);

  const parse = (): T | null => {
    try {
      const value = JSON.parse(json) as T;
      setError(null);
      return value;
    } catch (e) {
      setError(`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };

  // The edited JSON, if the form can now hold all of it; else null, with what still doesn't fit in `remaining`.
  const backToForm = (dropWhatDoesNotFit = false): T | null => {
    const value = parse();
    if (value === null) return null;
    const left = lostOf(value);
    setRemaining(left);
    if (left.length > 0 && !dropWhatDoesNotFit) return null;
    setAsJson(false);
    return value;
  };

  return { lost, remaining, asJson, json, setJson, error, parse, backToForm };
}
