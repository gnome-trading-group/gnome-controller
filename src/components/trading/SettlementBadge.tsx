import { Badge, Tooltip } from '@mantine/core';
import { useCents } from '../../hooks/useCents';
import { formatSettlement, formatTime, settlementState, SettlementState } from '../../utils/format';
import { usePreferences } from '../../context/PreferencesContext';

export const SETTLEMENT_COLORS: Record<SettlementState, string> = { full: 'green', none: 'red', partial: 'yellow' };

interface SettlementBadgeProps {
  settlementPrice: string | null | undefined;
  settledAt: string | null | undefined;
  exchangeId: number | null | undefined;
}

// What a settled outcome paid, coloured by whether it paid in full, nothing, or part; nothing while unsettled.
export function SettlementBadge({ settlementPrice, settledAt, exchangeId }: SettlementBadgeProps) {
  const cents = useCents(exchangeId);
  const { timeZone } = usePreferences();
  const state = settlementState(settlementPrice);
  if (state === null) return null;
  return (
    <Tooltip label={settledAt ? `Recorded ${formatTime(settledAt, timeZone, 'second')}` : 'Settled'} withArrow openDelay={300}>
      <Badge color={SETTLEMENT_COLORS[state]} variant="light" size="sm">
        Settled · {formatSettlement(settlementPrice, cents)}
      </Badge>
    </Tooltip>
  );
}
