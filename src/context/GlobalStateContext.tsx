import React, { createContext, useContext, useState, useEffect } from 'react';
import { registryApi } from '../utils/api';
import { Exchange } from '../types';

interface GlobalState {
  exchanges: Exchange[];
  loading: { exchanges: boolean };
  error: { exchanges: string | null };
  refreshExchanges: () => Promise<void>;
}

const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

export function GlobalStateProvider({ children }: { children: React.ReactNode }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState({ exchanges: false });
  const [error, setError] = useState<{ exchanges: string | null }>({ exchanges: null });

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

  useEffect(() => {
    refreshExchanges();
  }, []);

  return (
    <GlobalStateContext.Provider value={{ exchanges, loading, error, refreshExchanges }}>
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
