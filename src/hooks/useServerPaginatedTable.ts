import { useCallback, useEffect, useRef, useState } from 'react';
import type { MRT_PaginationState, MRT_SortingState } from 'mantine-react-table';
import { PaginationParams } from '../types';

interface ControlledTableState {
  pagination: MRT_PaginationState;
  sorting: MRT_SortingState;
  globalFilter: string;
  setPagination: (updater: MRT_PaginationState | ((prev: MRT_PaginationState) => MRT_PaginationState)) => void;
  setSorting: (updater: MRT_SortingState | ((prev: MRT_SortingState) => MRT_SortingState)) => void;
  setGlobalFilter: (value: string) => void;
}

interface UseServerPaginatedTableOptions<T> {
  fetchFn: (params: PaginationParams) => Promise<T[]>;
  countFn: (params: PaginationParams) => Promise<number>;
  defaultPageSize?: number;
  extraParams?: Record<string, string | number | boolean>;
  externalRefreshKey?: number;
  controlledState?: ControlledTableState;
}

interface UseServerPaginatedTableResult<T> {
  data: T[];
  total: number;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  pagination: MRT_PaginationState;
  sorting: MRT_SortingState;
  globalFilter: string;
  setPagination: (updater: MRT_PaginationState | ((prev: MRT_PaginationState) => MRT_PaginationState)) => void;
  setSorting: (updater: MRT_SortingState | ((prev: MRT_SortingState) => MRT_SortingState)) => void;
  setGlobalFilter: (value: string) => void;
  refresh: () => void;
  silentRefresh: () => void;
}

export function useServerPaginatedTable<T>({
  fetchFn,
  countFn,
  defaultPageSize = 50,
  extraParams = {},
  externalRefreshKey,
  controlledState,
}: UseServerPaginatedTableOptions<T>): UseServerPaginatedTableResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Internal state — used when controlledState is not provided
  const [internalPagination, setInternalPagination] = useState<MRT_PaginationState>({ pageIndex: 0, pageSize: defaultPageSize });
  const [internalSorting, setInternalSorting] = useState<MRT_SortingState>([]);
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const silentRefreshRef = useRef(false);

  const pagination = controlledState?.pagination ?? internalPagination;
  const sorting = controlledState?.sorting ?? internalSorting;
  const globalFilter = controlledState?.globalFilter ?? internalGlobalFilter;
  const setPagination = controlledState?.setPagination ?? setInternalPagination;
  const setSorting = controlledState?.setSorting ?? setInternalSorting;
  const setGlobalFilter = controlledState?.setGlobalFilter ?? setInternalGlobalFilter;

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  const silentRefresh = useCallback(() => {
    silentRefreshRef.current = true;
    setRefreshKey(k => k + 1);
  }, []);

  // Stable serialization of extraParams so object identity doesn't cause spurious re-fetches
  const extraParamsKey = JSON.stringify(extraParams);

  useEffect(() => {
    const params: PaginationParams = {
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
      ...extraParams,
    };
    if (sorting.length > 0) {
      params.sortBy = sorting[0].id;
      params.sortOrder = sorting[0].desc ? 'desc' : 'asc';
    }
    if (globalFilter) {
      params.search = globalFilter;
    }

    const filterParams: PaginationParams = { ...extraParams };
    if (globalFilter) filterParams.search = globalFilter;

    if (!silentRefreshRef.current) {
      setIsLoading(true);
    }
    setError(null);

    // A slower response for an earlier page, sort or search must not overwrite the one the table now shows.
    let cancelled = false;
    Promise.all([fetchFn(params), countFn(filterParams)])
      .then(([rows, count]) => {
        if (cancelled) return;
        setData(rows);
        setTotal(count);
        setLastUpdated(new Date());
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load data'); })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
        silentRefreshRef.current = false;
      });
    return () => { cancelled = true; };
  }, [pagination.pageIndex, pagination.pageSize, sorting, globalFilter, refreshKey, externalRefreshKey, extraParamsKey]);

  return {
    data,
    total,
    isLoading,
    error,
    lastUpdated,
    pagination,
    sorting,
    globalFilter,
    setPagination,
    setSorting,
    setGlobalFilter,
    refresh,
    silentRefresh,
  };
}
