import { fetchAuthSession } from 'aws-amplify/auth';
import { Exchange, Listing, Security } from '../types';

const CONTROLLER_API_URL = import.meta.env.VITE_CONTROLLER_API_URL;
const REGISTRY_API_URL = import.meta.env.VITE_REGISTRY_API_URL;
const REGISTRY_API_KEY = import.meta.env.VITE_REGISTRY_API_KEY;

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

// Collector-specific API methods
export const collectorsApi = {
  list: () => sendApiRequest<{ collectors: any[] }>('/collectors/list', 'GET', { 
    apiUrl: CONTROLLER_API_URL,
  }),
  create: (listingId: number) => 
    sendApiRequest<{ message: string }>('/collectors/create', 'POST', { 
      apiUrl: CONTROLLER_API_URL,
      body: { listingId },
    }),
  delete: (listingId: number) => 
    sendApiRequest<{ message: string }>('/collectors/delete', 'DELETE', { 
      apiUrl: CONTROLLER_API_URL,
      body: { listingId },
    }),
  redeploy: (listingId?: number) => 
    sendApiRequest<{ message: string }>('/collectors/redeploy', 'POST', { 
      apiUrl: CONTROLLER_API_URL,
      body: { listingId },
    }),
  get: (listingId: number) => sendApiRequest<any>(`/collectors/${listingId}`, 'GET', { 
    apiUrl: CONTROLLER_API_URL,
  }),
  getLogs: (listingId: number) => sendApiRequest<any>(`/collectors/${listingId}/logs`, 'GET', { 
    apiUrl: CONTROLLER_API_URL,
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
