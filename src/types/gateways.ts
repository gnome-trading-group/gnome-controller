// An order gateway as the registry's `GET /gateways/status` gives it: its row (what is wanted of it), what it last wrote
// of itself (its endpoint, every 15 s), and its last hour, written by the gateway once a minute.

export interface GatewayEndpoint {
  state: string;
  instance: string;
  privateIp: string;
  port: number;
  version: string;
  writtenAt: string;
  linkedSessions: number;
  workingOrders: number;
  // Whether its release stops without cancelling when rolled; one that can't would cancel every order.
  canHandOver: boolean;
  // Stopping for a roll, its orders left resting for the next process on its host.
  handover: boolean;
  // When its process started; null from a release that doesn't say.
  startedAt?: string | null;
  // A paper gateway's load against its caps; null for a live one or a release that doesn't say.
  paper?: GatewayPaperLoad | null;
  // The zone its host runs in, by name and ID; null from a release that doesn't say.
  availabilityZone?: string | null;
  availabilityZoneId?: string | null;
}

// What a paper gateway carries against its caps. A book is a session's listing (heap); streams are the distinct ones its
// shard reader reads every pass. A new session past either cap is refused and goes to another of the venue's instances.
export interface GatewayPaperLoad {
  books: number;
  streams: number;
  recordsPerSecond: number;
  maxBooks: number;
  maxStreams: number;
}

export type GatewayRollPhase = 'stopping' | 'starting' | 'rolling_back' | 'done' | 'rolled_back' | 'failed' | 'refused';

// The gateway reconciler's record of the last roll it took up: moving a running gateway onto another release without
// cancelling its orders. Kept a day.
export interface GatewayRoll {
  requestedAt: string;
  phase: GatewayRollPhase;
  fromVersion: string | null;
  toVersion: string | null;
  startedAt: string | null;
  endedAt: string | null;
  // Why it was refused, rolled back or failed, or how it ended.
  reason: string | null;
}

// One account's minute on a live gateway, as its lane counted it. Waits are for the account's request budget; answers
// are the venue's round trips.
export interface GatewayAccountMinute {
  endedAt: number;
  cancels: number;
  cancelWaitP99Us: number;
  cancelWaitMaxUs: number;
  orders: number;
  orderWaitP99Us: number;
  orderWaitMaxUs: number;
  held: number;
  refusedWaiting: number;
  refusedWithoutConnection: number;
  dropped: number;
  orderAnswerP50Us: number;
  orderAnswerP99Us: number;
  cancelAnswerP50Us: number;
  cancelAnswerP99Us: number;
  unanswered: number;
  connectionsBusy: number;
  venueRefusals: number;
}

// What one session's slot sent to the venue in the account's last minute; sessionId null if no session holds it now.
export interface GatewaySessionSends {
  slot: number;
  sessionId: string | null;
  sent: number;
}

export interface GatewayAccountMinutes {
  accountId: number;
  name: string;
  minutes: GatewayAccountMinute[];
  sessions: GatewaySessionSends[];
}

// A paper gateway's simulated venue over a minute. lagMaxMs: the oldest new market-data record any book took, from the
// venue's receipt; refusedNotReady counts since the gateway started.
export interface GatewayPaperMinute {
  endedAt: number;
  sessions: number;
  workingOrders: number;
  lagMaxMs: number;
  refusedNotReady: number;
  // From releases that report their load: books, distinct streams, records/s over the minute, and the share of new
  // records later than 5 ms (over 1%, the books' lag p99 is past 5 ms).
  books?: number;
  streams?: number;
  recordsPerSecond?: number;
  lateShare?: number;
  // New sessions refused for room (past a cap), since the gateway started.
  refusedForRoom?: number;
}

export interface GatewayMinutes {
  gatewayKey: string;
  mode: string;
  writtenAt: number;
  accounts: GatewayAccountMinutes[];
  paper?: { minutes: GatewayPaperMinute[] };
}

export interface GatewayStatus {
  gatewayKey: string;
  mode: 'live' | 'paper';
  exchangeId: number;
  exchangeCode: string | null;
  region: string;
  profile: string;
  pinnedVersion: string | null;
  // What a start, and so a roll, would run: its pin, else the latest release; null if that couldn't be read.
  rollTargetVersion: string | null;
  // Its exchange's home zone (an ID), where it starts; null when the exchange has none.
  homeZoneId?: string | null;
  wantedAt: string | null;
  accounts: number;
  rollRequestedAt: string | null;
  rollRequestedBy: string | null;
  roll: GatewayRoll | null;
  // Null when it isn't running (no endpoint written in the last minute).
  endpoint: GatewayEndpoint | null;
  // Null when it has written none in the last 10 minutes.
  minutes: GatewayMinutes | null;
}
