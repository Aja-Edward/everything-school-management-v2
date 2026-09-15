import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Download, FileUp, Loader2, Lock, Radio } from 'lucide-react';
import StationService, { StationError, StationPaper, StationStatus } from '@/services/StationService';
import { readJsonFile, saveJsonFile } from '@/components/cbt/offlineFiles';
import { StationShell } from './StationPage';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** ISO timestamp → value for <input type="datetime-local">, in this computer's time zone. */
const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const button = 'flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800';
const primary = 'flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50';
const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white';

const PaperCard: React.FC<{
  paper: StationPaper; stationKey: string; onChanged: (status: StationStatus) => void;
}> = ({ paper, stationKey, onChanged }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [opens, setOpens] = useState(toLocalInput(paper.opens_at));
  const [closes, setCloses] = useState(toLocalInput(paper.closes_at));

  const act = async (name: string, work: () => Promise<void>) => {
    setBusy(name);
    setMessage(null);
    try {
      await work();
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const saveResults = () => act('results', async () => {
    const results = await StationService.results(stationKey, paper.package);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    saveJsonFile(`cbt-results-${paper.package.slice(0, 8)}-${stamp}.json`, results);
    const parts = [`${results.attempts.length} finished attempt${results.attempts.length === 1 ? '' : 's'} saved.`];
    const writing = results.still_in_progress;
    if (writing) {
      parts.push(`${writing} ${writing === 1 ? 'student is' : 'students are'} still writing, so not in this file. Save again when they finish.`);
    }
    parts.push('Upload the file on the school system: the exam\'s CBT settings, Exam station tab.');
    setMessage({ tone: 'ok', text: parts.join(' ') });
  });

  const moveWindow = () => act('window', async () => {
    onChanged(await StationService.moveWindow(stationKey, paper.package, new Date(opens).toISOString(), new Date(closes).toISOString()));
    setMoving(false);
    setMessage({ tone: 'ok', text: 'The window has moved.' });
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{paper.exam_title}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {[paper.subject, `${paper.students} students`, `${paper.duration_minutes} minutes`].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{when(paper.opens_at)} – {when(paper.closes_at)}</p>
        </div>
        {paper.is_open && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Open</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={!!busy}
          onClick={() => act('board', () => StationService.staffSignIn(stationKey, paper.paper))}>
          {busy === 'board' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />} Invigilation board
        </button>
        <button type="button" className={button} disabled={!!busy} onClick={() => void saveResults()}>
          {busy === 'results' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Save results
        </button>
        <button type="button" className={button} disabled={!!busy} onClick={() => setMoving((m) => !m)}>
          <CalendarClock className="h-4 w-4" /> Move the window
        </button>
      </div>

      {moving && (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm text-slate-700 dark:text-slate-300">Opens
            <input type="datetime-local" className={input} value={opens} onChange={(e) => setOpens(e.target.value)} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-300">Closes
            <input type="datetime-local" className={input} value={closes} onChange={(e) => setCloses(e.target.value)} />
          </label>
          <button type="button" className={primary} disabled={!!busy || !opens || !closes} onClick={() => void moveWindow()}>
            {busy === 'window' && <Loader2 className="h-4 w-4 animate-spin" />} Move
          </button>
        </div>
      )}

      {message && (
        <p className={`mt-3 rounded-lg p-3 text-sm ${message.tone === 'ok'
          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
          : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
};

const StationStaffPage: React.FC = () => {
  const [status, setStatus] = useState<StationStatus | null>(null);
  const [key, setKey] = useState(StationService.savedKey());
  const [unlocked, setUnlocked] = useState(false);
  const [typedKey, setTypedKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    StationService.status().then(setStatus).catch((error: StationError) => setProblem(error.message));
    if (key) {
      StationService.checkKey(key).then(() => setUnlocked(true)).catch(() => { StationService.forgetKey(); setKey(''); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await StationService.checkKey(typedKey);
      StationService.saveKey(typedKey);
      setKey(typedKey);
      setTypedKey('');
      setUnlocked(true);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lock = () => {
    StationService.forgetKey();
    setKey('');
    setUnlocked(false);
  };

  const loadPackage = async (file: File) => {
    setBusy(true);
    setProblem(null);
    setLoaded(null);
    try {
      const result = await StationService.loadPackage(key, await readJsonFile(file));
      setStatus(result);
      const paper = result.papers.find((p) => p.package === result.loaded);
      setLoaded(paper ? `${paper.exam_title} is on the station, for ${paper.students} students.` : 'Loaded.');
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const footer = <Link to="/station" className="hover:text-slate-800 dark:hover:text-slate-200">Student sign-in</Link>;

  if (!unlocked) {
    return (
      <StationShell status={status} footer={footer}>
        <form onSubmit={unlock} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white"><Lock className="h-5 w-5" /> Staff</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Enter the station key to load papers, watch the exam and save results.</p>
          </div>
          <input type="password" value={typedKey} onChange={(e) => setTypedKey(e.target.value)} autoComplete="off" required
            aria-label="Station key" placeholder="Station key" className={input} />
          {problem && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{problem}</p>}
          <button type="submit" disabled={busy || !typedKey} className={`${primary} w-full justify-center py-2.5`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Unlock
          </button>
        </form>
      </StationShell>
    );
  }

  return (
    <StationShell status={status} footer={footer}>
      <div className="w-full max-w-3xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Station staff</h1>
          <div className="flex gap-2">
            <button type="button" className={primary} disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Load a package
            </button>
            <button type="button" className={button} onClick={lock}><Lock className="h-4 w-4" /> Lock</button>
          </div>
          <input ref={fileInput} type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) void loadPackage(file); }} />
        </div>

        {loaded && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">{loaded}</p>}
        {problem && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{problem}</p>}

        {status && status.papers.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <p className="font-medium">No papers on this station yet.</p>
            <p className="mt-1 text-sm">
              On the school system, open the exam's CBT settings, go to Exam station, and make a package. Bring its
              file here and load it.
            </p>
          </div>
        )}

        {status?.papers.map((paper) => (
          <PaperCard key={paper.package} paper={paper} stationKey={key} onChanged={setStatus} />
        ))}
      </div>
    </StationShell>
  );
};

export default StationStaffPage;
