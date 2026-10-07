import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Modal, SegmentedControl, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { Mode, StrategyListingPnl } from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { formatMoney, formatPrice, formatQty, parseScaled, plainDecimal } from '../../utils/format';
import { applyTrade } from '../../utils/position';

const UNIT = 1_000_000n;

type Kind = 'trade' | 'correction';

interface AdjustPositionModalProps {
  strategyId: number;
  mode: Mode;
  position: StrategyListingPnl | null;
  onClose: () => void;
  onAdjusted: () => void;
}

// Changes what the strategy holds on a listing outside any session, attributed to the signed-in operator. Refused
// while a session holds the listing, since its OMS owns the position then.
//   Book a trade      one made by hand (e.g. closing on the venue's own site): realizes PnL like any fill
//   Correct position  sets the position outright for a ledger that was wrong; realizes nothing, so whatever
//                     unrealized PnL it removes is written off
export function AdjustPositionModal({ strategyId, mode, position, onClose, onAdjusted }: AdjustPositionModalProps) {
  const [kind, setKind] = useState<Kind>('trade');
  const [side, setSide] = useState<'0' | '1'>('1');
  const [tradeQty, setTradeQty] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [fee, setFee] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filled in when the dialog opens for a listing, and only then: the position it's given is re-read every few
  // seconds, and refilling on each read would wipe what's being typed. A trade starts as the one that closes it.
  const openFor = position?.listingId ?? null;
  const latest = useRef(position);
  latest.current = position;
  useEffect(() => {
    const opened = latest.current;
    if (!opened) return;
    const net = BigInt(opened.netQuantity);
    setKind('trade');
    setSide(net < 0n ? '0' : '1');
    setTradeQty(net === 0n ? '' : plainDecimal(net < 0n ? -net : net, 'size'));
    setTradePrice('');
    setFee('');
    setQuantity(plainDecimal(opened.netQuantity, 'size'));
    setPrice(plainDecimal(opened.avgEntryPrice, 'price'));
    setReason('');
    setError(null);
  }, [openFor]);

  const held = position ? BigInt(position.netQuantity) : 0n;
  const heldCost = position ? (BigInt(position.avgEntryPrice) * (held < 0n ? -held : held)) / UNIT : 0n;
  const money = (v: bigint) => formatMoney(v, false).text;

  // A trade: what it would leave and realize, exactly as the registry will book it.
  const qty = parseScaled(tradeQty, 'size');
  const at = parseScaled(tradePrice, 'price');
  const feeValue = parseScaled(fee || '0', 'price');
  const trade = qty !== null && qty > 0n && at !== null && at >= 0n && feeValue !== null && feeValue >= 0n
    ? applyTrade({ netQuantity: held, totalCost: heldCost }, side === '0' ? 0 : 1, qty, at)
    : null;

  // A correction: the position set outright.
  const net = parseScaled(quantity, 'size');
  const avg = net === 0n ? 0n : parseScaled(price || '0', 'price');
  const totalCost = net !== null && avg !== null && avg >= 0n ? (avg * (net < 0n ? -net : net)) / UNIT : null;

  const missing = kind === 'trade'
    ? (qty === null || qty <= 0n ? 'Enter the quantity traded' : at === null ? 'Enter the price it traded at'
      : feeValue === null || feeValue < 0n ? 'The fee must be a positive amount' : null)
    : (net === null ? 'Enter the quantity' : totalCost === null ? 'Enter a valid average price' : null);
  const blocker = missing ?? (reason.trim().length === 0 ? 'Add a reason' : null);

  const save = async () => {
    if (!position || blocker) return;
    setSaving(true);
    setError(null);
    try {
      const target = { strategyId, listingId: position.listingId, mode, reason: reason.trim() };
      await registryApi.adjustPosition(kind === 'trade'
        ? { ...target, trade: { side: side === '0' ? 0 : 1, qty: String(qty), price: String(at), fee: String(feeValue) } }
        : { ...target, netQuantity: String(net), totalCost: String(totalCost) });
      onAdjusted();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Adjustment failed'));
    } finally {
      setSaving(false);
    }
  };

  const lot = position?.lotSize;
  const tick = { tickSize: position?.tickSize };
  return (
    <Modal opened={!!position} onClose={onClose} title={`Adjust position: ${position?.symbol ?? position?.listingId ?? ''}`} size="md">
      <Stack gap="sm">
        <Text size="sm">
          Holds <b>{formatQty(held, lot, true)}</b>
          {held !== 0n && <> at <b>{formatPrice(position?.avgEntryPrice ?? '0', tick)}</b> (mark {formatPrice(position?.markPrice ?? '0', tick)})</>}
          {' '}in {mode}.
        </Text>
        <SegmentedControl fullWidth value={kind} onChange={v => setKind(v as Kind)}
          data={[{ value: 'trade', label: 'Book a trade' }, { value: 'correction', label: 'Correct position' }]} />

        {kind === 'trade' ? (
          <>
            <Text size="xs" c="dimmed">
              For a trade made outside any session, e.g. closing the position by hand on the venue. It realizes PnL
              against the average entry, like any fill. Book each fill separately if prices differ.
            </Text>
            <SegmentedControl value={side} onChange={v => setSide(v as '0' | '1')}
              data={[{ value: '0', label: 'Bought' }, { value: '1', label: 'Sold' }]} />
            <Group grow align="flex-start">
              <TextInput label="Quantity" value={tradeQty} onChange={e => setTradeQty(e.currentTarget.value)}
                error={tradeQty !== '' && (qty === null || qty <= 0n) ? 'A positive number' : undefined} />
              <TextInput label="Price ($)" placeholder={plainDecimal(position?.markPrice ?? '0', 'price')} value={tradePrice}
                onChange={e => setTradePrice(e.currentTarget.value)} error={tradePrice !== '' && at === null ? 'Not a price' : undefined} />
              <TextInput label="Fee ($)" placeholder="0" value={fee} onChange={e => setFee(e.currentTarget.value)}
                error={feeValue === null || feeValue < 0n ? 'Not an amount' : undefined} />
            </Group>
            {trade && (
              <Text size="sm">
                Leaves <b>{formatQty(trade.netQuantity, lot, true)}</b>
                {trade.netQuantity !== 0n && <> at {formatPrice((trade.totalCost * UNIT) / (trade.netQuantity < 0n ? -trade.netQuantity : trade.netQuantity), tick)}</>}
                ; realizes <Text span fw={700} c={trade.realized < 0n ? 'red' : trade.realized > 0n ? 'teal' : undefined}>
                  {formatMoney(trade.realized).text}</Text>
                {feeValue !== null && feeValue > 0n && <> less {money(feeValue)} fee</>}.
              </Text>
            )}
          </>
        ) : (
          <>
            <Text size="xs" c="dimmed">
              Sets the position outright, for when the ledger is wrong. It realizes nothing: any unrealized PnL on
              what it removes is written off. To close a position you actually traded out of, book a trade instead.
            </Text>
            <Group grow align="flex-start">
              <TextInput label="Quantity" description="Signed: negative is short" value={quantity} onChange={e => setQuantity(e.currentTarget.value)}
                error={net === null && quantity !== '' ? 'Not a number' : undefined} />
              <TextInput label="Average price ($)" description="Per unit, in dollars" value={net === 0n ? '' : price} disabled={net === 0n}
                onChange={e => setPrice(e.currentTarget.value)} error={net !== 0n && avg === null ? 'Not a price' : undefined} />
            </Group>
            {net !== null && totalCost !== null && (
              <Text size="sm">
                Sets the position to <b>{formatQty(net, lot, true)}</b>
                {net !== 0n && <> with a cost of <b>{money(totalCost)}</b></>}.
              </Text>
            )}
          </>
        )}

        <Textarea label="Reason" required autosize minRows={2} value={reason} onChange={e => setReason(e.currentTarget.value)} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          {blocker && <Text size="xs" c="dimmed">{blocker}</Text>}
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button color="orange" disabled={!!blocker} loading={saving} onClick={save}>
            {kind === 'trade' ? 'Book trade' : 'Correct'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
