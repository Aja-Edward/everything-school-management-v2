import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { Save, RefreshCw, X, CheckCircle, AlertCircle } from 'lucide-react';
import api from '@/services/api';
import ResultService, {
  EducationLevelType,
  DevelopmentTermReport,
  TraitRatingEntry,
} from '@/services/ResultService';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONDUCT_CHOICES = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'] as const;
const RATING_SCALE: Array<{ value: number; label: string }> = [
  { value: 5, label: 'Excellent' },
  { value: 4, label: 'Very Good' },
  { value: 3, label: 'Good' },
  { value: 2, label: 'Fair' },
  { value: 1, label: 'Poor' },
];

// Fixed display order + labels for the level dropdown.
const LEVEL_ORDER: EducationLevelType[] = ['NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'];
const LEVEL_LABELS: Record<EducationLevelType, string> = {
  NURSERY: 'Nursery',
  PRIMARY: 'Primary',
  JUNIOR_SECONDARY: 'Junior Secondary',
  SENIOR_SECONDARY: 'Senior Secondary',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassroomOption {
  id: number;
  name: string;
}

interface StudentRow {
  student_id: number;
  full_name: string;
  term_report_id: string | null;
  loaded: boolean;

  physical_development_visible: boolean;
  physical_development: string;
  health: string;
  cleanliness: string;
  general_conduct: string;
  physical_development_comment: string;
  height_beginning: string;
  height_end: string;
  weight_beginning: string;
  weight_end: string;

  affective: TraitRatingEntry[];
  psychomotor: TraitRatingEntry[];

  saving: boolean;
  saved: boolean;
  error: boolean;
}

interface TraitsRecordingFormProps {
  onClose: () => void;
  /**
   * Classrooms the teacher is assigned to, grouped by education level.
   * Only levels the teacher actually has classrooms in should be present
   * as keys — an empty/missing level is simply not offered in the dropdown.
   */
  classroomsByLevel: Partial<Record<EducationLevelType, ClassroomOption[]>>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fromReport = (studentId: number, fullName: string, report: DevelopmentTermReport): StudentRow => ({
  student_id: studentId,
  full_name: fullName,
  term_report_id: report.id,
  loaded: true,
  physical_development_visible: !!report.physical_development_visible,
  physical_development: report.physical_development || '',
  health: report.health || '',
  cleanliness: report.cleanliness || '',
  general_conduct: report.general_conduct || '',
  physical_development_comment: report.physical_development_comment || '',
  height_beginning: report.height_beginning != null ? String(report.height_beginning) : '',
  height_end: report.height_end != null ? String(report.height_end) : '',
  weight_beginning: report.weight_beginning != null ? String(report.weight_beginning) : '',
  weight_end: report.weight_end != null ? String(report.weight_end) : '',
  affective: report.affective_domain || [],
  psychomotor: report.psychomotor_skills || [],
  saving: false, saved: false, error: false,
});

const emptyRow = (student_id: number, full_name: string): StudentRow => ({
  student_id, full_name,
  term_report_id: null,
  loaded: false,
  physical_development_visible: false,
  physical_development: '', health: '', cleanliness: '', general_conduct: '',
  physical_development_comment: '',
  height_beginning: '', height_end: '', weight_beginning: '', weight_end: '',
  affective: [], psychomotor: [],
  saving: false, saved: false, error: false,
});

const hasPhysicalDevData = (row: StudentRow): boolean =>
  !!(row.physical_development || row.health || row.cleanliness || row.general_conduct ||
     row.physical_development_comment || row.height_beginning || row.height_end ||
     row.weight_beginning || row.weight_end);

const hasTraitData = (entries: TraitRatingEntry[]): boolean =>
  entries.some(e => e.value != null);

// ─── Component ────────────────────────────────────────────────────────────────

const TraitsRecordingForm: React.FC<TraitsRecordingFormProps> = ({
  onClose,
  classroomsByLevel,
}) => {
  const availableLevels = useMemo(
    () => LEVEL_ORDER.filter(l => (classroomsByLevel[l]?.length ?? 0) > 0),
    [classroomsByLevel]
  );

  const [selectedLevel, setSelectedLevel] = useState<EducationLevelType | ''>(
    availableLevels.length === 1 ? availableLevels[0] : ''
  );
  const classrooms = selectedLevel ? (classroomsByLevel[selectedLevel] ?? []) : [];

  const [selectedClassroom, setSelectedClassroom] = useState<string>(
    classrooms.length === 1 ? String(classrooms[0].id) : ''
  );
  const [selectedSession, setSelectedSession] = useState('');
  const [examSessions, setExamSessions] = useState<any[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    ResultService.getExamSessions()
      .then((res: any) => {
        const arr: any[] = Array.isArray(res) ? res : (res?.results ?? []);
        setExamSessions(arr);
      })
      .catch(() => toast.error('Failed to load exam sessions'));
  }, []);

  // Changing the level invalidates classroom + session + student selections —
  // a different level has a completely different classroom set and its own
  // set of applicable trait/physical-development sections.
  const handleLevelChange = (value: string) => {
    const level = value as EducationLevelType | '';
    setSelectedLevel(level);
    const nextClassrooms = level ? (classroomsByLevel[level] ?? []) : [];
    setSelectedClassroom(nextClassrooms.length === 1 ? String(nextClassrooms[0].id) : '');
    setSelectedSession('');
    setStudents([]);
  };

  const loadData = useCallback(async () => {
    if (!selectedLevel || !selectedClassroom || !selectedSession) {
      setStudents([]);
      return;
    }
    setLoading(true);
    try {
      const studentRes: any = await api.get(
        `/classrooms/classrooms/${selectedClassroom}/students/`
      );
      const studentList: any[] = Array.isArray(studentRes)
        ? studentRes
        : (studentRes?.results ?? []);

      const baseRows = studentList.map((s: any) =>
        emptyRow(
          s.id,
          s.full_name || `${s.user?.first_name ?? ''} ${s.user?.last_name ?? ''}`.trim() || `Student #${s.id}`
        )
      );
      setStudents(baseRows);

      const settled = await Promise.allSettled(
        baseRows.map(row =>
          ResultService.getOrCreateTermReport(selectedLevel, row.student_id, selectedSession)
        )
      );
      setStudents(prev =>
        prev.map((row, i) => {
          const result = settled[i];
          if (result.status === 'fulfilled') {
            return fromReport(row.student_id, row.full_name, result.value);
          }
          return row;
        })
      );
    } catch (err) {
      console.error(err);
      toast.error('Failed to load student data');
    } finally {
      setLoading(false);
    }
  }, [selectedLevel, selectedClassroom, selectedSession]);

  useEffect(() => { loadData(); }, [loadData]);

  const affectiveColumns = useMemo(
    () => students.find(s => s.affective.length > 0)?.affective.map(a => a.name) || [],
    [students]
  );
  const psychomotorColumns = useMemo(
    () => students.find(s => s.psychomotor.length > 0)?.psychomotor.map(a => a.name) || [],
    [students]
  );
  const anyPhysicalDev = students.some(s => s.physical_development_visible);

  const updatePhysicalField = (student_id: number, field: keyof StudentRow, value: string) => {
    setStudents(prev =>
      prev.map(s => s.student_id === student_id ? { ...s, [field]: value, saved: false, error: false } : s)
    );
  };

  const updateTraitValue = (
    student_id: number,
    category: 'affective' | 'psychomotor',
    name: string,
    value: number | null
  ) => {
    setStudents(prev =>
      prev.map(s => {
        if (s.student_id !== student_id) return s;
        const list = s[category].map(entry =>
          entry.name === name ? { ...entry, value } : entry
        );
        return { ...s, [category]: list, saved: false, error: false };
      })
    );
  };

  const ensureReportId = async (row: StudentRow): Promise<string> => {
    if (row.term_report_id) return row.term_report_id;
    if (!selectedLevel) throw new Error('No education level selected');
    const report = await ResultService.getOrCreateTermReport(selectedLevel, row.student_id, selectedSession);
    setStudents(prev =>
      prev.map(s => s.student_id === row.student_id ? fromReport(row.student_id, row.full_name, report) : s)
    );
    return report.id;
  };

  const saveRow = async (row: StudentRow) => {
    if (!selectedSession || !selectedLevel) return;
    setStudents(prev =>
      prev.map(s => s.student_id === row.student_id ? { ...s, saving: true, error: false } : s)
    );
    try {
      const reportId = await ensureReportId(row);

      if (row.physical_development_visible) {
        await ResultService.upsertTermReportPhysicalDevelopment(selectedLevel, reportId, {
          physical_development: row.physical_development || '',
          health: row.health || '',
          cleanliness: row.cleanliness || '',
          general_conduct: row.general_conduct || '',
          physical_development_comment: row.physical_development_comment || '',
          ...(row.height_beginning ? { height_beginning: parseFloat(row.height_beginning) } : {}),
          ...(row.height_end ? { height_end: parseFloat(row.height_end) } : {}),
          ...(row.weight_beginning ? { weight_beginning: parseFloat(row.weight_beginning) } : {}),
          ...(row.weight_end ? { weight_end: parseFloat(row.weight_end) } : {}),
        });
      }

      if (row.affective.length > 0 && hasTraitData(row.affective)) {
        await ResultService.submitTraitRatings(
          selectedLevel, reportId, 'AFFECTIVE',
          row.affective
            .filter(e => e.value != null)
            .map(e => ({
              ...(e.trait_field_id ? { trait_field_id: e.trait_field_id } : { default_trait_name: e.name }),
              value: e.value as number,
            }))
        );
      }

      if (row.psychomotor.length > 0 && hasTraitData(row.psychomotor)) {
        await ResultService.submitTraitRatings(
          selectedLevel, reportId, 'PSYCHOMOTOR',
          row.psychomotor
            .filter(e => e.value != null)
            .map(e => ({
              ...(e.trait_field_id ? { trait_field_id: e.trait_field_id } : { default_trait_name: e.name }),
              value: e.value as number,
            }))
        );
      }

      setStudents(prev =>
        prev.map(s => s.student_id === row.student_id ? { ...s, saving: false, saved: true } : s)
      );
    } catch (err) {
      console.error(err);
      setStudents(prev =>
        prev.map(s => s.student_id === row.student_id ? { ...s, saving: false, error: true } : s)
      );
    }
  };

  const handleSaveAll = async () => {
    const toSave = students.filter(
      s => hasPhysicalDevData(s) || hasTraitData(s.affective) || hasTraitData(s.psychomotor) || s.term_report_id
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
    if (errors === 0) toast.success(`Data saved for ${toSave.length} student(s)`);
    else toast.warning(`Saved with ${errors} error(s). Rows marked in red failed — try again.`);
  };

  const filledCount = students.filter(
    s => hasPhysicalDevData(s) || hasTraitData(s.affective) || hasTraitData(s.psychomotor)
  ).length;

  const noSectionsEnabled =
    !loading && students.length > 0 &&
    !anyPhysicalDev && affectiveColumns.length === 0 && psychomotorColumns.length === 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Controls ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {availableLevels.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Education Level
            </label>
            <select
              value={selectedLevel}
              onChange={e => handleLevelChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">— Select level —</option>
              {availableLevels.map(l => (
                <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Classroom
          </label>
          <select
            value={selectedClassroom}
            onChange={e => setSelectedClassroom(e.target.value)}
            disabled={!selectedLevel}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
          >
            <option value="">— Select class —</option>
            {classrooms.map(c => (
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
            disabled={!selectedLevel}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
          >
            <option value="">— Select session —</option>
            {examSessions.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.academic_session?.name ?? s.name ?? `Session ${s.id}`}
                {s.term_name ? ` — ${s.term_name}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Status bar ── */}
      {selectedLevel && selectedClassroom && selectedSession && !loading && students.length > 0 && (
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

      {(!selectedLevel || !selectedClassroom || !selectedSession) && (
        <div className="py-12 text-center text-gray-400 text-sm">
          {!selectedLevel
            ? 'Select an education level above to start recording.'
            : 'Select a classroom and exam session above to start recording.'}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!loading && selectedLevel && selectedClassroom && selectedSession && students.length === 0 && (
        <div className="py-12 text-center text-gray-400 text-sm">
          No students found in this classroom.
        </div>
      )}

      {noSectionsEnabled && (
        <div className="py-12 text-center text-gray-400 text-sm">
          No development or trait sections are enabled for {LEVEL_LABELS[selectedLevel as EducationLevelType]}.
          Ask an admin to enable them under Settings → Result Configuration.
        </div>
      )}

      {/* ── Student table ── */}
      {!loading && students.length > 0 && !noSectionsEnabled && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-800 min-w-[160px] z-10">
                  Student
                </th>

                {anyPhysicalDev && (
                  <>
                    <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[130px] whitespace-nowrap">Physical Development</th>
                    <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[110px]">Health</th>
                    <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[110px]">Cleanliness</th>
                    <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[130px] whitespace-nowrap">General Conduct</th>
                    <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[160px]">Development Note</th>
                    <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[100px] whitespace-nowrap">Ht. Start (cm)</th>
                    <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[100px] whitespace-nowrap">Ht. End (cm)</th>
                    <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[100px] whitespace-nowrap">Wt. Start (kg)</th>
                    <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[100px] whitespace-nowrap">Wt. End (kg)</th>
                  </>
                )}

                {affectiveColumns.map(name => (
                  <th key={`aff-${name}`} className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[130px] whitespace-nowrap">
                    {name}
                  </th>
                ))}
                {psychomotorColumns.map(name => (
                  <th key={`psy-${name}`} className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[130px] whitespace-nowrap">
                    {name}
                  </th>
                ))}

                <th className="px-2 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[60px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {students.map(row => (
                <tr
                  key={row.student_id}
                  className={`transition-colors ${
                    row.error ? 'bg-red-50 dark:bg-red-900/10'
                    : row.saved ? 'bg-green-50 dark:bg-green-900/10'
                    : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 sticky left-0 bg-inherit z-10">
                    <div className="flex items-center gap-1.5">
                      {row.saved && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                      {row.error && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      <span className="truncate max-w-[140px]" title={row.full_name}>{row.full_name}</span>
                    </div>
                  </td>

                  {anyPhysicalDev && row.physical_development_visible && (
                    <>
                      {(['physical_development', 'health', 'cleanliness', 'general_conduct'] as const).map(field => (
                        <td key={field} className="px-2 py-2">
                          <select
                            value={row[field] || ''}
                            onChange={e => updatePhysicalField(row.student_id, field, e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white bg-white"
                          >
                            <option value="">—</option>
                            {CONDUCT_CHOICES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={row.physical_development_comment}
                          onChange={e => updatePhysicalField(row.student_id, 'physical_development_comment', e.target.value)}
                          placeholder="Optional note"
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        />
                      </td>
                      {(['height_beginning', 'height_end', 'weight_beginning', 'weight_end'] as const).map((field, i) => (
                        <td key={field} className="px-2 py-2">
                          <input
                            type="number"
                            min="0"
                            step={i < 2 ? '1' : '0.1'}
                            value={row[field] || ''}
                            onChange={e => updatePhysicalField(row.student_id, field, e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                            placeholder="—"
                          />
                        </td>
                      ))}
                    </>
                  )}
                  {anyPhysicalDev && !row.physical_development_visible && (
                    <td colSpan={9} className="px-2 py-2 text-center text-gray-300 text-xs">
                      Not applicable
                    </td>
                  )}

                  {affectiveColumns.map(name => {
                    const entry = row.affective.find(e => e.name === name);
                    return (
                      <td key={`aff-${name}`} className="px-2 py-2">
                        <select
                          value={entry?.value ?? ''}
                          onChange={e => updateTraitValue(
                            row.student_id, 'affective', name,
                            e.target.value === '' ? null : Number(e.target.value)
                          )}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white bg-white"
                        >
                          <option value="">—</option>
                          {RATING_SCALE.map(r => (
                            <option key={r.value} value={r.value}>
                              {entry?.display_mode === 'text' ? r.label : `${r.value} — ${r.label}`}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}

                  {psychomotorColumns.map(name => {
                    const entry = row.psychomotor.find(e => e.name === name);
                    return (
                      <td key={`psy-${name}`} className="px-2 py-2">
                        <select
                          value={entry?.value ?? ''}
                          onChange={e => updateTraitValue(
                            row.student_id, 'psychomotor', name,
                            e.target.value === '' ? null : Number(e.target.value)
                          )}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white bg-white"
                        >
                          <option value="">—</option>
                          {RATING_SCALE.map(r => (
                            <option key={r.value} value={r.value}>
                              {entry?.display_mode === 'text' ? r.label : `${r.value} — ${r.label}`}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}

                  <td className="px-2 py-2">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={row.saving}
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-40"
                      title="Save this student"
                    >
                      {row.saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

export default TraitsRecordingForm;