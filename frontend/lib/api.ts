/**
 * TaskFlow API client — all backend calls go through this module.
 */

import type {
  User, Job, JobListResponse, JobLog, Worker,
  AnalyticsOverview, AnalyticsJobs, CreateJobPayload,
  TokenResponse,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_PREFIX = `${API_BASE}/api/v1`;

// ─── Token storage ─────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('taskflow_token');
}

export function setToken(token: string): void {
  localStorage.setItem('taskflow_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('taskflow_token');
}

// ─── Base fetch wrapper ────────────────────────────────────────────────────────

interface FetchOptions extends RequestInit {
  auth?: boolean;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { auth = true, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string> || {}),
  };

  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_PREFIX}${path}`, { ...rest, headers });

  if (response.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || `API error ${response.status}`);
  }

  return data as T;
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export async function register(email: string, username: string, password: string): Promise<User> {
  return apiFetch('/auth/register', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, username, password }),
  });
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const data = await apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  return data;
}

export async function getMe(): Promise<User> {
  return apiFetch('/auth/me');
}

// ─── Jobs ──────────────────────────────────────────────────────────────────────

export interface ListJobsParams {
  page?: number;
  page_size?: number;
  status?: string;
  priority?: string;
  task_type?: string;
  search?: string;
}

export async function listJobs(params: ListJobsParams = {}): Promise<JobListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  });
  return apiFetch(`/jobs?${qs}`);
}

export async function getJob(id: string): Promise<Job> {
  return apiFetch(`/jobs/${id}`);
}

export async function createJob(payload: CreateJobPayload): Promise<Job> {
  return apiFetch('/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cancelJob(id: string): Promise<Job> {
  return apiFetch(`/jobs/${id}/cancel`, { method: 'POST' });
}

export async function retryJob(id: string): Promise<Job> {
  return apiFetch(`/jobs/${id}/retry`, { method: 'POST' });
}

export async function getJobLogs(id: string): Promise<JobLog[]> {
  return apiFetch(`/jobs/${id}/logs`);
}

export async function getTaskTypes(): Promise<string[]> {
  return apiFetch('/jobs/task-types');
}

// ─── Workers ───────────────────────────────────────────────────────────────────

export async function listWorkers(): Promise<Worker[]> {
  return apiFetch('/workers');
}

export async function getWorker(id: string): Promise<Worker> {
  return apiFetch(`/workers/${id}`);
}

// ─── Analytics ─────────────────────────────────────────────────────────────────

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  return apiFetch('/analytics/overview');
}

export async function getAnalyticsJobs(days = 7): Promise<AnalyticsJobs> {
  return apiFetch(`/analytics/jobs?days=${days}`);
}
