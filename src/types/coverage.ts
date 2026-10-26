// Coverage of the stored market data, by stream (a listing's book, or a vendor feed), from the daily inventory.
export interface CoverageSummaryResponse {
  totalFiles: number;
  totalSizeBytes: number;
  totalMinutes: number;
  streamCount: number;
  earliestDate?: string;
  latestDate?: string;
  streams: Record<string, StreamCoverageSummary>;
  recordTypes: Record<string, RecordTypeStats>;
  lastInventoryDate?: number;
  error?: string;
}

export interface StreamCoverageSummary {
  streamId: number;
  fileCount: number;
  totalMinutes: number;
  totalSizeBytes: number;
  earliestDate?: string;
  latestDate?: string;
  recordTypes: string[];
}

export interface RecordTypeStats {
  fileCount: number;
  minuteCount: number;
  sizeBytes: number;
}

export interface StreamCoverageResponse {
  streamId: number;
  coverage: Record<string, DayCoverage>;
  summary: {
    totalDays: number;
    totalMinutes: number;
    earliestDate?: string;
    latestDate?: string;
    totalSizeBytes: number;
    recordTypes: string[];
  };
  error?: string;
}

export interface DayCoverage {
  hasCoverage: boolean;
  totalMinutes: number;
  recordTypes: Record<string, RecordTypeDayCoverage>;
}

export interface RecordTypeDayCoverage {
  hasCoverage: boolean;
  minutes: number;
  sizeBytes: number;
}
