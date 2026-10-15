export type SessionStatus = 'running' | 'completed' | 'stalled' | 'paused';

export interface ResearchSession {
  sessionName: string;
  sk: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  owner: string;
  description: string;
  tags: string[];
  iterationCount: number;
  bestIteration?: number;
  bestPnl?: number;
  bestSharpe?: number;
  branch: string;
  primaryMetric?: string;
  primaryMetricDirection?: string;
  specYaml?: string;
  iterations?: ResearchIteration[];
  notes?: ResearchNote[];
}

export interface ResearchIteration {
  sessionName: string;
  sk: string;
  iteration: number;
  timestamp: string;
  type: 'local' | 'sweep' | 'manual';
  owner: string;
  title: string;
  description: string;
  metrics: Record<string, number>;
  metadata: Record<string, unknown>;
  environment: Record<string, string>;
}

export interface ResearchNote {
  sessionName: string;
  sk: string;
  timestamp: string;
  author: string;
  content: string;
}

export interface ResearchSessionListResponse {
  sessions: ResearchSession[];
  count: number;
}
