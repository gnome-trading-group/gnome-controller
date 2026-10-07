import { Anchor, Text, TextProps, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { useCents } from '../../hooks/useCents';
import { usePreferences } from '../../context/PreferencesContext';
import { formatMoney, formatPrice, formatQty, formatTime, NUMERIC, PriceFormat, Scaled } from '../../utils/format';

interface MoneyProps extends TextProps {
  value: Scaled;
  // PnL is signed and coloured; fees and costs are not.
  pnl?: boolean;
  arrow?: boolean;
}

export function Money({ value, pnl = true, arrow = false, ...text }: MoneyProps) {
  const money = formatMoney(value, pnl);
  const color = !pnl || money.sign === 0 ? undefined : money.sign > 0 ? 'teal' : 'red';
  const glyph = arrow && pnl && money.sign !== 0 ? (money.sign > 0 ? '▲ ' : '▼ ') : '';
  return (
    <Tooltip label={money.exact} disabled={money.exact === money.text} openDelay={400} withArrow>
      <Text span c={color} style={NUMERIC} {...text}>{glyph}{money.text}</Text>
    </Tooltip>
  );
}

interface PriceProps extends TextProps, Omit<PriceFormat, 'cents'> {
  value: Scaled;
  exchangeId: number | null | undefined;
}

export function Price({ value, exchangeId, tickSize, derived, ...text }: PriceProps) {
  const cents = useCents(exchangeId);
  return <Text span style={NUMERIC} {...text}>{formatPrice(value, { tickSize, cents, derived })}</Text>;
}

interface QtyProps extends TextProps {
  value: Scaled;
  lotSize: string | null | undefined;
  signed?: boolean;
}

export function Qty({ value, lotSize, signed, ...text }: QtyProps) {
  return <Text span style={NUMERIC} {...text}>{formatQty(value, lotSize, signed)}</Text>;
}

interface TimeProps extends TextProps {
  value: string | number | null | undefined;
  precision?: 'minute' | 'second' | 'ms';
}

// In the viewer's chosen zone, with the other zone and how long ago on hover.
export function Time({ value, precision = 'second', ...text }: TimeProps) {
  const { timeZone } = usePreferences();
  if (value === null || value === undefined) return <Text span c="dimmed" {...text}>—</Text>;
  const other = timeZone === 'UTC' ? 'local' : 'UTC';
  return (
    <Tooltip
      openDelay={400}
      withArrow
      label={<>{formatTime(value, other, precision)} · <ReactTimeAgo date={new Date(value)} timeStyle="round" /></>}
    >
      <Text span style={NUMERIC} {...text}>{formatTime(value, timeZone, precision)}</Text>
    </Tooltip>
  );
}

export function ListingLabel({ listingId, symbol }: { listingId: number; symbol: string | null | undefined }) {
  return (
    <Tooltip label={`Listing ${listingId}`} openDelay={400} withArrow>
      <Anchor component={Link} to={`/security-master/listings/${listingId}`} size="sm" onClick={e => e.stopPropagation()}>
        {symbol ?? listingId}
      </Anchor>
    </Tooltip>
  );
}

export function SideLabel({ side }: { side: 0 | 1 | null }) {
  if (side === null) return <Text span c="dimmed">—</Text>;
  return <Text span fw={600} c={side === 0 ? 'teal' : 'red'}>{side === 0 ? 'Buy' : 'Sell'}</Text>;
}
