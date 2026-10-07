import { useGlobalState } from '../context/GlobalStateContext';
import { isPredictionMarket } from '../utils/format';

// Prediction markets quote in cents, as their venues do.
export function useCents(exchangeId: number | null | undefined): boolean {
  const { exchanges } = useGlobalState();
  return isPredictionMarket(exchanges.find(e => e.exchangeId === exchangeId)?.exchangeCode);
}
