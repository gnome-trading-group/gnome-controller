import { fetchAuthSession } from 'aws-amplify/auth';
import { Exchange, Listing, Security } from '../types';
import { LatencyProbeRequest, LatencyProbeResponse } from '../types/latency-probe';
import { CoverageSummaryResponse, SecurityCoverageResponse, SecurityExchangeCoverageResponse } from '../types/coverage';
import { TransformJobsListResponse, TransformJobsSearchResponse, TransformJobsListParams, TransformJobsSearchParams } from '../types/transform-jobs';
import { GapsListResponse, GapsListParams, GapsByListingParams, GapsUpdateRequest, GapsUpdateResponse } from '../types/gaps';

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
}


export const controllerApi = {
  runLatencyProbe: (request: LatencyProbeRequest) =>
    sendApiRequest<LatencyProbeResponse>('/latency-probe/run', 'POST', {
      apiUrl: CONTROLLER_API_URL,
      body: request,
    }),
}
