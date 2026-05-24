import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Save, RefreshCw, X, CheckCircle, AlertCircle } from 'lucide-react';
import api from '@/services/api';
import ResultService from '@/services/ResultService';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONDUCT_CHOICES = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface NurseryClassroom {
  id: number;
  name: string;
}

interface StudentRow {
  student_id: number;
  full_name: string;
  term_report_id: number | null;
  // Development & Conduct
  physical_development: string;
  health: string;
  cleanliness: string;
  general_conduct: string;
  physical_development_comment: string;
  // Height & Weight
  height_beginning: string;
  height_end: string;
  weight_beginning: string;
  weight_end: string;
  // UI helpers
  saving: boolean;
  saved: boolean;
  error: boolean;
}

interface NurseryDevelopmentRecordingFormProps {
  onClose: () => void;
  nurseryClassrooms: NurseryClassroom[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyRow = (student_id: number, full_name: string): StudentRow => ({
  student_id, full_name,
  term_report_id: null,
  physical_development: '', health: '', cleanliness: '', general_conduct: '',
  physical_development_comment: '',
  height_beginning: '', height_end: '', weight_beginning: '', weight_end: '',
  saving: false, saved: false, error: false,
});

const hasAnyData = (row: StudentRow): boolean =>
  !!(row.physical_development || row.health || row.cleanliness || row.general_conduct ||
     row.physical_development_comment || row.height_beginning || row.height_end ||
     row.weight_beginning || row.weight_end);

// ─── Component ────────────────────────────────────────────────────────────────

const NurseryDevelopmentRecordingForm: React.FC<NurseryDevelopmentRecordingFormProps> = ({
  onClose,
  nurseryClassrooms,
}) => {
  const [selectedClassroom, setSelectedClassroom] = useState<string>(
    nurseryClassrooms.length === 1 ? String(nurseryClassrooms[0].id) : ''
  );
  const [selectedSession, setSelectedSession] = useState('');
  const [examSessions, setExamSessions] = useState<any[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  // Load exam sessions once on mount
  useEffect(() => {
    ResultService.getExamSessions()
      .then((res: any) => {
        const arr: any[] = Array.isArray(res) ? res : (res?.results ?? []);
        setExamSessions(arr);
      })
      .catch(() => toast.error('Failed to load exam sessions'));
  }, []);

  // Load students + existing term report data whenever class or session changes
  const loadData = useCallback(async () => {
    if (!selectedClassroom || !selectedSession) {
      setStudents([]);
      return;
    }
    setLoading(true);
    try {
      // 1. Students enrolled in the classroom
      const studentRes: any = await api.get(
        `/classrooms/classrooms/${selectedClassroom}/students/`
      );
      const studentList: any[] = Array.isArray(studentRes)
        ? studentRes
        : (studentRes?.results ?? []);

      // 2. Existing term reports for this exam session
      const trRes: any = await api.get(
        `/results/nursery/term-reports/?exam_session=${selectedSession}&page_size=500`
      );
      const termReports: any[] = Array.isArray(trRes) ? trRes : (trRes?.results ?? []);
      const trByStudent: Record<string, any> = Object.fromEntries(
        termReports.map((tr: any) => [String(tr.student), tr])
      );

      setStudents(
        studentList.map((s: any) => {
          const tr = trByStudent[String(s.id)] ?? null;
          return {
            student_id: s.id,
            full_name: s.full_name || `${s.user?.first_name ?? ''} ${s.user?.last_name ?? ''}`.trim() || `Student #${s.id}`,
            term_report_id: tr?.id ?? null,
            physical_development: tr?.physical_development ?? '',
            health: tr?.health ?? '',
            cleanliness: tr?.cleanliness ?? '',
            general_conduct: tr?.general_conduct ?? '',
            physical_development_comment: tr?.physical_development_comment ?? '',
            height_beginning: tr?.height_beginning != null ? String(tr.height_beginning) : '',
            height_end:       tr?.height_end != null       ? String(tr.height_end)       : '',
            weight_beginning: tr?.weight_beginning != null ? String(tr.weight_beginning) : '',
            weight_end:       tr?.weight_end != null       ? String(tr.weight_end)       : '',
            saving: false, saved: false, error: false,
          };
        })
      );
    } catch (err) {
      console.error(err);
      toast.error('Failed to load student data');
    } finally {
      setLoading(false);
    }
  }, [selectedClassroom, selectedSession]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateRow = (student_id: number, field: keyof StudentRow, value: string) => {
    setStudents(prev =>
      prev.map(s => s.student_id === student_id ? { ...s, [field]: value, saved: false, error: false } : s)
    );
  };

  // Save a single student's row
  const saveRow = async (row: StudentRow) => {
    if (!selectedSession) return;

    // Build the payload — always send all fields so clearing a value works
    const data: Record<string, unknown> = {
      physical_development:         row.physical_development || '',
      health:                       row.health || '',
      cleanliness:                  row.cleanliness || '',
      general_conduct:              row.general_conduct || '',
      physical_development_comment: row.physical_development_comment || '',
    };
    if (row.height_beginning) data.height_beginning = parseFloat(row.height_beginning);
    if (row.height_end)       data.height_end       = parseFloat(row.height_end);
    if (row.weight_beginning) data.weight_beginning = parseFloat(row.weight_beginning);
    if (row.weight_end)       data.weight_end       = parseFloat(row.weight_end);

    setStudents(prev =>
      prev.map(s => s.student_id === row.student_id ? { ...s, saving: true, error: false } : s)
    );
    try {
      await ResultService.upsertNurseryTermReportFields(row.student_id, selectedSession, data);
      setStudents(prev =>
        prev.map(s => s.student_id === row.student_id ? { ...s, saving: false, saved: true } : s)
      );
    } catch {
      setStudents(prev =>
        prev.map(s => s.student_id === row.student_id ? { ...s, saving: false, error: true } : s)
      );
    }
  };

  // Save all students who have data
  const handleSaveAll = async () => {
    const toSave = students.filter(
      s => hasAnyData(s) || s.term_report_id !== null // save if has data OR already has a term report
    );
    if (toSave.length === 0) {
      toast.info('No data entered yet. Fill in ratings for at least one student.');
      return;
    }
    setSavingAll(true);
    for (const row of toSave) {
      await saveRow(row);
    }
    setSavingAll(false);
    const errors = students.filter(s => s.error).length;
    if (errors === 0) toast.success(`Development data saved for ${toSave.length} student(s)`);
    else toast.warning(`Saved with ${errors} error(s). Rows marked in red failed — try again.`);
  };

  const filledCount = students.filter(hasAnyData).length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Controls ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Classroom
          </label>
          <select
            value={selectedClassroom}
            onChange={e => setSelectedClassroom(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          >
            <option value="">— Select class —</option>
            {nurseryClassrooms.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Exam Session / Term
          </label>
          <select
            value={selectedSession}
            onChange={e => setSelectedSession(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          >
            <option value="">— Select session —</option>
            {examSessions.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.academic_session?.name ?? s.name ?? `Session ${s.id}`}
                {s.term ? ` — ${s.term}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Status bar ── */}
      {selectedClassroom && selectedSession && !loading && students.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-4 py-2.5">
          <span className="text-sm text-blue-700 dark:text-blue-300">
            {students.length} student{students.length !== 1 ? 's' : ''}
            {filledCount > 0 && ` · ${filledCount} with data entered`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-lg disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleSaveAll}
              disabled={savingAll}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {savingAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save All
            </button>
          </div>
        </div>
      )}

      {/* ── Prompt if nothing selected ── */}
      {(!selectedClassroom || !selectedSession) && (
        <div className="py-12 text-center text-gray-400 text-sm">
          Select a classroom and exam session above to start recording.
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* ── No students ── */}
      {!loading && selectedClassroom && selectedSession && students.length === 0 && (
        <div className="py-12 text-center text-gray-400 text-sm">
          No students found in this classroom.
        </div>
      )}

      {/* ── Student table ── */}
      {!loading && students.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-800 min-w-[160px] z-10">
                  Student
                </th>
                {/* Development & Conduct */}
                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[130px] whitespace-nowrap">
                  Physical Development
                </th>
                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[110px]">
                  Health
                </th>
                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[110px]">
                  Cleanliness
                </th>
                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[130px] whitespace-nowrap">
                  General Conduct
                </th>
                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[160px]">
                  Development Note
                </th>
                {/* Height & Weight */}
                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[100px] whitespace-nowrap">
                  Ht. Start (cm)
                </th>
                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[100px] whitespace-nowrap">
                  Ht. End (cm)
                </th>
                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[100px] whitespace-nowrap">
                  Wt. Start (kg)
                </th>
                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[100px] whitespace-nowrap">
                  Wt. End (kg)
                </th>
                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[60px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {students.map(row => (
                <tr
                  key={row.student_id}
                  className={`transition-colors ${
                    row.error
                      ? 'bg-red-50 dark:bg-red-900/10'
                      : row.saved
                      ? 'bg-green-50 dark:bg-green-900/10'
                      : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {/* Name */}
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 sticky left-0 bg-inherit z-10">
                    <div className="flex items-center gap-1.5">
                      {row.saved && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                      {row.error && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      <span className="truncate max-w-[140px]" title={row.full_name}>
                        {row.full_name}
                      </span>
                    </div>
                  </td>

                  {/* Conduct dropdowns */}
                  {(
                    [
                      ['physical_development', 'physical_development'],
                      ['health', 'health'],
                      ['cleanliness', 'cleanliness'],
                      ['general_conduct', 'general_conduct'],
                    ] as [keyof StudentRow, string][]
                  ).map(([field]) => (
                    <td key={String(field)} className="px-2 py-2">
                      <select
                        value={(row[field] as string) || ''}
                        onChange={e => updateRow(row.student_id, field, e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white bg-white"
                      >
                        <option value="">—</option>
                        {CONDUCT_CHOICES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                  ))}

                  {/* Development comment */}
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={row.physical_development_comment}
                      onChange={e => updateRow(row.student_id, 'physical_development_comment', e.target.value)}
                      placeholder="Optional note"
                      className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </td>

                  {/* Height & Weight */}
                  {(
                    [
                      ['height_beginning', '0', '1'],
                      ['height_end', '0', '1'],
                      ['weight_beginning', '0', '0.1'],
                      ['weight_end', '0', '0.1'],
                    ] as [keyof StudentRow, string, string][]
                  ).map(([field, min, step]) => (
                    <td key={String(field)} className="px-2 py-2">
                      <input
                        type="number"
                        min={min}
                        step={step}
                        value={(row[field] as string) || ''}
                        onChange={e => updateRow(row.student_id, field, e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        placeholder="—"
                      />
                    </td>
                  ))}

                  {/* Per-row save */}
                  <td className="px-2 py-2">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={row.saving}
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-40"
                      title="Save this student"
                    >
                      {row.saving
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <Save className="w-3.5 h-3.5" />
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Bottom save bar ── */}
      {students.length > 0 && !loading && (
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Close
          </button>
          <button
            onClick={handleSaveAll}
            disabled={savingAll}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {savingAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save All
          </button>
        </div>
      )}
    </div>
  );
};

export default NurseryDevelopmentRecordingForm;
