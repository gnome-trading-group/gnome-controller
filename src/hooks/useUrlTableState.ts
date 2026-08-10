import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MRT_PaginationState, MRT_SortingState } from 'mantine-react-table';

interface UseUrlTableStateOptions {
  defaultPageSize?: number;
  defaultSort?: { id: string; desc: boolean };
}

interface UseUrlTableStateResult {
  pagination: MRT_PaginationState;
  sorting: MRT_SortingState;
  globalFilter: string;
  setPagination: (updater: MRT_PaginationState | ((prev: MRT_PaginationState) => MRT_PaginationState)) => void;
  setSorting: (updater: MRT_SortingState | ((prev: MRT_SortingState) => MRT_SortingState)) => void;
  setGlobalFilter: (value: string) => void;
  getParam: (key: string) => string;
  setParam: (key: string, value: string) => void;
}

export function useUrlTableState({
  defaultPageSize = 50,
  defaultSort,
}: UseUrlTableStateOptions = {}): UseUrlTableStateResult {
  const [searchParams, setSearchParams] = useSearchParams();

  // Extract primitives so memoized values below don't depend on the options object reference
  const defaultSortId = defaultSort?.id;
  const defaultSortDesc = defaultSort?.desc;

  const pageIndex = parseInt(searchParams.get('page') ?? '0') || 0;
  const pageSize = parseInt(searchParams.get('pageSize') ?? String(defaultPageSize)) || defaultPageSize;

  // Memoized so the object reference is stable — prevents useServerPaginatedTable's
  // effect from firing on every render due to a new array/object identity each time.
  const pagination = useMemo<MRT_PaginationState>(
    () => ({ pageIndex, pageSize }),
    [pageIndex, pageSize],
  );

  const sortParam = searchParams.get('sort');
  const sortDir = searchParams.get('sortDir');
  const sorting = useMemo<MRT_SortingState>(() => {
    if (sortParam) return [{ id: sortParam, desc: sortDir !== 'asc' }];
    if (defaultSortId) return [{ id: defaultSortId, desc: defaultSortDesc ?? false }];
    return [];
  }, [sortParam, sortDir, defaultSortId, defaultSortDesc]);

  const globalFilter = searchParams.get('search') ?? '';

  const setPagination = useCallback(
    (updater: MRT_PaginationState | ((prev: MRT_PaginationState) => MRT_PaginationState)) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        const current: MRT_PaginationState = {
          pageIndex: parseInt(next.get('page') ?? '0') || 0,
          pageSize: parseInt(next.get('pageSize') ?? String(defaultPageSize)) || defaultPageSize,
        };
        const resolved = typeof updater === 'function' ? updater(current) : updater;
        if (resolved.pageIndex > 0) next.set('page', String(resolved.pageIndex));
        else next.delete('page');
        if (resolved.pageSize !== defaultPageSize) next.set('pageSize', String(resolved.pageSize));
        else next.delete('pageSize');
        return next;
      }, { replace: true });
    },
    [setSearchParams, defaultPageSize],
  );

  const setSorting = useCallback(
    (updater: MRT_SortingState | ((prev: MRT_SortingState) => MRT_SortingState)) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        const currentSort = next.get('sort');
        const currentDir = next.get('sortDir');
        const currentSorting: MRT_SortingState = currentSort
          ? [{ id: currentSort, desc: currentDir !== 'asc' }]
          : defaultSortId ? [{ id: defaultSortId, desc: defaultSortDesc ?? false }] : [];
        const resolved = typeof updater === 'function' ? updater(currentSorting) : updater;
        if (resolved.length > 0) {
          const isDefault = defaultSortId && resolved[0].id === defaultSortId && resolved[0].desc === defaultSortDesc;
          if (isDefault) {
            next.delete('sort');
            next.delete('sortDir');
          } else {
            next.set('sort', resolved[0].id);
            next.set('sortDir', resolved[0].desc ? 'desc' : 'asc');
          }
        } else {
          next.delete('sort');
          next.delete('sortDir');
        }
        next.delete('page');
        return next;
      }, { replace: true });
    },
    [setSearchParams, defaultSortId, defaultSortDesc],
  );

  const setGlobalFilter = useCallback(
    (value: string) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (value) next.set('search', value);
        else next.delete('search');
        next.delete('page');
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const getParam = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams]);

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete('page');
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  return { pagination, sorting, globalFilter, setPagination, setSorting, setGlobalFilter, getParam, setParam };
}
