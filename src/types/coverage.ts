// Coverage Summary Response
export interface CoverageSummaryResponse {
  totalFiles: number;
  totalSizeBytes: number;
  totalMinutes: number;
  securityExchangeCount: number;
  earliestDate?: string;
  latestDate?: string;
  securities: Record<string, SecurityExchangeCoverageSummary>;
  schemaTypes: Record<string, SchemaTypeStats>;
  lastInventoryDate?: number;
  error?: string;
}

export interface SecurityExchangeCoverageSummary {
  securityId: number;
  exchangeId: number;
  fileCount: number;
  minuteCount: number;
  sizeBytes: number;
  earliestDate?: string;
  latestDate?: string;
  schemaTypes: string[];
}

export interface SchemaTypeStats {
  fileCount: number;
  minuteCount: number;
  sizeBytes: number;
}

// Security Coverage Response (all exchanges for a security)
export interface SecurityCoverageResponse {
  securityId: number;
  exchanges: Record<string, ExchangeCoverage>;
  coverage: Record<string, SecurityDayCoverage>;
  summary: {
    totalExchanges: number;
    totalDays: number;
    totalMinutes: number;
    earliestDate: string;
    latestDate: string;
    totalSizeBytes: number;
    schemaTypes: string[];
  };
  error?: string;
}

export interface ExchangeCoverage {
  exchangeId: number;
  totalDays: number;
  totalMinutes: number;
  totalSizeBytes: number;
  earliestDate: string;
  latestDate: string;
  schemaTypes: string[];
}

export interface SecurityDayCoverage {
  hasCoverage: boolean;
  totalMinutes: number;
  schemaTypes: Record<string, SchemaTypeDayCoverage>;
  exchanges: Record<string, ExchangeDayCoverage>;
}

export interface ExchangeDayCoverage {
  minutes: number;
  schemaTypes: Record<string, { minutes: number; sizeBytes: number }>;
}

export interface SchemaTypeDayCoverage {
  hasCoverage: boolean;
  minutes: number;
  sizeBytes: number;
}

// Security+Exchange Coverage Response (detailed day-by-day)
export interface SecurityExchangeCoverageResponse {
  securityId: number;
  exchangeId: number;
  coverage: Record<string, DayCoverage>;
  summary: {
    totalDays: number;
    totalMinutes: number;
    earliestDate: string;
    latestDate: string;
    totalSizeBytes: number;
    schemaTypes: string[];
  };
  error?: string;
}

export interface DayCoverage {
  hasCoverage: boolean;
  totalMinutes: number;
  schemaTypes: Record<string, SchemaTypeDayCoverage>;
}

