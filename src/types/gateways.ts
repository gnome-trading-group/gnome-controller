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
  wantedAt: string | null;
  accounts: number;
  // Null when it isn't running (no endpoint written in the last minute).
  endpoint: GatewayEndpoint | null;
  // Null when it has written none in the last 10 minutes.
  minutes: GatewayMinutes | null;
}
