import React, { createContext, useContext, useState, useEffect } from 'react';
import { registryApi } from '../utils/api';
import { Exchange } from '../types';

interface GlobalState {
  exchanges: Exchange[];
  securitySymbols: Record<number, string>;
  loading: { exchanges: boolean; securitySymbols: boolean };
  error: { exchanges: string | null; securitySymbols: string | null };
  refreshExchanges: () => Promise<void>;
  refreshSecuritySymbols: () => Promise<void>;
}

const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

export function GlobalStateProvider({ children }: { children: React.ReactNode }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [securitySymbols, setSecuritySymbols] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState({ exchanges: false, securitySymbols: false });
  const [error, setError] = useState<{ exchanges: string | null; securitySymbols: string | null }>({
    exchanges: null,
    securitySymbols: null,
  });

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

  const refreshSecuritySymbols = async () => {
    setLoading(prev => ({ ...prev, securitySymbols: true }));
    setError(prev => ({ ...prev, securitySymbols: null }));
    try {
      const map = await registryApi.listSecuritySymbols();
      setSecuritySymbols(map);
    } catch (err) {
      setError(prev => ({ ...prev, securitySymbols: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setLoading(prev => ({ ...prev, securitySymbols: false }));
    }
  };

  useEffect(() => {
    refreshExchanges();
    refreshSecuritySymbols();
  }, []);

  return (
    <GlobalStateContext.Provider value={{ exchanges, securitySymbols, loading, error, refreshExchanges, refreshSecuritySymbols }}>
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
