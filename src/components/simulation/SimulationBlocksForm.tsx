import { Group, NumberInput, Select, Stack, Text } from '@mantine/core';
import {
  BLOCK_LABELS, describeBlock, FEE_TYPE_OPTIONS, FeeModel, FeeType, Latency, LATENCY_FIELDS, LATENCY_TYPE_OPTIONS,
  LatencyBlock, LatencyType, newFee, newLatency, newQueue, QUEUE_TYPE_OPTIONS, QueueType, SELF_TRADE_OPTIONS,
  SelfTradePrevention, SimulationBlocks,
} from '../../utils/simulation';

const INHERIT = '';

function num(v: number | string): number | '' {
  return v === '' ? '' : Number(v);
}

function LatencyFields({ value, onChange, allowSeed }: { value: Latency; onChange: (l: Latency) => void; allowSeed: boolean }) {
  if (value.type === 'recorded') {
    const fallback = value.fallback ?? newLatency('static');
    return (
      <Stack gap={4} pl="md">
        <Select size="xs" label="Without a recorded time" data={LATENCY_TYPE_OPTIONS} value={fallback.type}
          onChange={v => onChange({ ...value, fallback: newLatency((v ?? 'static') as LatencyType, fallback) })} />
        <LatencyFields value={fallback} onChange={f => onChange({ ...value, fallback: f })} allowSeed={false} />
      </Stack>
    );
  }
  return (
    <Group grow>
      {LATENCY_FIELDS[value.type].map(f => (
        <NumberInput key={f.key} size="xs" label={f.label} value={value[f.key] as number | ''} step={1_000_000} min={0}
          allowDecimal={false} thousandSeparator="," onChange={v => onChange({ ...value, [f.key]: num(v) })} />
      ))}
      {allowSeed && value.type === 'lognormal' && (
        <NumberInput size="xs" label="Seed (optional)" placeholder="The run's" value={value.seed ?? ''} allowDecimal={false}
          onChange={v => onChange({ ...value, seed: num(v) === '' ? undefined : Number(v) })} />
      )}
    </Group>
  );
}

interface Props {
  value: SimulationBlocks;
  onChange: (value: SimulationBlocks) => void;
  // What each block is when this layer leaves it: the exchange's recorded parameters (with any exchange overrides).
  // Given, every block offers to keep it; without it (recording an exchange's parameters), every block is required.
  inherited?: SimulationBlocks;
  // Market data latency applies to backtests only; fees are never part of an exchange's recorded parameters.
  showMarketData?: boolean;
  showFees?: boolean;
}

// The blocks of how a venue behaves in simulation, each a model and its fields. Used to record an exchange's
// parameters and to override them for a run, a rule or a strategy.
export function SimulationBlocksForm({ value, onChange, inherited, showMarketData = false, showFees = true }: Props) {
  const overriding = inherited !== undefined;
  const set = (key: keyof SimulationBlocks, block: SimulationBlocks[keyof SimulationBlocks] | undefined) => {
    const next = { ...value } as Record<string, unknown>;
    if (block === undefined) delete next[key]; else next[key] = block;
    onChange(next as SimulationBlocks);
  };
  const keepLabel = (key: keyof SimulationBlocks) =>
    `Exchange's: ${inherited && inherited[key] !== undefined ? describeBlock(key, inherited) : 'none recorded'}`;

  const latencyBlocks: LatencyBlock[] = ['network_latency', 'order_processing_latency', ...(showMarketData ? ['market_data_latency' as const] : [])];
  return (
    <Stack gap="xs">
      {latencyBlocks.map(key => {
        const block = value[key];
        const options = [
          ...(overriding ? [{ value: INHERIT, label: keepLabel(key) }] : []),
          ...LATENCY_TYPE_OPTIONS,
          ...(key === 'market_data_latency' ? [{ value: 'recorded', label: 'As recorded' }] : []),
        ];
        return (
          <Stack key={key} gap={4}>
            <Select label={BLOCK_LABELS[key]} data={options} value={block?.type ?? INHERIT} required={!overriding}
              placeholder="Choose a model" allowDeselect={false}
              onChange={v => set(key, v ? newLatency(v as LatencyType, block ?? inherited?.[key]) : undefined)} />
            {block && <LatencyFields value={block} onChange={l => set(key, l)} allowSeed={overriding} />}
          </Stack>
        );
      })}

      <Select label={BLOCK_LABELS.queue_model} required={!overriding} placeholder="Choose a model" allowDeselect={false}
        data={[...(overriding ? [{ value: INHERIT, label: keepLabel('queue_model') }] : []), ...QUEUE_TYPE_OPTIONS]}
        value={value.queue_model?.type ?? INHERIT}
        onChange={v => set('queue_model', v ? newQueue(v as QueueType) : undefined)} />
      {value.queue_model?.type === 'probabilistic' && (
        <NumberInput size="xs" label="Cancel ahead probability" value={value.queue_model.cancel_ahead_probability ?? ''}
          min={0} max={1} step={0.05} decimalScale={4}
          onChange={v => set('queue_model', { type: 'probabilistic', cancel_ahead_probability: num(v) })} />
      )}

      <Select label={BLOCK_LABELS.self_trade_prevention} required={!overriding} placeholder="Choose" allowDeselect={false}
        description="What the venue does when the strategy's orders would cross each other"
        data={[...(overriding ? [{ value: INHERIT, label: keepLabel('self_trade_prevention') }] : []), ...SELF_TRADE_OPTIONS]}
        value={value.self_trade_prevention ?? INHERIT}
        onChange={v => set('self_trade_prevention', (v || undefined) as SelfTradePrevention | undefined)} />

      {showFees && (
        <>
          <Select label={BLOCK_LABELS.fee_model} allowDeselect={false}
            data={[{ value: INHERIT, label: "Venue's fee schedules" }, ...FEE_TYPE_OPTIONS.filter(o => o.value !== 'registry')]}
            value={value.fee_model?.type ?? INHERIT}
            onChange={v => set('fee_model', v ? newFee(v as FeeType) : undefined)} />
          {value.fee_model && value.fee_model.type !== 'registry' && (
            <Group grow>
              {(value.fee_model.type === 'static' ? ['taker_fee', 'maker_fee'] : ['taker_fee_rate', 'maker_fee_rate']).map(k => (
                <NumberInput key={k} size="xs" label={k.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                  value={(value.fee_model as FeeModel)[k as keyof FeeModel] as number | ''} step={0.001} decimalScale={6}
                  onChange={v => set('fee_model', { ...(value.fee_model as FeeModel), [k]: num(v) })} />
              ))}
            </Group>
          )}
        </>
      )}
      {overriding && Object.keys(value).length === 0 && (
        <Text size="xs" c="dimmed">Nothing overridden: simulates as the exchange is recorded.</Text>
      )}
    </Stack>
  );
}
