import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { Mode, StrategyListingPnl } from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { formatMoney, formatQty, parseScaled, plainDecimal } from '../../utils/format';

const UNIT = 1_000_000n;

interface AdjustPositionModalProps {
  strategyId: number;
  mode: Mode;
  position: StrategyListingPnl | null;
  onClose: () => void;
  onAdjusted: () => void;
}

// Sets what the strategy holds on a listing, recorded in the ledger as an adjustment by the signed-in operator: to
// correct a position under review, or book a settled market (set it flat). The registry refuses while a session holds
// the listing, since its OMS owns the position then.
export function AdjustPositionModal({ strategyId, mode, position, onClose, onAdjusted }: AdjustPositionModalProps) {
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!position) return;
    setQuantity(plainDecimal(position.netQuantity, 'size'));
    setPrice(plainDecimal(position.avgEntryPrice, 'price'));
    setReason('');
    setError(null);
  }, [position]);

  const net = parseScaled(quantity, 'size');
  const avg = parseScaled(price || '0', 'price');
  const valid = net !== null && avg !== null && avg >= 0n && reason.trim().length > 0;
  const totalCost = net !== null && avg !== null ? (avg * (net < 0n ? -net : net)) / UNIT : null;

  const save = async () => {
    if (!position || !valid || totalCost === null || net === null) return;
    setSaving(true);
    setError(null);
    try {
      await registryApi.adjustPosition({
        strategyId, listingId: position.listingId, mode,
        netQuantity: net.toString(), totalCost: net === 0n ? '0' : totalCost.toString(), reason: reason.trim(),
      });
      onAdjusted();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Adjustment failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={!!position} onClose={onClose} title={`Adjust position: ${position?.symbol ?? position?.listingId ?? ''}`} size="md">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Records an adjustment in the ledger, attributed to you, and clears any review flag. Only possible while no
          session of this strategy holds the listing. To book a settled market, set the quantity to 0.
        </Text>
        <Group grow>
          <TextInput label="Quantity" description="Signed: negative is short" value={quantity} onChange={e => setQuantity(e.currentTarget.value)}
            error={net === null && quantity !== '' ? 'Not a number' : undefined} />
          <TextInput label="Average price ($)" description="Per unit, in dollars" value={price} disabled={net === 0n}
            onChange={e => setPrice(e.currentTarget.value)} error={avg === null ? 'Not a price' : undefined} />
        </Group>
        <Textarea label="Reason" required autosize minRows={2} value={reason} onChange={e => setReason(e.currentTarget.value)} />
        {valid && totalCost !== null && (
          <Text size="sm">
            Sets {mode} position to <b>{formatQty(net, position?.lotSize, true)}</b>
            {net !== 0n && <> with a cost of <b>{formatMoney(totalCost, false).text}</b></>}.
          </Text>
        )}
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button color="orange" disabled={!valid} loading={saving} onClick={save}>Adjust</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
