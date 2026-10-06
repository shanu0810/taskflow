'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getJob, getJobLogs, cancelJob, retryJob } from '@/lib/api';
import type { Job, JobLog } from '@/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft, XCircle, RotateCcw, RefreshCw, Clock, Terminal,
  Zap, AlertCircle, CheckCircle2,
} from 'lucide-react';

function InfoRow({ label, value }: { label: string; value: unknown }) {
  const display = value === null || value === undefined
    ? '—'
    : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : (value as React.ReactNode);
  return (
    <div className="flex items-start gap-4 py-3 border-b border-white/5 last:border-0">
      <span className="w-36 text-xs font-medium text-slate-500 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-300 font-mono break-all">{display as React.ReactNode}</span>
    </div>
  );
}

function duration(job: Job): string {
  if (!job.started_at) return '—';
  const end = job.completed_at ? new Date(job.completed_at) : new Date();
  const ms = end.getTime() - new Date(job.started_at).getTime();
  return ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(2)}s` : `${(ms / 60000).toFixed(2)}m`;
}

const LOG_LEVEL_COLOR: Record<string, string> = {
  INFO:    'text-blue-400',
  WARNING: 'text-yellow-400',
  ERROR:   'text-red-400',
};

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchJob = useCallback(async () => {
    try {
      const [j, l] = await Promise.all([getJob(params.id), getJobLogs(params.id)]);
      setJob(j);
      setLogs(l);
    } catch {
      router.push('/jobs');
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // Auto-refresh for running jobs
  useEffect(() => {
    if (!job || !['RUNNING','QUEUED','RETRY'].includes(job.status)) return;
    const t = setInterval(fetchJob, 3000);
    return () => clearInterval(t);
  }, [job, fetchJob]);

  const handleCancel = async () => {
    if (!job) return;
    setActionLoading(true);
    try {
      await cancelJob(job.id);
      showToast('Job cancelled');
      fetchJob();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!job) return;
    setActionLoading(true);
    try {
      await retryJob(job.id);
      showToast('Job queued for retry');
      fetchJob();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="card p-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      </div>
    );
  }

  if (!job) return null;

  const canCancel = ['PENDING','QUEUED','RETRY'].includes(job.status);
  const canRetry = ['FAILED','DEAD','TIMEOUT','CANCELLED'].includes(job.status);

  return (
    <div>
      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="page-header flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/jobs" className="text-slate-500 hover:text-slate-300 transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <span className="text-slate-600 text-sm">/</span>
            <span className="text-slate-400 text-sm">Jobs</span>
            <span className="text-slate-600 text-sm">/</span>
            <span className="text-slate-300 text-sm font-mono">{job.id.slice(0,8)}…</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">{job.name}</h1>
            <StatusBadge value={job.status} />
            <StatusBadge value={job.priority} type="priority" />
          </div>
          <p className="page-subtitle font-mono text-xs">{job.id}</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button onClick={fetchJob} className="btn-secondary" id="job-refresh">
            <RefreshCw size={14} />
          </button>
          {canCancel && (
            <button onClick={handleCancel} className="btn-danger" disabled={actionLoading} id="job-cancel">
              <XCircle size={14} /> Cancel
            </button>
          )}
          {canRetry && (
            <button onClick={handleRetry} className="btn-secondary" disabled={actionLoading} id="job-retry">
              <RotateCcw size={14} /> Retry
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Zap size={14} className="text-indigo-400" /> Job Details
            </h2>
            <InfoRow label="ID" value={job.id} />
            <InfoRow label="Task Type" value={<span className="bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded text-xs">{job.task_type}</span>} />
            <InfoRow label="Description" value={job.description} />
            <InfoRow label="Status" value={<StatusBadge value={job.status} />} />
            <InfoRow label="Priority" value={<StatusBadge value={job.priority} type="priority" />} />
            <InfoRow label="Retry Count" value={`${job.retry_count} / ${job.max_retries}`} />
            <InfoRow label="Timeout" value={`${job.timeout_seconds}s`} />
            <InfoRow label="Worker" value={job.worker_id} />
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Clock size={14} className="text-indigo-400" /> Timeline
            </h2>
            <InfoRow label="Created" value={job.created_at ? format(new Date(job.created_at), 'PPpp') : '—'} />
            <InfoRow label="Queued" value={job.queued_at ? format(new Date(job.queued_at), 'PPpp') : '—'} />
            <InfoRow label="Started" value={job.started_at ? format(new Date(job.started_at), 'PPpp') : '—'} />
            <InfoRow label="Completed" value={job.completed_at ? format(new Date(job.completed_at), 'PPpp') : '—'} />
            <InfoRow label="Scheduled" value={job.scheduled_at ? format(new Date(job.scheduled_at), 'PPpp') : '—'} />
            <InfoRow label="Duration" value={duration(job)} />
          </div>

          {/* Execution Logs */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Terminal size={14} className="text-indigo-400" /> Execution Logs
            </h2>
            {logs.length === 0 ? (
              <p className="text-sm text-slate-600">No logs yet</p>
            ) : (
              <div className="bg-black/30 rounded-lg p-4 font-mono text-xs space-y-1 max-h-72 overflow-y-auto">
                {logs.map(log => (
                  <div key={log.id} className="flex gap-3">
                    <span className="text-slate-600 shrink-0">
                      {format(new Date(log.created_at), 'HH:mm:ss')}
                    </span>
                    <span className={`shrink-0 ${LOG_LEVEL_COLOR[log.level] || 'text-slate-400'}`}>
                      [{log.level}]
                    </span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: payload + result */}
        <div className="space-y-6">
          {/* Payload */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Payload</h2>
            <pre className="bg-black/30 rounded-lg p-3 text-xs text-slate-400 overflow-x-auto max-h-60 font-mono">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </div>

          {/* Result */}
          {job.result && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400" /> Result
              </h2>
              <pre className="bg-black/30 rounded-lg p-3 text-xs text-emerald-400 overflow-x-auto max-h-60 font-mono">
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {job.error_message && (
            <div className="card p-5 border-red-500/20">
              <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                <AlertCircle size={14} /> Error
              </h2>
              <p className="text-xs text-red-400 font-mono break-all">{job.error_message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
