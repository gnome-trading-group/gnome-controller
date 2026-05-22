export enum SecurityType {
  SPOT = 0,
  PERPETUAL = 1,
  FUTURE = 2,
  OPTION = 3,
}

export enum ContractType {
  NONE = 0,
  LINEAR_PERPETUAL = 1,
  INVERSE_PERPETUAL = 2,
  LINEAR_FUTURE = 3,
  INVERSE_FUTURE = 4,
  CALL_OPTION = 5,
  PUT_OPTION = 6,
}

export enum AssetClass {
  CRYPTO = 0,
  EQUITY = 1,
  COMMODITY = 2,
  FX = 3,
  INDEX = 4,
}

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
