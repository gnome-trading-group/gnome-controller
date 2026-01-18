export type GapStatus = 'UNREVIEWED' | 'REVIEWED';

export type GapReason = 'EXCHANGE_CLOSED' | 'INTERNAL_ERROR' | 'OTHER' | 'UNKNOWN';

export interface Gap {
  listingId: number;
  timestamp: number;
  status: GapStatus;
  reason: GapReason;
  expected: boolean;
  note: string | null;
  createdAt: number;
}

export interface GapsListResponse {
  gaps: Gap[];
  lastEvaluatedKey?: string;
  error?: string;
}

export interface GapsListParams {
  status?: GapStatus;
  limit?: number;
  lastEvaluatedKey?: string;
}

export interface GapsByListingParams {
  listingId: number;
  limit?: number;
  lastEvaluatedKey?: string;
}

export interface GapUpdateItem {
  listingId: number;
  timestamp: number;
  reason?: GapReason;
  expected?: boolean;
  note?: string;
}

export interface GapsUpdateRequest {
  gaps: GapUpdateItem[];
}

export interface GapUpdateError {
  gap: {
    listingId: number;
    timestamp: number;
  };
  error: string;
}

export interface GapsUpdateResponse {
  updated: number;
  errors: GapUpdateError[] | null;
}

