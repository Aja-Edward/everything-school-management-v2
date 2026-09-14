import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Monitor, Radio } from 'lucide-react';
import InvigilationBoard from '@/components/cbt/invigilation/InvigilationBoard';
import InvigilationService, { InvigilationPaperSummary } from '@/services/InvigilationService';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** CBT papers the signed-in staff member can invigilate; open ones first. */
const PaperList: React.FC<{ basePath: string }> = ({ basePath }) => {
  const navigate = useNavigate();
  const [papers, setPapers] = useState<InvigilationPaperSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    InvigilationService.papers()
      .then(({ papers: list }) => setPapers([...list].sort((a, b) => Number(b.is_open) - Number(a.is_open))))
      .catch((e) => setError(e.message || 'Could not load papers.'));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <Monitor className="h-6 w-6" /> CBT invigilation
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Computer-based tests you set or are named to invigilate. Open one to watch it live.
        </p>
      </div>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {!papers && !error && <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-slate-400" />}
      {papers && papers.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          No published CBT papers to invigilate.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {papers?.map((paper) => (
          <button key={paper.id} type="button" onClick={() => navigate(`${basePath}/${paper.id}`)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900 dark:text-white">{paper.exam_title}</p>
              {paper.is_open && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  <Radio className="h-3 w-3" /> Open
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">{[paper.subject, paper.grade_level].filter(Boolean).join(' · ')}</p>
            <p className="mt-2 text-xs text-slate-500">{when(paper.opens_at)} – {when(paper.closes_at)}</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              {paper.in_progress} writing · {paper.finished} finished
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

export const InvigilationPage: React.FC<{ basePath: string }> = ({ basePath }) => {
  const { paperId } = useParams();
  const navigate = useNavigate();
  if (!paperId) return <PaperList basePath={basePath} />;
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => navigate(basePath)}
        className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All papers
      </button>
      <InvigilationBoard key={paperId} paperId={Number(paperId)} />
    </div>
  );
};

export const AdminInvigilationPage: React.FC = () => (
  <div className="p-4 sm:p-6"><InvigilationPage basePath="/admin/cbt-invigilation" /></div>
);

export const TeacherInvigilationPage: React.FC = () => (
  <TeacherDashboardLayout>
    <InvigilationPage basePath="/teacher/invigilate" />
  </TeacherDashboardLayout>
);

export default AdminInvigilationPage;
