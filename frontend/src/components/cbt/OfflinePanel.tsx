import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, FileUp, Loader2, PackagePlus, Printer, WifiOff } from 'lucide-react';
import { toast } from 'react-toastify';
import CBTService, {
  CBTOfflineImport, CBTOfflinePackage, CBTPaper, CBTPinSlip, cbtProblems,
} from '@/services/CBTService';
import { isResultsFile, printPinSlips, readJsonFile, resultBatches, saveJsonFile } from './offlineFiles';

interface Props {
  paper: CBTPaper;
  /** Imported attempts change the paper's counts. */
  onImported: () => void;
}

const card = 'rounded-xl border border-slate-200 p-4 dark:border-slate-700';
const button = 'flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800';
const primary = 'flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface ImportReport extends CBTOfflineImport {
  file: string;
  stillInProgress: number;
  voided: number;
}

const OfflinePanel: React.FC<Props> = ({ paper, onImported }) => {
  const [packages, setPackages] = useState<CBTOfflinePackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ package: CBTOfflinePackage; slips: CBTPinSlip[] } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    CBTService.offlinePackages(paper.id)
      .then(({ packages: list }) => setPackages(list))
      .catch((e) => setError(cbtProblems(e)[0]));
  }, [paper.id]);

  useEffect(load, [load]);

  const filename = (packageId: string) => `cbt-package-${paper.id}-${packageId.slice(0, 8)}.json`;

  const download = async (packageId: string) => {
    setError(null);
    try {
      saveJsonFile(filename(packageId), await CBTService.offlinePackageFile(paper.id, packageId));
    } catch (e) {
      setError(cbtProblems(e)[0]);
    }
  };

  const makePackage = async () => {
    if (packages?.length && !window.confirm(
      'Make another package? It has new PINs. Slips printed for an earlier package only work with that package\'s file.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await CBTService.makeOfflinePackage(paper.id);
      setMade(result);
      await download(result.package.id);
      load();
    } catch (e) {
      setError(cbtProblems(e)[0]);
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    if (made && !printPinSlips(paper.exam_title, '', made.slips)) {
      toast.error('Your browser blocked the slips window. Allow pop-ups for this site and try again.');
    }
  };

  const importResults = async (file: File) => {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const data = await readJsonFile(file);
      if (!isResultsFile(data)) {
        throw new Error(`${file.name} isn't a results file. On the exam station, use "Save results" to make one.`);
      }
      const total: ImportReport = {
        file: file.name, imported: 0, already_imported: 0, refused: [],
        stillInProgress: data.still_in_progress, voided: data.voided,
      };
      const batches = resultBatches(data);
      let sent = 0;
      for (const batch of batches) {
        setProgress(`Sending ${sent + batch.attempts.length} of ${data.attempts.length} attempts…`);
        const result = await CBTService.importOfflineResults(paper.id, batch);
        total.imported += result.imported;
        total.already_imported += result.already_imported;
        total.refused.push(...result.refused);
        sent += batch.attempts.length;
      }
      setReport(total);
      if (total.imported) onImported();
      load();
    } catch (e) {
      setError(cbtProblems(e)[0]);
    } finally {
      setProgress(null);
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${card} bg-slate-50 dark:bg-slate-900/40`}>
        <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <WifiOff className="h-4 w-4 text-indigo-600" /> Sit this paper on the school's exam station
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          For a computer lab without reliable internet. The station is a computer on the school's own network that
          runs the exam for the lab.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li>Make a package. Its file has the paper without the answers. Print the PIN slips at the same time.</li>
          <li>Load the file onto the station. Students sign in there with the number and PIN on their slip.</li>
          <li>Afterwards, save the results on the station and upload that file here. Answers are marked here.</li>
        </ol>
      </div>

      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void makePackage()} disabled={busy} className={primary}>
          {busy && !progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
          Make a package
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className={button}>
          {progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          Upload results from the station
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void importResults(file); }} />
      </div>
      {progress && <p className="text-sm text-slate-600 dark:text-slate-300">{progress}</p>}

      {made && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/30">
          <p className="font-semibold text-indigo-900 dark:text-indigo-100">
            Package made for {plural(made.slips.length, 'student')}, and its file downloaded.
          </p>
          <p className="mt-1 text-sm text-indigo-900 dark:text-indigo-200">
            The PINs are shown only now. Print the slips before you leave this page. If they are lost, make a new
            package and load that onto the station instead.
          </p>
          {made.package.questions_needing_internet > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {plural(made.package.questions_needing_internet, 'question')} show a picture or play a sound from the
              internet. If the station can't reach the internet, students won't see or hear them.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={print} className={primary}><Printer className="h-4 w-4" /> Print PIN slips</button>
            <button type="button" onClick={() => void download(made.package.id)} className={button}>
              <Download className="h-4 w-4" /> Download the file again
            </button>
          </div>
        </div>
      )}

      {report && (
        <div className={card}>
          <p className="font-semibold text-slate-900 dark:text-white">Results from {report.file}</p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {plural(report.imported, 'attempt')} added and marked
            {report.already_imported > 0 && `, ${report.already_imported} already here from an earlier upload`}.
          </p>
          {report.stillInProgress > 0 && (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
              {plural(report.stillInProgress, 'student')} {report.stillInProgress === 1 ? 'was' : 'were'} still writing when the file was saved. Save the results
              again once they finish and upload the new file; nothing comes in twice.
            </p>
          )}
          {report.voided > 0 && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {plural(report.voided, 'attempt')} voided on the station {report.voided === 1 ? 'was' : 'were'} left out.
            </p>
          )}
          {report.refused.length > 0 && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/30">
              <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                {plural(report.refused.length, 'attempt')} couldn't be added
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-rose-700 dark:text-rose-300">
                {report.refused.map((r, i) => <li key={i}><strong>{r.student}:</strong> {r.reason}</li>)}
              </ul>
            </div>
          )}
          {report.imported > 0 && paper.results_pushed_at && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Scores were sent to the school's results before this upload. Send them again from Marking &amp; results
              to include these students.
            </p>
          )}
        </div>
      )}

      <div className={card}>
        <h3 className="font-semibold text-slate-900 dark:text-white">Packages made</h3>
        {!packages && !error && <Loader2 className="mx-auto mt-3 h-5 w-5 animate-spin text-slate-400" />}
        {packages?.length === 0 && <p className="mt-2 text-sm text-slate-500">None yet.</p>}
        {!!packages?.length && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Made</th>
                  <th className="py-2 pr-3 font-medium">By</th>
                  <th className="py-2 pr-3 font-medium">Students</th>
                  <th className="py-2 pr-3 font-medium">Results in</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {packages.map((p) => (
                  <tr key={p.id} className="text-slate-700 dark:text-slate-300">
                    <td className="py-2 pr-3">{when(p.created_at)}</td>
                    <td className="py-2 pr-3">{p.created_by || '—'}</td>
                    <td className="py-2 pr-3">{p.students}</td>
                    <td className="py-2 pr-3">{p.attempts_imported}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => void download(p.id)} className={`${button} ml-auto`}>
                        <Download className="h-4 w-4" /> File
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default OfflinePanel;
