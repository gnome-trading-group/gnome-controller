export type QualityIssueStatus = 'UNREVIEWED' | 'REVIEWED';

export type QualityRuleType = string;

const RULE_TYPE_PALETTE = ['red', 'orange', 'grape', 'blue', 'cyan', 'teal', 'indigo', 'yellow', 'pink', 'violet', 'green', 'lime'];

export function formatRuleType(ruleType: string): string {
  return ruleType.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

export function getRuleTypeColor(ruleType: string): string {
  let hash = 0;
  for (let i = 0; i < ruleType.length; i++) hash = (hash * 31 + ruleType.charCodeAt(i)) | 0;
  return RULE_TYPE_PALETTE[Math.abs(hash) % RULE_TYPE_PALETTE.length];
}

export interface QualityIssue {
  listingId: number;
  issueId: string;
  ruleType: QualityRuleType;
  status: QualityIssueStatus;
  timestamp: number;
  s3Key: string;
  details: string | null;
  recordCount: number | null;
  note: string | null;
  createdAt: number;
}

export interface QualityIssuesListResponse {
  issues: QualityIssue[];
  lastEvaluatedKey?: string;
  error?: string;
}

export interface QualityIssuesListParams {
  status?: QualityIssueStatus;
  ruleType?: QualityRuleType;
  limit?: number;
  lastEvaluatedKey?: string;
}

export interface QualityIssuesByListingParams {
  listingId: number;
  limit?: number;
  lastEvaluatedKey?: string;
}

export interface QualityIssueUpdateItem {
  listingId: number;
  issueId: string;
  note?: string;
}

export interface QualityIssuesUpdateRequest {
  issues: QualityIssueUpdateItem[];
}

export interface QualityIssuesUpdateResponse {
  updated: number;
  errors: { issue: QualityIssueUpdateItem; error: string }[] | null;
}

export type QualityBackfillMode = 'statistics' | 'issues' | 'all';

export interface QualityBackfillRequest {
  exchangeId: number;
  securityId: number;
  startDate: string;
  endDate: string;
  mode?: QualityBackfillMode;
  resetStatistics?: boolean;
}

export interface QualityBackfillResponse {
  message: string;
  days: number;
}

export interface ListingStatisticMetric {
  mean: number;
  stddev: number;
  count: number;
}

export interface ListingStatisticsResponse {
  listingId: number;
  metrics: Record<string, ListingStatisticMetric>;
  lastUpdated: number | null;
}

export interface ListingStatisticsHistoryPoint {
  date: string;
  metrics: Record<string, ListingStatisticMetric>;
}

export interface ListingStatisticsHistoryResponse {
  listingId: number;
  history: ListingStatisticsHistoryPoint[];
  lookbackDays: number;
}

export interface MinuteMetrics {
  timestamp: number;
  hasData: boolean;
  recordCount: number | null;
  metrics: Record<string, number>;
}

export interface MinuteInvestigationIssue {
  issueId: string;
  ruleType: string;
  timestamp: number;
  details: string | null;
  recordCount: number | null;
  status: QualityIssueStatus;
}

export interface MinuteInvestigationResponse {
  listingId: number;
  schemaType: string;
  centerTimestamp: number;
  windowMinutes: number;
  minutes: MinuteMetrics[];
  issues: MinuteInvestigationIssue[];
  baseline: Record<string, ListingStatisticMetric>;
}
