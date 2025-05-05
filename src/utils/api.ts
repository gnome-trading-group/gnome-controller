import { fetchAuthSession } from 'aws-amplify/auth';

const API_URL = import.meta.env.VITE_API_URL;

interface ApiResponse {
  statusCode: number;
  body: string;
}

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: any
): Promise<T> {
  try {
    const { tokens } = await fetchAuthSession();
    if (!tokens?.idToken) {
      throw new ApiError(401, 'Not authenticated');
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': tokens.idToken.toString()
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data: ApiResponse = await response.json();
    
    if (response.ok) {
      return JSON.parse(data.body);
    } else {
      const error = JSON.parse(data.body);
      throw new ApiError(response.status, error.error || 'An error occurred');
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, 'Failed to make API request');
  }
}

// Collector-specific API methods
export const collectorsApi = {
  list: () => apiRequest<{ collectors: any[] }>('/collectors'),
  create: (listingId: number) => apiRequest<{ message: string }>('/collectors', 'POST', { listingId }),
  delete: (listingId: number) => apiRequest<{ message: string }>('/collectors', 'DELETE', { listingId }),
  heartbeat: (listingId: number) => apiRequest<{ message: string }>('/collectors/heartbeat', 'POST', { listingId })
}; 