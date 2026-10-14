import { useCallback } from 'react';
import { useGlobalState } from '../context/GlobalStateContext';

export function useExchangeName(): (exchangeId: number) => string | undefined {
  const { exchanges } = useGlobalState();
  return useCallback((exchangeId: number) => exchanges.find(e => e.exchangeId === exchangeId)?.exchangeName, [exchanges]);
}
