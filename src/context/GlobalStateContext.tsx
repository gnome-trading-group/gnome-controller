import React, { createContext, useContext, useState, useEffect } from 'react';
import { registryApi } from '../utils/api';
import { Currency, Exchange, Listing, Security } from '../types';

interface ErrorState {
  securities: string | null;
  exchanges: string | null;
  listings: string | null;
  currencies: string | null;
}

interface GlobalState {
  securities: Security[];
  exchanges: Exchange[];
  listings: Listing[];
  currencies: Currency[];
  loading: {
    securities: boolean;
    exchanges: boolean;
    listings: boolean;
    currencies: boolean;
  };
  error: ErrorState;
  refreshSecurities: () => Promise<void>;
  refreshExchanges: () => Promise<void>;
  refreshListings: () => Promise<void>;
  refreshCurrencies: () => Promise<void>;
}

const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

export function GlobalStateProvider({ children }: { children: React.ReactNode }) {
  const [securities, setSecurities] = useState<Security[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState({
    securities: false,
    exchanges: false,
    listings: false,
    currencies: false,
  });
  const [error, setError] = useState<ErrorState>({
    securities: null,
    exchanges: null,
    listings: null,
    currencies: null,
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

  const refreshCurrencies = async () => {
    setLoading(prev => ({ ...prev, currencies: true }));
    setError(prev => ({ ...prev, currencies: null }));
    try {
      const response = await registryApi.listCurrencies();
      setCurrencies(response);
    } catch (err) {
      setError(prev => ({ ...prev, currencies: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setLoading(prev => ({ ...prev, currencies: false }));
    }
  };

  useEffect(() => {
    refreshSecurities();
    refreshExchanges();
    refreshListings();
    refreshCurrencies();
  }, []);

  const value = {
    securities,
    exchanges,
    listings,
    currencies,
    loading,
    error,
    refreshSecurities,
    refreshExchanges,
    refreshListings,
    refreshCurrencies,
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
