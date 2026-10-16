// How venues behave in simulation, in the one shape every config takes (backtest YAML, session and rule configs,
// the registry's per-exchange parameters): blocks, each a model named by `type`, snake_case.

export type LatencyType = 'static' | 'lognormal' | 'maker_taker' | 'recorded';
export type QueueType = 'optimistic' | 'risk_averse' | 'probabilistic';
export type FeeType = 'registry' | 'static' | 'parametric';
export type SelfTradePrevention = 'CANCEL_INCOMING' | 'CANCEL_RESTING';

// A field being edited may be blank (''); validateBlocks refuses it before it is sent.
type Num = number | '';

export interface Latency {
  type: LatencyType;
  latency_nanos?: Num;
  floor_nanos?: Num;
  median_nanos?: Num;
  p99_nanos?: Num;
  seed?: Num;
  base_nanos?: Num;
  taker_delay_nanos?: Num;
  maker_delay_nanos?: Num;
  fallback?: Latency;
}

export interface QueueModel {
  type: QueueType;
  cancel_ahead_probability?: Num;
}

export interface FeeModel {
  type: FeeType;
  taker_fee?: Num;
  maker_fee?: Num;
  taker_fee_rate?: Num;
  maker_fee_rate?: Num;
}

export interface SimulationBlocks {
  fee_model?: FeeModel;
  network_latency?: Latency;
  order_processing_latency?: Latency;
  market_data_latency?: Latency;
  queue_model?: QueueModel;
  self_trade_prevention?: SelfTradePrevention;
}

export type LatencyBlock = 'network_latency' | 'order_processing_latency' | 'market_data_latency';

// A paper session's (or a rule's, or a strategy template's) simulation: overrides by exchange code and by listing id
// over each exchange's registry parameters, which the registry reads as of as_of (pinned when the session launches).
export interface SessionSimulation {
  as_of?: string;
  seed?: number;
  exchanges?: Record<string, SimulationBlocks>;
  listings?: Record<string, SimulationBlocks>;
}

// One exchange's recorded parameters (sm.simulation_parameters), as the registry returns the row.
export interface SimulationParametersRow {
  simulation_parameters_id: string;
  exchange_id: number;
  definition: Required<Omit<SimulationBlocks, 'fee_model'>>;
  note: string | null;
  actor: string | null;
  recorded_at: string;
}

export const LATENCY_FIELDS: Record<Exclude<LatencyType, 'recorded'>, { key: keyof Latency; label: string }[]> = {
  static: [{ key: 'latency_nanos', label: 'Latency (ns)' }],
  lognormal: [
    { key: 'floor_nanos', label: 'Floor (ns)' },
    { key: 'median_nanos', label: 'Median (ns)' },
    { key: 'p99_nanos', label: 'p99 (ns)' },
  ],
  maker_taker: [
    { key: 'base_nanos', label: 'Base (ns)' },
    { key: 'taker_delay_nanos', label: 'Taker delay (ns)' },
    { key: 'maker_delay_nanos', label: 'Maker delay (ns)' },
  ],
};

export const LATENCY_TYPE_OPTIONS = [
  { value: 'static', label: 'Static' },
  { value: 'lognormal', label: 'Log-normal (floor + tail)' },
  { value: 'maker_taker', label: 'Maker/Taker' },
];

export const QUEUE_TYPE_OPTIONS = [
  { value: 'risk_averse', label: 'Risk averse' },
  { value: 'optimistic', label: 'Optimistic' },
  { value: 'probabilistic', label: 'Probabilistic' },
];

export const FEE_TYPE_OPTIONS = [
  { value: 'registry', label: "Venue's fees (fee schedules)" },
  { value: 'static', label: 'Static' },
  { value: 'parametric', label: 'Parametric' },
];

export const SELF_TRADE_OPTIONS = [
  { value: 'CANCEL_INCOMING', label: 'Cancel incoming (Kalshi taker_at_cross)' },
  { value: 'CANCEL_RESTING', label: 'Cancel resting (Kalshi maker)' },
];

export const BLOCK_LABELS: Record<keyof SimulationBlocks, string> = {
  fee_model: 'Fees',
  network_latency: 'Network latency',
  order_processing_latency: 'Order latency',
  market_data_latency: 'Market data latency',
  queue_model: 'Queue model',
  self_trade_prevention: 'Self-trade prevention',
};

function ms(nanos: Num | undefined): string {
  if (nanos === '' || nanos === undefined) return '?';
  const value = Number(nanos) / 1_000_000;
  return `${Number.isInteger(value) ? value : value.toFixed(3).replace(/0+$/, '')}ms`;
}

export function describeLatency(l: Latency | undefined): string {
  if (!l) return '—';
  switch (l.type) {
    case 'static': return `static ${ms(l.latency_nanos)}`;
    case 'lognormal': return `log-normal ${ms(l.floor_nanos)} / ${ms(l.median_nanos)} / ${ms(l.p99_nanos)}`;
    case 'maker_taker': return `${ms(l.base_nanos)} + ${ms(l.taker_delay_nanos)} taking, + ${ms(l.maker_delay_nanos)} making`;
    case 'recorded': return `as recorded (else ${describeLatency(l.fallback)})`;
    default: return String((l as Latency).type);
  }
}

export function describeQueue(q: QueueModel | undefined): string {
  if (!q) return '—';
  return q.type === 'probabilistic' ? `probabilistic, ${q.cancel_ahead_probability} cancel ahead` : q.type.replace('_', ' ');
}

export function describeFee(f: FeeModel | undefined): string {
  if (!f || f.type === 'registry') return "venue's fee schedules";
  return f.type === 'static' ? `static ${f.taker_fee} taker / ${f.maker_fee} maker` : `parametric ${f.taker_fee_rate} / ${f.maker_fee_rate}`;
}

export function describeBlock(key: keyof SimulationBlocks, blocks: SimulationBlocks): string {
  switch (key) {
    case 'fee_model': return describeFee(blocks.fee_model);
    case 'queue_model': return describeQueue(blocks.queue_model);
    case 'self_trade_prevention': return blocks.self_trade_prevention?.toLowerCase().replace('_', ' ') ?? '—';
    default: return describeLatency(blocks[key]);
  }
}

// The fields of a model the user just switched to: the previous values where the model is the same shape, else blank.
export function newLatency(type: LatencyType, from?: Latency): Latency {
  if (type === 'recorded') return { type, fallback: from && from.type !== 'recorded' ? from : { type: 'static', latency_nanos: 50_000_000 } };
  const fields = Object.fromEntries(LATENCY_FIELDS[type].map(f => [f.key, from?.type === type ? from[f.key] : '']));
  return { type, ...fields } as Latency;
}

export function newQueue(type: QueueType): QueueModel {
  return type === 'probabilistic' ? { type, cancel_ahead_probability: 0.5 } : { type };
}

export function newFee(type: FeeType): FeeModel {
  if (type === 'static') return { type, taker_fee: '', maker_fee: '' };
  if (type === 'parametric') return { type, taker_fee_rate: '', maker_fee_rate: '' };
  return { type };
}

function wholeNanos(name: string, v: Num | undefined): string | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? null : `${name} must be a whole number of nanoseconds`;
}

function latencyProblem(name: string, l: Latency): string | null {
  if (l.type === 'recorded') return l.fallback ? latencyProblem(`${name} fallback`, l.fallback) : `${name} needs a fallback`;
  for (const f of LATENCY_FIELDS[l.type]) {
    const problem = wholeNanos(`${name} ${f.label.replace(' (ns)', '').toLowerCase()}`, l[f.key] as Num | undefined);
    if (problem) return problem;
  }
  if (l.seed !== undefined && l.seed !== '' && !Number.isSafeInteger(l.seed)) return `${name} seed must be a whole number`;
  if (l.type === 'lognormal' && !(Number(l.floor_nanos) < Number(l.median_nanos) && Number(l.median_nanos) < Number(l.p99_nanos))) {
    return `${name} needs floor < median < p99`;
  }
  return null;
}

// What the registry would refuse in these blocks (lambda/simulation/parameters.ts), worded for a form.
export function blocksProblem(where: string, blocks: SimulationBlocks): string | null {
  for (const key of ['network_latency', 'order_processing_latency', 'market_data_latency'] as LatencyBlock[]) {
    const l = blocks[key];
    if (l) {
      const problem = latencyProblem(`${where}: ${BLOCK_LABELS[key]}`, l);
      if (problem) return problem;
    }
  }
  const q = blocks.queue_model;
  if (q?.type === 'probabilistic') {
    const p = q.cancel_ahead_probability;
    if (typeof p !== 'number' || p < 0 || p > 1) return `${where}: cancel ahead probability must be within 0 and 1`;
  }
  const f = blocks.fee_model;
  if (f && f.type !== 'registry') {
    const keys = f.type === 'static' ? ['taker_fee', 'maker_fee'] : ['taker_fee_rate', 'maker_fee_rate'];
    if (keys.some(k => typeof f[k as keyof FeeModel] !== 'number')) return `${where}: ${f.type} fees need a taker and a maker rate`;
  }
  return null;
}

export function simulationProblem(sim: SessionSimulation): string | null {
  for (const [code, blocks] of Object.entries(sim.exchanges ?? {})) {
    const problem = blocksProblem(code, blocks);
    if (problem) return problem;
  }
  for (const [listingId, blocks] of Object.entries(sim.listings ?? {})) {
    const problem = blocksProblem(`Listing ${listingId}`, blocks);
    if (problem) return problem;
  }
  return null;
}

// Without empty override sets, so a config that overrides nothing carries nothing.
export function compactSimulation(sim: SessionSimulation): SessionSimulation {
  const nonEmpty = (m?: Record<string, SimulationBlocks>) =>
    Object.fromEntries(Object.entries(m ?? {}).filter(([, b]) => Object.keys(b).length > 0));
  const out: SessionSimulation = {};
  if (sim.as_of) out.as_of = sim.as_of;
  if (sim.seed !== undefined) out.seed = sim.seed;
  const exchanges = nonEmpty(sim.exchanges);
  if (Object.keys(exchanges).length) out.exchanges = exchanges;
  const listings = nonEmpty(sim.listings);
  if (Object.keys(listings).length) out.listings = listings;
  return out;
}

export function toSessionSimulation(raw: unknown): SessionSimulation {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as SessionSimulation : {};
}
