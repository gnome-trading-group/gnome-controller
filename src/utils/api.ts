import { fetchAuthSession } from 'aws-amplify/auth';

const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function sendApiRequest<T>(
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

    const data = await response.json();
    if (response.ok) {
      return data as T;
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
  list: () => sendApiRequest<{ collectors: any[] }>('/collectors'),
  create: (listingId: number) => sendApiRequest<{ message: string }>('/collectors', 'POST', { listingId }),
  delete: (listingId: number) => sendApiRequest<{ message: string }>('/collectors', 'DELETE', { listingId }),
}; 