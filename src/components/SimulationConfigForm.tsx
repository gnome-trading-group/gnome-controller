import { ActionIcon, Accordion, Button, Divider, Group, NumberInput, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { ConfigValue } from '../types';
import { IconPlus, IconTrash } from '@tabler/icons-react';

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
  // '' means unset: the orchestrator then derives these draws from the session seed.
  networkLatencySeed: number | string;
  orderLatencySeed: number | string;
  selfTradePrevention: '' | 'CANCEL_INCOMING' | 'CANCEL_RESTING';
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
  networkLatencySeed: '',
  orderLatencySeed: '',
  selfTradePrevention: '',
});

// A cleared NumberInput holds '', which Number() turns into 0, so a blank fee or latency would silently simulate as
// free or instant and flatter the results.
function requireNumber(field: string, value: number | string): number {
  const n = typeof value === 'number' ? value : value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} is empty or not a number`);
  return n;
}

// Seeds are Java longs; blank means "not set", never 0.
function optionalSeed(field: string, value: number | string): number | undefined {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`${field} must be a whole number`);
  return n;
}

export function simulationStateToConfig(sim: SimulationState): Record<string, ConfigValue> {
  const cfg: Record<string, ConfigValue> = {};
  cfg['fee.model'] = sim.feeModel;
  if (sim.feeModel === 'parametric') {
    cfg['fee.taker.rate'] = requireNumber('fee.taker.rate', sim.feeTakerRate);
    cfg['fee.maker.rate'] = requireNumber('fee.maker.rate', sim.feeMakerRate);
  } else {
    cfg['fee.taker'] = requireNumber('fee.taker', sim.feeTaker);
    cfg['fee.maker'] = requireNumber('fee.maker', sim.feeMaker);
  }
  cfg['network.latency.model'] = sim.networkLatencyModel;
  if (sim.networkLatencyModel === 'gaussian') {
    cfg['network.latency.mu'] = requireNumber('network.latency.mu', sim.networkLatencyMu);
    cfg['network.latency.sigma'] = requireNumber('network.latency.sigma', sim.networkLatencySigma);
    const seed = optionalSeed('network.latency.seed', sim.networkLatencySeed);
    if (seed !== undefined) cfg['network.latency.seed'] = seed;
  } else if (sim.networkLatencyModel === 'maker_taker') {
    cfg['network.latency.base.nanos'] = requireNumber('network.latency.base.nanos', sim.networkLatencyBaseNanos);
    cfg['network.latency.taker.delay.nanos'] = requireNumber('network.latency.taker.delay.nanos', sim.networkLatencyTakerDelayNanos);
    cfg['network.latency.maker.delay.nanos'] = requireNumber('network.latency.maker.delay.nanos', sim.networkLatencyMakerDelayNanos);
  } else {
    cfg['network.latency.nanos'] = requireNumber('network.latency.nanos', sim.networkLatencyNanos);
  }
  cfg['order.latency.model'] = sim.orderLatencyModel;
  if (sim.orderLatencyModel === 'gaussian') {
    cfg['order.latency.mu'] = requireNumber('order.latency.mu', sim.orderLatencyMu);
    cfg['order.latency.sigma'] = requireNumber('order.latency.sigma', sim.orderLatencySigma);
    const seed = optionalSeed('order.latency.seed', sim.orderLatencySeed);
    if (seed !== undefined) cfg['order.latency.seed'] = seed;
  } else if (sim.orderLatencyModel === 'maker_taker') {
    cfg['order.latency.base.nanos'] = requireNumber('order.latency.base.nanos', sim.orderLatencyBaseNanos);
    cfg['order.latency.taker.delay.nanos'] = requireNumber('order.latency.taker.delay.nanos', sim.orderLatencyTakerDelayNanos);
    cfg['order.latency.maker.delay.nanos'] = requireNumber('order.latency.maker.delay.nanos', sim.orderLatencyMakerDelayNanos);
  } else {
    cfg['order.latency.nanos'] = requireNumber('order.latency.nanos', sim.orderLatencyNanos);
  }
  cfg['queue.model'] = sim.queueModel;
  if (sim.queueModel === 'probabilistic') {
    cfg['queue.cancel.ahead.probability'] = requireNumber('queue.cancel.ahead.probability', sim.cancelAheadProbability);
  }
  if (sim.selfTradePrevention) cfg['self.trade.prevention'] = sim.selfTradePrevention;
  return cfg;
}

export function simulationStateFromConfig(sim: Record<string, ConfigValue>): SimulationState {
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
    s.networkLatencySeed = sim['network.latency.seed'] != null ? Number(sim['network.latency.seed']) : '';
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
    s.orderLatencySeed = sim['order.latency.seed'] != null ? Number(sim['order.latency.seed']) : '';
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
  const stp = sim['self.trade.prevention'];
  s.selfTradePrevention = stp === 'CANCEL_INCOMING' || stp === 'CANCEL_RESTING' ? stp : '';
  return s;
}

export interface ListingProfileRow {
  listingId: string;
  profile: string;
}

export type ProfilesState = Record<string, SimulationState>;

export function simulationProfilesToConfig(
  profiles: ProfilesState,
  listings: ListingProfileRow[],
  seed: number | string = '',
): Record<string, ConfigValue> {
  const cfg: Record<string, ConfigValue> = {};
  const sessionSeed = optionalSeed('simulation.seed', seed);
  if (sessionSeed !== undefined) cfg['simulation.seed'] = sessionSeed;
  for (const [name, sim] of Object.entries(profiles)) {
    let simCfg: Record<string, ConfigValue>;
    try {
      simCfg = simulationStateToConfig(sim);
    } catch (e) {
      throw new Error(`Simulation profile "${name}": ${e instanceof Error ? e.message : String(e)}`);
    }
    for (const [k, v] of Object.entries(simCfg)) {
      cfg[`simulation.profiles.${name}.${k}`] = v;
    }
  }
  for (const { listingId, profile } of listings) {
    if (listingId.trim() && profile) {
      cfg[`simulation.listing.${listingId.trim()}.profile`] = profile;
    }
  }
  return cfg;
}

export function simulationProfilesFromConfig(config: Record<string, ConfigValue>): {
  profiles: ProfilesState;
  listings: ListingProfileRow[];
  seed: number | string;
} {
  const profileKeys: Record<string, Record<string, ConfigValue>> = {};
  const listingMap: Record<string, string> = {};

  for (const [key, value] of Object.entries(config)) {
    const profileMatch = key.match(/^simulation\.profiles\.([^.]+)\.(.*)/);
    if (profileMatch) {
      const name = profileMatch[1];
      const subKey = profileMatch[2];
      if (!profileKeys[name]) profileKeys[name] = {};
      profileKeys[name][subKey] = value;
    }
    const listingMatch = key.match(/^simulation\.listing\.(\d+)\.profile$/);
    if (listingMatch) {
      listingMap[listingMatch[1]] = String(value);
    }
  }

  const profiles: ProfilesState = {};
  for (const [name, simKeys] of Object.entries(profileKeys)) {
    profiles[name] = simulationStateFromConfig(simKeys);
  }

  const listings: ListingProfileRow[] = Object.entries(listingMap).map(([listingId, profile]) => ({
    listingId,
    profile,
  }));

  const seed = config['simulation.seed'] != null ? Number(config['simulation.seed']) : '';
  return { profiles, listings, seed };
}

export interface ProfilesEditorProps {
  profiles: ProfilesState;
  listings: ListingProfileRow[];
  seed: number | string;
  onProfilesChange: (p: ProfilesState) => void;
  onListingsChange: (l: ListingProfileRow[]) => void;
  onSeedChange: (seed: number | string) => void;
}

// Profile names become part of property keys (simulation.profiles.<name>.…) that travel as environment variables,
// where '.' and '_' both turn into separators, so a name using them can't be found again by the orchestrator.
const PROFILE_NAME = /^[A-Za-z0-9-]+$/;

export function ProfilesEditor({ profiles, listings, seed, onProfilesChange, onListingsChange, onSeedChange }: ProfilesEditorProps) {
  const profileNames = Object.keys(profiles);

  const addProfile = () => {
    const base = 'profile';
    let name = base;
    let i = 1;
    while (profiles[name] !== undefined) name = `${base}${i++}`;
    onProfilesChange({ ...profiles, [name]: defaultSimulationState() });
  };

  const removeProfile = (name: string) => {
    const next = { ...profiles };
    delete next[name];
    onProfilesChange(next);
  };

  const renameProfile = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return;
    if (!PROFILE_NAME.test(newName.trim()) || profiles[newName.trim()] !== undefined) return;
    const next: ProfilesState = {};
    for (const [k, v] of Object.entries(profiles)) {
      next[k === oldName ? newName.trim() : k] = v;
    }
    onProfilesChange(next);
    onListingsChange(listings.map(l => l.profile === oldName ? { ...l, profile: newName.trim() } : l));
  };

  const addListing = () => {
    onListingsChange([...listings, { listingId: '', profile: profileNames[0] ?? '' }]);
  };

  const removeListing = (i: number) => {
    onListingsChange(listings.filter((_, j) => j !== i));
  };

  const updateListing = (i: number, patch: Partial<ListingProfileRow>) => {
    onListingsChange(listings.map((l, j) => j === i ? { ...l, ...patch } : l));
  };

  return (
    <Stack gap="sm">
      <NumberInput
        label="Simulation seed (optional)"
        description="Blank uses the orchestrator's fixed default, so runs are reproducible; set one to vary the latency draws"
        value={seed}
        onChange={onSeedChange}
        allowDecimal={false}
      />
      <Group justify="space-between">
        <Title order={6} c="dimmed">Profiles</Title>
        <Button size="xs" variant="subtle" leftSection={<IconPlus size={12} />} onClick={addProfile}>Add Profile</Button>
      </Group>

      <Accordion variant="separated">
        {profileNames.map(name => (
          <Accordion.Item key={name} value={name}>
            <Accordion.Control>
              <Group gap="xs">
                <TextInput
                  size="xs"
                  defaultValue={name}
                  title="Letters, digits and '-' only"
                  onBlur={e => {
                    const next = e.currentTarget.value;
                    if (!PROFILE_NAME.test(next.trim())) e.currentTarget.value = name;
                    renameProfile(name, next);
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1 }}
                />
                <ActionIcon
                  size="sm"
                  color="red"
                  variant="subtle"
                  onClick={e => { e.stopPropagation(); removeProfile(name); }}
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <SimulationConfigForm
                sim={profiles[name]}
                onChange={sim => onProfilesChange({ ...profiles, [name]: sim })}
              />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      <Divider />
      <Group justify="space-between">
        <Title order={6} c="dimmed">Listings</Title>
        <ActionIcon size="sm" variant="subtle" color="blue" onClick={addListing}>
          <IconPlus size={14} />
        </ActionIcon>
      </Group>
      {listings.length === 0 && <Text size="sm" c="dimmed">Add at least one listing.</Text>}
      {listings.map((row, i) => (
        <Group key={i} gap="xs" align="flex-end">
          <TextInput
            placeholder="Listing ID"
            value={row.listingId}
            onChange={e => updateListing(i, { listingId: e.currentTarget.value })}
            style={{ flex: 1 }}
          />
          <Select
            placeholder="Profile"
            data={profileNames}
            value={row.profile}
            onChange={v => updateListing(i, { profile: v ?? '' })}
            style={{ flex: 1 }}
          />
          <ActionIcon variant="subtle" color="red" onClick={() => removeListing(i)}>
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  );
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

const SELF_TRADE_OPTIONS = [
  { value: '', label: 'None (simulator default)' },
  { value: 'CANCEL_INCOMING', label: 'Cancel incoming (Kalshi taker_at_cross)' },
  { value: 'CANCEL_RESTING', label: 'Cancel resting (Kalshi maker)' },
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
  seed,
  onModelChange,
  onNanosChange,
  onMuChange,
  onSigmaChange,
  onBaseNanosChange,
  onTakerDelayChange,
  onMakerDelayChange,
  onSeedChange,
}: {
  prefix: string;
  model: string;
  nanos: number | string;
  mu: number | string;
  sigma: number | string;
  baseNanos: number | string;
  takerDelayNanos: number | string;
  makerDelayNanos: number | string;
  seed: number | string;
  onModelChange: (v: string) => void;
  onNanosChange: (v: number | string) => void;
  onMuChange: (v: number | string) => void;
  onSigmaChange: (v: number | string) => void;
  onBaseNanosChange: (v: number | string) => void;
  onTakerDelayChange: (v: number | string) => void;
  onMakerDelayChange: (v: number | string) => void;
  onSeedChange: (v: number | string) => void;
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
          <NumberInput label="Seed (optional)" placeholder="Session seed" value={seed} onChange={onSeedChange} allowDecimal={false} />
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
        seed={sim.networkLatencySeed}
        onModelChange={v => set('networkLatencyModel', v as SimulationState['networkLatencyModel'])}
        onNanosChange={v => set('networkLatencyNanos', v)}
        onMuChange={v => set('networkLatencyMu', v)}
        onSigmaChange={v => set('networkLatencySigma', v)}
        onBaseNanosChange={v => set('networkLatencyBaseNanos', v)}
        onTakerDelayChange={v => set('networkLatencyTakerDelayNanos', v)}
        onMakerDelayChange={v => set('networkLatencyMakerDelayNanos', v)}
        onSeedChange={v => set('networkLatencySeed', v)}
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
        seed={sim.orderLatencySeed}
        onModelChange={v => set('orderLatencyModel', v as SimulationState['orderLatencyModel'])}
        onNanosChange={v => set('orderLatencyNanos', v)}
        onMuChange={v => set('orderLatencyMu', v)}
        onSigmaChange={v => set('orderLatencySigma', v)}
        onBaseNanosChange={v => set('orderLatencyBaseNanos', v)}
        onTakerDelayChange={v => set('orderLatencyTakerDelayNanos', v)}
        onMakerDelayChange={v => set('orderLatencyMakerDelayNanos', v)}
        onSeedChange={v => set('orderLatencySeed', v)}
      />

      <Select label="Queue Model" data={QUEUE_MODEL_OPTIONS} value={sim.queueModel} onChange={v => set('queueModel', (v ?? 'risk_averse') as SimulationState['queueModel'])} />
      {sim.queueModel === 'probabilistic' && (
        <NumberInput label="Cancel Ahead Probability" value={sim.cancelAheadProbability} onChange={v => set('cancelAheadProbability', v)} step={0.01} min={0} max={1} decimalScale={4} />
      )}

      <Select
        label="Self-trade prevention"
        description="What the simulated exchange does when the strategy's orders would cross each other"
        data={SELF_TRADE_OPTIONS}
        value={sim.selfTradePrevention}
        onChange={v => set('selfTradePrevention', (v ?? '') as SimulationState['selfTradePrevention'])}
      />
    </Stack>
  );
}

export default SimulationConfigForm;
