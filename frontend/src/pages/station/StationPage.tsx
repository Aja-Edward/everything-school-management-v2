import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, KeyRound, Loader2, LogIn, Monitor, RefreshCw } from 'lucide-react';
import StationService, { StationError, StationPaper, StationStatus } from '@/services/StationService';

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** The station's clock, which is the one that counts, ticking in the corner. */
export const useStationClock = (serverTime: string | undefined) => {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!serverTime) return undefined;
    const offset = new Date(serverTime).getTime() - Date.now();
    const tick = () => setNow(new Date(Date.now() + offset));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [serverTime]);
  return now;
};

export const StationShell: React.FC<{ status: StationStatus | null; children: React.ReactNode; footer?: React.ReactNode }> = ({
  status, children, footer,
}) => {
  const now = useStationClock(status?.server_time);
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Monitor className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900 dark:text-white">{status?.school?.name || 'Exam station'}</p>
            {status?.school && <p className="text-xs text-slate-500 dark:text-slate-400">Exam station</p>}
          </div>
        </div>
        {now && (
          <p className="font-mono text-lg font-semibold tabular-nums text-slate-700 dark:text-slate-200" title="The station's clock">
            {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        )}
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:py-12">{children}</main>
      {footer && <footer className="px-4 pb-4 text-center text-sm text-slate-500">{footer}</footer>}
    </div>
  );
};

const PaperChoice: React.FC<{ paper: StationPaper; chosen: boolean; onChoose: () => void }> = ({ paper, chosen, onChoose }) => (
  <button type="button" onClick={onChoose} aria-pressed={chosen}
    className={`w-full rounded-xl border-2 p-4 text-left transition ${chosen
      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40'
      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900'}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 dark:text-white">{paper.exam_title}</p>
        {paper.subject && <p className="text-sm text-slate-500 dark:text-slate-400">{paper.subject}</p>}
      </div>
      {paper.is_open
        ? <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Open</span>
        : <span className="flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Not open</span>}
    </div>
    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
      {day(paper.opens_at)}, {time(paper.opens_at)} – {time(paper.closes_at)} · {paper.duration_minutes} minutes
    </p>
  </button>
);

const StationPage: React.FC = () => {
  const [status, setStatus] = useState<StationStatus | null>(null);
  const [loadError, setLoadError] = useState<StationError | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [pin, setPin] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = () => {
    setLoadError(null);
    StationService.status()
      .then((result) => {
        setStatus(result);
        const open = result.papers.filter((p) => p.is_open);
        if (result.papers.length === 1) setChosen(result.papers[0].package);
        else if (open.length === 1) setChosen(open[0].package);
      })
      .catch((error: StationError) => setLoadError(error));
  };

  useEffect(load, []);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chosen) return;
    setSigningIn(true);
    setProblem(null);
    try {
      await StationService.studentSignIn(chosen, number.trim(), pin.trim());
    } catch (error) {
      setProblem((error as Error).message);
      setPin('');
      setSigningIn(false);
    }
  };

  const footer = <Link to="/station/staff" className="hover:text-slate-800 dark:hover:text-slate-200">Staff</Link>;

  if (loadError) {
    return (
      <StationShell status={null}>
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-3 font-semibold text-slate-900 dark:text-white">{loadError.message}</p>
          {loadError.code !== 'not_station' && (
            <button type="button" onClick={load}
              className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          )}
        </div>
      </StationShell>
    );
  }

  if (!status) {
    return <StationShell status={null}><Loader2 className="mt-16 h-8 w-8 animate-spin text-indigo-600" /></StationShell>;
  }

  const paper = status.papers.find((p) => p.package === chosen) || null;

  return (
    <StationShell status={status} footer={footer}>
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sign in to your exam</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">Use the slip number and PIN on the slip your invigilator gave you.</p>

        {status.papers.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            No exams are on this station yet. Ask your invigilator.
          </p>
        ) : (
          <form onSubmit={signIn} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            {status.papers.length > 1 && (
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Your exam</legend>
                {status.papers.map((p) => (
                  <PaperChoice key={p.package} paper={p} chosen={p.package === chosen} onChoose={() => setChosen(p.package)} />
                ))}
              </fieldset>
            )}
            {status.papers.length === 1 && paper && <PaperChoice paper={paper} chosen onChoose={() => undefined} />}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="station-number" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Slip number</label>
                <input id="station-number" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" autoComplete="off" required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-lg tabular-nums dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
              </div>
              <div>
                <label htmlFor="station-pin" className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <KeyRound className="h-4 w-4" /> PIN
                </label>
                <input id="station-pin" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric" autoComplete="off" required minLength={6} maxLength={6}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-lg tracking-[0.3em] dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
              </div>
            </div>

            {problem && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{problem}</p>}

            <button type="submit" disabled={signingIn || !chosen || !number || pin.length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {signingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
              Sign in
            </button>
          </form>
        )}
      </div>
    </StationShell>
  );
};

export default StationPage;
