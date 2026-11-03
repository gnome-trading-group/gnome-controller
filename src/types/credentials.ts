// What the registry says about a market-data account's key. Only metadata: Secrets Manager holds the keys, and the
// registry never returns them.
export interface SecretReplica {
  region: string;
  status: 'InSync' | 'InProgress' | 'Failed' | 'Missing' | string;
  message: string | null;
}

/** A market-data secret as Secrets Manager describes it; never its value. */
export interface SecretStatus {
  secretName: string;
  exists: boolean;
  apiKeyId: string | null;
  updatedBy: string | null;
  lastChangedAt: string | null;
  replicas: SecretReplica[];
  inSync: boolean;
}

// A dedicated market-data account a source's shards collect with (registry /market-data-accounts): the registry's
// record of it plus its key's state in Secrets Manager.
export interface MarketDataAccount {
  accountId: number;
  sourceId: number;
  sourceCode: string;
  label: string;
  secretName: string;
  connectionBudget: number | null;
  status: 'ACTIVE' | 'RETIRED';
  note: string | null;
  createdBy: string;
  dateCreated: string;
  dateModified: string;
  key: SecretStatus;
}
