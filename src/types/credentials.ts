// The per-exchange keys market data signs in with (registry /market-data-keys). Only metadata: Secrets Manager holds
// the keys, and the registry never returns them.
export interface MarketDataKeyReplica {
  region: string;
  status: 'InSync' | 'InProgress' | 'Failed' | 'Missing' | string;
  message: string | null;
}

export interface MarketDataKey {
  exchangeCode: string;
  secretName: string;
  exists: boolean;
  apiKeyId: string | null;
  updatedBy: string | null;
  lastChangedAt: string | null;
  replicas: MarketDataKeyReplica[];
  inSync: boolean;
}
