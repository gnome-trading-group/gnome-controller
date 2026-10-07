import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import { LaunchRequest, LaunchRule, RuleType } from '../types/launcher';
import { AttentionItem, ContractRelationship, DailyPnl, EventPositions, PriceHistory, RiskUsage, TableSizes, CreateContractRelationship, CreateHedgeKeyword, Currency, DenormalizedListing, Event, EventContract, Exchange, FirmSummary, HedgeKeyword, LedgerFill, LedgerOrder, LedgerPage, Listing, ListingSpec, Mode, PaginationParams, PnlSeries, RiskPolicy, SessionSummary, SessionTotals, StrategySummary, RiskPolicyHistory, Security, Strategy } from '../types';
import { ResearchSession, ResearchSessionListResponse, ResearchArtifactListResponse, ResearchDatasetListResponse } from '../types/research';
import { PipelineListResponse, PipelineDetailResponse } from '../types/pipeline';
import { CreateStrategySessionRequest, StrategySession } from '../types/strategy-sessions';
import { LatencyProbeRequest, LatencyProbeResponse } from '../types/latency-probe';
import { CoverageSummaryResponse, SecurityCoverageResponse, SecurityExchangeCoverageResponse } from '../types/coverage';
import { TransformJobsListResponse, TransformJobsSearchResponse, TransformJobsListParams, TransformJobsSearchParams } from '../types/transform-jobs';
import { GapsListResponse, GapsListParams, GapsByListingParams, GapsUpdateRequest, GapsUpdateResponse } from '../types/gaps';
import { QualityIssuesListResponse, QualityIssuesListParams, QualityIssuesByListingParams, QualityIssuesUpdateRequest, QualityIssuesUpdateResponse, QualityBackfillRequest, QualityBackfillResponse, ListingStatisticsResponse, ListingStatisticsHistoryResponse, MinuteInvestigationResponse } from '../types/quality-issues';
import { BboTimelineResponse } from '../types/bbo-timeline';

export interface ServiceConfigResponse {
  config: Record<string, unknown>;
  version: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ServiceConfigVersion {
  version: number;
  config: Record<string, unknown>;
  updated_at: string;
  updated_by: string;
}

export interface ServiceConfigHistoryResponse {
  versions: ServiceConfigVersion[];
}

// Which ledger rows to read: one session's, one strategy's in one mode, or every strategy's in one mode.
export type LedgerScope = { sessionId: string } | { strategyId: number; mode: Mode } | { mode: Mode };

// Narrows a fills or orders list; everything is optional.
export interface LedgerFilters {
  listingId?: number;
  side?: 0 | 1;
  // Fills only: VENUE, RECOVERY, RESET, ADJUSTMENT, GAP (comma-separated).
  source?: string;
  start?: string;
  end?: string;
}

export interface LedgerPageParams extends LedgerFilters {
  before?: string;
  after?: string;
  limit?: number;
}

function definedParams(params: Record<string, string | number | undefined>): Record<string, string | number> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string | number>;
}

const CONTROLLER_API_URL = import.meta.env.VITE_CONTROLLER_API_URL;
// The registry serves people under /cognito and services (with an API key) at the root; the UI must never hold a key.
const REGISTRY_API_URL = `${import.meta.env.VITE_REGISTRY_API_URL}/cognito`;
const MARKET_DATA_API_URL = import.meta.env.VITE_MARKET_DATA_API_URL;
const LAUNCHER_API_URL = import.meta.env.VITE_LAUNCHER_API_URL;

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiConfig {
  apiUrl: string;
  convertToCamelCase?: boolean;
  preserveKeys?: Set<string>;
  queryParams?: Record<string, string | number | boolean>;
  body?: any;
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function convertObjectToCamelCase(obj: any, preserveKeys?: Set<string>): any {
  if (Array.isArray(obj)) {
    return obj.map(item => convertObjectToCamelCase(item, preserveKeys));
  }

  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => {
        const camelKey = toCamelCase(key);
        return [camelKey, preserveKeys?.has(camelKey) ? value : convertObjectToCamelCase(value, preserveKeys)];
      })
    );
  }

  return obj;
}

let signingOut = false;

// Every endpoint needs a Cognito token, so once the session can't be refreshed or the API rejects the token, all calls
// fail until the user logs in again. Signing out shows the login screen instead of a page of identical errors.
function endSession() {
  if (signingOut) return;
  signingOut = true;
  const currentPath = window.location.pathname + window.location.search + window.location.hash;
  if (currentPath !== '/') sessionStorage.setItem('postLoginRedirect', currentPath);
  signOut().catch(() => { signingOut = false; });
}

export async function sendApiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
  config: ApiConfig,
): Promise<T> {
  try {
    const { tokens } = await fetchAuthSession().catch(() => ({ tokens: undefined }));
    if (!tokens?.idToken) {
      endSession();
      throw new ApiError(401, 'Your login has expired — signing you out');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: tokens.idToken.toString(),
    };

    let url = `${config.apiUrl}${endpoint}`;
    if (config.queryParams) {
      const params = new URLSearchParams();
      Object.entries(config.queryParams).forEach(([key, value]) => {
        params.append(key, String(value));
      });
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: config.body ? JSON.stringify(config.body) : undefined,
    });

    // Gateway rejections (401/403/502) come back as {message} or non-JSON, not the handlers' {body} shape.
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (response.ok) {
      return (config.convertToCamelCase ? convertObjectToCamelCase(data, config.preserveKeys) : data) as T;
    } else {
      if (response.status === 401) endSession();
      const body = data as { body?: string | { error?: string }; message?: string; error?: string } | null;
      const error = (typeof body?.body === 'string' ? body.body : body?.body?.error)
        ?? body?.message
        ?? body?.error
        ?? (text || `Request failed with status ${response.status}`);
      throw new ApiError(response.status, error);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, `Failed to make API request: ${error}`);
  }
}

export const marketDataApi = {
  listCollectors: () => sendApiRequest<{ collectors: any[] }>('/collectors/list', 'GET', {
    apiUrl: MARKET_DATA_API_URL,
  }),
  createCollector: (listingIds: number[], region: string, cpu?: string, memory?: string, orchestratorVersion?: string) =>
    sendApiRequest<{ message: string }>('/collectors/create', 'POST', {
      apiUrl: MARKET_DATA_API_URL,
      body: { listingIds, region, cpu, memory, orchestratorVersion },
    }),
  deleteCollector: (listingId: number) =>
    sendApiRequest<{ message: string }>('/collectors/delete', 'DELETE', {
      apiUrl: MARKET_DATA_API_URL,
      body: { listingId },
    }),
  purgeCollector: (listingId: number) =>
    sendApiRequest<{ message: string }>('/collectors/purge', 'DELETE', {
      apiUrl: MARKET_DATA_API_URL,
      body: { listingId },
    }),
  redeployCollector: (listingId?: number, orchestratorVersion?: string) =>
    sendApiRequest<{ message: string }>('/collectors/redeploy', 'POST', {
      apiUrl: MARKET_DATA_API_URL,
      body: { listingId, orchestratorVersion },
    }),
  getCollector: (listingId: number) => sendApiRequest<any>(`/collectors/${listingId}`, 'GET', {
    apiUrl: MARKET_DATA_API_URL,
  }),
  getCollectorLogs: (listingId: number) => sendApiRequest<any>(`/collectors/${listingId}/logs`, 'GET', {
    apiUrl: MARKET_DATA_API_URL,
  }),
  // Coverage endpoints
  getCoverageSummary: () => sendApiRequest<CoverageSummaryResponse>('/coverage/summary', 'GET', {
    apiUrl: MARKET_DATA_API_URL,
  }),
  getSecurityCoverage: (securityId: number) =>
    sendApiRequest<SecurityCoverageResponse>(`/coverage/security/${securityId}`, 'GET', {
      apiUrl: MARKET_DATA_API_URL,
    }),
  getSecurityExchangeCoverage: (securityId: number, exchangeId: number) =>
    sendApiRequest<SecurityExchangeCoverageResponse>(`/coverage/${securityId}/${exchangeId}`, 'GET', {
      apiUrl: MARKET_DATA_API_URL,
    }),
  // Transform Jobs endpoints
  listTransformJobs: (params?: TransformJobsListParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.lastEvaluatedKey) queryParams.lastEvaluatedKey = params.lastEvaluatedKey;
    return sendApiRequest<TransformJobsListResponse>('/transform-jobs/list', 'GET', {
      apiUrl: MARKET_DATA_API_URL,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  searchTransformJobs: (params: TransformJobsSearchParams) => {
    const queryParams: Record<string, string | number | boolean> = {
      listingId: params.listingId,
    };
    if (params.schemaType) queryParams.schemaType = params.schemaType;
    if (params.limit) queryParams.limit = params.limit;
    if (params.lastEvaluatedKey) queryParams.lastEvaluatedKey = params.lastEvaluatedKey;
    return sendApiRequest<TransformJobsSearchResponse>('/transform-jobs/search', 'GET', {
      apiUrl: MARKET_DATA_API_URL,
      queryParams,
    });
  },
  // Gaps endpoints
  listGaps: (params?: GapsListParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.lastEvaluatedKey) queryParams.lastEvaluatedKey = params.lastEvaluatedKey;
    return sendApiRequest<GapsListResponse>('/gaps/list', 'GET', {
      apiUrl: MARKET_DATA_API_URL,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  getGapsByListing: (params: GapsByListingParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params.limit) queryParams.limit = params.limit;
    if (params.lastEvaluatedKey) queryParams.lastEvaluatedKey = params.lastEvaluatedKey;
    return sendApiRequest<GapsListResponse>(`/gaps/list/${params.listingId}`, 'GET', {
      apiUrl: MARKET_DATA_API_URL,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  updateGaps: (request: GapsUpdateRequest) =>
    sendApiRequest<GapsUpdateResponse>('/gaps/update', 'POST', {
      apiUrl: MARKET_DATA_API_URL,
      body: request,
    }),
  // Quality Issues endpoints
  listQualityIssues: (params?: QualityIssuesListParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.ruleType) queryParams.ruleType = params.ruleType;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.lastEvaluatedKey) queryParams.lastEvaluatedKey = params.lastEvaluatedKey;
    return sendApiRequest<QualityIssuesListResponse>('/quality-issues/list', 'GET', {
      apiUrl: MARKET_DATA_API_URL,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  getQualityIssuesByListing: (params: QualityIssuesByListingParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params.limit) queryParams.limit = params.limit;
    if (params.lastEvaluatedKey) queryParams.lastEvaluatedKey = params.lastEvaluatedKey;
    return sendApiRequest<QualityIssuesListResponse>(`/quality-issues/list/${params.listingId}`, 'GET', {
      apiUrl: MARKET_DATA_API_URL,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  updateQualityIssues: (request: QualityIssuesUpdateRequest) =>
    sendApiRequest<QualityIssuesUpdateResponse>('/quality-issues/update', 'POST', {
      apiUrl: MARKET_DATA_API_URL,
      body: request,
    }),
  triggerQualityBackfill: (request: QualityBackfillRequest) =>
    sendApiRequest<QualityBackfillResponse>('/quality-issues/backfill', 'POST', {
      apiUrl: MARKET_DATA_API_URL,
      body: request,
    }),
  // Listing Statistics endpoint
  getListingStatistics: (listingId: number) =>
    sendApiRequest<ListingStatisticsResponse>(`/listing-statistics/${listingId}`, 'GET', {
      apiUrl: MARKET_DATA_API_URL,
    }),
  getListingStatisticsHistory: (listingId: number, lookbackDays?: number) =>
    sendApiRequest<ListingStatisticsHistoryResponse>(`/listing-statistics/${listingId}/history`, 'GET', {
      apiUrl: MARKET_DATA_API_URL,
      queryParams: lookbackDays !== undefined ? { lookbackDays } : undefined,
    }),
  investigateQualityIssue: (listingId: number, timestamp: number, windowMinutes?: number) =>
    sendApiRequest<MinuteInvestigationResponse>(`/quality-issues/investigate/${listingId}`, 'GET', {
      apiUrl: MARKET_DATA_API_URL,
      queryParams: {
        timestamp,
        ...(windowMinutes !== undefined ? { windowMinutes } : {}),
      },
    }),
  getBboTimeline: (listingId: number, startTimestamp: number, endTimestamp: number, maxPoints?: number) =>
    sendApiRequest<BboTimelineResponse>(`/bbo/timeline/${listingId}`, 'GET', {
      apiUrl: MARKET_DATA_API_URL,
      queryParams: {
        startTimestamp,
        endTimestamp,
        ...(maxPoints !== undefined ? { maxPoints } : {}),
      },
    }),
};

export const registryApi = {
  listExchanges: () => sendApiRequest<any[]>('/exchanges', 'GET', { 
    apiUrl: REGISTRY_API_URL, 
    convertToCamelCase: true 
  }),
  listSecurities: () => sendApiRequest<any[]>('/securities', 'GET', { 
    apiUrl: REGISTRY_API_URL, 
    convertToCamelCase: true 
  }),
  listListings: () => sendApiRequest<any[]>('/listings', 'GET', { 
    apiUrl: REGISTRY_API_URL, 
    convertToCamelCase: true 
  }),
  deleteExchange: (exchangeId: number) => sendApiRequest<{ message: string }>('/exchanges', 'DELETE', { 
    apiUrl: REGISTRY_API_URL, 
    convertToCamelCase: true,
    body: { exchangeId },
  }),
  deleteSecurity: (securityId: number) => sendApiRequest<{ message: string }>('/securities', 'DELETE', { 
    apiUrl: REGISTRY_API_URL, 
    convertToCamelCase: true,
    body: { securityId },
  }),
  deleteListing: (listingId: number) => sendApiRequest<{ message: string }>('/listings', 'DELETE', { 
    apiUrl: REGISTRY_API_URL, 
    convertToCamelCase: true,
    body: { listingId },
  }),
  updateExchange: (exchangeId: number, exchange: Partial<Exchange>) => sendApiRequest<{ message: string }>('/exchanges', 'PATCH', { 
    apiUrl: REGISTRY_API_URL, 
    convertToCamelCase: true,
    body: exchange,
    queryParams: { exchangeId },
  }),
  updateSecurity: (securityId: number, security: Partial<Security>) => sendApiRequest<{ message: string }>('/securities', 'PATCH', { 
    apiUrl: REGISTRY_API_URL, 
    convertToCamelCase: true,
    body: security,
    queryParams: { securityId },
  }),
  updateListing: (listingId: number, listing: Partial<Listing>) => sendApiRequest<{ message: string }>('/listings', 'PATCH', { 
    apiUrl: REGISTRY_API_URL, 
    convertToCamelCase: true,
    body: listing,
    queryParams: { listingId },
  }),
  createExchange: (exchange: Omit<Exchange, 'exchangeId' | 'dateCreated' | 'dateModified'>) => 
    sendApiRequest<Exchange>('/exchanges', 'POST', {
      apiUrl: REGISTRY_API_URL,
      body: exchange,
    }),
  createSecurity: (security: Omit<Security, 'securityId' | 'dateCreated' | 'dateModified'>) => 
    sendApiRequest<Security>('/securities', 'POST', {
      apiUrl: REGISTRY_API_URL,
      body: security,
    }),
  createListing: (listing: Omit<Listing, 'listingId' | 'dateCreated' | 'dateModified'>) =>
    sendApiRequest<Listing>('/listings', 'POST', {
      apiUrl: REGISTRY_API_URL,
      body: listing,
    }),
  listStrategies: (params?: { strategyId?: number; name?: string; archived?: boolean }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.strategyId !== undefined) queryParams.strategyId = params.strategyId;
    if (params?.name) queryParams.name = params.name;
    if (params?.archived !== undefined) queryParams.archived = params.archived;
    return sendApiRequest<Strategy[]>('/strategies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['args', 'config', 'overrides']),
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  createStrategy: (strategy: Omit<Strategy, 'strategyId' | 'dateCreated' | 'dateModified' | 'archived'>) =>
    sendApiRequest<Strategy>('/strategies', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['args', 'config']),
      body: strategy,
    }),
  updateStrategy: (strategyId: number, strategy: Partial<Strategy>) =>
    sendApiRequest<{ message: string }>('/strategies', 'PATCH', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: strategy,
      queryParams: { strategyId },
    }),
  deleteStrategy: (strategyId: number) =>
    sendApiRequest<{ message: string }>('/strategies', 'DELETE', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: { strategyId },
    }),
  listSessionsPaginated: (params: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params.limit !== undefined) queryParams.limit = params.limit;
    if (params.offset !== undefined) queryParams.offset = params.offset;
    if (params.sortBy) queryParams.sortBy = params.sortBy.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
    if (params.sortOrder) queryParams.sortOrder = params.sortOrder;
    Object.entries(params).forEach(([k, v]) => {
      if (!['limit', 'offset', 'sortBy', 'sortOrder', 'search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<StrategySession[]>('/strategy-sessions', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['args', 'config']),
      queryParams,
    });
  },
  countSessions: (params?: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = { count: true };
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (!['limit', 'offset', 'sortBy', 'sortOrder', 'search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<{ count: number }>('/strategy-sessions', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams,
    }).then(r => r.count);
  },
  listSessions: (params?: { sessionId?: string; strategyId?: number; status?: string }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.sessionId) queryParams.sessionId = params.sessionId;
    if (params?.strategyId !== undefined) queryParams.strategyId = params.strategyId;
    if (params?.status) queryParams.status = params.status;
    return sendApiRequest<StrategySession[]>('/strategy-sessions', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['args', 'config']),
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  createSession: (request: CreateStrategySessionRequest) =>
    sendApiRequest<StrategySession>('/strategy-sessions/launch', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['args', 'config']),
      body: request,
    }),
  stopSession: (sessionId: string, stopGraceMs?: number) =>
    sendApiRequest<StrategySession>('/strategy-sessions/stop', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['args', 'config']),
      body: { sessionId, stopGraceMs },
    }),
  getSessionLogs: (sessionId: string) =>
    sendApiRequest<{ logs: Array<{ instanceId: string; logs: Array<{ timestamp: number; message: string }>; consoleUrl: string }> }>(
      '/strategy-sessions/logs', 'GET', {
        apiUrl: REGISTRY_API_URL,
        queryParams: { sessionId },
      }
    ),
  listCurrencies: () =>
    sendApiRequest<Currency[]>('/currencies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
    }),
  listSecuritiesPaginated: (params: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params.limit !== undefined) queryParams.limit = params.limit;
    if (params.offset !== undefined) queryParams.offset = params.offset;
    if (params.sortBy) queryParams.sortBy = params.sortBy;
    if (params.sortOrder) queryParams.sortOrder = params.sortOrder;
    if (params.search) queryParams.search = params.search;
    Object.entries(params).forEach(([k, v]) => {
      if (!['limit','offset','sortBy','sortOrder','search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<Security[]>('/securities', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams,
    });
  },
  countSecurities: (params?: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = { count: true };
    if (params?.search) queryParams.search = params.search;
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (!['limit','offset','sortBy','sortOrder','search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<{ count: number }>('/securities', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams,
    }).then(r => r.count);
  },
  listListingsPaginated: (params: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = { denormalize: true };
    if (params.limit !== undefined) queryParams.limit = params.limit;
    if (params.offset !== undefined) queryParams.offset = params.offset;
    if (params.sortBy) queryParams.sortBy = params.sortBy;
    if (params.sortOrder) queryParams.sortOrder = params.sortOrder;
    if (params.search) queryParams.search = params.search;
    Object.entries(params).forEach(([k, v]) => {
      if (!['limit','offset','sortBy','sortOrder','search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<DenormalizedListing[]>('/listings', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams,
    });
  },
  countListings: (params?: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = { count: true, denormalize: true };
    if (params?.search) queryParams.search = params.search;
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (!['limit','offset','sortBy','sortOrder','search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<{ count: number }>('/listings', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams,
    }).then(r => r.count);
  },
  listCurrenciesPaginated: (params: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params.limit !== undefined) queryParams.limit = params.limit;
    if (params.offset !== undefined) queryParams.offset = params.offset;
    if (params.sortBy) queryParams.sortBy = params.sortBy;
    if (params.sortOrder) queryParams.sortOrder = params.sortOrder;
    if (params.search) queryParams.search = params.search;
    return sendApiRequest<Currency[]>('/currencies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams,
    });
  },
  countCurrencies: (params?: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = { count: true };
    if (params?.search) queryParams.search = params.search;
    return sendApiRequest<{ count: number }>('/currencies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams,
    }).then(r => r.count);
  },
  searchSecurities: (search: string, limit = 50) =>
    sendApiRequest<Security[]>('/securities', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: { search, limit },
    }),
  getOrchestratorProperties: (version?: string) =>
    sendApiRequest<{ version: string; properties: Record<string, string> }>('/orchestrator/properties', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['properties']),
      queryParams: version ? { version } : undefined,
    }),
  listListingsByIds: (listingIds: number[]) =>
    sendApiRequest<DenormalizedListing[]>('/listings', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: { listingIds: listingIds.join(','), denormalize: true, limit: listingIds.length },
    }),
  listSecuritiesByIds: (securityIds: number[]) =>
    sendApiRequest<Security[]>('/securities', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: { securityIds: securityIds.join(','), limit: securityIds.length },
    }),
  searchListings: (search: string, limit = 50) =>
    sendApiRequest<DenormalizedListing[]>('/listings', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: { search, limit, denormalize: true },
    }),
  searchCurrencies: (search: string, limit = 50) =>
    sendApiRequest<Currency[]>('/currencies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: { search, limit },
    }),
  listListingSpecs: (listingId?: number, history?: boolean) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (listingId !== undefined) queryParams.listingId = listingId;
    if (history) queryParams.history = true;
    return sendApiRequest<ListingSpec[]>('/listing-specs', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  createListingSpec: (spec: Omit<ListingSpec, 'dateCreated' | 'dateModified'>) =>
    sendApiRequest<ListingSpec>('/listing-specs', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: spec,
    }),
  updateListingSpec: (listingId: number, spec: Partial<ListingSpec>) =>
    sendApiRequest<{ message: string }>('/listing-specs', 'PATCH', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: spec,
      queryParams: { listingId },
    }),
  deleteListingSpec: (listingId: number) =>
    sendApiRequest<{ message: string }>('/listing-specs', 'DELETE', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: { listingId },
    }),
  // PnL is derived by the registry from the ledger's fills and marks; see types/pnl for the shapes.
  getSessionSummary: (sessionId: string) =>
    sendApiRequest<SessionSummary>('/pnl/summary', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { sessionId },
    }),
  getStrategySummary: (strategyId: number, mode: Mode, tz: string) =>
    sendApiRequest<StrategySummary>('/pnl/summary', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { strategyId, mode, tz },
    }),
  getFirmSummary: (mode: Mode, tz: string) =>
    sendApiRequest<FirmSummary>('/pnl/summary', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { mode, tz },
    }),
  getSessionsTotals: (sessionIds: string[]) =>
    sendApiRequest<SessionTotals[]>('/pnl/summary', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { sessionIds: sessionIds.join(',') },
    }),
  getEventPositions: (scope: { strategyId: number; mode: Mode } | { sessionId: string }) =>
    sendApiRequest<EventPositions>('/pnl/events', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: scope,
    }),
  getTableSizes: () =>
    sendApiRequest<TableSizes>('/monitoring/tables', 'GET', { apiUrl: REGISTRY_API_URL }),
  getRiskUsage: (sessionId: string) =>
    sendApiRequest<RiskUsage>('/risk/usage', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { sessionId },
    }),
  getAttention: (mode: Mode) =>
    sendApiRequest<{ asOf: string; items: AttentionItem[] }>('/monitoring/attention', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { mode },
    }),
  getDailyPnl: (scope: { strategyId?: number; mode: Mode }, tz: string, days: number) =>
    sendApiRequest<DailyPnl>('/pnl/daily', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: definedParams({ ...scope, tz, days }),
    }),
  getMarks: (listingId: number, start?: string) =>
    sendApiRequest<PriceHistory>('/ledger/marks', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: definedParams({ listingId, start }),
    }),
  getPnlSeries: (scope: LedgerScope, window: { start?: string; resolution?: number; since?: number; listingId?: number }) =>
    sendApiRequest<PnlSeries>('/pnl/series', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: definedParams({ ...scope, ...window }),
    }),
  listFills: (scope: LedgerScope, page: LedgerPageParams = {}) =>
    sendApiRequest<LedgerPage<LedgerFill>>('/ledger/fills', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: definedParams({ ...scope, ...page }),
    }),
  // One order's fills, oldest first, including any a later session recovered from the venue for it.
  listOrderFills: (sessionId: string, clientOidCounter: string) =>
    sendApiRequest<LedgerPage<LedgerFill>>('/ledger/fills', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: { orderSessionId: sessionId, clientOidCounter },
    }),
  listOrders: (scope: LedgerScope, page: LedgerPageParams & { status?: 'OPEN' | 'CLOSED' | 'ANY' } = {}) =>
    sendApiRequest<LedgerPage<LedgerOrder>>('/ledger/orders/list', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: definedParams({ ...scope, ...page }),
    }),
  // Cognito only and audited: sets what a strategy holds on a listing, while no session holds it.
  adjustPosition: (adjustment: {
    strategyId: number; listingId: number; mode: Mode; netQuantity: string; totalCost: string; reason: string;
  }) =>
    sendApiRequest<unknown>('/ledger/adjustments', 'POST', {
      apiUrl: REGISTRY_API_URL,
      body: adjustment,
    }),
  listRiskPolicies: () =>
    sendApiRequest<RiskPolicy[]>('/risk/policies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
    }),
  listRiskPolicyHistory: (policyId: number) =>
    sendApiRequest<RiskPolicyHistory[]>('/risk/policies/history', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['oldParameters', 'newParameters']),
      queryParams: { policyId },
    }),
  createRiskPolicy: (policy: Omit<RiskPolicy, 'policyId' | 'dateCreated' | 'dateModified'> & { reason?: string }) =>
    sendApiRequest<RiskPolicy>('/risk/policies', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: policy,
    }),
  updateRiskPolicy: (policyId: number, policy: Partial<RiskPolicy> & { reason?: string }) =>
    sendApiRequest<{ message: string }>('/risk/policies', 'PATCH', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: policy,
      queryParams: { policyId },
    }),
  deleteRiskPolicy: (policyId: number, reason?: string) =>
    sendApiRequest<{ message: string }>('/risk/policies', 'DELETE', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: { policyId, reason },
    }),
  listEventsPaginated: (params: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params.limit !== undefined) queryParams.limit = params.limit;
    if (params.offset !== undefined) queryParams.offset = params.offset;
    if (params.sortBy) queryParams.sortBy = params.sortBy.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
    if (params.sortOrder) queryParams.sortOrder = params.sortOrder;
    if (params.search) queryParams.search = params.search;
    Object.entries(params).forEach(([k, v]) => {
      if (!['limit', 'offset', 'sortBy', 'sortOrder', 'search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<Event[]>('/events', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams,
    });
  },
  countEvents: (params?: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = { count: true };
    if (params?.search) queryParams.search = params.search;
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (!['limit', 'offset', 'sortBy', 'sortOrder', 'search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<{ count: number }>('/events', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams,
    }).then(r => r.count);
  },
  listContractRelationshipsPaginated: (params: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params.limit !== undefined) queryParams.limit = params.limit;
    if (params.offset !== undefined) queryParams.offset = params.offset;
    if (params.sortBy) queryParams.sortBy = params.sortBy.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
    if (params.sortOrder) queryParams.sortOrder = params.sortOrder;
    Object.entries(params).forEach(([k, v]) => {
      if (!['limit', 'offset', 'sortBy', 'sortOrder', 'search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    queryParams.denormalize = true;
    return sendApiRequest<ContractRelationship[]>('/contract-relationships', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams,
    });
  },
  countContractRelationships: (params?: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = { count: true };
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (!['limit', 'offset', 'sortBy', 'sortOrder', 'search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<{ count: number }>('/contract-relationships', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams,
    }).then(r => r.count);
  },
  listEvents: (params?: { eventId?: number; category?: string; resolved?: boolean }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.eventId !== undefined) queryParams.eventId = params.eventId;
    if (params?.category) queryParams.category = params.category;
    if (params?.resolved !== undefined) queryParams.resolved = params.resolved;
    return sendApiRequest<Event[]>('/events', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  listEventContracts: (params?: { eventId?: number; securityId?: number }) => {
    const queryParams: Record<string, string | number | boolean> = { denormalize: true };
    if (params?.eventId !== undefined) queryParams.eventId = params.eventId;
    if (params?.securityId !== undefined) queryParams.securityId = params.securityId;
    return sendApiRequest<EventContract[]>('/event-contracts', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams,
    });
  },
  listContractRelationships: (params?: { method?: string; relationshipType?: string; securityId?: number; eventId?: number }) => {
    const queryParams: Record<string, string | number | boolean> = { denormalize: true };
    if (params?.method) queryParams.method = params.method;
    if (params?.relationshipType) queryParams.relationshipType = params.relationshipType;
    if (params?.securityId !== undefined) queryParams.securityId = params.securityId;
    if (params?.eventId !== undefined) queryParams.eventId = params.eventId;
    return sendApiRequest<ContractRelationship[]>('/contract-relationships', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams,
    });
  },
  createContractRelationship: (body: CreateContractRelationship) =>
    sendApiRequest<{ message: string }>('/contract-relationships', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body,
    }),
  createContractRelationshipsBulk: (bodies: CreateContractRelationship[]) =>
    sendApiRequest<any[]>('/contract-relationships', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: bodies,
    }),
  deleteContractRelationship: (relationshipId: number) =>
    sendApiRequest<{ message: string }>('/contract-relationships', 'DELETE', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: { relationshipId },
    }),
  listHedgeKeywordsPaginated: (params: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params.limit !== undefined) queryParams.limit = params.limit;
    if (params.offset !== undefined) queryParams.offset = params.offset;
    if (params.sortBy) queryParams.sortBy = params.sortBy.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
    if (params.sortOrder) queryParams.sortOrder = params.sortOrder;
    Object.entries(params).forEach(([k, v]) => {
      if (!['limit', 'offset', 'sortBy', 'sortOrder', 'search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<HedgeKeyword[]>('/hedge-keywords', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams,
    });
  },
  countHedgeKeywords: (params?: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = { count: true };
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (!['limit', 'offset', 'sortBy', 'sortOrder', 'search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<{ count: number }>('/hedge-keywords', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams,
    }).then(r => r.count);
  },
  createHedgeKeyword: (body: CreateHedgeKeyword) =>
    sendApiRequest<HedgeKeyword>('/hedge-keywords', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body,
    }),
  deleteHedgeKeyword: (hedgeKeywordId: number) =>
    sendApiRequest<{ message: string }>('/hedge-keywords', 'DELETE', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: { hedgeKeywordId },
    }),
}


export const controllerApi = {
  // One section of the System page; see types/system.
  getSystemHealth: <T,>(section: string, fresh = false) =>
    sendApiRequest<T>('/system/health', 'GET', {
      apiUrl: CONTROLLER_API_URL,
      queryParams: fresh ? { section, fresh: true } : { section },
    }),
  // Prod controller only; the signed-in person and their reason are recorded on the approval.
  decideApproval: (decision: {
    pipeline: string; stage: string; action: string; token: string; decision: 'Approved' | 'Rejected'; reason: string;
  }) =>
    sendApiRequest<{ status: string; by: string }>('/system/approvals', 'POST', {
      apiUrl: CONTROLLER_API_URL,
      body: decision,
    }),
  runLatencyProbe: (request: LatencyProbeRequest) =>
    sendApiRequest<LatencyProbeResponse>('/latency-probe/run', 'POST', {
      apiUrl: CONTROLLER_API_URL,
      body: request,
    }),
  listBacktests: (params?: { status?: string; limit?: number }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.limit) queryParams.limit = params.limit;
    return sendApiRequest<{ runs: any[]; count: number }>('/backtests', 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  // Parameter and metric names are user-defined (e.g. spread_bps) and shown verbatim next to the run's YAML.
  getBacktest: (runId: string) =>
    sendApiRequest<any>(`/backtests/${runId}`, 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['configParams', 'sweepParams', 'summary']),
    }),
  cancelBacktest: (runId: string) =>
    sendApiRequest<{ runId: string; status: string }>(`/backtests/${runId}`, 'DELETE', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
    }),
  listResearchSessions: (params?: { status?: string; limit?: number }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.limit) queryParams.limit = params.limit;
    return sendApiRequest<ResearchSessionListResponse>('/research/sessions', 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  getResearchSession: (sessionName: string) =>
    sendApiRequest<ResearchSession>(`/research/sessions/${sessionName}`, 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['metrics', 'metadata', 'environment']),
    }),
  addResearchNote: (sessionName: string, content: string) =>
    sendApiRequest<{ sessionName: string; timestamp: string }>(
      `/research/sessions/${sessionName}/notes`, 'POST', {
        apiUrl: CONTROLLER_API_URL,
        convertToCamelCase: true,
        body: { content },
      }
    ),
  listArtifacts: (params?: { type?: string; name?: string; sessionName?: string }) => {
    const queryParams: Record<string, string> = {};
    if (params?.type) queryParams.type = params.type;
    if (params?.name) queryParams.name = params.name;
    if (params?.sessionName) queryParams.session_name = params.sessionName;
    return sendApiRequest<ResearchArtifactListResponse>('/research/artifacts', 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  listDatasets: (params?: { name?: string }) => {
    const queryParams: Record<string, string> = {};
    if (params?.name) queryParams.name = params.name;
    return sendApiRequest<ResearchDatasetListResponse>('/research/datasets', 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  listPipelines: () =>
    sendApiRequest<PipelineListResponse>('/research/pipelines', 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
    }),
  getPipeline: (pipelineName: string) =>
    sendApiRequest<PipelineDetailResponse>(`/research/pipelines/${pipelineName}`, 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
    }),
  createPipeline: (body: Record<string, unknown>) =>
    sendApiRequest<{ pipeline: unknown }>('/research/pipelines', 'POST', {
      apiUrl: CONTROLLER_API_URL,
      body,
      convertToCamelCase: true,
    }),
  updatePipeline: (pipelineName: string, body: Record<string, unknown>) =>
    sendApiRequest<{ pipeline: unknown }>(`/research/pipelines/${pipelineName}`, 'PUT', {
      apiUrl: CONTROLLER_API_URL,
      body,
      convertToCamelCase: true,
    }),
  triggerPipeline: (pipelineName: string, params?: Record<string, unknown>) =>
    sendApiRequest<{ runId: string; ecsTaskArn: string }>(`/research/pipelines/${pipelineName}/trigger`, 'POST', {
      apiUrl: CONTROLLER_API_URL,
      body: { parameters: params ?? {} },
      convertToCamelCase: true,
    }),
  getServiceConfig: (service: string) =>
    sendApiRequest<ServiceConfigResponse>(`/cognito/config/${service}`, 'GET', {
      apiUrl: CONTROLLER_API_URL,
    }),
  updateServiceConfig: (service: string, config: Record<string, unknown>, version: number) =>
    sendApiRequest<ServiceConfigResponse>(`/cognito/config/${service}`, 'PUT', {
      apiUrl: CONTROLLER_API_URL,
      body: { config, version },
    }),
  getServiceConfigHistory: (service: string) =>
    sendApiRequest<ServiceConfigHistoryResponse>(`/cognito/config/${service}/history`, 'GET', {
      apiUrl: CONTROLLER_API_URL,
    }),
}

export const launcherApi = {
  getRuleTypes: () =>
    sendApiRequest<RuleType[]>('/rule-types', 'GET', {
      apiUrl: LAUNCHER_API_URL,
    }),

  listRules: () =>
    sendApiRequest<LaunchRule[]>('/launch-rules', 'GET', {
      apiUrl: LAUNCHER_API_URL,
    }),
  createRule: (body: Omit<LaunchRule, 'rule_id' | 'date_created' | 'date_modified'>) =>
    sendApiRequest<LaunchRule>('/launch-rules', 'POST', {
      apiUrl: LAUNCHER_API_URL,
      body,
    }),
  updateRule: (ruleId: string, body: Partial<LaunchRule>) =>
    sendApiRequest<LaunchRule>(`/launch-rules/${ruleId}`, 'PATCH', {
      apiUrl: LAUNCHER_API_URL,
      body,
    }),
  deleteRule: (ruleId: string) =>
    sendApiRequest<{ deleted: string }>(`/launch-rules/${ruleId}`, 'DELETE', {
      apiUrl: LAUNCHER_API_URL,
    }),

  listRequests: (params?: { status?: string; rule_type?: string; limit?: number }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.rule_type) queryParams.rule_type = params.rule_type;
    if (params?.limit) queryParams.limit = params.limit;
    return sendApiRequest<LaunchRequest[]>('/launch-requests', 'GET', {
      apiUrl: LAUNCHER_API_URL,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  getRequest: (requestId: string) =>
    sendApiRequest<LaunchRequest>(`/launch-requests/${requestId}`, 'GET', {
      apiUrl: LAUNCHER_API_URL,
    }),
  submitTrigger: (body: { rule_type: string; data: Record<string, unknown> }) =>
    sendApiRequest<{ message: string }>('/triggers', 'POST', {
      apiUrl: LAUNCHER_API_URL,
      body,
    }),
}
