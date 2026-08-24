import { Divider, Group, NumberInput, Select, Stack, Title } from '@mantine/core';

export interface SimulationState {
  feeModel: 'static' | 'parametric';
  feeTaker: number | string;
  feeMaker: number | string;
  feeTakerRate: number | string;
  feeMakerRate: number | string;
  networkLatencyModel: 'static' | 'gaussian' | 'maker_taker';
  networkLatencyNanos: number | string;
  networkLatencyMu: number | string;
  networkLatencySigma: number | string;
  networkLatencyBaseNanos: number | string;
  networkLatencyTakerDelayNanos: number | string;
  networkLatencyMakerDelayNanos: number | string;
  orderLatencyModel: 'static' | 'gaussian' | 'maker_taker';
  orderLatencyNanos: number | string;
  orderLatencyMu: number | string;
  orderLatencySigma: number | string;
  orderLatencyBaseNanos: number | string;
  orderLatencyTakerDelayNanos: number | string;
  orderLatencyMakerDelayNanos: number | string;
  queueModel: 'optimistic' | 'risk_averse' | 'probabilistic';
  cancelAheadProbability: number | string;
}

export const defaultSimulationState = (): SimulationState => ({
  feeModel: 'static',
  feeTaker: 0,
  feeMaker: 0,
  feeTakerRate: 0.07,
  feeMakerRate: 0,
  networkLatencyModel: 'static',
  networkLatencyNanos: 0,
  networkLatencyMu: 0,
  networkLatencySigma: 0,
  networkLatencyBaseNanos: 0,
  networkLatencyTakerDelayNanos: 0,
  networkLatencyMakerDelayNanos: 0,
  orderLatencyModel: 'static',
  orderLatencyNanos: 0,
  orderLatencyMu: 0,
  orderLatencySigma: 0,
  orderLatencyBaseNanos: 0,
  orderLatencyTakerDelayNanos: 0,
  orderLatencyMakerDelayNanos: 0,
  queueModel: 'risk_averse',
  cancelAheadProbability: 0.5,
});

export function simulationStateToConfig(sim: SimulationState): Record<string, string> {
  const cfg: Record<string, string> = {};
  cfg['fee.model'] = sim.feeModel;
  if (sim.feeModel === 'parametric') {
    cfg['fee.taker.rate'] = String(sim.feeTakerRate);
    cfg['fee.maker.rate'] = String(sim.feeMakerRate);
  } else {
    cfg['fee.taker'] = String(sim.feeTaker);
    cfg['fee.maker'] = String(sim.feeMaker);
  }
  cfg['network.latency.model'] = sim.networkLatencyModel;
  if (sim.networkLatencyModel === 'gaussian') {
    cfg['network.latency.mu'] = String(sim.networkLatencyMu);
    cfg['network.latency.sigma'] = String(sim.networkLatencySigma);
  } else if (sim.networkLatencyModel === 'maker_taker') {
    cfg['network.latency.base.nanos'] = String(sim.networkLatencyBaseNanos);
    cfg['network.latency.taker.delay.nanos'] = String(sim.networkLatencyTakerDelayNanos);
    cfg['network.latency.maker.delay.nanos'] = String(sim.networkLatencyMakerDelayNanos);
  } else {
    cfg['network.latency.nanos'] = String(sim.networkLatencyNanos);
  }
  cfg['order.latency.model'] = sim.orderLatencyModel;
  if (sim.orderLatencyModel === 'gaussian') {
    cfg['order.latency.mu'] = String(sim.orderLatencyMu);
    cfg['order.latency.sigma'] = String(sim.orderLatencySigma);
  } else if (sim.orderLatencyModel === 'maker_taker') {
    cfg['order.latency.base.nanos'] = String(sim.orderLatencyBaseNanos);
    cfg['order.latency.taker.delay.nanos'] = String(sim.orderLatencyTakerDelayNanos);
    cfg['order.latency.maker.delay.nanos'] = String(sim.orderLatencyMakerDelayNanos);
  } else {
    cfg['order.latency.nanos'] = String(sim.orderLatencyNanos);
  }
  cfg['queue.model'] = sim.queueModel;
  if (sim.queueModel === 'probabilistic') {
    cfg['queue.cancel.ahead.probability'] = String(sim.cancelAheadProbability);
  }
  return cfg;
}

export function simulationStateFromConfig(sim: Record<string, string>): SimulationState {
  const s = defaultSimulationState();
  const feeModel = sim['fee.model'];
  if (feeModel === 'parametric') {
    s.feeModel = 'parametric';
    s.feeTakerRate = Number(sim['fee.taker.rate'] ?? 0.07);
    s.feeMakerRate = Number(sim['fee.maker.rate'] ?? 0);
  } else {
    s.feeModel = 'static';
    s.feeTaker = Number(sim['fee.taker'] ?? sim['taker.fee'] ?? 0);
    s.feeMaker = Number(sim['fee.maker'] ?? sim['maker.fee'] ?? 0);
  }
  const netModel = (sim['network.latency.model'] ?? 'static') as SimulationState['networkLatencyModel'];
  s.networkLatencyModel = netModel;
  if (netModel === 'gaussian') {
    s.networkLatencyMu = Number(sim['network.latency.mu'] ?? 0);
    s.networkLatencySigma = Number(sim['network.latency.sigma'] ?? 0);
  } else if (netModel === 'maker_taker') {
    s.networkLatencyBaseNanos = Number(sim['network.latency.base.nanos'] ?? 0);
    s.networkLatencyTakerDelayNanos = Number(sim['network.latency.taker.delay.nanos'] ?? 0);
    s.networkLatencyMakerDelayNanos = Number(sim['network.latency.maker.delay.nanos'] ?? 0);
  } else {
    s.networkLatencyNanos = Number(sim['network.latency.nanos'] ?? sim['network.latency.nanos'] ?? 0);
  }
  const ordModel = (sim['order.latency.model'] ?? 'static') as SimulationState['orderLatencyModel'];
  s.orderLatencyModel = ordModel;
  if (ordModel === 'gaussian') {
    s.orderLatencyMu = Number(sim['order.latency.mu'] ?? 0);
    s.orderLatencySigma = Number(sim['order.latency.sigma'] ?? 0);
  } else if (ordModel === 'maker_taker') {
    s.orderLatencyBaseNanos = Number(sim['order.latency.base.nanos'] ?? 0);
    s.orderLatencyTakerDelayNanos = Number(sim['order.latency.taker.delay.nanos'] ?? 0);
    s.orderLatencyMakerDelayNanos = Number(sim['order.latency.maker.delay.nanos'] ?? 0);
  } else {
    s.orderLatencyNanos = Number(sim['order.latency.nanos'] ?? 0);
  }
  const qModel = (sim['queue.model'] ?? 'risk_averse') as SimulationState['queueModel'];
  s.queueModel = qModel;
  if (qModel === 'probabilistic') {
    s.cancelAheadProbability = Number(sim['queue.cancel.ahead.probability'] ?? 0.5);
  }
  return s;
}

const FEE_MODEL_OPTIONS = [
  { value: 'static', label: 'Static' },
  { value: 'parametric', label: 'Parametric' },
];

const LATENCY_MODEL_OPTIONS = [
  { value: 'static', label: 'Static' },
  { value: 'gaussian', label: 'Gaussian' },
  { value: 'maker_taker', label: 'Maker/Taker' },
];

const QUEUE_MODEL_OPTIONS = [
  { value: 'risk_averse', label: 'Risk Averse' },
  { value: 'optimistic', label: 'Optimistic' },
  { value: 'probabilistic', label: 'Probabilistic' },
];

interface SimulationConfigFormProps {
  sim: SimulationState;
  onChange: (sim: SimulationState) => void;
}

function LatencyFields({
  prefix,
  model,
  nanos,
  mu,
  sigma,
  baseNanos,
  takerDelayNanos,
  makerDelayNanos,
  onModelChange,
  onNanosChange,
  onMuChange,
  onSigmaChange,
  onBaseNanosChange,
  onTakerDelayChange,
  onMakerDelayChange,
}: {
  prefix: string;
  model: string;
  nanos: number | string;
  mu: number | string;
  sigma: number | string;
  baseNanos: number | string;
  takerDelayNanos: number | string;
  makerDelayNanos: number | string;
  onModelChange: (v: string) => void;
  onNanosChange: (v: number | string) => void;
  onMuChange: (v: number | string) => void;
  onSigmaChange: (v: number | string) => void;
  onBaseNanosChange: (v: number | string) => void;
  onTakerDelayChange: (v: number | string) => void;
  onMakerDelayChange: (v: number | string) => void;
}) {
  return (
    <>
      <Select label={`${prefix} Model`} data={LATENCY_MODEL_OPTIONS} value={model} onChange={v => onModelChange(v ?? 'static')} />
      {model === 'static' && (
        <NumberInput label="Latency (ns)" value={nanos} onChange={onNanosChange} step={1000} />
      )}
      {model === 'gaussian' && (
        <Group grow>
          <NumberInput label="Mu (ns)" value={mu} onChange={onMuChange} step={1000} />
          <NumberInput label="Sigma (ns)" value={sigma} onChange={onSigmaChange} step={1000} />
        </Group>
      )}
      {model === 'maker_taker' && (
        <Group grow>
          <NumberInput label="Base (ns)" value={baseNanos} onChange={onBaseNanosChange} step={1000} />
          <NumberInput label="Taker Delay (ns)" value={takerDelayNanos} onChange={onTakerDelayChange} step={1000} />
          <NumberInput label="Maker Delay (ns)" value={makerDelayNanos} onChange={onMakerDelayChange} step={1000} />
        </Group>
      )}
    </>
  );
}

function SimulationConfigForm({ sim, onChange }: SimulationConfigFormProps) {
  const set = <K extends keyof SimulationState>(key: K, val: SimulationState[K]) =>
    onChange({ ...sim, [key]: val });

  return (
    <Stack gap="xs">
      <Divider />
      <Title order={6} c="dimmed">Simulation Config</Title>

      <Select label="Fee Model" data={FEE_MODEL_OPTIONS} value={sim.feeModel} onChange={v => set('feeModel', (v ?? 'static') as SimulationState['feeModel'])} />
      {sim.feeModel === 'static' && (
        <Group grow>
          <NumberInput label="Taker Fee" value={sim.feeTaker} onChange={v => set('feeTaker', v)} step={0.0001} decimalScale={6} />
          <NumberInput label="Maker Fee" value={sim.feeMaker} onChange={v => set('feeMaker', v)} step={0.0001} decimalScale={6} />
        </Group>
      )}
      {sim.feeModel === 'parametric' && (
        <Group grow>
          <NumberInput label="Taker Fee Rate" value={sim.feeTakerRate} onChange={v => set('feeTakerRate', v)} step={0.001} decimalScale={6} />
          <NumberInput label="Maker Fee Rate" value={sim.feeMakerRate} onChange={v => set('feeMakerRate', v)} step={0.001} decimalScale={6} />
        </Group>
      )}

      <LatencyFields
        prefix="Network Latency"
        model={sim.networkLatencyModel}
        nanos={sim.networkLatencyNanos}
        mu={sim.networkLatencyMu}
        sigma={sim.networkLatencySigma}
        baseNanos={sim.networkLatencyBaseNanos}
        takerDelayNanos={sim.networkLatencyTakerDelayNanos}
        makerDelayNanos={sim.networkLatencyMakerDelayNanos}
        onModelChange={v => set('networkLatencyModel', v as SimulationState['networkLatencyModel'])}
        onNanosChange={v => set('networkLatencyNanos', v)}
        onMuChange={v => set('networkLatencyMu', v)}
        onSigmaChange={v => set('networkLatencySigma', v)}
        onBaseNanosChange={v => set('networkLatencyBaseNanos', v)}
        onTakerDelayChange={v => set('networkLatencyTakerDelayNanos', v)}
        onMakerDelayChange={v => set('networkLatencyMakerDelayNanos', v)}
      />
      <LatencyFields
        prefix="Order Latency"
        model={sim.orderLatencyModel}
        nanos={sim.orderLatencyNanos}
        mu={sim.orderLatencyMu}
        sigma={sim.orderLatencySigma}
        baseNanos={sim.orderLatencyBaseNanos}
        takerDelayNanos={sim.orderLatencyTakerDelayNanos}
        makerDelayNanos={sim.orderLatencyMakerDelayNanos}
        onModelChange={v => set('orderLatencyModel', v as SimulationState['orderLatencyModel'])}
        onNanosChange={v => set('orderLatencyNanos', v)}
        onMuChange={v => set('orderLatencyMu', v)}
        onSigmaChange={v => set('orderLatencySigma', v)}
        onBaseNanosChange={v => set('orderLatencyBaseNanos', v)}
        onTakerDelayChange={v => set('orderLatencyTakerDelayNanos', v)}
        onMakerDelayChange={v => set('orderLatencyMakerDelayNanos', v)}
      />

      <Select label="Queue Model" data={QUEUE_MODEL_OPTIONS} value={sim.queueModel} onChange={v => set('queueModel', (v ?? 'risk_averse') as SimulationState['queueModel'])} />
      {sim.queueModel === 'probabilistic' && (
        <NumberInput label="Cancel Ahead Probability" value={sim.cancelAheadProbability} onChange={v => set('cancelAheadProbability', v)} step={0.01} min={0} max={1} decimalScale={4} />
      )}
    </Stack>
  );
}

export default SimulationConfigForm;
