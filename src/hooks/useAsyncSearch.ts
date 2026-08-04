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
    registryApi.searchSecurities(debounced)
      .then((securities: Security[]) =>
        setOptions(securities.map(s => ({ value: String(s.securityId), label: s.symbol })))
      )
      .catch(() => setOptions([]))
      .finally(() => setIsLoading(false));
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
    registryApi.searchListings(debounced)
      .then((listings: DenormalizedListing[]) =>
        setOptions(listings.map(l => ({
          value: String(l.listingId),
          label: `${l.listingId} - ${l.exchangeName} - ${l.securitySymbol}`,
        })))
      )
      .catch(() => setOptions([]))
      .finally(() => setIsLoading(false));
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
    registryApi.listEventsPaginated({ search: debounced, limit: 20 })
      .then((events: Event[]) =>
        setOptions(events.map(e => ({ value: String(e.eventId), label: e.title })))
      )
      .catch(() => setOptions([]))
      .finally(() => setIsLoading(false));
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
    registryApi.searchCurrencies(debounced)
      .then((currencies: Currency[]) =>
        setOptions(currencies.map(c => ({ value: String(c.currencyId), label: c.symbol })))
      )
      .catch(() => setOptions([]))
      .finally(() => setIsLoading(false));
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
    Promise.all(unique.map(id =>
      registryApi.listListingsPaginated({ listingId: id, limit: 1 })
        .then((rows: DenormalizedListing[]) => rows[0])
    )).then(results => {
      const map: Record<number, string> = {};
      results.forEach(l => {
        if (l) map[l.listingId] = `${l.listingId} - ${l.exchangeName} - ${l.securitySymbol}`;
      });
      setLabels(map);
    }).catch(() => {});
  }, [listingIds.join(',')]);

  return labels;
}
