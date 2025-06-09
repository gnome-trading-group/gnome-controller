import React, { createContext, useContext, useState, useEffect } from 'react';
import { registryApi } from '../utils/api';

export interface Security {
  securityId: number;
  symbol: string;
  type: number;
  description?: string;
  dateCreated: string;
  dateModified: string;
}

export interface Exchange {
  exchangeId: number;
  exchangeName: string;
  dateCreated: string;
  dateModified: string;
}

export interface Listing {
  listingId: number;
  exchangeId: number;
  securityId: number;
  exchangeSecurityId: string;
  exchangeSecuritySymbol: string;
  dateCreated: string;
  dateModified: string;
}

interface ErrorState {
  securities: string | null;
  exchanges: string | null;
  listings: string | null;
}

interface GlobalState {
  securities: Security[];
  exchanges: Exchange[];
  listings: Listing[];
  loading: {
    securities: boolean;
    exchanges: boolean;
    listings: boolean;
  };
  error: ErrorState;
  refreshSecurities: () => Promise<void>;
  refreshExchanges: () => Promise<void>;
  refreshListings: () => Promise<void>;
}

const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

export function GlobalStateProvider({ children }: { children: React.ReactNode }) {
  const [securities, setSecurities] = useState<Security[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState({
    securities: false,
    exchanges: false,
    listings: false,
  });
  const [error, setError] = useState<ErrorState>({
    securities: null,
    exchanges: null,
    listings: null,
  });

  const refreshSecurities = async () => {
    setLoading(prev => ({ ...prev, securities: true }));
    setError(prev => ({ ...prev, securities: null }));
    try {
      const response = await registryApi.listSecurities();
      setSecurities(response);
    } catch (err) {
      setError(prev => ({ ...prev, securities: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setLoading(prev => ({ ...prev, securities: false }));
    }
  };

  const refreshExchanges = async () => {
    setLoading(prev => ({ ...prev, exchanges: true }));
    setError(prev => ({ ...prev, exchanges: null }));
    try {
      const response = await registryApi.listExchanges();
      setExchanges(response);
    } catch (err) {
      setError(prev => ({ ...prev, exchanges: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setLoading(prev => ({ ...prev, exchanges: false }));
    }
  };

  const refreshListings = async () => {
    setLoading(prev => ({ ...prev, listings: true }));
    setError(prev => ({ ...prev, listings: null }));
    try {
      const response = await registryApi.listListings();
      setListings(response);
    } catch (err) {
      setError(prev => ({ ...prev, listings: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setLoading(prev => ({ ...prev, listings: false }));
    }
  };

  // Initial data fetch
  useEffect(() => {
    refreshSecurities();
    refreshExchanges();
    refreshListings();
  }, []);

  const value = {
    securities,
    exchanges,
    listings,
    loading,
    error,
    refreshSecurities,
    refreshExchanges,
    refreshListings,
  };

  return (
    <GlobalStateContext.Provider value={value}>
      {children}
    </GlobalStateContext.Provider>
  );
}

export function useGlobalState() {
  const context = useContext(GlobalStateContext);
  if (context === undefined) {
    throw new Error('useGlobalState must be used within a GlobalStateProvider');
  }
  return context;
} 