import React, { createContext, useContext, useState, useEffect } from 'react';
import { registryApi } from '../utils/api';
import { Exchange, Listing, ListingSpec, Security } from '../types';

interface ErrorState {
  securities: string | null;
  exchanges: string | null;
  listings: string | null;
  listingSpecs: string | null;
}

interface GlobalState {
  securities: Security[];
  exchanges: Exchange[];
  listings: Listing[];
  listingSpecs: ListingSpec[];
  loading: {
    securities: boolean;
    exchanges: boolean;
    listings: boolean;
    listingSpecs: boolean;
  };
  error: ErrorState;
  refreshSecurities: () => Promise<void>;
  refreshExchanges: () => Promise<void>;
  refreshListings: () => Promise<void>;
  refreshListingSpecs: () => Promise<void>;
}

const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

export function GlobalStateProvider({ children }: { children: React.ReactNode }) {
  const [securities, setSecurities] = useState<Security[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingSpecs, setListingSpecs] = useState<ListingSpec[]>([]);
  const [loading, setLoading] = useState({
    securities: false,
    exchanges: false,
    listings: false,
    listingSpecs: false,
  });
  const [error, setError] = useState<ErrorState>({
    securities: null,
    exchanges: null,
    listings: null,
    listingSpecs: null,
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

  const refreshListingSpecs = async () => {
    setLoading(prev => ({ ...prev, listingSpecs: true }));
    setError(prev => ({ ...prev, listingSpecs: null }));
    try {
      const response = await registryApi.listListingSpecs();
      setListingSpecs(response);
    } catch (err) {
      setError(prev => ({ ...prev, listingSpecs: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setLoading(prev => ({ ...prev, listingSpecs: false }));
    }
  };

  // Initial data fetch
  useEffect(() => {
    refreshSecurities();
    refreshExchanges();
    refreshListings();
    refreshListingSpecs();
  }, []);

  const value = {
    securities,
    exchanges,
    listings,
    listingSpecs,
    loading,
    error,
    refreshSecurities,
    refreshExchanges,
    refreshListings,
    refreshListingSpecs,
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