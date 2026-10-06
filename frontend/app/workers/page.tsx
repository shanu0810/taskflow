'use client';

import { useEffect, useState, useCallback } from 'react';
import { listWorkers } from '@/lib/api';
import type { Worker } from '@/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { format, formatDistanceToNow } from 'date-fns';
import { RefreshCw, Server, Activity } from 'lucide-react';

function uptime(w: Worker): string {
  const ms = Date.now() - new Date(w.started_at).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkers = useCallback(async () => {
    try {
      const ws = await listWorkers();
      setWorkers(ws);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchWorkers();
    const t = setInterval(fetchWorkers, 10000);
    return () => clearInterval(t);
  }, [fetchWorkers]);

  const online = workers.filter(w => w.status !== 'OFFLINE').length;
  const busy = workers.filter(w => w.status === 'BUSY').length;

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Workers</h1>
          <p className="page-subtitle">{online} online · {busy} busy · {workers.length} total</p>
        </div>
        <button onClick={fetchWorkers} className="btn-secondary" id="workers-refresh">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: workers.length, color: '#e2e8f0' },
          { label: 'Online', value: online, color: '#34d399' },
          { label: 'Busy', value: busy, color: '#fbbf24' },
          { label: 'Offline', value: workers.filter(w => w.status === 'OFFLINE').length, color: '#64748b' },
        ].map(card => (
          <div key={card.label} className="stat-card">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{card.label}</p>
            <p className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="card p-4"><TableSkeleton rows={4} cols={7} /></div>
      ) : workers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Server size={32} className="text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">No workers registered</p>
            <p className="text-slate-600 text-xs mt-1">Start a worker process to begin processing jobs</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {workers.map(worker => (
            <div key={worker.id} className="card p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    worker.status === 'BUSY' ? 'bg-yellow-400 animate-pulse' :
                    worker.status === 'IDLE' ? 'bg-blue-400' :
                    worker.status === 'ONLINE' ? 'bg-emerald-400' : 'bg-slate-600'
                  }`} />
                  <div>
                    <p className="text-base font-semibold text-white">{worker.id}</p>
                    <p className="text-xs text-slate-500">{worker.hostname}{worker.pid ? ` · PID ${worker.pid}` : ''}</p>
                  </div>
                </div>
                <StatusBadge value={worker.status} type="worker" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-600 mb-0.5">Jobs Processed</p>
                  <p className="text-lg font-semibold text-emerald-400">{worker.jobs_processed}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-0.5">Jobs Failed</p>
                  <p className="text-lg font-semibold text-red-400">{worker.jobs_failed}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-0.5">Uptime</p>
                  <p className="text-lg font-semibold text-slate-300">{uptime(worker)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-0.5">Last Heartbeat</p>
                  <p className="text-sm text-slate-400">
                    {worker.last_heartbeat
                      ? formatDistanceToNow(new Date(worker.last_heartbeat), { addSuffix: true })
                      : '—'}
                  </p>
                </div>
              </div>

              {worker.current_job_id && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <Activity size={12} className="text-yellow-400 animate-pulse" />
                    <span className="text-xs text-slate-400">
                      Processing job: <span className="font-mono text-slate-300">{worker.current_job_id}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
