'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createJob, getTaskTypes } from '@/lib/api';
import type { JobPriority } from '@/types';
import { ArrowLeft, Plus, HelpCircle } from 'lucide-react';
import Link from 'next/link';

const PRIORITY_OPTIONS: { value: JobPriority; label: string; desc: string; color: string }[] = [
  { value: 'LOW',      label: 'Low',      desc: 'No rush',       color: 'border-slate-600 text-slate-400' },
  { value: 'MEDIUM',   label: 'Medium',   desc: 'Default',       color: 'border-blue-500/50 text-blue-300' },
  { value: 'HIGH',     label: 'High',     desc: 'Prioritised',   color: 'border-orange-500/50 text-orange-300' },
  { value: 'CRITICAL', label: 'Critical', desc: 'Immediately',   color: 'border-red-500/50 text-red-300' },
];

const TASK_DEFAULTS: Record<string, object> = {
  echo_task:             { message: 'Hello TaskFlow' },
  sleep_task:            { seconds: 3 },
  calculate_task:        { operation: 'add', a: 42, b: 58 },
  random_failure_task:   { failure_rate: 0.5 },
  generate_report_task:  { report_type: 'summary', rows: 500 },
  data_transform_task:   { data: ['hello', 'world'], transform: 'uppercase' },
  send_notification_task:{ channel: 'email', recipient: 'user@example.com', message: 'Hello!' },
};

export default function CreateJobPage() {
  const router = useRouter();
  const [taskTypes, setTaskTypes] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    task_type: '',
    payload: '{}',
    priority: 'MEDIUM' as JobPriority,
    max_retries: 3,
    timeout_seconds: 300,
    scheduled_at: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getTaskTypes().then(setTaskTypes).catch(console.error);
  }, []);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleTaskTypeChange = (type: string) => {
    set('task_type', type);
    if (TASK_DEFAULTS[type]) {
      set('payload', JSON.stringify(TASK_DEFAULTS[type], null, 2));
    }
    setErrors(e => ({ ...e, task_type: '' }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.task_type) newErrors.task_type = 'Select a task type';
    try { JSON.parse(form.payload); } catch { newErrors.payload = 'Invalid JSON'; }
    if (form.max_retries < 0 || form.max_retries > 10) newErrors.max_retries = 'Must be 0–10';
    if (form.timeout_seconds < 1 || form.timeout_seconds > 3600) newErrors.timeout_seconds = 'Must be 1–3600s';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const job = await createJob({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        task_type: form.task_type,
        payload: JSON.parse(form.payload),
        priority: form.priority,
        max_retries: Number(form.max_retries),
        timeout_seconds: Number(form.timeout_seconds),
        scheduled_at: form.scheduled_at || undefined,
      });
      setToast('Job created!');
      setTimeout(() => router.push(`/jobs/${job.id}`), 1000);
    } catch (err: unknown) {
      setErrors({ submit: err instanceof Error ? err.message : 'Failed to create job' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {toast && <div className="toast toast-success">{toast}</div>}

      <div className="page-header flex items-center gap-3">
        <Link href="/jobs" className="text-slate-500 hover:text-slate-300 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="page-title">Create Job</h1>
          <p className="page-subtitle">Queue a new background task</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main form */}
          <div className="lg:col-span-2 space-y-5">
            {errors.submit && (
              <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {errors.submit}
              </div>
            )}

            {/* Basic Info */}
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-300">Basic Information</h2>

              <div>
                <label className="label" htmlFor="job-name">Job Name <span className="text-red-400">*</span></label>
                <input id="job-name" type="text" className="input" placeholder="e.g. Generate Monthly Report"
                  value={form.name} onChange={e => { set('name', e.target.value); setErrors(v => ({ ...v, name: '' })); }} />
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="label" htmlFor="job-desc">Description</label>
                <textarea id="job-desc" className="input min-h-[80px] resize-y" placeholder="Optional description..."
                  value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
            </div>

            {/* Task Type */}
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-300">Task Type <span className="text-red-400">*</span></h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {taskTypes.map(type => (
                  <button
                    key={type}
                    type="button"
                    id={`task-type-${type}`}
                    onClick={() => handleTaskTypeChange(type)}
                    className={`p-3 rounded-lg border text-left text-xs font-mono transition-all ${
                      form.task_type === type
                        ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                        : 'border-white/08 bg-white/02 text-slate-400 hover:border-white/15 hover:text-slate-300'
                    }`}
                    style={{ border: '1px solid' }}
                  >
                    {type}
                  </button>
                ))}
              </div>
              {errors.task_type && <p className="text-red-400 text-xs">{errors.task_type}</p>}
            </div>

            {/* Payload */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-300">Payload (JSON)</h2>
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <HelpCircle size={12} />
                  <span>Task-specific parameters</span>
                </div>
              </div>
              <textarea
                id="job-payload"
                className="input font-mono text-xs min-h-[160px] resize-y"
                value={form.payload}
                onChange={e => { set('payload', e.target.value); setErrors(v => ({ ...v, payload: '' })); }}
                spellCheck={false}
              />
              {errors.payload && <p className="text-red-400 text-xs mt-1">{errors.payload}</p>}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">
            {/* Priority */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Priority</h2>
              <div className="space-y-2">
                {PRIORITY_OPTIONS.map(({ value, label, desc, color }) => (
                  <button
                    key={value}
                    type="button"
                    id={`priority-${value.toLowerCase()}`}
                    onClick={() => set('priority', value)}
                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                      form.priority === value
                        ? `border-opacity-100 bg-white/5 ${color}`
                        : 'border-white/08 text-slate-500 hover:border-white/15'
                    }`}
                    style={{ border: '1px solid' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-xs opacity-70">{desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Settings */}
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-300">Settings</h2>

              <div>
                <label className="label" htmlFor="job-max-retries">Max Retries</label>
                <input id="job-max-retries" type="number" className="input" min={0} max={10}
                  value={form.max_retries} onChange={e => set('max_retries', Number(e.target.value))} />
                {errors.max_retries && <p className="text-red-400 text-xs mt-1">{errors.max_retries}</p>}
              </div>

              <div>
                <label className="label" htmlFor="job-timeout">Timeout (seconds)</label>
                <input id="job-timeout" type="number" className="input" min={1} max={3600}
                  value={form.timeout_seconds} onChange={e => set('timeout_seconds', Number(e.target.value))} />
                {errors.timeout_seconds && <p className="text-red-400 text-xs mt-1">{errors.timeout_seconds}</p>}
              </div>

              <div>
                <label className="label" htmlFor="job-scheduled">Schedule (optional)</label>
                <input id="job-scheduled" type="datetime-local" className="input"
                  value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} />
                <p className="text-xs text-slate-600 mt-1">Leave empty to queue immediately</p>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" className="btn-primary w-full justify-center py-3" disabled={submitting} id="create-job-submit">
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
                  </svg>
                  Creating...
                </span>
              ) : (
                <><Plus size={16} /> Create Job</>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
