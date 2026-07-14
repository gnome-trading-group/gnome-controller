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
  | 'COMPLEMENT'
  | 'IMPLIES'
  | 'MUTUALLY_EXCLUSIVE'
  | 'CORRELATED'
  | 'HEDGEABLE_WITH';

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
  exchangeName: string;
  region: string;
  schemaType: string;
  dateCreated: string;
  dateModified: string;
}

export interface Listing {
  listingId: number;
  exchangeId: number;
  securityId: number;
  exchangeSecurityId: string;
  exchangeSecuritySymbol: string;
  dateCreated: string;
  dateModified: string;
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
  recordedAt: string;
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
  resolutionSource: string | null;
  tags: string[];
  resolved: boolean;
  resolvedAt: string | null;
  expiry: string | null;
  dateCreated: string;
  dateModified: string;
}

export interface EventContract {
  eventContractId: number;
  eventId: number;
  securityId: number;
  outcomeLabel: string;
  dateCreated: string;
}

export interface ContractRelationship {
  relationshipId: number;
  securityIdA: number;
  securityIdB: number;
  relationshipType: ContractRelationshipType;
  confidence: number;
  method: string;
  dateCreated: string;
}

export interface ExchangeEvent {
  exchangeEventId: number;
  exchangeId: number;
  eventId: number;
  nativeEventId: string;
  rawTitle: string;
  dateCreated: string;
}

export interface CreateContractRelationship {
  securityIdA: number;
  securityIdB: number;
  relationshipType: ContractRelationshipType;
  confidence: number;
  method: string;
}
