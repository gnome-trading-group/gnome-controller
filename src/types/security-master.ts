export enum SecurityType {
  SPOT = 0,
  PERPETUAL = 1,
  FUTURE = 2,
  OPTION = 3,
  EVENT_CONTRACT = 4,
}

export enum ContractType {
  NONE = 0,
  LINEAR_PERPETUAL = 1,
  INVERSE_PERPETUAL = 2,
  LINEAR_FUTURE = 3,
  INVERSE_FUTURE = 4,
  CALL_OPTION = 5,
  PUT_OPTION = 6,
  BINARY = 7,
  MULTI_OUTCOME = 8,
}

export enum AssetClass {
  CRYPTO = 0,
  EQUITY = 1,
  COMMODITY = 2,
  FX = 3,
  INDEX = 4,
  PREDICTION = 5,
}

export type ContractRelationshipType =
  | 'EQUIVALENT'
  | 'IMPLIES';

export interface Security {
  securityId: number;
  symbol: string;
  type: number;
  contractType: number;
  assetClass: number;
  baseCurrency: string | null;
  quoteCurrency: string | null;
  settleCurrency: string | null;
  inverse: boolean;
  isQuanto: boolean;
  expiry: string | null;
  strikePrice: number | null;
  active: boolean;
  underlyingSecurityId: number | null;
  description: string | null;
  dateCreated: string;
  dateModified: string;
}

export interface Exchange {
  exchangeId: number;
  exchangeCode: string;
  exchangeName: string;
  region: string;
  dateCreated: string;
  dateModified: string;
}

// Where market data comes from: a trading venue (one per exchange, created with it) or a data vendor.
export type SourceKind = 'VENUE' | 'VENDOR';

export interface Source {
  sourceId: number;
  code: string;
  kind: SourceKind;
  exchangeId: number | null;
  // Vendors only; a venue collects in its exchange's region.
  homeRegion: string | null;
  adapter: string;
  families: string[];
  active: boolean;
  // Capacity, read by shard assignment: markets on one connection, how many connections the venue allows and per
  // what (null: no limit), and how many subscribe messages a client may send a minute (null: no limit).
  maxPerConnection: number;
  connectionScope: ConnectionScope;
  connectionsPerScope: number | null;
  clientMessagesPerMinute: number | null;
  dateCreated: string;
  dateModified: string;
}

export type ConnectionScope = 'IP' | 'KEY' | 'ACCOUNT';

// One thing collected from a source: a listing's book (subjectKind LISTING) or a vendor subject such as a match.
export interface Stream {
  streamId: number;
  sourceId: number;
  sourceCode: string;
  sourceKind: SourceKind;
  subjectKind: string;
  listingId: number | null;
  nativeSubjectId: string;
  family: string;
  region: string | null;
  // Where the stream is collected: its own override, else the venue's exchange region, else the vendor's home region.
  resolvedRegion: string;
  eventId: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  dateCreated: string;
}

export interface Listing {
  listingId: number;
  exchangeId: number;
  securityId: number;
  exchangeSecurityId: string;
  exchangeSecuritySymbol: string;
  dateCreated: string;
  dateModified: string;
  // The venue's keys fee schedules target: a coarse group (a Kalshi series) and the venue's own event id.
  feeGroup?: string | null;
  feeEvent?: string | null;
}

export interface DenormalizedListing extends Listing {
  exchangeName: string;
  securitySymbol: string;
  securityType: number;
  securityActive: boolean;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ListingSpec {
  listingId: number;
  tickSize: number;
  lotSize: number;
  minNotional: number;
  contractMultiplier: number;
  minSize: number;
  // When the spec held at the venue; recordedAt is when it was written.
  effectiveFrom: string;
  recordedAt: string;
}

// A fill's fee is the sum of its components, each charged at the taker or maker rate by the fill's liquidity
// (negative is a rebate), then rounded: see gnome-registry's sm.fee_schedule.
export type FeeKind = 'PRICE_CURVE' | 'NOTIONAL' | 'PER_UNIT';
export type FeeRoundingMode = 'NONE' | 'CEIL' | 'HALF_UP' | 'HALF_EVEN';
export type FeeRoundingScope = 'FILL' | 'ORDER_ACCUMULATOR';

export interface FeeComponent {
  kind: FeeKind;
  taker: number;
  maker: number;
  exponent?: number;
  side?: 'BUY' | 'SELL';
}

export interface FeeDefinition {
  currency: string;
  components: FeeComponent[];
  rounding: { mode: FeeRoundingMode; increment?: number; scope?: FeeRoundingScope };
}

export type FeeSource = 'VENUE_API' | 'MANUAL' | 'BACKFILL';

/** One stored schedule: it targets the exchange, one of its fee groups or fee events, or a listing. */
export interface FeeScheduleRow {
  feeScheduleId: string;
  exchangeId: number;
  feeGroup: string | null;
  feeEvent: string | null;
  listingId: number | null;
  effectiveFrom: string;
  recordedAt: string;
  // Null lifts the scope from then on, so its listings fall back to the next scope out.
  definition: FeeDefinition | null;
  source: FeeSource;
  sourceRef: string | null;
  actor: string | null;
}

export type FeeScope = 'LISTING' | 'FEE_EVENT' | 'FEE_GROUP' | 'EXCHANGE';

/** One stretch of a listing's resolved fees: effectiveTo is exclusive, null while it holds. */
export interface FeeTimelineEntry {
  effectiveFrom: string;
  effectiveTo: string | null;
  scope: FeeScope;
  feeScheduleId: string;
  definition: FeeDefinition;
}

export interface CreateFeeSchedule {
  exchangeId?: number;
  feeGroup?: string;
  feeEvent?: string;
  listingId?: number;
  effectiveFrom: string;
  definition: FeeDefinition | null;
  source: FeeSource;
  sourceRef?: string;
}

export interface Currency {
  currencyId: number;
  symbol: string;
  name: string | null;
  decimals: number;
  dateCreated: string;
  dateModified: string;
}

export interface Event {
  eventId: number;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  resolved: boolean;
  resolvedAt: string | null;
  expiry: string | null;
  dateCreated: string;
  dateModified: string;
  exchangeId: number | null;
  nativeEventId: string | null;
  nativeUrl: string | null;
  // About USD traded over the last 24 hours, as the classifier last read it; null before its first reading.
  volume24h: number | null;
  volumeUpdatedAt: string | null;
}

export interface EventContract {
  eventContractId: number;
  eventId: number;
  securityId: number;
  outcomeLabel: string;
  dateCreated: string;
  securitySymbol?: string;
  // What the outcome paid once its result was final (1e9 = $1), and when that was recorded; null until then.
  settlementPrice: string | null;
  settledAt: string | null;
}

// The rule a derived relationship came from and the proposition fields it compared, as the classifier wrote them
// (snake_case keys).
export interface RelationshipEvidence {
  rule: string;
  version: string;
  a: Record<string, unknown>;
  b: Record<string, unknown>;
}

export interface ContractRelationship {
  relationshipId: number;
  securityIdA: number;
  securityIdB: number;
  relationshipType: ContractRelationshipType;
  method: string;
  flags: string[];
  evidence?: RelationshipEvidence | null;
  derivationVersion?: string | null;
  dateCreated: string;
  symbolA?: string;
  symbolB?: string;
}

// What a proposition's contracts are about; duplicates are merged into a canonical subject.
export interface PropositionSubject {
  subjectId: number;
  key: string;
  description: string;
  derivedAt: string | null;
  dateCreated: string;
  dateModified: string;
  hasEmbedding: boolean;
  canonicalSubjectId: number | null;
  propositionCount: number;
  similarity?: number;
}

export interface SubjectDuplicate {
  similarity: number;
  subjectId: number;
  key: string;
  description: string;
  dateCreated: string;
  propositionCount: number;
  candidateSubjectId: number;
  candidateKey: string;
  candidateDescription: string;
  candidateDateCreated: string;
  candidatePropositionCount: number;
}

export interface SubjectMergeLogEntry {
  mergeLogId: number;
  action: 'MERGE' | 'UNMERGE';
  aliasSubjectId: number;
  aliasKey: string;
  canonicalSubjectId: number;
  canonicalKey: string;
  actor: string;
  propositionsMoved: number;
  dateCreated: string;
}

// What one security asks, as the classifier extracted it; `fields` keeps the classifier's snake_case keys.
export interface ContractProposition {
  securityId: number;
  subjectId: number;
  extractedSubjectId: number;
  fields: Record<string, unknown>;
  method: 'VENUE' | 'LLM';
  extractorVersion: string;
  sourceHash: string;
  dateCreated: string;
  dateModified: string;
  symbol?: string;
  eventId?: number | null;
  outcomeLabel?: string | null;
  eventTitle?: string | null;
  eventResolved?: boolean | null;
  exchangeCode?: string | null;
  exchangeSecurityId?: string | null;
}

export interface CreateContractRelationship {
  securityIdA: number;
  securityIdB: number;
  relationshipType: ContractRelationshipType;
  method: string;
}


