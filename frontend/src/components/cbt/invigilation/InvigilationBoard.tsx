import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ClipboardPaste, Clock, Copy, Eye, EyeOff, History, KeyRound, Loader2, Minimize2, MonitorSmartphone,
  MoreVertical, RefreshCw, Search, WifiOff, X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import InvigilationService, {
  InvigilationAction, InvigilationBoardData, InvigilationEvent, InvigilationRow,
} from '@/services/InvigilationService';

const REFRESH_MS = 10000;

type Filter = 'all' | 'in_progress' | 'not_started' | 'finished' | 'attention';

const STATE_LABEL: Record<string, string> = {
  not_started: 'Not started', in_progress: 'Writing', submitted: 'Submitted', timed_out: 'Time ran out', voided: 'Voided',
};
const STATE_STYLE: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-indigo-100 text-indigo-800',
  submitted: 'bg-emerald-100 text-emerald-800',
  timed_out: 'bg-amber-100 text-amber-800',
  voided: 'bg-rose-100 text-rose-700',
};

const WARNING_ICONS: Record<string, { icon: React.ElementType; label: string }> = {
  focus_lost: { icon: EyeOff, label: 'Left the exam window' },
  fullscreen_exited: { icon: Minimize2, label: 'Left full screen' },
  copy_attempted: { icon: Copy, label: 'Tried to copy' },
  paste_attempted: { icon: ClipboardPaste, label: 'Tried to paste' },
  connection_lost: { icon: WifiOff, label: 'Lost connection' },
  device_changed: { icon: MonitorSmartphone, label: 'Moved to another device' },
};

const ACTIONS: Record<InvigilationAction, { title: string; explain: string; minutes?: number; reasonRequired: boolean; confirm: string; danger?: boolean }> = {
  extend: {
    title: 'Give extra time', minutes: 10, reasonRequired: false, confirm: 'Add time',
    explain: "Adds minutes to this student's deadline. Their screen picks up the new time within half a minute.",
  },
  submit: {
    title: 'Hand in for this student', reasonRequired: false, confirm: 'Hand in now', danger: true,
    explain: 'Ends the attempt now with whatever answers have been saved. The student can no longer change them.',
  },
  reopen: {
    title: 'Let back in', minutes: 10, reasonRequired: true, confirm: 'Let back in',
    explain: 'Reopens a finished attempt with the minutes you set, starting now. The student keeps their saved answers. If the paper has an access code, they will need it to continue.',
  },
  void: {
    title: 'Void this attempt', reasonRequired: true, confirm: 'Void attempt', danger: true,
    explain: "The attempt stops counting, but its answers are kept in the record. While the paper is open, the student can start again from the beginning.",
  },
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

const ago = (seconds: number | null) => {
  if (seconds === null) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};

const actionsFor = (row: InvigilationRow): InvigilationAction[] => {
  if (!row.attempt) return [];
  if (row.state === 'in_progress') return ['extend', 'submit', 'void'];
  if (row.state === 'submitted' || row.state === 'timed_out') return ['reopen', 'void'];
  return [];
};

interface Props {
  paperId: number;
}

const InvigilationBoard: React.FC<Props> = ({ paperId }) => {
  const [data, setData] = useState<InvigilationBoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ action: InvigilationAction; row: InvigilationRow } | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [log, setLog] = useState<{ row: InvigilationRow; events: InvigilationEvent[] | null } | null>(null);
  const offsetRef = useRef(0);
  const [now, setNow] = useState(Date.now());

  const accept = useCallback((board: InvigilationBoardData) => {
    offsetRef.current = Date.parse(board.server_time) - Date.now();
    setData(board);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      accept(await InvigilationService.board(paperId));
    } catch (e) {
      setError((e as Error).message || 'Could not load the board.');
    } finally {
      setRefreshing(false);
    }
  }, [accept, paperId]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => { void load(); }, REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [load]);

  const serverNow = now + offsetRef.current;

  const rows = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.students.filter((row) => {
      if (term && !`${row.student.name} ${row.student.registration_number}`.toLowerCase().includes(term)) return false;
      switch (filter) {
        case 'in_progress': return row.state === 'in_progress';
        case 'not_started': return row.state === 'not_started';
        case 'finished': return row.state === 'submitted' || row.state === 'timed_out';
        case 'attention': return row.offline || Object.keys(row.warnings).length > 0;
        default: return true;
      }
    });
  }, [data, filter, search]);

  const openDialog = (action: InvigilationAction, row: InvigilationRow) => {
    setMenuFor(null);
    setDialog({ action, row });
    setMinutes(ACTIONS[action].minutes ?? 10);
    setReason('');
    setActionError(null);
  };

  const runAction = async () => {
    if (!dialog?.row.attempt) return;
    const spec = ACTIONS[dialog.action];
    if (spec.reasonRequired && !reason.trim()) {
      setActionError('Give a reason. It is kept in the exam record.');
      return;
    }
    setActing(true);
    setActionError(null);
    try {
      accept(await InvigilationService.act(paperId, dialog.action, {
        attempt: dialog.row.attempt.id,
        ...(spec.minutes !== undefined ? { minutes } : {}),
        reason: reason.trim(),
      }));
      toast.success(`${spec.title}: done for ${dialog.row.student.name}`);
      setDialog(null);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const openLog = async (row: InvigilationRow) => {
    setMenuFor(null);
    if (!row.attempt) return;
    setLog({ row, events: null });
    try {
      const { events } = await InvigilationService.events(paperId, row.attempt.id);
      setLog({ row, events });
    } catch (e) {
      toast.error((e as Error).message);
      setLog(null);
    }
  };

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        {error ? <p className="rounded-lg bg-rose-50 p-4 text-rose-700">{error}</p> : <Loader2 className="h-8 w-8 animate-spin text-slate-400" />}
      </div>
    );
  }

  const { paper, summary } = data;
  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: summary.students },
    { key: 'in_progress', label: 'Writing', count: summary.in_progress },
    { key: 'not_started', label: 'Not started', count: summary.not_started },
    { key: 'finished', label: 'Finished', count: summary.finished },
    { key: 'attention', label: 'Needs attention', count: data.students.filter((r) => r.offline || Object.keys(r.warnings).length).length },
  ];

  const timeLeft = (row: InvigilationRow) => {
    if (row.state !== 'in_progress' || !row.attempt) return null;
    return Math.max(0, (Date.parse(row.attempt.deadline) - serverNow) / 1000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0">
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Live board</p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{paper.exam_title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {[paper.subject, paper.grade_level].filter(Boolean).join(' · ')} · Open {when(paper.opens_at)}–{when(paper.closes_at)} · {paper.duration_minutes} min
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {paper.access_code && (
            <button type="button" onClick={() => setShowCode((s) => !s)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600">
              <KeyRound className="h-4 w-4 text-slate-500" />
              <span className="font-mono text-lg font-bold tracking-widest text-slate-900 dark:text-white">
                {showCode ? paper.access_code : '••••'}
              </span>
              {showCode ? <EyeOff className="h-4 w-4 text-slate-400" /> : <Eye className="h-4 w-4 text-slate-400" />}
            </button>
          )}
          <button type="button" onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        {error && <p className="w-full text-sm text-amber-700">Couldn't refresh: {error} Showing the last update.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <button key={chip.key} type="button" onClick={() => setFilter(chip.key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              filter === chip.key ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
            }`}>
            {chip.label} <span className="opacity-70">{chip.count}</span>
          </button>
        ))}
        {summary.offline > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800">
            <WifiOff className="h-4 w-4" /> {summary.offline} not checking in
          </span>
        )}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a student"
            className="w-56 rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Answered</th>
                <th className="px-4 py-3">Time left</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3">Warnings</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => {
                const left = timeLeft(row);
                const available = actionsFor(row);
                return (
                  <tr key={row.student.id} className={row.offline ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{row.student.name}</p>
                      <p className="text-xs text-slate-500">
                        {[row.student.registration_number, [row.student.class, row.student.section].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                        {row.extra_time_minutes > 0 && <span className="ml-1 text-indigo-700">· +{row.extra_time_minutes} min allowed</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLE[row.state]}`}>{STATE_LABEL[row.state]}</span>
                      {row.attempt && row.attempt.number > 1 && <span className="ml-1 text-xs text-slate-500">attempt {row.attempt.number}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {row.attempt ? (
                        <div className="w-28">
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div className="h-full bg-indigo-600" style={{ width: `${row.attempt.question_count ? (100 * row.attempt.answered) / row.attempt.question_count : 0}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{row.attempt.answered} of {row.attempt.question_count}</p>
                        </div>
                      ) : <span className="text-slate-400">–</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums">
                      {left === null ? <span className="text-slate-400">–</span>
                        : <span className={left < 300 ? 'text-rose-700' : 'text-slate-800 dark:text-slate-100'}><Clock className="mr-1 inline h-3.5 w-3.5" />{clock(left)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {row.state === 'in_progress' && row.attempt
                        ? <span className={row.offline ? 'font-semibold text-amber-700' : 'text-slate-600 dark:text-slate-300'}>
                          {row.offline && <WifiOff className="mr-1 inline h-3.5 w-3.5" />}{ago(row.attempt.seconds_since_seen)}
                        </span>
                        : row.attempt?.submitted_at ? <span className="text-slate-500">Ended {when(row.attempt.submitted_at)}</span> : <span className="text-slate-400">–</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(row.warnings).map(([kind, count]) => {
                          const w = WARNING_ICONS[kind];
                          if (!w) return null;
                          const Icon = w.icon;
                          return (
                            <span key={kind} title={`${w.label}: ${count}`}
                              className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              <Icon className="h-3.5 w-3.5" />{count}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="relative px-2 py-3 text-right">
                      {row.attempt && (
                        <button type="button" onClick={() => setMenuFor(menuFor === row.student.id ? null : row.student.id)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Actions for ${row.student.name}`}>
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                      {menuFor === row.student.id && (
                        <div className="absolute right-2 top-11 z-20 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-lg dark:border-slate-700 dark:bg-slate-800">
                          {available.map((action) => (
                            <button key={action} type="button" onClick={() => openDialog(action, row)}
                              className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 ${ACTIONS[action].danger ? 'text-rose-700' : 'text-slate-700 dark:text-slate-200'}`}>
                              {ACTIONS[action].title}
                            </button>
                          ))}
                          <button type="button" onClick={() => void openLog(row)}
                            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700">
                            <History className="h-4 w-4" /> Activity log
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No students match.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Recent activity</h2>
          {data.recent_events.length === 0 && <p className="text-sm text-slate-500">Nothing yet.</p>}
          <ul className="space-y-2.5">
            {data.recent_events.map((event) => (
              <li key={event.id} className="text-sm">
                <p className="text-slate-800 dark:text-slate-100">
                  <span className="font-medium">{event.student}</span>: {event.label.toLowerCase()}
                  {event.detail?.minutes ? ` (+${event.detail.minutes} min)` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  {when(event.recorded_at)}{event.actor ? ` · by ${event.actor}` : ''}{event.detail?.reason ? ` · "${event.detail.reason}"` : ''}
                </p>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{ACTIONS[dialog.action].title}</h2>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{dialog.row.student.name}</p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{ACTIONS[dialog.action].explain}</p>
            {ACTIONS[dialog.action].minutes !== undefined && (
              <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Minutes
                <input type="number" min={1} max={240} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 1)}
                  className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
              </label>
            )}
            <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Reason {ACTIONS[dialog.action].reasonRequired ? '' : <span className="font-normal text-slate-500">(optional)</span>}
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500}
                placeholder="Kept in the exam record"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
            </label>
            {actionError && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {actionError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} disabled={acting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">Cancel</button>
              <button type="button" onClick={() => void runAction()} disabled={acting}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${ACTIONS[dialog.action].danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                {acting && <Loader2 className="h-4 w-4 animate-spin" />}{ACTIONS[dialog.action].confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {log && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setLog(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Activity log</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">{log.row.student.name}{log.row.attempt ? ` · attempt ${log.row.attempt.number}` : ''}</p>
                {log.row.attempt?.ip_address && <p className="text-xs text-slate-500">IP {log.row.attempt.ip_address}</p>}
              </div>
              <button type="button" onClick={() => setLog(null)} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            {!log.events ? <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-slate-400" /> : (
              <ol className="mt-4 space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
                {log.events.map((event) => (
                  <li key={event.id} className="text-sm">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{event.label}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(event.recorded_at).toLocaleTimeString()}{event.actor ? ` · by ${event.actor}` : ''}
                      {event.detail?.minutes ? ` · ${event.detail.minutes} min` : ''}
                      {event.detail?.away_seconds ? ` · away ${event.detail.away_seconds}s` : ''}
                    </p>
                    {event.detail?.reason && <p className="text-xs italic text-slate-600 dark:text-slate-400">"{event.detail.reason}"</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InvigilationBoard;
