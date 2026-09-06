/**
 * Gate Tracker — admin oversight for chip/card attendance.
 *
 * Enrolling a chip needs a device that can read one, so that lives in the
 * scanner app. This is the desk-side half: how far enrollment has got, which
 * bags still need a chip, retiring a lost one, correcting one on the wrong
 * bag, and answering "was the parent actually told?".
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  Copy,
  CreditCard,
  RefreshCw,
  Search,
  ShieldOff,
  X,
} from 'lucide-react';
import GateTracker, {
  GateScan,
  RosterCounts,
  RosterRow,
  ScanNotification,
  SectionOption,
  StudentTag,
  failureOf,
} from '@/services/GateTrackerService';

type Tab = 'enrollment' | 'scans' | 'notifications';

const PAGE_SIZE = 25;

const EMPTY_COUNTS: RosterCounts = { total: 0, enrolled: 0, unenrolled: 0 };

// ── Small presentational helpers ──────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`}
  >
    {children}
  </div>
);

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: string;
  hint?: string;
}> = ({ label, value, tone = 'text-gray-900', hint }) => (
  <Card className="p-5">
    <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
    <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </Card>
);

const Pill: React.FC<{ tone: string; children: React.ReactNode }> = ({
  tone,
  children,
}) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tone}`}
  >
    {children}
  </span>
);

const statusTone: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  lost: 'bg-amber-50 text-amber-700',
  revoked: 'bg-gray-100 text-gray-600',
  sent: 'bg-green-50 text-green-700',
  queued: 'bg-blue-50 text-blue-700',
  failed: 'bg-red-50 text-red-700',
  skipped: 'bg-gray-100 text-gray-600',
};

const Uid: React.FC<{ value: string }> = ({ value }) => (
  <span className="font-mono text-xs text-gray-700">{value}</span>
);

const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Pager: React.FC<{
  page: number;
  count: number;
  onPage: (page: number) => void;
}> = ({ page, count, onPage }) => {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
      <p className="text-xs text-gray-500">
        Page {page} of {pages} · {count} record{count === 1 ? '' : 's'}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
        >
          Previous
        </button>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

const GateTrackerView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('enrollment');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [sections, setSections] = useState<SectionOption[]>([]);

  useEffect(() => {
    GateTracker.getSections()
      .then(setSections)
      .catch(() => setSections([]));
  }, []);

  return (
    <div className="bg-gray-50 min-h-screen p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Gate Tracker</h1>
        <p className="text-gray-500">
          Chip enrollment, gate activity, and what parents were told
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start justify-between gap-3">
          <span className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex items-start justify-between gap-3">
          <span className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            {notice}
          </span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(
          [
            ['enrollment', 'Enrollment', CreditCard],
            ['scans', 'Gate activity', ArrowUpRight],
            ['notifications', 'Parent alerts', BellRing],
          ] as [Tab, string, typeof CreditCard][]
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              setError(null);
              setNotice(null);
            }}
            className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'enrollment' && (
        <EnrollmentTab
          sections={sections}
          onError={setError}
          onNotice={setNotice}
        />
      )}
      {tab === 'scans' && <ScanLogTab onError={setError} />}
      {tab === 'notifications' && <NotificationLogTab onError={setError} />}
    </div>
  );
};

// ── Enrollment ────────────────────────────────────────────────────────────────

const EnrollmentTab: React.FC<{
  sections: SectionOption[];
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}> = ({ sections, onError, onNotice }) => {
  const [sectionId, setSectionId] = useState<number | ''>('');
  const [filter, setFilter] = useState<'all' | 'enrolled' | 'unenrolled'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<RosterRow[]>([]);
  const [counts, setCounts] = useState<RosterCounts>(EMPTY_COUNTS);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyTagId, setBusyTagId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await GateTracker.getRoster({
        section: sectionId === '' ? undefined : sectionId,
        enrolled:
          filter === 'all' ? undefined : filter === 'enrolled' ? true : false,
        search: search.trim() || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setRows(response.results ?? []);
      setCounts(response.counts ?? EMPTY_COUNTS);
      setCount(response.count ?? 0);
      onError(null);
    } catch (caught) {
      const failure = failureOf(caught);
      onError(failure.detail ?? 'Could not load the roster.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [sectionId, filter, search, page, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const coverage = useMemo(() => {
    if (!counts.total) return 0;
    return Math.round((counts.enrolled / counts.total) * 100);
  }, [counts]);

  const revoke = async (tag: RosterRow['tags'][number], student: RosterRow) => {
    const reason = window.prompt(
      `Retire chip ${tag.uid} from ${student.name ?? 'this student'}?\n\n` +
        'Give a reason (kept on the record):',
      'Chip lost'
    );
    if (reason === null) return;

    setBusyTagId(tag.id);
    try {
      await GateTracker.revokeTag(tag.id, {
        status: 'lost',
        reason: reason || 'Retired by admin',
      });
      onNotice(
        `Chip ${tag.uid} retired. The same chip can be enrolled again if it turns up.`
      );
      await load();
    } catch (caught) {
      onError(failureOf(caught).detail ?? 'Could not retire that chip.');
    } finally {
      setBusyTagId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Students" value={counts.total} />
        <StatCard
          label="Chip enrolled"
          value={counts.enrolled}
          tone="text-green-600"
        />
        <StatCard
          label="Still to do"
          value={counts.unenrolled}
          tone={counts.unenrolled ? 'text-amber-600' : 'text-gray-400'}
        />
        <StatCard
          label="Coverage"
          value={`${coverage}%`}
          tone="text-blue-600"
          hint={sectionId === '' ? 'Whole school' : 'This section'}
        />
      </div>

      <Card className="p-4">
        <p className="text-sm text-gray-600">
          Chips are enrolled from the scanner app, which reads the chip and
          sends its ID. This page is for keeping track: who still needs one,
          and retiring a chip that has been lost.
        </p>
      </Card>

      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Section
            </label>
            <select
              value={sectionId}
              onChange={(event) => {
                setSectionId(
                  event.target.value === '' ? '' : Number(event.target.value)
                );
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Whole school</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Show
            </label>
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as typeof filter);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Everyone</option>
              <option value="unenrolled">Still needs a chip</option>
              <option value="enrolled">Already has one</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Name or registration number"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Students</h2>
          <button
            onClick={load}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading && rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            {filter === 'unenrolled'
              ? 'Every student here has a chip.'
              : 'No students match those filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Class</th>
                  <th className="px-5 py-3 font-medium">Chip</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">
                        {row.name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {row.registration_number ?? 'No registration number'}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {row.class_display ?? '—'}
                      {row.section_name ? ` · ${row.section_name}` : ''}
                    </td>
                    <td className="px-5 py-3">
                      {row.is_enrolled ? (
                        <div className="space-y-1">
                          {row.tags.map((tag) => (
                            <div key={tag.id} className="flex items-center gap-2">
                              <Uid value={tag.uid} />
                              {tag.label && (
                                <span className="text-xs text-gray-400">
                                  {tag.label}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Pill tone="bg-amber-50 text-amber-700">
                          Needs a chip
                        </Pill>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {row.tags.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => revoke(tag, row)}
                          disabled={busyTagId === tag.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40"
                        >
                          <ShieldOff className="h-3.5 w-3.5" />
                          Retire
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pager page={page} count={count} onPage={setPage} />
      </Card>

      <ReassignPanel onError={onError} onNotice={onNotice} onDone={load} />
    </div>
  );
};

// ── Reassign / lookup ─────────────────────────────────────────────────────────

const ReassignPanel: React.FC<{
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  onDone: () => void;
}> = ({ onError, onNotice, onDone }) => {
  const [uid, setUid] = useState('');
  const [looking, setLooking] = useState(false);
  const [holder, setHolder] = useState<StudentTag | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);

  const lookup = async () => {
    const value = uid.trim();
    if (!value) return;

    setLooking(true);
    setHolder(null);
    setLookupMessage(null);
    try {
      const result = await GateTracker.resolveUid(value);
      setHolder(result.tag);
      setLookupMessage(null);
      onError(null);
    } catch (caught) {
      const failure = failureOf(caught);
      // The endpoint separates these deliberately: an unknown chip can be
      // enrolled, a retired one should not be quietly re-used without a look.
      if (failure.code === 'uid_not_enrolled') {
        setLookupMessage(
          'No student holds this chip. Enroll it from the scanner app.'
        );
      } else if (failure.code === 'uid_not_active') {
        setLookupMessage(
          failure.detail ??
            'This chip was retired and is no longer in use.'
        );
      } else {
        onError(failure.detail ?? 'Could not look that chip up.');
      }
    } finally {
      setLooking(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">
        Look a chip up
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Type the chip ID to see who holds it — useful when a chip is found
        loose, or turns up on the wrong bag. Separators and letter case do not
        matter.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={uid}
          onChange={(event) => setUid(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') lookup();
          }}
          placeholder="04:A2:24:1B"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={lookup}
          disabled={looking || !uid.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Search className="h-4 w-4" />
          {looking ? 'Looking…' : 'Look up'}
        </button>
      </div>

      {lookupMessage && (
        <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {lookupMessage}
        </p>
      )}

      {holder && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-medium text-gray-900">
                {holder.student_detail?.name ?? 'Unknown student'}
              </p>
              <p className="text-xs text-gray-500">
                {holder.student_detail?.class_display ?? '—'} ·{' '}
                <Uid value={holder.uid} />
              </p>
            </div>
            <Pill tone={statusTone[holder.status] ?? 'bg-gray-100 text-gray-600'}>
              {holder.status_display}
            </Pill>
          </div>

          <ReassignForm
            tag={holder}
            onError={onError}
            onNotice={(message) => {
              onNotice(message);
              setHolder(null);
              setUid('');
              onDone();
            }}
          />
        </div>
      )}
    </Card>
  );
};

const ReassignForm: React.FC<{
  tag: StudentTag;
  onError: (message: string | null) => void;
  onNotice: (message: string) => void;
}> = ({ tag, onError, onNotice }) => {
  const [studentId, setStudentId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const target = Number(studentId);
    if (!target) {
      onError('Enter the ID of the student this chip should belong to.');
      return;
    }

    setSaving(true);
    try {
      const created = await GateTracker.reassignTag({
        uid: tag.uid,
        student: target,
        reason: reason.trim() || 'Reassigned by admin',
      });
      onNotice(
        `Chip ${created.uid} now belongs to ${
          created.student_detail?.name ?? `student ${target}`
        }. The previous binding was retired.`
      );
    } catch (caught) {
      const failure = failureOf(caught);
      onError(failure.detail ?? 'Could not reassign that chip.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <p className="text-xs font-medium text-gray-600 mb-2">
        Move this chip to a different student
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={studentId}
          onChange={(event) => setStudentId(event.target.value)}
          placeholder="Student ID"
          inputMode="numeric"
          className="sm:w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason (kept on the record)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={submit}
          disabled={saving}
          className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Copy className="h-4 w-4" />
          {saving ? 'Moving…' : 'Reassign'}
        </button>
      </div>
    </div>
  );
};

// ── Gate activity ─────────────────────────────────────────────────────────────

const ScanLogTab: React.FC<{ onError: (message: string | null) => void }> = ({
  onError,
}) => {
  const [direction, setDirection] = useState<'' | 'in' | 'out'>('');
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<GateScan[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await GateTracker.getScans({
        direction: direction === '' ? undefined : direction,
        is_duplicate: showDuplicates ? undefined : false,
        search: search.trim() || undefined,
        page,
        page_size: PAGE_SIZE,
        ordering: '-scanned_at',
      });
      setRows(response.results ?? []);
      setCount(response.count ?? 0);
      onError(null);
    } catch (caught) {
      onError(failureOf(caught).detail ?? 'Could not load gate activity.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [direction, showDuplicates, search, page, onError]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Direction
            </label>
            <select
              value={direction}
              onChange={(event) => {
                setDirection(event.target.value as typeof direction);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Arrivals and departures</option>
              <option value="in">Arrivals only</option>
              <option value="out">Departures only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Name, chip ID or device"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 pb-2">
            <input
              type="checkbox"
              checked={showDuplicates}
              onChange={(event) => {
                setShowDuplicates(event.target.checked);
                setPage(1);
              }}
              className="rounded border-gray-300"
            />
            Include repeat taps
          </label>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Gate activity</h2>
          <button
            onClick={load}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading && rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            No gate activity recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Direction</th>
                  <th className="px-5 py-3 font-medium">Chip</th>
                  <th className="px-5 py-3 font-medium">Recorded by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((scan) => (
                  <tr key={scan.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {formatDateTime(scan.scanned_at)}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">
                        {scan.student_detail?.name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {scan.student_detail?.class_display ?? ''}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2">
                        {scan.direction === 'in' ? (
                          <Pill tone="bg-green-50 text-green-700">
                            <ArrowDownLeft className="h-3 w-3" />
                            Arrived
                          </Pill>
                        ) : (
                          <Pill tone="bg-blue-50 text-blue-700">
                            <ArrowUpRight className="h-3 w-3" />
                            Left
                          </Pill>
                        )}
                        {scan.is_duplicate && (
                          <Pill tone="bg-gray-100 text-gray-500">
                            Repeat tap
                          </Pill>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Uid value={scan.uid} />
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {scan.scanned_by_name ?? '—'}
                      {scan.device_id && (
                        <span className="block text-xs text-gray-400">
                          {scan.device_id}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pager page={page} count={count} onPage={setPage} />
      </Card>
    </div>
  );
};

// ── Parent alerts ─────────────────────────────────────────────────────────────

const NotificationLogTab: React.FC<{
  onError: (message: string | null) => void;
}> = ({ onError }) => {
  const [channel, setChannel] = useState<'' | 'in_app' | 'email' | 'sms'>('');
  const [status, setStatus] = useState<
    '' | 'queued' | 'sent' | 'failed' | 'skipped'
  >('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<ScanNotification[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await GateTracker.getNotifications({
        channel: channel === '' ? undefined : channel,
        status: status === '' ? undefined : status,
        page,
        page_size: PAGE_SIZE,
        ordering: '-queued_at',
      });
      setRows(response.results ?? []);
      setCount(response.count ?? 0);
      onError(null);
    } catch (caught) {
      onError(failureOf(caught).detail ?? 'Could not load parent alerts.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [channel, status, page, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const queued = rows.filter((row) => row.status === 'queued').length;

  return (
    <div className="space-y-6">
      {queued > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <p className="font-medium mb-1">
            {queued} alert{queued === 1 ? '' : 's'} on this page still waiting
            to send.
          </p>
          <p className="text-blue-700">
            Email and SMS are sent by a background worker. If they stay queued,
            the worker is not running — in-app alerts still reach parents in the
            portal either way.
          </p>
        </div>
      )}

      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Channel
            </label>
            <select
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value as typeof channel);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Every channel</option>
              <option value="in_app">In-app</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Any status</option>
              <option value="sent">Sent</option>
              <option value="queued">Queued</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">
            What parents were told
          </h2>
          <button
            onClick={load}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading && rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            No parent alerts yet. Under the anomalies-only policy, an ordinary
            arrival sends nothing.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Queued</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Channel</th>
                  <th className="px-5 py-3 font-medium">Sent to</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 align-top">
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {formatDateTime(row.queued_at)}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">
                        {row.student_detail?.name ?? '—'}
                      </p>
                      <p
                        className="text-xs text-gray-400 max-w-xs truncate"
                        title={row.body}
                      >
                        {row.body}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {row.channel_display}
                      {row.provider && (
                        <span className="block text-xs text-gray-400">
                          {row.provider}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {row.destination || (
                        <span className="text-gray-400">No address</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Pill
                        tone={statusTone[row.status] ?? 'bg-gray-100 text-gray-600'}
                      >
                        {row.status_display}
                      </Pill>
                      {row.error && (
                        <p
                          className="text-xs text-red-600 mt-1 max-w-xs truncate"
                          title={row.error}
                        >
                          {row.error}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pager page={page} count={count} onPage={setPage} />
      </Card>
    </div>
  );
};

export default GateTrackerView;
