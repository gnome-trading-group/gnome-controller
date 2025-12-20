export interface LatencyProbeTarget {
  url: string;
  protocol: 'http' | 'websocket' | 'tcp';
  method?: string;
}

export interface LatencyProbeRequest {
  targets: LatencyProbeTarget[];
  regions: string[];
  samples: number;
  warmup: boolean;
  timeout: number;
}

export interface LatencyResult {
  samples: number[];
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
}

export interface RegionResult {
  region: string;
  regionName: string;
  status: 'success' | 'error';
  error?: string;
  latencies: LatencyResult | null;
}

export interface TargetResult {
  target: {
    url: string;
    protocol: string;
  };
  regions: RegionResult[];
}

export interface LatencyProbeResponse {
  timestamp: string;
  results: TargetResult[];
}