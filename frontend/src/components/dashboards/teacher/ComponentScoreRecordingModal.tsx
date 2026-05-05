/**
 * ComponentScoreRecordingModal
 *
 * Allows teachers to record ONE assessment component at a time (CA, Test, Exam…).
 * The teacher selects the component, sees all students in the class, enters
 * scores, and saves — without having to submit every component at once.
 *
 * Previously recorded components are shown as read-only context so the teacher
 * can see what's already saved before adding the next component.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, CheckCircle2, AlertCircle, Clock, ChevronRight,
  Users, Save, RefreshCw, Info,
} from 'lucide-react';
import ResultService from '@/services/ResultService';
import type {
  EducationLevelType, AssessmentComponentInfo,
  ExamSession, BulkComponentScoreEntry,
} from '@/services/ResultService';
import ClassroomService from '@/services/ClassroomService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
  subject_id: number;
  subject_name: string;
  subject_code: string;
  classroom_id?: number | null;
  classroom_name: string;
  education_level?: string;
}

interface StudentRow {
  id: string;
  full_name: string;
  admission_number: string;
  /** Map component_id → current score from existing results */
  existingScores: Record<number, number>;
  resultId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Teacher's subject assignments for populating selectors */
  assignments: Assignment[];
}

// ─── Component status helper ──────────────────────────────────────────────────

type ComponentStatus = 'complete' | 'partial' | 'empty';

function componentStatus(
  componentId: number,
  students: StudentRow[],
  maxScore: number
): ComponentStatus {
  if (students.length === 0) return 'empty';
  const recorded = students.filter(s => (s.existingScores[componentId] ?? 0) > 0).length;
  if (recorded === 0) return 'empty';
  if (recorded < students.length) return 'partial';
  return 'complete';
}

const statusIcon = (s: ComponentStatus) => {
  if (s === 'complete') return <CheckCircle2 size={12} className="text-green-500" />;
  if (s === 'partial')  return <AlertCircle  size={12} className="text-amber-500" />;
  return <Clock size={12} className="text-gray-400" />;
};

const statusLabel = (s: ComponentStatus, recorded: number, total: number) => {
  if (s === 'complete') return `${total}/${total} ✓`;
  if (s === 'partial')  return `${recorded}/${total}`;
  return `0/${total}`;
};

// ─── Modal ────────────────────────────────────────────────────────────────────

const ComponentScoreRecordingModal: React.FC<Props> = ({ open, onClose, assignments }) => {

  // ── Selectors ──────────────────────────────────────────────────────────────
  const [selectedSubjectId,    setSelectedSubjectId]    = useState<number>(0);
  const [selectedClassroomId,  setSelectedClassroomId]  = useState<number>(0);
  const [selectedSessionId,    setSelectedSessionId]    = useState<string>('');
  const [selectedComponentId,  setSelectedComponentId]  = useState<number>(0);

  // ── Reference data ─────────────────────────────────────────────────────────
  const [examSessions,        setExamSessions]        = useState<ExamSession[]>([]);
  const [assessmentComponents,setAssessmentComponents] = useState<AssessmentComponentInfo[]>([]);
  const [students,            setStudents]            = useState<StudentRow[]>([]);

  // ── Entry state ────────────────────────────────────────────────────────────
  /** score being entered per student: { studentId → inputValue } */
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});

  // ── UI state ───────────────────────────────────────────────────────────────
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [loadingStudents,   setLoadingStudents]   = useState(false);
  const [saving,            setSaving]            = useState(false);
  const [saveMsg,           setSaveMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  const [validationErrors,  setValidationErrors]  = useState<Record<string, string>>({});

  // ── Derived data ───────────────────────────────────────────────────────────

  /** Unique subjects from assignments */
  const subjects = useMemo(() => {
    const seen = new Set<number>();
    return assignments.filter(a => {
      if (seen.has(a.subject_id)) return false;
      seen.add(a.subject_id);
      return true;
    });
  }, [assignments]);

  /** Classrooms available for the selected subject */
  const classroomsForSubject = useMemo(() =>
    assignments
      .filter(a => a.subject_id === selectedSubjectId && a.classroom_id)
      .map(a => ({ id: a.classroom_id!, name: a.classroom_name })),
  [assignments, selectedSubjectId]);

  /** Education level for the selected classroom */
  const educationLevel = useMemo(() => {
    const a = assignments.find(
      a => a.subject_id === selectedSubjectId && a.classroom_id === selectedClassroomId
    );
    return a?.education_level as EducationLevelType | undefined;
  }, [assignments, selectedSubjectId, selectedClassroomId]);

  /** The active assessment component being recorded */
  const activeComponent = useMemo(
    () => assessmentComponents.find(c => c.id === selectedComponentId),
    [assessmentComponents, selectedComponentId]
  );

  const maxScore = activeComponent ? parseFloat(activeComponent.max_score) : 0;

  // ── Load exam sessions once on open ────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    ResultService.getExamSessions().then(setExamSessions).catch(() => {});
  }, [open]);

  // ── Reset subject when modal opens ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setSelectedSubjectId(subjects[0]?.subject_id ?? 0);
    setSelectedComponentId(0);
    setScoreInputs({});
    setSaveMsg(null);
  }, [open]);

  // ── Auto-select first classroom when subject changes ───────────────────────
  useEffect(() => {
    setSelectedClassroomId(classroomsForSubject[0]?.id ?? 0);
    setSelectedComponentId(0);
  }, [selectedSubjectId]);

  // ── Load assessment components when education level is known ───────────────
  useEffect(() => {
    if (!educationLevel) return;
    setLoadingComponents(true);
    ResultService.getAssessmentComponents({ is_active: true, page_size: 50 })
      .then(all => {
        // Filter client-side by education_level_type matching
        const filtered = all.filter(c =>
          !c.education_level_type || c.education_level_type === educationLevel
        );
        // If backend returns education_level_type, use it; otherwise show all active
        const components = filtered.length > 0
          ? filtered
          : all.filter(c => c.is_active !== false);
        const sorted = components.sort((a, b) => a.display_order - b.display_order);
        setAssessmentComponents(sorted);
        if (sorted.length > 0 && !selectedComponentId) {
          setSelectedComponentId(sorted[0].id);
        }
      })
      .catch(() => setAssessmentComponents([]))
      .finally(() => setLoadingComponents(false));
  }, [educationLevel]);

  // ── Load students + existing scores when all selectors are set ─────────────
  const loadStudentsAndScores = useCallback(async () => {
    if (!selectedClassroomId || !selectedSessionId || !selectedSubjectId || !educationLevel) return;
    setLoadingStudents(true);
    try {
      // Fetch students in classroom
      const studentsRaw: any[] = await ClassroomService.getClassroomStudents(selectedClassroomId)
        .then((r: any) => Array.isArray(r) ? r : r?.results ?? []);

      // Fetch existing results to prefill scores
      const existingResults = await ResultService.getSubjectResults(educationLevel, {
        exam_session: selectedSessionId,
        subject:      selectedSubjectId,
        page_size:    200,
      } as any);

      const resultByStudent = new Map<string, any>();
      existingResults.forEach((r: any) => {
        const sid = String(r.student?.id ?? r.student_id ?? '');
        if (sid) resultByStudent.set(sid, r);
      });

      const rows: StudentRow[] = studentsRaw.map((s: any) => {
        const sid     = String(s.id ?? s.student_id ?? '');
        const existing = resultByStudent.get(sid);
        const scores: Record<number, number> = {};
        if (existing?.component_scores) {
          existing.component_scores.forEach((cs: any) => {
            scores[cs.component] = parseFloat(cs.score ?? '0');
          });
        }
        return {
          id:               sid,
          full_name:        s.full_name ?? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
          admission_number: s.admission_number ?? s.username ?? '—',
          existingScores:   scores,
          resultId:         existing?.id,
        };
      });

      setStudents(rows);
      // Prefill input with existing score for the active component
      const inputs: Record<string, string> = {};
      rows.forEach(r => {
        if (selectedComponentId && r.existingScores[selectedComponentId] !== undefined) {
          inputs[r.id] = String(r.existingScores[selectedComponentId] || '');
        }
      });
      setScoreInputs(inputs);
    } catch {
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }, [selectedClassroomId, selectedSessionId, selectedSubjectId, educationLevel, selectedComponentId]);

  useEffect(() => { loadStudentsAndScores(); }, [loadStudentsAndScores]);

  // ── Prefill inputs when component changes ──────────────────────────────────
  useEffect(() => {
    if (!selectedComponentId) return;
    const inputs: Record<string, string> = {};
    students.forEach(s => {
      const existing = s.existingScores[selectedComponentId];
      inputs[s.id] = existing !== undefined ? String(existing || '') : '';
    });
    setScoreInputs(inputs);
    setValidationErrors({});
    setSaveMsg(null);
  }, [selectedComponentId, students]);

  // ── Score input handler ────────────────────────────────────────────────────
  const handleScoreChange = (studentId: string, raw: string) => {
    setScoreInputs(prev => ({ ...prev, [studentId]: raw }));
    // Clear per-student validation error
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!activeComponent || !selectedSessionId || !educationLevel) return;

    // Validate
    const errors: Record<string, string> = {};
    students.forEach(s => {
      const raw = scoreInputs[s.id];
      if (raw === '' || raw === undefined) return; // blank = skip this student
      const n = parseFloat(raw);
      if (isNaN(n) || n < 0) {
        errors[s.id] = 'Must be ≥ 0';
      } else if (n > maxScore) {
        errors[s.id] = `Max is ${maxScore}`;
      }
    });
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setSaving(true);
    setSaveMsg(null);
    try {
      // Build payload — only include students with a value entered
      const entries: BulkComponentScoreEntry[] = students
        .filter(s => scoreInputs[s.id] !== '' && scoreInputs[s.id] !== undefined)
        .map(s => ({
          student:       s.id,
          subject:       selectedSubjectId,
          exam_session:  selectedSessionId,
          scores:        [{ component_id: activeComponent.id, score: parseFloat(scoreInputs[s.id] || '0') }],
        }));

      if (entries.length === 0) {
        setSaveMsg({ ok: false, text: 'No scores entered. Enter at least one score to save.' });
        return;
      }

      await ResultService.bulkRecordComponentScores(educationLevel, entries);

      setSaveMsg({ ok: true, text: `${entries.length} score(s) saved for "${activeComponent.name}".` });

      // Refresh to show updated existing scores
      await loadStudentsAndScores();
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e?.message || 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!open) return null;

  const canLoad = !!selectedClassroomId && !!selectedSessionId && !!selectedSubjectId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Record Component Scores</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Record one component at a time — previously saved scores are preserved
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* ── Selectors ── */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Subject</label>
              <select
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(Number(e.target.value))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900"
              >
                <option value={0}>Select subject…</option>
                {subjects.map(s => (
                  <option key={s.subject_id} value={s.subject_id}>
                    {s.subject_name} ({s.subject_code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Class</label>
              <select
                value={selectedClassroomId}
                onChange={e => setSelectedClassroomId(Number(e.target.value))}
                disabled={!selectedSubjectId}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 disabled:opacity-50"
              >
                <option value={0}>Select class…</option>
                {classroomsForSubject.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Exam Session</label>
              <select
                value={selectedSessionId}
                onChange={e => setSelectedSessionId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900"
              >
                <option value="">Select session…</option>
                {examSessions.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Component status chips ── */}
        {assessmentComponents.length > 0 && canLoad && !loadingStudents && (
          <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Assessment Components — click to record:
            </p>
            <div className="flex flex-wrap gap-2">
              {assessmentComponents.map(comp => {
                const st     = componentStatus(comp.id, students, parseFloat(comp.max_score));
                const recorded = students.filter(s => (s.existingScores[comp.id] ?? 0) > 0).length;
                const isActive = comp.id === selectedComponentId;
                return (
                  <button
                    key={comp.id}
                    onClick={() => setSelectedComponentId(comp.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600'
                        : st === 'complete'
                          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                          : st === 'partial'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {!isActive && statusIcon(st)}
                    {comp.name}
                    <span className="opacity-70">({comp.max_score}pts)</span>
                    {!isActive && (
                      <span className="ml-0.5 opacity-60">
                        {statusLabel(st, recorded, students.length)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Active component header ── */}
        {activeComponent && canLoad && (
          <div className="px-6 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <ChevronRight size={14} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                Recording: {activeComponent.name}
              </span>
              <span className="text-xs text-blue-500 dark:text-blue-400">
                — max {activeComponent.max_score} pts
                {activeComponent.contributes_to_ca ? ' (counts as CA)' : ''}
              </span>
            </div>
            <button
              onClick={loadStudentsAndScores}
              disabled={loadingStudents}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              <RefreshCw size={12} className={loadingStudents ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Not ready state */}
          {!canLoad && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
              <Info size={28} />
              <p className="text-sm">Select subject, class, and exam session to begin</p>
            </div>
          )}

          {/* Loading */}
          {canLoad && loadingStudents && (
            <div className="flex items-center justify-center h-48 gap-3 text-gray-400">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              <span className="text-sm">Loading students…</span>
            </div>
          )}

          {/* No component selected */}
          {canLoad && !loadingStudents && !selectedComponentId && (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
              <Clock size={28} />
              <p className="text-sm">Select a component above to start recording</p>
            </div>
          )}

          {/* Student table */}
          {canLoad && !loadingStudents && !!selectedComponentId && students.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
              <Users size={28} />
              <p className="text-sm">No students found in this class</p>
            </div>
          )}

          {canLoad && !loadingStudents && !!selectedComponentId && students.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-28">Adm. No.</th>
                  {/* Show other recorded components for context */}
                  {assessmentComponents
                    .filter(c => c.id !== selectedComponentId)
                    .slice(0, 3)
                    .map(c => (
                      <th key={c.id} className="px-3 py-3 text-center text-xs font-semibold text-gray-400 w-20">
                        {c.name}
                        <div className="text-gray-300 font-normal">/{c.max_score}</div>
                      </th>
                    ))}
                  <th className="px-4 py-3 text-center text-xs font-semibold text-blue-600 dark:text-blue-400 w-36">
                    {activeComponent?.name} (/{activeComponent?.max_score})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {students.map((student, idx) => {
                  const existing = student.existingScores[selectedComponentId!];
                  const hasError = !!validationErrors[student.id];
                  return (
                    <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">
                        {student.full_name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{student.admission_number}</td>
                      {/* Other component scores (read-only context) */}
                      {assessmentComponents
                        .filter(c => c.id !== selectedComponentId)
                        .slice(0, 3)
                        .map(c => {
                          const s = student.existingScores[c.id];
                          return (
                            <td key={c.id} className="px-3 py-2.5 text-center text-xs text-gray-400">
                              {s !== undefined && s > 0
                                ? <span className="text-gray-600 font-medium">{s}</span>
                                : <span className="text-gray-200">—</span>}
                            </td>
                          );
                        })}
                      {/* Active component score input */}
                      <td className="px-4 py-2">
                        <div className="flex flex-col items-center gap-0.5">
                          <input
                            type="number"
                            min={0}
                            max={maxScore}
                            step="0.5"
                            value={scoreInputs[student.id] ?? ''}
                            onChange={e => handleScoreChange(student.id, e.target.value)}
                            placeholder={existing !== undefined && existing > 0 ? `${existing}` : '—'}
                            className={`w-20 text-center border rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors ${
                              hasError
                                ? 'border-red-400 bg-red-50 text-red-700'
                                : 'border-blue-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 bg-blue-50'
                            }`}
                          />
                          {hasError && (
                            <span className="text-xs text-red-500">{validationErrors[student.id]}</span>
                          )}
                          {existing !== undefined && existing > 0 && !scoreInputs[student.id] && (
                            <span className="text-xs text-green-600">saved: {existing}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer ── */}
        {canLoad && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 flex-shrink-0 bg-white dark:bg-gray-900">
            <div className="flex-1">
              {saveMsg && (
                <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                  saveMsg.ok
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {saveMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {saveMsg.text}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {students.length} student{students.length !== 1 ? 's' : ''}
              </span>

              <button
                onClick={handleSave}
                disabled={saving || !selectedComponentId || students.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {saving
                  ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /> Saving…</>
                  : <><Save size={15} /> Save {activeComponent?.name || 'Scores'}</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComponentScoreRecordingModal;
