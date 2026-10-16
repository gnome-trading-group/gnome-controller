import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon, Alert, Button, Checkbox, Divider, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useGlobalState } from '../../context/GlobalStateContext';
import {
  FeeComponent, FeeDefinition, FeeKind, FeeRoundingMode, FeeRoundingScope, FeeScheduleRow, FeeScope,
} from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { describeFeeDefinition, FEE_SCOPE_LABELS, feeScope, feeTarget } from '../../utils/fees';

const KIND_OPTIONS = [
  { value: 'PRICE_CURVE', label: 'rate × p(1−p) (binary contracts)' },
  { value: 'NOTIONAL', label: 'share of notional' },
  { value: 'PER_UNIT', label: 'dollars per contract' },
];
const SIDE_OPTIONS = [{ value: 'BOTH', label: 'Both sides' }, { value: 'BUY', label: 'Buys only' }, { value: 'SELL', label: 'Sells only' }];
const MODE_OPTIONS = [
  { value: 'NONE', label: 'Not rounded' }, { value: 'CEIL', label: 'Up' }, { value: 'HALF_UP', label: 'Half up' },
  { value: 'HALF_EVEN', label: 'Half to even' },
];
const ROUNDING_SCOPE_OPTIONS = [
  { value: 'FILL', label: 'Each fill' },
  { value: 'ORDER_ACCUMULATOR', label: "Carried across an order's fills (Kalshi)" },
];

interface ComponentForm {
  kind: FeeKind;
  taker: number | string;
  maker: number | string;
  exponent: number | string;
  side: 'BOTH' | 'BUY' | 'SELL';
}

const emptyComponent = (): ComponentForm => ({ kind: 'PRICE_CURVE', taker: '', maker: 0, exponent: 1, side: 'BOTH' });

interface AddFeeScheduleModalProps {
  opened: boolean;
  // The stored rows, so a correction can pick the row it replaces and take its effective time.
  rows: FeeScheduleRow[];
  onClose: () => void;
  onSaved: () => void;
}

// Schedules are never edited: a venue change is a new row from when it happened, and a fix is a row with the same
// target and effective time as the row it corrects, which replaces it for all time.
export function AddFeeScheduleModal({ opened, rows, onClose, onSaved }: AddFeeScheduleModalProps) {
  const { exchanges } = useGlobalState();
  const [exchangeId, setExchangeId] = useState<string | null>(null);
  const [scope, setScope] = useState<FeeScope>('EXCHANGE');
  const [target, setTarget] = useState('');
  const [kind, setKind] = useState<'change' | 'correction'>('change');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [corrects, setCorrects] = useState<string | null>(null);
  const [clear, setClear] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [components, setComponents] = useState<ComponentForm[]>([emptyComponent()]);
  const [mode, setMode] = useState<FeeRoundingMode>('NONE');
  const [increment, setIncrement] = useState<number | string>(0.01);
  const [roundingScope, setRoundingScope] = useState<FeeRoundingScope>('FILL');
  const [sourceRef, setSourceRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setExchangeId(null);
    setScope('EXCHANGE');
    setTarget('');
    setKind('change');
    setEffectiveFrom(new Date().toISOString().slice(0, 19) + 'Z');
    setCorrects(null);
    setClear(false);
    setCurrency('USD');
    setComponents([emptyComponent()]);
    setMode('NONE');
    setIncrement(0.01);
    setRoundingScope('FILL');
    setSourceRef('');
    setError(null);
  }, [opened]);

  // The rows a correction can replace: those of the chosen exchange and target.
  const correctable = useMemo(() => rows.filter((r) => String(r.exchangeId) === exchangeId && feeScope(r) === scope
    && (scope === 'EXCHANGE' || feeTarget(r) === (scope === 'LISTING' ? `listing ${target}` : target.trim()))),
  [rows, exchangeId, scope, target]);
  const corrected = correctable.find((r) => r.feeScheduleId === corrects);

  const definition: FeeDefinition | null = clear ? null : {
    currency: currency.trim(),
    components: components.map((c): FeeComponent => ({
      kind: c.kind, taker: Number(c.taker), maker: Number(c.maker),
      ...(c.kind === 'PRICE_CURVE' && Number(c.exponent) !== 1 ? { exponent: Number(c.exponent) } : {}),
      ...(c.side !== 'BOTH' ? { side: c.side } : {}),
    })),
    rounding: mode === 'NONE' ? { mode } : { mode, increment: Number(increment), scope: roundingScope },
  };

  const blocker = !exchangeId ? 'Pick the exchange'
    : scope !== 'EXCHANGE' && target.trim() === '' ? `Enter the ${FEE_SCOPE_LABELS[scope].toLowerCase()}`
    : scope === 'LISTING' && !/^\d+$/.test(target.trim()) ? 'A listing is its numeric id'
    : kind === 'correction' && !corrected ? 'Pick the row this corrects'
    : kind === 'change' && Number.isNaN(Date.parse(effectiveFrom)) ? 'Effective from must be an ISO-8601 time'
    : !clear && components.some((c) => c.taker === '' || c.maker === '' || Number.isNaN(Number(c.taker))
      || Number.isNaN(Number(c.maker))) ? 'Every component needs a taker and maker rate'
    : !clear && mode !== 'NONE' && !(Number(increment) > 0) ? 'Rounding needs a positive increment'
    : !clear && mode !== 'NONE' && mode !== 'CEIL' && roundingScope === 'ORDER_ACCUMULATOR'
      ? 'Carrying rounding across an order only rounds up'
    : null;

  const save = async () => {
    if (blocker) return;
    setSaving(true);
    setError(null);
    try {
      const listingTarget = scope === 'LISTING';
      await registryApi.createFeeSchedule({
        ...(listingTarget ? { listingId: Number(target.trim()) } : { exchangeId: Number(exchangeId) }),
        ...(scope === 'FEE_GROUP' ? { feeGroup: target.trim() } : {}),
        ...(scope === 'FEE_EVENT' ? { feeEvent: target.trim() } : {}),
        effectiveFrom: kind === 'correction' ? corrected!.effectiveFrom : new Date(effectiveFrom).toISOString(),
        definition,
        source: 'MANUAL',
        sourceRef: sourceRef.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Recording the schedule failed'));
    } finally {
      setSaving(false);
    }
  };

  const setComponent = (i: number, patch: Partial<ComponentForm>) =>
    setComponents((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Modal opened={opened} onClose={onClose} title="Add fee schedule" size="lg">
      <Stack>
        <Group grow>
          <Select label="Exchange" data={exchanges.map((e) => ({ value: String(e.exchangeId), label: e.exchangeCode }))}
            value={exchangeId} onChange={setExchangeId} searchable />
          <Select label="Applies to" value={scope} onChange={(v) => setScope((v ?? 'EXCHANGE') as FeeScope)}
            data={(Object.keys(FEE_SCOPE_LABELS) as FeeScope[]).map((s) => ({ value: s, label: FEE_SCOPE_LABELS[s] }))} />
        </Group>
        {scope !== 'EXCHANGE' && (
          <TextInput label={FEE_SCOPE_LABELS[scope]} value={target} onChange={(e) => setTarget(e.currentTarget.value)}
            description={scope === 'FEE_GROUP' ? 'The venue\'s group, e.g. a Kalshi series (KXMLBGAME) or a sport (table-tennis)'
              : scope === 'FEE_EVENT' ? 'The venue\'s own event id, e.g. a Kalshi event ticker'
                : 'The listing id'} />
        )}

        <SegmentedControl value={kind} onChange={(v) => setKind(v as 'change' | 'correction')} data={[
          { value: 'change', label: 'The venue changed its fees' },
          { value: 'correction', label: 'Correct a recorded schedule' },
        ]} />
        {kind === 'change' ? (
          <TextInput label="Effective from (UTC)" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.currentTarget.value)}
            description="When the venue started charging it, e.g. 2026-09-17T04:00:00Z; backtests before then keep the old fees" />
        ) : (
          <Select label="Corrects" value={corrects} onChange={setCorrects}
            description="It replaces that row for all time, from the same effective time"
            data={correctable.map((r) => ({
              value: r.feeScheduleId,
              label: `${r.effectiveFrom} · ${describeFeeDefinition(r.definition)}`,
            }))} nothingFoundMessage="No recorded schedule for this target" />
        )}

        <Divider />
        <Checkbox label="Clear this scope (its listings fall back to the next scope out, as when a Kalshi event override is lifted)"
          checked={clear} onChange={(e) => setClear(e.currentTarget.checked)} disabled={scope === 'EXCHANGE'} />
        {!clear && (
          <>
            {components.map((c, i) => (
              <Group key={i} align="flex-end" wrap="nowrap">
                <Select label={i === 0 ? 'Fee' : undefined} data={KIND_OPTIONS} value={c.kind} w={210}
                  onChange={(v) => setComponent(i, { kind: (v ?? 'PRICE_CURVE') as FeeKind })} />
                <NumberInput label={i === 0 ? 'Taker rate' : undefined} value={c.taker} decimalScale={8} w={110}
                  onChange={(v) => setComponent(i, { taker: v })} />
                <NumberInput label={i === 0 ? 'Maker rate' : undefined} value={c.maker} decimalScale={8} w={110}
                  description={i === 0 ? 'negative is a rebate' : undefined} onChange={(v) => setComponent(i, { maker: v })} />
                {c.kind === 'PRICE_CURVE' && (
                  <NumberInput label={i === 0 ? 'Exponent' : undefined} value={c.exponent} decimalScale={4} w={80}
                    onChange={(v) => setComponent(i, { exponent: v })} />
                )}
                <Select label={i === 0 ? 'Side' : undefined} data={SIDE_OPTIONS} value={c.side} w={120}
                  onChange={(v) => setComponent(i, { side: (v ?? 'BOTH') as ComponentForm['side'] })} />
                <ActionIcon variant="subtle" color="red" disabled={components.length === 1}
                  onClick={() => setComponents((cs) => cs.filter((_, j) => j !== i))}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
            <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} w="fit-content"
              onClick={() => setComponents((cs) => [...cs, emptyComponent()])}>Add component</Button>
            <Group grow>
              <Select label="Rounding" data={MODE_OPTIONS} value={mode}
                onChange={(v) => setMode((v ?? 'NONE') as FeeRoundingMode)} />
              {mode !== 'NONE' && (
                <>
                  <NumberInput label="To the nearest ($)" value={increment} decimalScale={8} onChange={setIncrement} />
                  <Select label="Rounded per" data={ROUNDING_SCOPE_OPTIONS} value={roundingScope}
                    onChange={(v) => setRoundingScope((v ?? 'FILL') as FeeRoundingScope)} />
                </>
              )}
              <TextInput label="Currency" value={currency} onChange={(e) => setCurrency(e.currentTarget.value.toUpperCase())} />
            </Group>
          </>
        )}
        <Text size="sm" c="dimmed">{describeFeeDefinition(definition)}</Text>

        <Divider />
        <TextInput label="Source" placeholder="Where the venue published it, e.g. a URL or CFTC filing"
          value={sourceRef} onChange={(e) => setSourceRef(e.currentTarget.value)} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={blocker !== null} title={blocker ?? undefined}>Record schedule</Button>
        </Group>
        {blocker && <Text size="xs" c="dimmed" ta="right">{blocker}</Text>}
      </Stack>
    </Modal>
  );
}
