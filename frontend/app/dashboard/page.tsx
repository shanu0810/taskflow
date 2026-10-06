'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  getAnalyticsOverview, getAnalyticsJobs, listWorkers,
} from '@/lib/api';
import type { AnalyticsOverview, AnalyticsJobs, Worker } from '@/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CardSkeleton } from '@/components/ui/Skeleton';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { Plus, RefreshCw, TrendingUp, Layers, Server, Clock } from 'lucide-react';
import type { WorkerStatus } from '@/types';

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function StatCard({ label, value, sub, color = '#6366f1' }: {
  label: string; value: number | string; sub?: string; color?: string;
}) {
  return (
    <div className="stat-card">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [jobsAnalytics, setJobsAnalytics] = useState<AnalyticsJobs | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [ov, ja, ws] = await Promise.all([
        getAnalyticsOverview(),
        getAnalyticsJobs(7),
        listWorkers(),
      ]);
      setOverview(ov);
      setJobsAnalytics(ja);
      setWorkers(ws);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // auto-refresh every 15s
    return () => clearInterval(interval);
  }, [fetchData]);

  const taskPieData = jobsAnalytics
    ? Object.entries(jobsAnalytics.task_type_breakdown).map(([name, value]) => ({ name, value }))
    : [];

  const queueData = overview
    ? Object.entries(overview.queue_sizes).map(([name, count]) => ({ name, count }))
    : [];

  return (
    <div>
      {/* Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Real-time overview of your job queue and workers</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
          <button onClick={fetchData} className="btn-secondary" id="refresh-dashboard">
            <RefreshCw size={14} />
            Refresh
          </button>
          <Link href="/create-job" className="btn-primary" id="dashboard-create-job">
            <Plus size={14} />
            New Job
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : overview && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <StatCard label="Total Jobs" value={overview.total_jobs} color="#e2e8f0" />
            <StatCard label="Queued" value={overview.queued} color="#60a5fa" sub="Waiting for worker" />
            <StatCard label="Running" value={overview.running} color="#fbbf24" sub="In progress" />
            <StatCard label="Success" value={overview.success} color="#34d399" sub="Completed" />
            <StatCard label="Failed / Dead" value={overview.failed + overview.dead} color="#f87171" sub="Needs attention" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            <StatCard label="Pending" value={overview.pending} color="#94a3b8" />
            <StatCard label="Retry" value={overview.retry} color="#fb923c" />
            <StatCard label="Cancelled" value={overview.cancelled} color="#64748b" />
            <StatCard label="Active Workers" value={overview.active_workers} color="#a78bfa" />
            <StatCard label="Avg Exec Time" value={`${jobsAnalytics?.avg_execution_time_seconds.toFixed(1) ?? 0}s`} color="#22d3ee" />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Jobs Over Time */}
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-300">Jobs over time (7 days)</h2>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={jobsAnalytics?.jobs_over_time ?? []}>
                  <defs>
                    <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Area type="monotone" dataKey="success" stroke="#10b981" fill="url(#successGrad)" strokeWidth={2} name="Success" />
                  <Area type="monotone" dataKey="failed" stroke="#ef4444" fill="url(#failedGrad)" strokeWidth={2} name="Failed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Task type breakdown */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Layers size={16} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-300">Task types</h2>
              </div>
              {taskPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={taskPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} strokeWidth={0}>
                      {taskPieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state h-40 text-sm">No job data yet</div>
              )}
            </div>
          </div>

          {/* Queue sizes + Workers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Queue sizes */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={16} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-300">Queue depth by priority</h2>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={queueData} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar dataKey="count" name="Jobs" radius={[4, 4, 0, 0]}>
                    {queueData.map((entry, i) => {
                      const colors: Record<string, string> = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#6366f1', LOW: '#64748b', SCHEDULED: '#8b5cf6' };
                      return <Cell key={i} fill={colors[entry.name] || '#6366f1'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Workers */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Server size={16} className="text-indigo-400" />
                  <h2 className="text-sm font-semibold text-slate-300">Workers</h2>
                </div>
                <Link href="/workers" className="text-xs text-indigo-400 hover:text-indigo-300">View all →</Link>
              </div>
              {workers.length === 0 ? (
                <div className="empty-state h-32 text-sm">No workers registered</div>
              ) : (
                <div className="space-y-2">
                  {workers.slice(0, 5).map(w => (
                    <div key={w.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-slate-300">{w.id}</p>
                        <p className="text-xs text-slate-600">{w.hostname} · {w.jobs_processed} jobs done</p>
                      </div>
                      <StatusBadge value={w.status} type="worker" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
