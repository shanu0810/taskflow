/**
 * TypeScript types for TaskFlow API responses.
 */

export type JobStatus =
  | 'PENDING' | 'QUEUED' | 'RUNNING' | 'SUCCESS'
  | 'FAILED' | 'RETRY' | 'DEAD' | 'CANCELLED' | 'TIMEOUT';

export type JobPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type WorkerStatus = 'ONLINE' | 'BUSY' | 'IDLE' | 'OFFLINE';

export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  created_at: string;
}

export interface Job {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  task_type: string;
  payload: Record<string, unknown>;
  priority: JobPriority;
  status: JobStatus;
  retry_count: number;
  max_retries: number;
  timeout_seconds: number;
  worker_id: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  scheduled_at: string | null;
}

export interface JobListResponse {
  total: number;
  page: number;
  page_size: number;
  items: Job[];
}

export interface JobLog {
  id: string;
  job_id: string;
  level: string;
  message: string;
  created_at: string;
}

export interface Worker {
  id: string;
  hostname: string;
  pid: number | null;
  status: WorkerStatus;
  last_heartbeat: string | null;
  current_job_id: string | null;
  jobs_processed: number;
  jobs_failed: number;
  started_at: string;
}

export interface AnalyticsOverview {
  total_jobs: number;
  pending: number;
  queued: number;
  running: number;
  success: number;
  failed: number;
  dead: number;
  cancelled: number;
  timeout: number;
  retry: number;
  active_workers: number;
  idle_workers: number;
  offline_workers: number;
  queue_sizes: Record<string, number>;
}

export interface JobsOverTime {
  date: string;
  success: number;
  failed: number;
  total: number;
}

export interface AnalyticsJobs {
  jobs_over_time: JobsOverTime[];
  avg_execution_time_seconds: number;
  task_type_breakdown: Record<string, number>;
}

export interface CreateJobPayload {
  name: string;
  description?: string;
  task_type: string;
  payload: Record<string, unknown>;
  priority: JobPriority;
  max_retries: number;
  timeout_seconds: number;
  scheduled_at?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}
