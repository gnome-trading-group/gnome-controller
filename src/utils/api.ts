import { fetchAuthSession } from 'aws-amplify/auth';
import { ContractRelationship, CreateContractRelationship, Currency, DenormalizedListing, Event, EventContract, ExchangeEvent, Exchange, Listing, ListingSpec, PaginationParams, PnlSnapshot, RiskPolicy, Security, Strategy } from '../types';
import { ResearchSession, ResearchSessionListResponse } from '../types/research';
import { LatencyProbeRequest, LatencyProbeResponse } from '../types/latency-probe';
import { CoverageSummaryResponse, SecurityCoverageResponse, SecurityExchangeCoverageResponse } from '../types/coverage';
import { TransformJobsListResponse, TransformJobsSearchResponse, TransformJobsListParams, TransformJobsSearchParams } from '../types/transform-jobs';
import { GapsListResponse, GapsListParams, GapsByListingParams, GapsUpdateRequest, GapsUpdateResponse } from '../types/gaps';
import { QualityIssuesListResponse, QualityIssuesListParams, QualityIssuesByListingParams, QualityIssuesUpdateRequest, QualityIssuesUpdateResponse, QualityBackfillRequest, QualityBackfillResponse, ListingStatisticsResponse, ListingStatisticsHistoryResponse, MinuteInvestigationResponse } from '../types/quality-issues';

const CONTROLLER_API_URL = import.meta.env.VITE_CONTROLLER_API_URL;
const REGISTRY_API_URL = import.meta.env.VITE_REGISTRY_API_URL;
const REGISTRY_API_KEY = import.meta.env.VITE_REGISTRY_API_KEY;
const MARKET_DATA_API_URL = import.meta.env.VITE_MARKET_DATA_API_URL;

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiConfig {
  apiUrl: string;
  apiKey?: string;
  convertToCamelCase?: boolean;
  queryParams?: Record<string, string | number | boolean>;
  body?: any;
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function convertObjectToCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertObjectToCamelCase);
  }
  
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        toCamelCase(key),
        convertObjectToCamelCase(value)
      ])
    );
  }
  
  return obj;
}

export async function sendApiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH' = 'GET',
  config: ApiConfig,
): Promise<T> {
  try {
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers['x-api-key'] = config.apiKey;
    } else {
      const { tokens } = await fetchAuthSession();
      if (!tokens?.idToken) {
        throw new ApiError(401, 'Not authenticated');
      }
      headers['Authorization'] = tokens.idToken.toString();
    }

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

    const data = await response.json();
    if (response.ok) {
      return (config.convertToCamelCase ? convertObjectToCamelCase(data) : data) as T;
    } else {
      const error = typeof data.body === 'string' ? data.body : data.body?.error || 'An error occurred';
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
  createCollector: (listingId: number, region: string) =>
    sendApiRequest<{ message: string }>('/collectors/create', 'POST', {
      apiUrl: MARKET_DATA_API_URL,
      body: { listingId, region },
    }),
  deleteCollector: (listingId: number) =>
    sendApiRequest<{ message: string }>('/collectors/delete', 'DELETE', {
      apiUrl: MARKET_DATA_API_URL,
      body: { listingId },
    }),
  redeployCollector: (listingId?: number) =>
    sendApiRequest<{ message: string }>('/collectors/redeploy', 'POST', {
      apiUrl: MARKET_DATA_API_URL,
      body: { listingId },
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
};

export const registryApi = {
  listExchanges: () => sendApiRequest<any[]>('/exchanges', 'GET', { 
    apiUrl: REGISTRY_API_URL, 
    apiKey: REGISTRY_API_KEY,
    convertToCamelCase: true 
  }),
  listSecurities: () => sendApiRequest<any[]>('/securities', 'GET', { 
    apiUrl: REGISTRY_API_URL, 
    apiKey: REGISTRY_API_KEY,
    convertToCamelCase: true 
  }),
  listListings: () => sendApiRequest<any[]>('/listings', 'GET', { 
    apiUrl: REGISTRY_API_URL, 
    apiKey: REGISTRY_API_KEY,
    convertToCamelCase: true 
  }),
  deleteExchange: (exchangeId: number) => sendApiRequest<{ message: string }>('/exchanges', 'DELETE', { 
    apiUrl: REGISTRY_API_URL, 
    apiKey: REGISTRY_API_KEY,
    convertToCamelCase: true,
    body: { exchangeId },
  }),
  deleteSecurity: (securityId: number) => sendApiRequest<{ message: string }>('/securities', 'DELETE', { 
    apiUrl: REGISTRY_API_URL, 
    apiKey: REGISTRY_API_KEY,
    convertToCamelCase: true,
    body: { securityId },
  }),
  deleteListing: (listingId: number) => sendApiRequest<{ message: string }>('/listings', 'DELETE', { 
    apiUrl: REGISTRY_API_URL, 
    apiKey: REGISTRY_API_KEY,
    convertToCamelCase: true,
    body: { listingId },
  }),
  updateExchange: (exchangeId: number, exchange: Partial<Exchange>) => sendApiRequest<{ message: string }>('/exchanges', 'PATCH', { 
    apiUrl: REGISTRY_API_URL, 
    apiKey: REGISTRY_API_KEY,
    convertToCamelCase: true,
    body: exchange,
    queryParams: { exchangeId },
  }),
  updateSecurity: (securityId: number, security: Partial<Security>) => sendApiRequest<{ message: string }>('/securities', 'PATCH', { 
    apiUrl: REGISTRY_API_URL, 
    apiKey: REGISTRY_API_KEY,
    convertToCamelCase: true,
    body: security,
    queryParams: { securityId },
  }),
  updateListing: (listingId: number, listing: Partial<Listing>) => sendApiRequest<{ message: string }>('/listings', 'PATCH', { 
    apiUrl: REGISTRY_API_URL, 
    apiKey: REGISTRY_API_KEY,
    convertToCamelCase: true,
    body: listing,
    queryParams: { listingId },
  }),
  createExchange: (exchange: Omit<Exchange, 'exchangeId' | 'dateCreated' | 'dateModified'>) => 
    sendApiRequest<Exchange>('/exchanges', 'POST', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      body: exchange,
    }),
  createSecurity: (security: Omit<Security, 'securityId' | 'dateCreated' | 'dateModified'>) => 
    sendApiRequest<Security>('/securities', 'POST', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      body: security,
    }),
  createListing: (listing: Omit<Listing, 'listingId' | 'dateCreated' | 'dateModified'>) =>
    sendApiRequest<Listing>('/listings', 'POST', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      body: listing,
    }),
  listStrategies: (params?: { strategyId?: number; name?: string; status?: number }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.strategyId !== undefined) queryParams.strategyId = params.strategyId;
    if (params?.name) queryParams.name = params.name;
    if (params?.status !== undefined) queryParams.status = params.status;
    return sendApiRequest<Strategy[]>('/strategies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  createStrategy: (strategy: Omit<Strategy, 'dateCreated' | 'dateModified'>) =>
    sendApiRequest<Strategy>('/strategies', 'POST', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body: strategy,
    }),
  updateStrategy: (strategyId: number, strategy: Partial<Strategy>) =>
    sendApiRequest<{ message: string }>('/strategies', 'PATCH', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body: strategy,
      queryParams: { strategyId },
    }),
  deleteStrategy: (strategyId: number) =>
    sendApiRequest<{ message: string }>('/strategies', 'DELETE', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body: { strategyId },
    }),
  listCurrencies: () =>
    sendApiRequest<Currency[]>('/currencies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
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
      apiKey: REGISTRY_API_KEY,
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
      apiKey: REGISTRY_API_KEY,
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
      apiKey: REGISTRY_API_KEY,
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
      apiKey: REGISTRY_API_KEY,
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
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams,
    });
  },
  countCurrencies: (params?: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = { count: true };
    if (params?.search) queryParams.search = params.search;
    return sendApiRequest<{ count: number }>('/currencies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      queryParams,
    }).then(r => r.count);
  },
  searchSecurities: (search: string, limit = 50) =>
    sendApiRequest<Security[]>('/securities', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams: { search, limit },
    }),
  searchListings: (search: string, limit = 50) =>
    sendApiRequest<DenormalizedListing[]>('/listings', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams: { search, limit, denormalize: true },
    }),
  searchCurrencies: (search: string, limit = 50) =>
    sendApiRequest<Currency[]>('/currencies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams: { search, limit },
    }),
  listListingSpecs: (listingId?: number, history?: boolean) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (listingId !== undefined) queryParams.listingId = listingId;
    if (history) queryParams.history = true;
    return sendApiRequest<ListingSpec[]>('/listing-specs', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  createListingSpec: (spec: Omit<ListingSpec, 'dateCreated' | 'dateModified'>) =>
    sendApiRequest<ListingSpec>('/listing-specs', 'POST', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body: spec,
    }),
  updateListingSpec: (listingId: number, spec: Partial<ListingSpec>) =>
    sendApiRequest<{ message: string }>('/listing-specs', 'PATCH', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body: spec,
      queryParams: { listingId },
    }),
  deleteListingSpec: (listingId: number) =>
    sendApiRequest<{ message: string }>('/listing-specs', 'DELETE', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body: { listingId },
    }),
  listPnlLatest: (strategyId?: number) =>
    sendApiRequest<PnlSnapshot[]>('/pnl/latest', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams: strategyId !== undefined ? { strategyId } : undefined,
    }),
  listRiskPolicies: () =>
    sendApiRequest<RiskPolicy[]>('/risk/policies', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
    }),
  createRiskPolicy: (policy: Omit<RiskPolicy, 'policyId' | 'dateCreated' | 'dateModified'>) =>
    sendApiRequest<RiskPolicy>('/risk/policies', 'POST', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body: policy,
    }),
  updateRiskPolicy: (policyId: number, policy: Partial<RiskPolicy>) =>
    sendApiRequest<{ message: string }>('/risk/policies', 'PATCH', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body: policy,
      queryParams: { policyId },
    }),
  deleteRiskPolicy: (policyId: number) =>
    sendApiRequest<{ message: string }>('/risk/policies', 'DELETE', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body: { policyId },
    }),
  listEventsPaginated: (params: PaginationParams) => {
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
    return sendApiRequest<Event[]>('/events', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams,
    });
  },
  countEvents: (params?: PaginationParams) => {
    const queryParams: Record<string, string | number | boolean> = { count: true };
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (!['limit', 'offset', 'sortBy', 'sortOrder', 'search'].includes(k) && v !== undefined) {
        queryParams[k] = v as string | number | boolean;
      }
    });
    return sendApiRequest<{ count: number }>('/events', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
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
    return sendApiRequest<ContractRelationship[]>('/contract-relationships', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
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
      apiKey: REGISTRY_API_KEY,
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
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  listEventContracts: (params?: { eventId?: number; securityId?: number }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.eventId !== undefined) queryParams.eventId = params.eventId;
    if (params?.securityId !== undefined) queryParams.securityId = params.securityId;
    return sendApiRequest<EventContract[]>('/event-contracts', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  listContractRelationships: (params?: { method?: string; relationshipType?: string; securityId?: number }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.method) queryParams.method = params.method;
    if (params?.relationshipType) queryParams.relationshipType = params.relationshipType;
    if (params?.securityId !== undefined) queryParams.securityId = params.securityId;
    return sendApiRequest<ContractRelationship[]>('/contract-relationships', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  createContractRelationship: (body: CreateContractRelationship) =>
    sendApiRequest<{ message: string }>('/contract-relationships', 'POST', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body,
    }),
  deleteContractRelationship: (relationshipId: number) =>
    sendApiRequest<{ message: string }>('/contract-relationships', 'DELETE', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      body: { relationshipId },
    }),
  listExchangeEvents: (params?: { eventId?: number; exchangeId?: number; nativeEventId?: string }) => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.eventId !== undefined) queryParams.eventId = params.eventId;
    if (params?.exchangeId !== undefined) queryParams.exchangeId = params.exchangeId;
    if (params?.nativeEventId) queryParams.nativeEventId = params.nativeEventId;
    return sendApiRequest<ExchangeEvent[]>('/exchange-events', 'GET', {
      apiUrl: REGISTRY_API_URL,
      apiKey: REGISTRY_API_KEY,
      convertToCamelCase: true,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
  },
  listSecuritySymbols: async (): Promise<Record<number, string>> => {
    const PAGE_SIZE = 100000;
    const map: Record<number, string> = {};
    let offset = 0;
    while (true) {
      const rows = await sendApiRequest<{ security_id: number; symbol: string }[]>(
        '/securities/symbols', 'GET', {
          apiUrl: REGISTRY_API_URL,
          apiKey: REGISTRY_API_KEY,
          queryParams: { limit: PAGE_SIZE, offset },
        },
      );
      for (const row of rows) map[row.security_id] = row.symbol;
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return map;
  },
}


export const controllerApi = {
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
  getBacktest: (runId: string) =>
    sendApiRequest<any>(`/backtests/${runId}`, 'GET', {
      apiUrl: CONTROLLER_API_URL,
      convertToCamelCase: true,
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
    }),
  addResearchNote: (sessionName: string, content: string) =>
    sendApiRequest<{ sessionName: string; timestamp: string }>(
      `/research/sessions/${sessionName}/notes`, 'POST', {
        apiUrl: CONTROLLER_API_URL,
        convertToCamelCase: true,
        body: { content },
      }
    ),
}
