import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../utils/api';

// One cache for every page, so a strategy list or the risk policies are fetched once, not by each component. Polling
// pauses in a hidden tab; a request the API refused (4xx) is not retried.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      refetchIntervalInBackground: false,
      retry: (failures, error) =>
        !(error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) && failures < 2,
    },
  },
});
