import { useEffect, useRef, useState } from 'react';
import { DenormalizedListing, Event, Security, Currency } from '../types';
import { registryApi } from '../utils/api';

interface SearchOption {
  value: string;
  label: string;
}

interface UseAsyncSearchResult {
  options: SearchOption[];
  isLoading: boolean;
}

// Keeps each batch lookup's query string well under URL length limits.
const ID_BATCH_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useSecuritySearch(search: string): UseAsyncSearchResult {
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounced = useDebounced(search, 300);

  useEffect(() => {
    if (!debounced) {
      setOptions([]);
      return;
    }
    setIsLoading(true);
    let cancelled = false;
    registryApi.searchSecurities(debounced)
      .then((securities: Security[]) => {
        if (!cancelled) setOptions(securities.map(s => ({ value: String(s.securityId), label: s.symbol })));
      })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  return { options, isLoading };
}

export function useListingSearch(search: string): UseAsyncSearchResult {
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounced = useDebounced(search, 300);

  useEffect(() => {
    if (!debounced) {
      setOptions([]);
      return;
    }
    setIsLoading(true);
    let cancelled = false;
    registryApi.searchListings(debounced)
      .then((listings: DenormalizedListing[]) => {
        if (cancelled) return;
        setOptions(listings.map(l => ({
          value: String(l.listingId),
          label: `${l.listingId} - ${l.exchangeName} - ${l.securitySymbol}`,
        })));
      })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  return { options, isLoading };
}

export function useEventSearch(search: string): UseAsyncSearchResult {
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounced = useDebounced(search, 300);

  useEffect(() => {
    if (!debounced) {
      setOptions([]);
      return;
    }
    setIsLoading(true);
    let cancelled = false;
    registryApi.listEventsPaginated({ search: debounced, limit: 20 })
      .then((events: Event[]) => {
        if (!cancelled) setOptions(events.map(e => ({ value: String(e.eventId), label: e.title })));
      })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  return { options, isLoading };
}

export function useCurrencySearch(search: string): UseAsyncSearchResult {
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounced = useDebounced(search, 300);

  useEffect(() => {
    if (!debounced) {
      setOptions([]);
      return;
    }
    setIsLoading(true);
    let cancelled = false;
    registryApi.searchCurrencies(debounced)
      .then((currencies: Currency[]) => {
        if (!cancelled) setOptions(currencies.map(c => ({ value: String(c.currencyId), label: c.symbol })));
      })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  return { options, isLoading };
}

export function useListingLabels(listingIds: number[]): Record<number, string> {
  const [labels, setLabels] = useState<Record<number, string>>({});
  const prevIds = useRef<string>('');

  useEffect(() => {
    if (listingIds.length === 0) return;
    const key = [...listingIds].sort().join(',');
    if (key === prevIds.current) return;
    prevIds.current = key;

    const unique = [...new Set(listingIds)];
    let cancelled = false;
    // allSettled: one failed batch should cost those listings their labels, not every listing.
    Promise.allSettled(chunk(unique, ID_BATCH_SIZE).map(ids => registryApi.listListingsByIds(ids))).then(batches => {
      if (cancelled) return;
      const results = batches.flatMap(b => (b.status === 'fulfilled' ? b.value : []));
      const map: Record<number, string> = {};
      results.forEach(l => {
        map[l.listingId] = `${l.listingId} - ${l.exchangeName} - ${l.securitySymbol}`;
      });
      setLabels(map);
    });
    // Forget the key on cancel so the same ids load again (React re-runs effects after cleanup in StrictMode).
    return () => { cancelled = true; prevIds.current = ''; };
  }, [listingIds.join(',')]);

  return labels;
}

export function useListingDetails(listingIds: number[]): Record<number, DenormalizedListing> {
  const [details, setDetails] = useState<Record<number, DenormalizedListing>>({});
  const prevIds = useRef<string>('');

  useEffect(() => {
    if (listingIds.length === 0) return;
    const key = [...listingIds].sort().join(',');
    if (key === prevIds.current) return;
    prevIds.current = key;

    const unique = [...new Set(listingIds)];
    let cancelled = false;
    // allSettled: one failed batch should cost those listings their labels, not every listing.
    Promise.allSettled(chunk(unique, ID_BATCH_SIZE).map(ids => registryApi.listListingsByIds(ids))).then(batches => {
      if (cancelled) return;
      const results = batches.flatMap(b => (b.status === 'fulfilled' ? b.value : []));
      const map: Record<number, DenormalizedListing> = {};
      results.forEach(l => {
        map[l.listingId] = l;
      });
      setDetails(map);
    });
    // Forget the key on cancel so the same ids load again (React re-runs effects after cleanup in StrictMode).
    return () => { cancelled = true; prevIds.current = ''; };
  }, [listingIds.join(',')]);

  return details;
}
