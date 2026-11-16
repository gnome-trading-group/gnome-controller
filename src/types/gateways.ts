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
