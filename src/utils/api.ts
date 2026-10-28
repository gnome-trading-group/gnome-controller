import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import {
  DryRunResult, EditableRule, LaunchRequest, LaunchRequestDetail, LaunchRule, Page, RequestAction, RuleRevision, RuleStats,
  RuleType, TriggerEvaluation,
} from '../types/launcher';
import { Alert, AlertFacets, AlertFilters, AttentionItem, ContractRelationship, DailyPnl, EventPositions, PriceHistory, RiskUsage, TableSizes, CreateContractRelationship, CreateHedgeKeyword, Currency, DenormalizedListing, Event, EventContract, Exchange, FirmSummary, HedgeKeyword, LedgerFill, LedgerOrder, LedgerPage, Listing, ListingSpec, FeeScheduleRow, FeeTimelineEntry, CreateFeeSchedule, Mode, PaginationParams, PnlSeries, RiskPolicy, SessionSummary, SessionTotals, StrategyListingPnl, StrategySummary, RiskPolicyHistory, Security, Source, Strategy, Stream, ConnectionScope } from '../types';
import { ResearchSession, ResearchSessionListResponse } from '../types/research';
import { ResearchJob } from '../types/research-jobs';
import { BacktestRun } from '../types/backtests';
import { ArtifactDetail, ArtifactSummary, Dataset, DatasetDetail } from '../types/data';
import { PipelineDetailResponse, PipelineListResponse, PipelineRun, RunLogsResponse } from '../types/pipeline';
import { CreateStrategySessionRequest, StrategySession } from '../types/strategy-sessions';
import { LatencyProbeRequest, LatencyProbeResponse } from '../types/latency-probe';
import {
  AccountConfigUpdate, AccountStatus, AccountStatusChange, CreateAccountRequest, CreatedAccount, DeletedSecrets, UpdateCredentialsRequest, ManualSnapshot, ReconDetail, SessionAccount, Transfer, TransferKind, TreasurySummary, VenueAccount,
} from '../types/treasury';
import { MarketDataAccount, MarketDataKey } from '../types/credentials';
import {
  CollectionRule, CollectionRuleType, CollectionShard, CollectionTarget, NewRule, RuleChange, RuleParameters, RulePreview,
  RuleTypeSchema, ShardDetail, ShardLogs, StreamCoverage,
} from '../types/collection';
import { SimulationParametersRow } from './simulation';

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

// A lesson someone saved for gnome-bot from a Slack thread. Scope is the alert type it's about, or `general`.
export interface BotNote {
  id: string;
  scope: string;
  note: string;
  saved_by: string;
  saved_at: string;
  link: string | null;
  edited_by: string | null;
  edited_at: string | null;
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
  // Fills only: VENUE, RECOVERY, RESET, ADJUSTMENT, MANUAL, SETTLEMENT, GAP (comma-separated).
  source?: string;
  start?: string;
  end?: string;
}

export type EventScope = { strategyId: number; mode: Mode } | { sessionId: string };

export interface LedgerPageParams extends LedgerFilters {
  before?: string;
  after?: string;
  limit?: number;
}

function alertParams(filters: AlertFilters): Record<string, string | number> {
  return definedParams({
    status: filters.status?.join(','), severity: filters.severity?.join(','), type: filters.type?.join(','),
    sessionId: filters.sessionId, strategyId: filters.strategyId, sinceId: filters.sinceId, limit: filters.limit,
    offset: filters.offset,
  });
}

function definedParams(params: object): Record<string, string | number> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string | number>;
}

const CONTROLLER_API_URL = import.meta.env.VITE_CONTROLLER_API_URL;
// People and services call the same registry routes; the UI sends the operator's ID token and never holds a key.
const REGISTRY_API_URL = import.meta.env.VITE_REGISTRY_API_URL;
const MARKET_DATA_API_URL = import.meta.env.VITE_MARKET_DATA_API_URL;
const LAUNCHER_API_URL = import.meta.env.VITE_LAUNCHER_API_URL;
const BOT_API_URL = import.meta.env.VITE_BOT_API_URL;

export class ApiError extends Error {
  // Validation failures some APIs itemise (the launcher's {message, problems}), one message per problem.
  constructor(public statusCode: number, message: string, public problems: string[] = []) {
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

// A digit after an underscore joins it too, so volume_24h reads as volume24h.
function toCamelCase(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
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

// Pipeline payloads whose keys are data (parameter names, output names), so they keep their snake_case.
const PIPELINE_DATA_KEYS = new Set(['paramsSchema', 'parameters', 'params', 'outputs']);

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

// The streams API filters by its own fields and sorts by snake_case columns; it has no free-text search.
function streamQueryParams(params: PaginationParams): Record<string, string | number | boolean> {
  const queryParams: Record<string, string | number | boolean> = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || k === 'search') return;
    queryParams[k] = k === 'sortBy' ? String(v).replace(/[A-Z]/g, c => `_${c.toLowerCase()}`) : v as string | number | boolean;
  });
  return queryParams;
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
      const body = data as {
        body?: string | { error?: string }; message?: string; error?: string; problems?: string[];
      } | null;
      const error = (typeof body?.body === 'string' ? body.body : body?.body?.error)
        ?? body?.message
        ?? body?.error
        ?? (text || `Request failed with status ${response.status}`);
      throw new ApiError(response.status, error, Array.isArray(body?.problems) ? body.problems : []);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, `Failed to make API request: ${error}`);
  }
}

// Shard fields keyed by data (source codes, stream ids) or copied as the shard wrote them.
const COLLECTION_DATA_KEYS = new Set(['accounts', 'cuts', 'process']);
// A rule's parameters keep the names its type's schema gives them, which the rule form edits.
const RULE_DATA_KEYS = new Set(['parameters']);

// The collection control plane. Rule changes wake the reconciler at once; everything else it does on its 1-minute tick.
export const collectionApi = {
  listRules: () => sendApiRequest<{ rules: CollectionRule[] }>('/collection/rules', 'GET', {
    apiUrl: MARKET_DATA_API_URL, convertToCamelCase: true, preserveKeys: RULE_DATA_KEYS,
  }).then(r => r.rules),
  createRule: (rule: NewRule) => sendApiRequest<CollectionRule>('/collection/rules', 'POST', {
    apiUrl: MARKET_DATA_API_URL, convertToCamelCase: true, preserveKeys: RULE_DATA_KEYS, body: rule,
  }),
  updateRule: (ruleId: string, change: RuleChange) =>
    sendApiRequest<CollectionRule>(`/collection/rules/${encodeURIComponent(ruleId)}`, 'PATCH', {
      apiUrl: MARKET_DATA_API_URL, convertToCamelCase: true, preserveKeys: RULE_DATA_KEYS, body: change,
    }),
  // Schemas keyed by type, their property names as rules store them: not camel-cased.
  getRuleTypes: () => sendApiRequest<{ ruleTypes: Record<CollectionRuleType, RuleTypeSchema> }>(
    '/collection/rule-types', 'GET', { apiUrl: MARKET_DATA_API_URL },
  ).then(r => r.ruleTypes),
  previewRule: (ruleType: CollectionRuleType, parameters: RuleParameters) =>
    sendApiRequest<RulePreview>('/collection/rule-preview', 'POST', {
      apiUrl: MARKET_DATA_API_URL, body: { rule_type: ruleType, parameters },
    }),
  deleteRule: (ruleId: string) =>
    sendApiRequest<{ deleted: string }>(`/collection/rules/${encodeURIComponent(ruleId)}`, 'DELETE', {
      apiUrl: MARKET_DATA_API_URL,
    }),
  // Nanoseconds as exact integer strings: epoch nanos exceed a double's integer range.
  getStreamCoverage: (streamId: number, fromMs: number, toMs: number) =>
    sendApiRequest<StreamCoverage>(`/collection/coverage/${streamId}`, 'GET', {
      apiUrl: MARKET_DATA_API_URL,
      queryParams: {
        fromNs: (BigInt(Math.floor(fromMs)) * 1_000_000n).toString(),
        toNs: (BigInt(Math.floor(toMs)) * 1_000_000n).toString(),
      },
    }),
  reconcileNow: () => sendApiRequest<{ queued: boolean }>('/collection/triggers', 'POST', {
    apiUrl: MARKET_DATA_API_URL,
  }),
  listTargets: () => sendApiRequest<{ targets: CollectionTarget[] }>('/collection/targets', 'GET', {
    apiUrl: MARKET_DATA_API_URL, convertToCamelCase: true,
  }).then(r => r.targets),
  listShards: (includeDeleted = false) => sendApiRequest<{ shards: CollectionShard[] }>('/collection/shards', 'GET', {
    apiUrl: MARKET_DATA_API_URL, convertToCamelCase: true, preserveKeys: COLLECTION_DATA_KEYS, queryParams: { includeDeleted },
  }).then(r => r.shards),
  getShard: (shardId: string) => sendApiRequest<ShardDetail>(`/collection/shards/${encodeURIComponent(shardId)}`, 'GET', {
    apiUrl: MARKET_DATA_API_URL, convertToCamelCase: true, preserveKeys: COLLECTION_DATA_KEYS,
  }),
  getShardLogs: (shardId: string, region: string, taskId: string) =>
    sendApiRequest<ShardLogs>(`/collection/shards/${encodeURIComponent(shardId)}/logs`, 'GET', {
      apiUrl: MARKET_DATA_API_URL, queryParams: { region, taskId, limit: 300 },
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
      preserveKeys: new Set(['args', 'config', 'overrides', 'simulation']),
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  createStrategy: (strategy: Omit<Strategy, 'strategyId' | 'dateCreated' | 'dateModified' | 'archived'>) =>
    sendApiRequest<Strategy>('/strategies', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['args', 'config', 'overrides', 'simulation']),
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
  // listingId and eventId find the sessions that traded that listing, or any listing of that event, at any time.
  listSessions: (params?: { sessionId?: string; strategyId?: number; status?: string; listingId?: number; eventId?: number }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.sessionId) queryParams.sessionId = params.sessionId;
    if (params?.strategyId !== undefined) queryParams.strategyId = params.strategyId;
    if (params?.status) queryParams.status = params.status;
    if (params?.listingId !== undefined) queryParams.listingId = params.listingId;
    if (params?.eventId !== undefined) queryParams.eventId = params.eventId;
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
  stopSession: (sessionId: string, options: { reason?: string; stopGraceMs?: number } = {}) =>
    sendApiRequest<StrategySession>('/strategy-sessions/stop', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['args', 'config']),
      body: { sessionId, ...options },
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
  listSources: () =>
    sendApiRequest<Source[]>('/sources', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: { sortBy: 'code' },
    }),
  createVendorSource: (source: { code: string; homeRegion: string; adapter: string; families: string[] }) =>
    sendApiRequest<Source>('/sources', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: source,
    }),
  updateSource: (sourceId: number, source: {
    homeRegion?: string; adapter?: string; families?: string[]; active?: boolean;
    maxPerConnection?: number; connectionScope?: ConnectionScope; connectionsPerScope?: number | null;
    clientMessagesPerMinute?: number | null;
  }) =>
    sendApiRequest<Source>('/sources', 'PATCH', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: source,
      queryParams: { sourceId },
    }),
  listStreamsPaginated: (params: PaginationParams) =>
    sendApiRequest<Stream[]>('/streams', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: streamQueryParams(params),
    }),
  countStreams: (params?: PaginationParams) =>
    sendApiRequest<{ count: number }>('/streams', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { ...streamQueryParams(params ?? {}), count: true },
    }).then(r => r.count),
  listStreamsByIds: (streamIds: number[]) =>
    sendApiRequest<Stream[]>('/streams', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: { streamIds: streamIds.join(','), limit: streamIds.length },
    }),
  getStreamForListing: (listingId: number) =>
    sendApiRequest<Stream[]>('/streams', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: { listingId },
    }).then(rows => rows[0] ?? null),
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
  // Every stored fee schedule matching the filters, newest effective first; corrections included.
  listFeeSchedules: (filters: { exchangeId?: number; feeGroup?: string; feeEvent?: string; scopeListingId?: number } = {}) =>
    sendApiRequest<FeeScheduleRow[]>('/fees', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: Object.fromEntries(Object.entries({ ...filters, limit: 5000 }).filter(([, v]) => v !== undefined && v !== '')),
    }),
  // A listing's fees over time as the registry resolves them from its listing, fee event, fee group and exchange.
  getFeeTimeline: async (listingId: number) => {
    const [result] = await sendApiRequest<{ listingId: number; timeline: FeeTimelineEntry[] }[]>('/fees', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { listingIds: listingId },
    });
    return result?.timeline ?? [];
  },
  createFeeSchedule: (schedule: CreateFeeSchedule) =>
    sendApiRequest<FeeScheduleRow>('/fees', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: schedule,
    }),
  // Each exchange's simulation parameters in force at knownAsOf (default now), or with history every version. Rows
  // keep their snake_case: a definition's keys are the config shape every simulation config shares.
  listSimulationParameters: (filters: { exchangeId?: number; knownAsOf?: string; history?: boolean } = {}) =>
    sendApiRequest<SimulationParametersRow[]>('/simulation-parameters', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: Object.fromEntries(Object.entries({ ...filters, limit: 1000 }).filter(([, v]) => v !== undefined && v !== false)),
    }),
  recordSimulationParameters: (body: { exchangeId: number; definition: SimulationParametersRow['definition']; note?: string }) =>
    sendApiRequest<SimulationParametersRow>('/simulation-parameters', 'POST', { apiUrl: REGISTRY_API_URL, body }),
  // PnL is derived by the registry from the ledger's fills and marks; see types/pnl for the shapes.
  getSessionSummary: (sessionId: string) =>
    sendApiRequest<SessionSummary>('/pnl/summary', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { sessionId },
    }),
  getStrategySummary: (strategyId: number, mode: Mode, tz: string, listingId?: number) =>
    sendApiRequest<StrategySummary>('/pnl/summary', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: definedParams({ strategyId, mode, tz, listingId }),
    }),
  // The strategy's flat positions its summary leaves out, newest first.
  listFlatPositions: (strategyId: number, mode: Mode, tz: string, page: { before?: string; limit: number }) =>
    sendApiRequest<LedgerPage<StrategyListingPnl>>('/pnl/summary', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: definedParams({ strategyId, mode, tz, positions: 'flat', ...page }),
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
  // Events still held; with a history page, events every contract of which is flat, most recently resolved first.
  getEventPositions: (scope: EventScope, history?: { before?: string; limit: number }) =>
    sendApiRequest<EventPositions>('/pnl/events', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: definedParams({ ...scope, ...(history && { status: 'history', ...history }) }),
    }),
  getTableSizes: () =>
    sendApiRequest<TableSizes>('/monitoring/tables', 'GET', { apiUrl: REGISTRY_API_URL }),
  getRiskUsage: (sessionId: string) =>
    sendApiRequest<RiskUsage>('/risk/usage', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { sessionId },
    }),
  listAlerts: (filters: AlertFilters = {}) =>
    sendApiRequest<Alert[]>('/alerts', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: alertParams(filters),
    }),
  getAlertFacets: (filters: AlertFilters = {}) =>
    sendApiRequest<AlertFacets>('/alerts', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { ...alertParams(filters), facets: 'true' },
    }),
  acknowledgeAlert: (alertId: number, reason?: string) =>
    sendApiRequest<{ alertId: number; outcome: 'ACKNOWLEDGED' | 'CLOSED' }>('/alerts', 'PATCH', {
      apiUrl: REGISTRY_API_URL,
      body: { alertId, reason: reason?.trim() || undefined },
    }),
  getAttention: (mode: Mode) =>
    sendApiRequest<{ asOf: string; items: AttentionItem[] }>('/monitoring/attention', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: { mode },
    }),
  getDailyPnl: (scope: { strategyId?: number; mode: Mode }, tz: string, days: number, byStrategy = false) =>
    sendApiRequest<DailyPnl>('/pnl/daily', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: definedParams({ ...scope, tz, days, byStrategy: byStrategy ? 'true' : undefined }),
    }),
  getMarks: (listingId: number, start?: string) =>
    sendApiRequest<PriceHistory>('/ledger/marks', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: definedParams({ listingId, start }),
    }),
  getPnlSeries: (
    scope: LedgerScope,
    { byListing, listingIds, ...window }: {
      start?: string; resolution?: number; since?: number; listingId?: number; byListing?: boolean; listingIds?: number[];
    },
  ) =>
    sendApiRequest<PnlSeries>('/pnl/series', 'GET', {
      apiUrl: REGISTRY_API_URL,
      queryParams: definedParams({
        ...scope, ...window, byListing: byListing ? 'true' : undefined, listingIds: listingIds?.join(','),
      }),
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
  // Cognito only and audited: sets what a strategy holds on a listing, while no session holds it there.
  // Either a trade booked by hand or a correction setting the position outright; see AdjustPositionModal. A live
  // position is held on one venue account, which must be named; a paper one belongs to none.
  adjustPosition: (adjustment: { strategyId: number; listingId: number; mode: Mode; accountId?: number; reason: string } & (
    | { trade: { side: 0 | 1; qty: string; price: string; fee: string } }
    | { netQuantity: string; totalCost: string }
  )) =>
    sendApiRequest<unknown>('/ledger/adjustments', 'POST', {
      apiUrl: REGISTRY_API_URL,
      body: adjustment,
    }),
  listVenueAccounts: (exchangeId?: number) =>
    sendApiRequest<VenueAccount[]>('/venue-accounts', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['venueRef']),
      queryParams: exchangeId !== undefined ? { exchangeId } : undefined,
    }),
  changeAccountStatus: (accountId: number, status: AccountStatus, reason: string) =>
    sendApiRequest<AccountStatusChange>('/venue-accounts/status', 'PATCH', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['venueRef']),
      body: { accountId, status, reason },
    }),
  createVenueAccount: (request: CreateAccountRequest) =>
    sendApiRequest<CreatedAccount>('/venue-accounts/create', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['venueRef']),
      body: request,
    }),
  updateAccountCredentials: (request: UpdateCredentialsRequest) =>
    sendApiRequest<CreatedAccount>('/venue-accounts/credentials', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['venueRef']),
      body: request,
    }),
  listMarketDataKeys: () =>
    sendApiRequest<MarketDataKey[]>('/market-data-keys', 'GET', { apiUrl: REGISTRY_API_URL }),
  setMarketDataKey: (exchangeCode: string, credentials: Record<string, string>) =>
    sendApiRequest<MarketDataKey>('/market-data-keys', 'POST', {
      apiUrl: REGISTRY_API_URL,
      body: { exchangeCode, credentials },
    }),
  listMarketDataAccounts: () =>
    sendApiRequest<MarketDataAccount[]>('/market-data-accounts', 'GET', { apiUrl: REGISTRY_API_URL, convertToCamelCase: true }),
  setMarketDataAccount: (request: {
    sourceCode: string; label: string; credentials: Record<string, string>; connectionBudget: number | null; note?: string;
  }) =>
    sendApiRequest<MarketDataAccount>('/market-data-accounts', 'POST', {
      apiUrl: REGISTRY_API_URL, convertToCamelCase: true, body: request,
    }),
  updateMarketDataAccount: (accountId: number, change: { status?: string; connectionBudget?: number | null; note?: string }) =>
    sendApiRequest<MarketDataAccount>('/sources/accounts', 'PATCH', {
      apiUrl: REGISTRY_API_URL, convertToCamelCase: true, body: { accountId, ...change },
    }),
  deleteAccountSecrets: (accountId: number) =>
    sendApiRequest<DeletedSecrets>('/venue-accounts/delete-secrets', 'POST', {
      apiUrl: REGISTRY_API_URL,
      body: { accountId },
    }),
  getSessionAccounts: (sessionId: string) =>
    sendApiRequest<SessionAccount[]>('/strategy-sessions/accounts', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['venueRef']),
      queryParams: { sessionId },
    }),
  getTreasurySummary: () =>
    sendApiRequest<TreasurySummary>('/treasury/summary', 'GET', { apiUrl: REGISTRY_API_URL }),
  listTransfers: (accountId?: number) =>
    sendApiRequest<Transfer[]>('/treasury/transfers', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: accountId !== undefined ? { accountId } : undefined,
    }),
  // Amounts are signed price-unit strings: money in is positive, a withdrawal negative.
  recordTransfer: (transfer: {
    accountId: number; kind: TransferKind; amount: string; occurredAt?: string; externalRef?: string; reason: string;
  }) =>
    sendApiRequest<Transfer>('/treasury/transfers', 'POST', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      body: transfer,
    }),
  updateAccountConfig: (update: AccountConfigUpdate) =>
    sendApiRequest<unknown>('/treasury/account-config', 'PUT', {
      apiUrl: REGISTRY_API_URL,
      body: update,
    }),
  getRecon: (accountId: number) =>
    sendApiRequest<ReconDetail>('/treasury/recon', 'GET', {
      apiUrl: REGISTRY_API_URL,
      convertToCamelCase: true,
      queryParams: { accountId },
    }),
  // An operator's reading of the venue's balances, for when the poller can't read them.
  recordSnapshot: (snapshot: ManualSnapshot) =>
    sendApiRequest<unknown>('/treasury/snapshots', 'POST', {
      apiUrl: REGISTRY_API_URL,
      body: snapshot,
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
    if (params.sortBy) {
      queryParams.sortBy = params.sortBy === 'volume24h'
        ? 'volume_24h'
        : params.sortBy.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
    }
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

function logQuery(params?: { before?: string; limit?: number }): Record<string, string | number> | undefined {
  const query: Record<string, string | number> = {};
  if (params?.before) query.before = params.before;
  if (params?.limit) query.limit = params.limit;
  return Object.keys(query).length > 0 ? query : undefined;
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
    return sendApiRequest<{ runs: BacktestRun[]; count: number }>('/backtests', 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  // Parameter and metric names are user-defined (e.g. spread_bps) and shown verbatim next to the run's YAML.
  getBacktest: (runId: string) =>
    sendApiRequest<BacktestRun>(`/backtests/${runId}`, 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['configParams', 'sweepParams', 'summary']),
    }),
  getBacktestJobLogs: (runId: string, index: number, params?: { before?: string; limit?: number }) =>
    sendApiRequest<RunLogsResponse>(`/backtests/${runId}/jobs/${index}/logs`, 'GET', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, queryParams: logQuery(params),
    }),
  cancelBacktest: (runId: string) =>
    sendApiRequest<{ runId: string; status: string }>(`/backtests/${runId}`, 'DELETE', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
    }),
  listResearchJobs: (params?: { status?: string; limit?: number }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.limit) queryParams.limit = params.limit;
    return sendApiRequest<{ runs: ResearchJob[]; count: number }>('/research-jobs', 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['inputs']),
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  // Input names are user-chosen and shown verbatim.
  getResearchJob: (runId: string) =>
    sendApiRequest<ResearchJob>(`/research-jobs/${runId}`, 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
      preserveKeys: new Set(['inputs']),
    }),
  getResearchJobTaskLogs: (runId: string, index: number, params?: { before?: string; limit?: number }) =>
    sendApiRequest<RunLogsResponse>(`/research-jobs/${runId}/tasks/${index}/logs`, 'GET', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, queryParams: logQuery(params),
    }),
  cancelResearchJob: (runId: string) =>
    sendApiRequest<{ runId: string; status: string }>(`/research-jobs/${runId}`, 'DELETE', {
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
  listPipelines: () =>
    sendApiRequest<PipelineListResponse>('/research/pipelines', 'GET', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, preserveKeys: PIPELINE_DATA_KEYS,
    }),
  getPipeline: (pipelineName: string) =>
    sendApiRequest<PipelineDetailResponse>(`/research/pipelines/${pipelineName}`, 'GET', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, preserveKeys: PIPELINE_DATA_KEYS,
    }),
  runPipeline: (pipelineName: string, parameters: Record<string, unknown>) =>
    sendApiRequest<{ runId: string; ecsTaskArn: string }>(`/research/pipelines/${pipelineName}/runs`, 'POST', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, body: { parameters },
    }),
  setPipelineSchedule: (pipelineName: string, schedule: string, enabled: boolean) =>
    sendApiRequest<{ enabled: boolean }>(`/research/pipelines/${pipelineName}/schedules/${schedule}`, 'PUT', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, body: { enabled },
    }),
  getRunLogs: (pipelineName: string, runId: string, before?: string) =>
    sendApiRequest<RunLogsResponse>(`/research/pipelines/${pipelineName}/runs/${runId}/logs`, 'GET', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, queryParams: before ? { before } : undefined,
    }),
  cancelRun: (pipelineName: string, runId: string) =>
    sendApiRequest<{ run: PipelineRun }>(`/research/pipelines/${pipelineName}/runs/${runId}/cancel`, 'POST', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, preserveKeys: PIPELINE_DATA_KEYS,
    }),
  listDatasets: () =>
    sendApiRequest<{ datasets: Dataset[]; count: number }>('/research/datasets', 'GET', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true,
    }),
  getDataset: (name: string) =>
    sendApiRequest<DatasetDetail>(`/research/datasets/${name}`, 'GET', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, preserveKeys: new Set(['sample']),
    }),
  listArtifacts: () =>
    sendApiRequest<{ artifacts: ArtifactSummary[]; count: number }>('/research/artifacts', 'GET', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, preserveKeys: new Set(['aliases']),
    }),
  getArtifact: (artifactType: string, name: string) =>
    sendApiRequest<ArtifactDetail>(`/research/artifacts/${artifactType}/${name}`, 'GET', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true, preserveKeys: new Set(['aliases', 'params', 'metrics']),
    }),
  getArtifactDownload: (artifactType: string, name: string, version: string) =>
    sendApiRequest<{ url: string; expiresIn: number }>(`/research/artifacts/${artifactType}/${name}/${version}/download`, 'GET', {
      apiUrl: CONTROLLER_API_URL, convertToCamelCase: true,
    }),
  getServiceConfig: (service: string) =>
    sendApiRequest<ServiceConfigResponse>(`/config/${service}`, 'GET', {
      apiUrl: CONTROLLER_API_URL,
    }),
  updateServiceConfig: (service: string, config: Record<string, unknown>, version: number) =>
    sendApiRequest<ServiceConfigResponse>(`/config/${service}`, 'PUT', {
      apiUrl: CONTROLLER_API_URL,
      body: { config, version },
    }),
  getServiceConfigHistory: (service: string) =>
    sendApiRequest<ServiceConfigHistoryResponse>(`/config/${service}/history`, 'GET', {
      apiUrl: CONTROLLER_API_URL,
    }),
}

export const launcherApi = {
  getRuleTypes: () => sendApiRequest<RuleType[]>('/rule-types', 'GET', { apiUrl: LAUNCHER_API_URL }),

  listRules: () => sendApiRequest<LaunchRule[]>('/launch-rules', 'GET', { apiUrl: LAUNCHER_API_URL }),
  getRule: (ruleId: string) => sendApiRequest<LaunchRule>(`/launch-rules/${ruleId}`, 'GET', { apiUrl: LAUNCHER_API_URL }),
  createRule: (rule: EditableRule) =>
    sendApiRequest<LaunchRule>('/launch-rules', 'POST', { apiUrl: LAUNCHER_API_URL, body: rule }),
  // `revision` is the one the edit was based on: the launcher refuses it with 409 if someone saved since.
  updateRule: (ruleId: string, revision: number, changes: Partial<EditableRule>) =>
    sendApiRequest<LaunchRule>(`/launch-rules/${ruleId}`, 'PATCH', {
      apiUrl: LAUNCHER_API_URL, body: { ...changes, revision },
    }),
  archiveRule: (ruleId: string) =>
    sendApiRequest<LaunchRule>(`/launch-rules/${ruleId}`, 'DELETE', { apiUrl: LAUNCHER_API_URL }),
  validateRule: (rule: Partial<EditableRule>) =>
    sendApiRequest<{ problems: string[] }>('/launch-rules/validate', 'POST', { apiUrl: LAUNCHER_API_URL, body: { rule } }),
  ruleRevisions: (ruleId: string) =>
    sendApiRequest<RuleRevision[]>(`/launch-rules/${ruleId}/revisions`, 'GET', { apiUrl: LAUNCHER_API_URL }),
  ruleActivity: (ruleId: string, page: { before?: string; limit?: number } = {}) =>
    sendApiRequest<Page<TriggerEvaluation>>(`/launch-rules/${ruleId}/activity`, 'GET', {
      apiUrl: LAUNCHER_API_URL, queryParams: definedParams(page),
    }),
  ruleStats: (ruleId: string, days: number) =>
    sendApiRequest<RuleStats>(`/launch-rules/${ruleId}/stats`, 'GET', { apiUrl: LAUNCHER_API_URL, queryParams: { days } }),
  dryRun: (ruleId: string, data: Record<string, unknown>, action: 'launch' | 'shutdown') =>
    sendApiRequest<DryRunResult>(`/launch-rules/${ruleId}/dry-run`, 'POST', {
      apiUrl: LAUNCHER_API_URL, body: { data, action },
    }),

  listRequests: (filters: RequestFilters = {}) =>
    sendApiRequest<Page<LaunchRequest>>('/launch-requests', 'GET', {
      apiUrl: LAUNCHER_API_URL, queryParams: definedParams(filters),
    }),
  getRequest: (requestId: string) =>
    sendApiRequest<LaunchRequestDetail>(`/launch-requests/${requestId}`, 'GET', { apiUrl: LAUNCHER_API_URL }),
  actOnRequest: (requestId: string, action: RequestAction) =>
    sendApiRequest<LaunchRequest>(`/launch-requests/${requestId}/${action}`, 'POST', { apiUrl: LAUNCHER_API_URL }),

  listTriggers: (filters: { rule_type?: string; before?: string; limit?: number } = {}) =>
    sendApiRequest<Page<TriggerEvaluation>>('/triggers', 'GET', {
      apiUrl: LAUNCHER_API_URL, queryParams: definedParams(filters),
    }),
  sendTrigger: (body: { rule_type: string; action: 'launch' | 'shutdown'; data: Record<string, unknown> }) =>
    sendApiRequest<{ trigger_id: string }>('/triggers', 'POST', { apiUrl: LAUNCHER_API_URL, body }),
};

export interface RequestFilters {
  rule_id?: string;
  rule_type?: string;
  status?: string;
  action?: 'launch' | 'shutdown';
  before?: string;
  limit?: number;
}

export const botApi = {
  listNotes: () => sendApiRequest<BotNote[]>('/notes', 'GET', { apiUrl: BOT_API_URL }),
  editNote: (id: string, changes: { note?: string; scope?: string }) =>
    sendApiRequest<BotNote>(`/notes/${id}`, 'PATCH', { apiUrl: BOT_API_URL, body: changes }),
  deleteNote: (id: string) => sendApiRequest<{ id: string }>(`/notes/${id}`, 'DELETE', { apiUrl: BOT_API_URL }),
};
