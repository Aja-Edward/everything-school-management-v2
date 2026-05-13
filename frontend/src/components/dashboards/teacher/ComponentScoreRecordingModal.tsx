import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, CheckCircle2, AlertCircle, Save, RefreshCw,
  Info, Users, ClipboardList, ChevronDown,
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
  existingScores: Record<number, number>;
  resultId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  assignments: Assignment[];
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ComponentScoreRecordingModal: React.FC<Props> = ({ open, onClose, assignments }) => {

  // ── Selectors ──────────────────────────────────────────────────────────────
  const [selectedSubjectId,   setSelectedSubjectId]   = useState<number>(0);
  const [selectedClassroomId, setSelectedClassroomId] = useState<number>(0);
  const [selectedSessionId,   setSelectedSessionId]   = useState<string>('');

  // ── Reference data ─────────────────────────────────────────────────────────
  const [examSessions,         setExamSessions]         = useState<ExamSession[]>([]);
  const [assessmentComponents, setAssessmentComponents] = useState<AssessmentComponentInfo[]>([]);
  const [students,             setStudents]             = useState<StudentRow[]>([]);

  // scoreInputs keyed as `${studentId}:${componentId}`
  const [scoreInputs,      setScoreInputs]      = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors]  = useState<Record<string, string>>({});
  const [loadingStudents,  setLoadingStudents]   = useState(false);
  const [saving,           setSaving]            = useState(false);
  const [saveMsg,          setSaveMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const subjects = useMemo(() => {
    const seen = new Set<number>();
    return assignments.filter(a => {
      if (seen.has(a.subject_id)) return false;
      seen.add(a.subject_id);
      return true;
    });
  }, [assignments]);

  const classroomsForSubject = useMemo(() =>
    assignments
      .filter(a => a.subject_id === selectedSubjectId && a.classroom_id)
      .map(a => ({ id: a.classroom_id!, name: a.classroom_name })),
  [assignments, selectedSubjectId]);

  const educationLevel = useMemo(() => {
    const a = assignments.find(
      a => a.subject_id === selectedSubjectId && a.classroom_id === selectedClassroomId
    );
    return a?.education_level as EducationLevelType | undefined;
  }, [assignments, selectedSubjectId, selectedClassroomId]);

  const teacherEducationLevels = useMemo(() => {
    const levels = new Set<string>();
    assignments.forEach(a => { if (a.education_level) levels.add(a.education_level); });
    return levels;
  }, [assignments]);

  const canLoad = !!selectedClassroomId && !!selectedSessionId && !!selectedSubjectId;

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    ResultService.getExamSessions().then(setExamSessions).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelectedSubjectId(subjects[0]?.subject_id ?? 0);
    setScoreInputs({});
    setSaveMsg(null);
  }, [open]);

  useEffect(() => {
    setSelectedClassroomId(classroomsForSubject[0]?.id ?? 0);
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!educationLevel) return;
    ResultService.getAssessmentComponents({ is_active: true, page_size: 50 })
      .then(all => {
        const filtered = all.filter(c => {
          const levelType = c.education_level_detail?.level_type;
          if (!levelType) return c.is_active !== false;
          return teacherEducationLevels.has(levelType);
        });
        setAssessmentComponents(filtered.sort((a, b) => a.display_order - b.display_order));
      })
      .catch(() => setAssessmentComponents([]))
  }, [educationLevel, teacherEducationLevels]);

  const loadStudentsAndScores = useCallback(async () => {
    if (!selectedClassroomId || !selectedSessionId || !selectedSubjectId || !educationLevel) return;
    setLoadingStudents(true);
    try {
      const studentsRaw: any[] = await ClassroomService.getClassroomStudents(selectedClassroomId)
        .then((r: any) => Array.isArray(r) ? r : r?.results ?? []);

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
        const sid      = String(s.id ?? s.student_id ?? '');
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

      // Pre-fill inputs from existing scores
      const inputs: Record<string, string> = {};
      rows.forEach(row => {
        Object.entries(row.existingScores).forEach(([cid, score]) => {
          if (score > 0) inputs[`${row.id}:${cid}`] = String(score);
        });
      });
      setScoreInputs(inputs);
    } catch {
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }, [selectedClassroomId, selectedSessionId, selectedSubjectId, educationLevel]);

  useEffect(() => { loadStudentsAndScores(); }, [loadStudentsAndScores]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleScoreChange = (studentId: string, componentId: number, raw: string) => {
    const key = `${studentId}:${componentId}`;
    setScoreInputs(prev => ({ ...prev, [key]: raw }));
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedSessionId || !educationLevel || assessmentComponents.length === 0) return;

    const errors: Record<string, string> = {};
    students.forEach(s => {
      assessmentComponents.forEach(comp => {
        const key = `${s.id}:${comp.id}`;
        const raw = scoreInputs[key];
        if (raw === '' || raw === undefined) return;
        const n = parseFloat(raw);
        const max = parseFloat(comp.max_score);
        if (isNaN(n) || n < 0) errors[key] = `Must be ≥ 0`;
        else if (n > max) errors[key] = `Max ${max}`;
      });
    });
    if (Object.keys(errors).length > 0) { setValidationErrors(errors); return; }

    setSaving(true); setSaveMsg(null);
    try {
      const entries: BulkComponentScoreEntry[] = students
        .filter(s =>
          assessmentComponents.some(comp => {
            const key = `${s.id}:${comp.id}`;
            return scoreInputs[key] !== '' && scoreInputs[key] !== undefined;
          })
        )
        .map(s => ({
          student:      s.id,
          subject:      selectedSubjectId,
          exam_session: selectedSessionId,
          scores: assessmentComponents
            .filter(comp => {
              const key = `${s.id}:${comp.id}`;
              return scoreInputs[key] !== '' && scoreInputs[key] !== undefined;
            })
            .map(comp => ({
              component_id: comp.id,
              score: parseFloat(scoreInputs[`${s.id}:${comp.id}`] || '0'),
            })),
        }));

      if (entries.length === 0) {
        setSaveMsg({ ok: false, text: 'No scores entered yet.' });
        return;
      }
      await ResultService.bulkRecordComponentScores(educationLevel, entries);
      setSaveMsg({ ok: true, text: `Scores saved for ${entries.length} student(s).` });
      await loadStudentsAndScores();
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e?.message || 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!open) return null;

  const selectedSubject = subjects.find(s => s.subject_id === selectedSubjectId);
  const selectedSession = examSessions.find(s => String(s.id) === selectedSessionId);

  const completedStudents = students.filter(s =>
    assessmentComponents.every(c => (s.existingScores[c.id] ?? 0) > 0)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">

      {/* ── Top Bar ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">

        {/* Title row */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600">
              <ClipboardList size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 leading-tight">Record Component Scores</h2>
              <p className="text-xs text-gray-400 mt-0.5">All components shown per student — fill any score and save</p>
            </div>
          </div>

          {/* Right side: summary chips + close */}
          <div className="flex items-center gap-3">
            {students.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5">
                  <Users size={12} className="text-gray-500" />
                  <span className="text-xs font-semibold text-gray-600">{students.length} Students</span>
                </div>
                <div className="flex items-center gap-1.5 bg-emerald-50 rounded-lg px-3 py-1.5">
                  <CheckCircle2 size={12} className="text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700">
                    {completedStudents}/{students.length} Complete
                  </span>
                </div>
              </>
            )}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all border border-gray-200"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-end gap-4 px-6 py-3 flex-wrap">
          {/* Subject */}
          <div className="flex-1 min-w-[160px] max-w-[220px]">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Subject</label>
            <div className="relative">
              <select
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(Number(e.target.value))}
                className="w-full h-8 border border-gray-200 rounded-lg pl-3 pr-8 text-xs font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 appearance-none cursor-pointer"
              >
                <option value={0}>Select subject…</option>
                {subjects.map(s => (
                  <option key={s.subject_id} value={s.subject_id}>
                    {s.subject_name} ({s.subject_code})
                  </option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Class */}
          <div className="flex-1 min-w-[140px] max-w-[180px]">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Class</label>
            <div className="relative">
              <select
                value={selectedClassroomId}
                onChange={e => setSelectedClassroomId(Number(e.target.value))}
                disabled={!selectedSubjectId}
                className="w-full h-8 border border-gray-200 rounded-lg pl-3 pr-8 text-xs font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 appearance-none cursor-pointer disabled:opacity-40"
              >
                <option value={0}>Select class…</option>
                {classroomsForSubject.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Exam Session */}
          <div className="flex-1 min-w-[160px] max-w-[220px]">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Exam Session</label>
            <div className="relative">
              <select
                value={selectedSessionId}
                onChange={e => setSelectedSessionId(e.target.value)}
                className="w-full h-8 border border-gray-200 rounded-lg pl-3 pr-8 text-xs font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 appearance-none cursor-pointer"
              >
                <option value="">Select session…</option>
                {examSessions.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Divider */}
          <div className="h-8 w-px bg-gray-200 self-end mb-0.5" />

          {/* Context chips */}
          {selectedSubject && (
            <div className="self-end mb-0.5 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                {selectedSubject.subject_name}
              </span>
              {selectedSession && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
                  {selectedSession.name}
                </span>
              )}
              {assessmentComponents.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">
                  {assessmentComponents.length} component{assessmentComponents.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          <div className="ml-auto self-end">
            <button
              onClick={loadStudentsAndScores}
              disabled={!canLoad || loadingStudents}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <RefreshCw size={11} className={loadingStudents ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Table Area ── */}
      <div className="flex-1 min-h-0 overflow-auto bg-gray-50">

        {/* Not ready */}
        {!canLoad && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-gray-200">
              <Info size={24} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">Select a subject, class, and exam session to begin</p>
          </div>
        )}

        {/* Loading */}
        {canLoad && loadingStudents && (
          <div className="flex items-center justify-center h-full gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
            <span className="text-sm text-gray-400">Loading students…</span>
          </div>
        )}

        {/* No students */}
        {canLoad && !loadingStudents && students.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-gray-200">
              <Users size={24} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">No students found in this class</p>
          </div>
        )}

        {/* No components */}
        {canLoad && !loadingStudents && students.length > 0 && assessmentComponents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-gray-200">
              <ClipboardList size={24} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">No assessment components configured for this level</p>
          </div>
        )}

        {/* ── MAIN TABLE ── */}
        {canLoad && !loadingStudents && students.length > 0 && assessmentComponents.length > 0 && (
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {/* # */}
              <col style={{ width: '48px' }} />
              {/* Student name */}
              <col style={{ width: '220px' }} />
              {/* Adm No */}
              <col style={{ width: '110px' }} />
              {/* One col per component */}
              {assessmentComponents.map(c => (
                <col key={c.id} style={{ width: `${Math.max(90, Math.floor((window.innerWidth - 490) / assessmentComponents.length))}px` }} />
              ))}
            </colgroup>

            <thead className="sticky top-0 z-20">
              <tr className="bg-white border-b-2 border-gray-200">
                <th className="text-center py-3 px-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">#</span>
                </th>
                <th className="text-left py-3 px-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Student Name</span>
                </th>
                <th className="text-left py-3 px-3">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Adm. No.</span>
                </th>
                {assessmentComponents.map(comp => (
                  <th key={comp.id} className="text-center py-3 px-2">
                    <div className={`inline-flex flex-col items-center px-2.5 py-1 rounded-lg ${
                      comp.contributes_to_ca
                        ? 'bg-indigo-50 border border-indigo-100'
                        : 'bg-amber-50 border border-amber-100'
                    }`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wide leading-tight ${
                        comp.contributes_to_ca ? 'text-indigo-600' : 'text-amber-600'
                      }`}>
                        {comp.name}
                      </span>
                      <span className={`text-[9px] font-medium ${
                        comp.contributes_to_ca ? 'text-indigo-400' : 'text-amber-400'
                      }`}>
                        /{comp.max_score} pts
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {students.map((student, idx) => {
                const isEven = idx % 2 === 0;
                const isFullyComplete = assessmentComponents.every(c => (student.existingScores[c.id] ?? 0) > 0);

                return (
                  <tr
                    key={student.id}
                    className={`transition-colors ${
                      isEven ? 'bg-white' : 'bg-gray-50/60'
                    } hover:bg-indigo-50/30 ${
                      isFullyComplete ? 'border-l-2 border-l-emerald-400' : 'border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* Row number */}
                    <td className="py-2 px-2 text-center">
                      <span className={`text-[11px] font-bold tabular-nums rounded-md px-1.5 py-0.5 ${
                        isFullyComplete
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </td>

                    {/* Student name */}
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isFullyComplete
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-indigo-100 text-indigo-600'
                        }`}>
                          {student.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-medium text-gray-800 truncate">
                          {student.full_name}
                        </span>
                      </div>
                    </td>

                    {/* Admission number */}
                    <td className="py-2 px-3">
                      <span className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded truncate block">
                        {student.admission_number}
                      </span>
                    </td>

                    {/* Score input per component */}
                    {assessmentComponents.map(comp => {
                      const key      = `${student.id}:${comp.id}`;
                      const hasError = !!validationErrors[key];
                      const existing = student.existingScores[comp.id];
                      const hasExisting = existing !== undefined && existing > 0;
                      const currentVal = scoreInputs[key];
                      const isFilled = currentVal !== '' && currentVal !== undefined;
                      const max = parseFloat(comp.max_score);

                      return (
                        <td key={comp.id} className="py-1.5 px-2 text-center">
                          <div className="relative inline-flex flex-col items-center gap-0.5">
                            <input
                              type="number"
                              min={0}
                              max={max}
                              step="0.5"
                              value={currentVal ?? ''}
                              onChange={e => handleScoreChange(student.id, comp.id, e.target.value)}
                              onFocus={e => e.target.select()}
                              placeholder={hasExisting ? String(existing) : '—'}
                              className={`w-16 h-8 text-center rounded-lg text-[13px] font-bold tabular-nums transition-all focus:outline-none focus:ring-2 border ${
                                hasError
                                  ? 'border-red-300 bg-red-50 text-red-600 focus:ring-red-400/30 focus:border-red-400'
                                  : isFilled
                                    ? comp.contributes_to_ca
                                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 focus:ring-indigo-400/30 focus:border-indigo-500'
                                      : 'border-amber-300 bg-amber-50 text-amber-700 focus:ring-amber-400/30 focus:border-amber-500'
                                    : hasExisting
                                      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 focus:ring-emerald-400/30 focus:border-emerald-400'
                                      : 'border-gray-200 bg-white text-gray-700 focus:ring-indigo-400/30 focus:border-indigo-400'
                              }`}
                            />
                            {hasError && (
                              <span className="text-[9px] text-red-500 font-semibold leading-none">
                                {validationErrors[key]}
                              </span>
                            )}
                            {hasExisting && !isFilled && !hasError && (
                              <span className="text-[9px] text-emerald-500 font-semibold leading-none">
                                ✓ {existing}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between gap-4">

        {/* Left: legend */}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-indigo-100 border border-indigo-200 inline-block" />
            CA Component
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200 inline-block" />
            Exam Component
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 border-l-2 border-emerald-400 h-3 inline-block" />
            All scores filled
          </span>
        </div>

        {/* Center: save message */}
        <div className="flex-1 flex justify-center">
          {saveMsg && (
            <div className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg ${
              saveMsg.ok
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-600 border border-red-200'
            }`}>
              {saveMsg.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {saveMsg.text}
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving || students.length === 0 || assessmentComponents.length === 0 || !canLoad}
            className="inline-flex items-center gap-2 h-9 px-5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/40 shadow-sm shadow-indigo-200"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save size={13} />
                Save All Scores
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComponentScoreRecordingModal;
