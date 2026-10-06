/**
 * Status badge component — color-coded per job/worker status.
 */

import type { JobStatus, WorkerStatus } from '@/types';

const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  PENDING:   'bg-slate-500/20 text-slate-300 border-slate-500/30',
  QUEUED:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
  RUNNING:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  SUCCESS:   'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  FAILED:    'bg-red-500/20 text-red-300 border-red-500/30',
  RETRY:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
  DEAD:      'bg-red-900/40 text-red-400 border-red-900/50',
  CANCELLED: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
  TIMEOUT:   'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

const WORKER_STATUS_STYLES: Record<WorkerStatus, string> = {
  ONLINE:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  BUSY:    'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  IDLE:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
  OFFLINE: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW:      'bg-slate-500/20 text-slate-300 border-slate-500/30',
  MEDIUM:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
  HIGH:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
  CRITICAL: 'bg-red-500/20 text-red-300 border-red-500/30',
};

interface BadgeProps {
  value: string;
  type?: 'job' | 'worker' | 'priority';
}

export function StatusBadge({ value, type = 'job' }: BadgeProps) {
  let style = 'bg-slate-500/20 text-slate-300 border-slate-500/30';

  if (type === 'job') style = JOB_STATUS_STYLES[value as JobStatus] || style;
  else if (type === 'worker') style = WORKER_STATUS_STYLES[value as WorkerStatus] || style;
  else if (type === 'priority') style = PRIORITY_STYLES[value] || style;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      {value}
    </span>
  );
}
