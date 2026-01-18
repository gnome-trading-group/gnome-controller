import { SchemaType } from "./schema";

export type TransformJobStatus = 'PENDING' | 'COMPLETE' | 'FAILED';

export interface TransformJob {
  jobId: string;
  timestamp: number;
  listingId: number;
  schemaType: SchemaType;
  status: TransformJobStatus;
  createdAt: number;
  processedAt: number | null;
  errorMessage: string | null;
  expiresAt: number | null;
}

export interface TransformJobsListResponse {
  jobs: TransformJob[];
  lastEvaluatedKey?: string;
  error?: string;
}

export interface TransformJobsSearchResponse {
  jobs: TransformJob[];
  lastEvaluatedKey?: string;
  error?: string;
}

export interface TransformJobsListParams {
  status?: TransformJobStatus;
  limit?: number;
  lastEvaluatedKey?: string;
}

export interface TransformJobsSearchParams {
  listingId: number;
  schemaType?: SchemaType;
  limit?: number;
  lastEvaluatedKey?: string;
}
