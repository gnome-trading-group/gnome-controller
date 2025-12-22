export enum SecurityType {
  SPOT = 0,
  PERPETUAL_FUTURE = 1,
}

export interface Security {
  securityId: number;
  symbol: string;
  type: number;
  description?: string;
  dateCreated: string;
  dateModified: string;
}

export interface Exchange {
  exchangeId: number;
  exchangeName: string;
  region: string;
  dateCreated: string;
  dateModified: string;
}

export interface Listing {
  listingId: number;
  exchangeId: number;
  securityId: number;
  exchangeSecurityId: string;
  exchangeSecuritySymbol: string;
  schemaType: string;
  dateCreated: string;
  dateModified: string;
}