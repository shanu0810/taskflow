'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { listJobs, cancelJob, retryJob } from '@/lib/api';
import type { Job, JobStatus, JobPriority } from '@/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Search, Plus, RefreshCw, XCircle, RotateCcw, Eye,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

const STATUS_OPTIONS: JobStatus[] = ['PENDING','QUEUED','RUNNING','SUCCESS','FAILED','RETRY','DEAD','CANCELLED','TIMEOUT'];
const PRIORITY_OPTIONS: JobPriority[] = ['LOW','MEDIUM','HIGH','CRITICAL'];

function duration(job: Job): string {
  if (!job.started_at) return '—';
  const end = job.completed_at ? new Date(job.completed_at) : new Date();
  const ms = end.getTime() - new Date(job.started_at).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const PAGE_SIZE = 20;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listJobs({ page, page_size: PAGE_SIZE, search, status: statusFilter, priority: priorityFilter });
      setJobs(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, priorityFilter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Auto-refresh while any jobs are running
  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'RUNNING' || j.status === 'QUEUED');
    if (!hasRunning) return;
    const t = setInterval(fetchJobs, 5000);
    return () => clearInterval(t);
  }, [jobs, fetchJobs]);

  const handleCancel = async (id: string) => {
    setActionLoading(id + '-cancel');
    try {
      await cancelJob(id);
      showToast('Job cancelled');
      fetchJobs();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetry = async (id: string) => {
    setActionLoading(id + '-retry');
    try {
      await retryJob(id);
      showToast('Job queued for retry');
      fetchJobs();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.msg}
        </div>
      )}

      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">{total} total jobs</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchJobs} className="btn-secondary" id="jobs-refresh">
            <RefreshCw size={14} />
          </button>
          <Link href="/create-job" className="btn-primary" id="jobs-create">
            <Plus size={14} /> New Job
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            id="jobs-search"
            type="text"
            className="input pl-9"
            placeholder="Search jobs..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select id="jobs-filter-status" className="input w-40"
          value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select id="jobs-filter-priority" className="input w-40"
          value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}>
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {(statusFilter || priorityFilter || search) && (
          <button className="btn-secondary text-xs" onClick={() => { setStatusFilter(''); setPriorityFilter(''); setSearch(''); setPage(1); }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="table-container">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={7} /></div>
        ) : jobs.length === 0 ? (
          <div className="empty-state">
            <p className="text-slate-500 text-sm">No jobs found</p>
            <Link href="/create-job" className="btn-primary mt-4 text-xs">Create your first job</Link>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Task</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Worker</th>
                <th>Created</th>
                <th>Duration</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td>
                    <div>
                      <p className="font-medium text-slate-200 truncate max-w-48">{job.name}</p>
                      <p className="text-xs text-slate-600 font-mono">{job.id.slice(0, 8)}…</p>
                    </div>
                  </td>
                  <td><span className="font-mono text-xs text-slate-400">{job.task_type}</span></td>
                  <td><StatusBadge value={job.priority} type="priority" /></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <StatusBadge value={job.status} />
                      {job.retry_count > 0 && (
                        <span className="text-xs text-slate-600">×{job.retry_count}</span>
                      )}
                    </div>
                  </td>
                  <td><span className="text-xs text-slate-500">{job.worker_id || '—'}</span></td>
                  <td>
                    <span className="text-xs text-slate-500" title={format(new Date(job.created_at), 'PPpp')}>
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </span>
                  </td>
                  <td><span className="text-xs text-slate-400">{duration(job)}</span></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Link href={`/jobs/${job.id}`} className="btn-secondary px-2 py-1 text-xs" id={`view-job-${job.id}`}>
                        <Eye size={12} />
                      </Link>
                      {['PENDING','QUEUED','RETRY'].includes(job.status) && (
                        <button
                          className="btn-danger px-2 py-1 text-xs"
                          onClick={() => handleCancel(job.id)}
                          disabled={actionLoading === job.id + '-cancel'}
                          id={`cancel-job-${job.id}`}
                        >
                          <XCircle size={12} />
                        </button>
                      )}
                      {['FAILED','DEAD','TIMEOUT','CANCELLED'].includes(job.status) && (
                        <button
                          className="btn-secondary px-2 py-1 text-xs"
                          onClick={() => handleRetry(job.id)}
                          disabled={actionLoading === job.id + '-retry'}
                          id={`retry-job-${job.id}`}
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages} · {total} jobs
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
              <ChevronLeft size={14} />
            </button>
            <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
