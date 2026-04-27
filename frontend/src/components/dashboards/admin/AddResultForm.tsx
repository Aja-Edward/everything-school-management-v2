/**
 * AddResultForm.tsx
 *
 * Score inputs are driven 100% by AssessmentComponent rows fetched from:
 *   GET /api/results/assessment-components/?education_level=<LEVEL>&is_active=true
 *
 * No hardcoded score fields. Each component gets one numeric input,
 * validated against its max_score. Scores are submitted via:
 *   POST /api/results/<level>/results/              ← creates the result row
 *   POST /api/results/<level>/results/<id>/component-scores/  ← submits scores
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Save, User, Target, RefreshCw, AlertCircle,
  Heart, BookOpen, ChevronDown, Info,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/services/api';
import ResultService from '@/services/ResultService';
import resultSettingsService, { AssessmentComponent } from '@/services/ResultSettingsService';
import type { EducationLevelType } from '@/services/ResultService';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface StudentOption {
  id: string;
  full_name: string;
  student_class: string;
  education_level: EducationLevelType;
  registration_number: string;
}

interface SubjectOption {
  id: number;
  name: string;
  code: string;
}

interface ExamSessionOption {
  id: string;
  name: string;
  exam_type_name: string;
  term_name: string | null;
  academic_session_name: string;
}

interface GradingSystemOption {
  id: number;
  name: string;
  grading_type: string;
  pass_mark: number;
}

interface StreamOption {
  id: number;
  name: string;
}

interface AddResultFormProps {
  onClose: () => void;
  onSuccess: () => void;
  preSelectedStudent?: StudentOption;
}

const EDUCATION_LEVELS: EducationLevelType[] = [
  'NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY',
];

const LEVEL_LABELS: Record<EducationLevelType, string> = {
  NURSERY: 'Nursery',
  PRIMARY: 'Primary',
  JUNIOR_SECONDARY: 'Junior Secondary',
  SENIOR_SECONDARY: 'Senior Secondary',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function extractArray<T>(res: any): T[] {
  if (Array.isArray(res)) return res;
  if (res?.results) return res.results;
  return [];
}

function gradeFromPct(pct: number): string {
  if (pct >= 70) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 45) return 'D';
  if (pct >= 39) return 'E';
  return 'F';
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const AddResultForm: React.FC<AddResultFormProps> = ({
  onClose,
  onSuccess,
  preSelectedStudent,
}) => {
  // ── Dropdown data ────────────────────────────────────────────────────────
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [examSessions, setExamSessions] = useState<ExamSessionOption[]>([]);
  const [gradingSystems, setGradingSystems] = useState<GradingSystemOption[]>([]);
  const [streams, setStreams] = useState<StreamOption[]>([]);
  const [components, setComponents] = useState<AssessmentComponent[]>([]);

  // ── Selection state ──────────────────────────────────────────────────────
  const [levelFilter, setLevelFilter] = useState<EducationLevelType | ''>(
    preSelectedStudent?.education_level || ''
  );
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(
    preSelectedStudent || null
  );
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedGrading, setSelectedGrading] = useState('');
  const [selectedStream, setSelectedStream] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'APPROVED' | 'PUBLISHED'>('DRAFT');
  const [teacherRemark, setTeacherRemark] = useState('');
  const [academicComment, setAcademicComment] = useState('');

  // ── Nursery physical ─────────────────────────────────────────────────────
  const [nurseryTab, setNurseryTab] = useState<'academic' | 'physical'>('academic');
  const [physicalDev, setPhysicalDev] = useState('');
  const [health, setHealth] = useState('');
  const [cleanliness, setCleanliness] = useState('');
  const [generalConduct, setGeneralConduct] = useState('');
  const [heightBegin, setHeightBegin] = useState('');
  const [heightEnd, setHeightEnd] = useState('');
  const [weightBegin, setWeightBegin] = useState('');
  const [weightEnd, setWeightEnd] = useState('');
  const [maxMarks, setMaxMarks] = useState('100');
  const [markObtained, setMarkObtained] = useState('');

  // ── Dynamic component scores: { componentId → score string } ─────────────
  const [componentScores, setComponentScores] = useState<Record<number, string>>({});

  // ── Loading / UI state ───────────────────────────────────────────────────
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isNursery = selectedStudent?.education_level === 'NURSERY';

  // ── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const [sessions, grading] = await Promise.all([
          ResultService.getExamSessions(),
          resultSettingsService.getGradingSystems(),
        ]);
        setExamSessions(
          sessions.map((s: any) => ({
            id: s.id,
            name: s.name,
            exam_type_name: s.exam_type_name || s.exam_type?.name || '',
            term_name: s.term_name,
            academic_session_name: s.academic_session_name || s.academic_session?.name || '',
          }))
        );
        setGradingSystems(
          extractArray<GradingSystemOption>(grading).map((g: any) => ({
            id: g.id,
            name: g.name,
            grading_type: g.grading_type,
            pass_mark: g.pass_mark,
          }))
        );
        if (preSelectedStudent) {
          await loadForLevel(preSelectedStudent.education_level);
        }
      } catch (e) {
        console.error('Init error:', e);
      } finally {
        setLoadingInit(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load subjects + components when level changes ────────────────────────
  const loadForLevel = useCallback(async (level: EducationLevelType) => {
    try {
      setLoadingComponents(true);
      const [subRes, compRes] = await Promise.all([
        api.get('/api/subjects/', { params: { education_level: level, is_active: true } }),
        resultSettingsService.getAssessmentComponents({ education_level: level, is_active: true }),
      ]);
      setSubjects(extractArray<SubjectOption>(subRes));
      const sorted = [...compRes].sort((a, b) => a.display_order - b.display_order);
      setComponents(sorted);
      setComponentScores({});
      if (level === 'SENIOR_SECONDARY') {
        const streamRes = await api.get('/api/classroom/streams/');
        setStreams(extractArray<StreamOption>(streamRes));
      } else {
        setStreams([]);
      }
    } catch (e) {
      console.error('loadForLevel error:', e);
      toast.error('Failed to load subjects or components');
    } finally {
      setLoadingComponents(false);
    }
  }, []);

  // ── Load students when level filter changes ──────────────────────────────
  useEffect(() => {
    if (!levelFilter) return;
    const load = async () => {
      setLoadingStudents(true);
      try {
        const res = await api.get('/api/students/students/', {
          params: { education_level: levelFilter },
        });
        setStudents(extractArray<StudentOption>(res));
      } catch (e) {
        console.error('loadStudents error:', e);
      } finally {
        setLoadingStudents(false);
      }
    };
    load();
    loadForLevel(levelFilter as EducationLevelType);
    setSelectedStudent(null);
    setSelectedSubject('');
  }, [levelFilter, loadForLevel]);

  // ── Derived: CA total, exam total, overall ───────────────────────────────
  const caComponents = components.filter((c) => c.contributes_to_ca);
  const examComponents = components.filter((c) => !c.contributes_to_ca);

  const caTotal = caComponents.reduce((sum, c) => {
    return sum + (parseFloat(componentScores[c.id] || '0') || 0);
  }, 0);

  const examTotal = examComponents.reduce((sum, c) => {
    return sum + (parseFloat(componentScores[c.id] || '0') || 0);
  }, 0);

  const totalScore = caTotal + examTotal;

  const maxPossible = components.reduce((sum, c) => sum + parseFloat(c.max_score), 0);

  const percentage = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;

  const overallGrade = components.length > 0 ? gradeFromPct(percentage) : '—';

  // Nursery grade/percentage
  const nurseryPct =
    parseFloat(maxMarks) > 0
      ? (parseFloat(markObtained || '0') / parseFloat(maxMarks)) * 100
      : 0;

  // ── Validation ───────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!selectedStudent) errs.student = 'Please select a student';
    if (!selectedSubject) errs.subject = 'Please select a subject';
    if (!selectedSession) errs.session = 'Please select an exam session';
    if (!selectedGrading) errs.grading = 'Please select a grading system';

    if (isNursery) {
      const mark = parseFloat(markObtained || '0');
      const max = parseFloat(maxMarks || '0');
      if (max <= 0) errs.maxMarks = 'Max marks must be greater than 0';
      if (mark < 0 || mark > max) errs.markObtained = `Mark must be between 0 and ${max}`;
    } else {
      components.forEach((c) => {
        const score = parseFloat(componentScores[c.id] || '0');
        const max = parseFloat(c.max_score);
        if (score < 0 || score > max) {
          errs[`comp_${c.id}`] = `Max ${max}`;
        }
      });
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !selectedStudent) return;

    setSubmitting(true);
    try {
      const level = selectedStudent.education_level;

      // 1. Create the result row (no scores yet)
      const basePayload: Record<string, unknown> = {
        student: selectedStudent.id,
        subject: selectedSubject,
        exam_session: selectedSession,
        grading_system: selectedGrading,
        status,
      };
      if (level === 'SENIOR_SECONDARY' && selectedStream) {
        basePayload.stream = selectedStream;
      }
      if (isNursery) {
        basePayload.mark_obtained = parseFloat(markObtained || '0');
        basePayload.max_marks_obtainable = parseFloat(maxMarks);
        basePayload.academic_comment = academicComment || teacherRemark;
      } else {
        basePayload.teacher_remark = teacherRemark;
      }

      const created = await ResultService.createSubjectResult(level, basePayload);
      const resultId = created?.id;

      // 2. Submit component scores (non-nursery, if components exist)
      if (!isNursery && components.length > 0 && resultId) {
        const scores = components
          .filter((c) => componentScores[c.id] !== undefined && componentScores[c.id] !== '')
          .map((c) => ({ component_id: c.id, score: componentScores[c.id] }));

        if (scores.length > 0) {
          await api.post(
            `/api/results/${levelPath(level)}/results/${resultId}/component-scores/`,
            { scores }
          );
        }
      }

      // 3. Nursery: patch term report physical dev data
      if (isNursery && resultId) {
        try {
          const trRes = await api.get('/api/results/nursery/term-reports/', {
            params: { student: selectedStudent.id, exam_session: selectedSession },
          });
          const reports = extractArray<any>(trRes);
          if (reports.length > 0) {
            await api.patch(`/api/results/nursery/term-reports/${reports[0].id}/`, {
              physical_development: physicalDev,
              health,
              cleanliness,
              general_conduct: generalConduct,
              height_beginning: heightBegin || null,
              height_end: heightEnd || null,
              weight_beginning: weightBegin || null,
              weight_end: weightEnd || null,
            });
          }
        } catch (physErr) {
          console.warn('Could not save physical development data:', physErr);
        }
      }

      toast.success('Result recorded successfully!');
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to create result';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-10 flex items-center gap-4 shadow-2xl">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-600" />
          <span className="text-slate-700 font-medium">Loading form…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Record New Result</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Score inputs are loaded from your configured assessment components
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* ── Section 1: Student Selection ── */}
          <div className="bg-slate-50 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <User className="w-4 h-4" /> Student Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!preSelectedStudent && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Education Level *
                  </label>
                  <div className="relative">
                    <select
                      value={levelFilter}
                      onChange={(e) => setLevelFilter(e.target.value as EducationLevelType)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none appearance-none"
                    >
                      <option value="">Select level…</option>
                      {EDUCATION_LEVELS.map((l) => (
                        <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {!preSelectedStudent && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Student *
                  </label>
                  <div className="relative">
                    <select
                      value={selectedStudent?.id || ''}
                      onChange={(e) => {
                        const s = students.find((st) => st.id === e.target.value) || null;
                        setSelectedStudent(s);
                      }}
                      disabled={!levelFilter || loadingStudents}
                      className={`w-full px-3 py-2.5 border rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none appearance-none ${
                        errors.student ? 'border-red-400' : 'border-slate-300'
                      }`}
                    >
                      <option value="">
                        {loadingStudents ? 'Loading…' : 'Select student…'}
                      </option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} — {s.student_class}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                  {errors.student && <p className="text-red-500 text-xs mt-1">{errors.student}</p>}
                </div>
              )}

              {preSelectedStudent && (
                <div className="sm:col-span-2">
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{preSelectedStudent.full_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {preSelectedStudent.student_class} · {LEVEL_LABELS[preSelectedStudent.education_level]}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Subject, Session, Grading, Stream */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Subject *
                </label>
                <div className="relative">
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    disabled={!levelFilter}
                    className={`w-full px-3 py-2.5 border rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none appearance-none ${
                      errors.subject ? 'border-red-400' : 'border-slate-300'
                    }`}
                  >
                    <option value="">Select subject…</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                {errors.subject && <p className="text-red-500 text-xs mt-1">{errors.subject}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Exam Session *
                </label>
                <div className="relative">
                  <select
                    value={selectedSession}
                    onChange={(e) => setSelectedSession(e.target.value)}
                    className={`w-full px-3 py-2.5 border rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none appearance-none ${
                      errors.session ? 'border-red-400' : 'border-slate-300'
                    }`}
                  >
                    <option value="">Select session…</option>
                    {examSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.term_name || s.exam_type_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                {errors.session && <p className="text-red-500 text-xs mt-1">{errors.session}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Grading System *
                </label>
                <div className="relative">
                  <select
                    value={selectedGrading}
                    onChange={(e) => setSelectedGrading(e.target.value)}
                    className={`w-full px-3 py-2.5 border rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none appearance-none ${
                      errors.grading ? 'border-red-400' : 'border-slate-300'
                    }`}
                  >
                    <option value="">Select grading system…</option>
                    {gradingSystems.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                {errors.grading && <p className="text-red-500 text-xs mt-1">{errors.grading}</p>}
              </div>

              {selectedStudent?.education_level === 'SENIOR_SECONDARY' && streams.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Stream
                  </label>
                  <div className="relative">
                    <select
                      value={selectedStream}
                      onChange={(e) => setSelectedStream(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none appearance-none"
                    >
                      <option value="">No stream</option>
                      {streams.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Status
                </label>
                <div className="relative">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none appearance-none"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="APPROVED">Approved</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 2: Scores ── */}
          {selectedStudent && (
            <div className="bg-slate-50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
                <Target className="w-4 h-4" /> Assessment Scores
                {selectedStudent && (
                  <span className="ml-auto text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                    {LEVEL_LABELS[selectedStudent.education_level]}
                  </span>
                )}
              </h3>

              {/* NURSERY */}
              {isNursery && (
                <>
                  {/* Tabs */}
                  <div className="flex border-b border-slate-200 mb-4">
                    {(['academic', 'physical'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setNurseryTab(tab)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                          nurseryTab === tab
                            ? 'border-slate-900 text-slate-900'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {tab === 'academic' ? <BookOpen className="w-3.5 h-3.5" /> : <Heart className="w-3.5 h-3.5" />}
                        {tab === 'academic' ? 'Academic' : 'Physical Development'}
                      </button>
                    ))}
                  </div>

                  {nurseryTab === 'academic' ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <ScoreInput
                          label="Max Marks Obtainable"
                          value={maxMarks}
                          onChange={setMaxMarks}
                          max={999}
                          error={errors.maxMarks}
                        />
                        <ScoreInput
                          label="Mark Obtained"
                          value={markObtained}
                          onChange={setMarkObtained}
                          max={parseFloat(maxMarks) || 100}
                          error={errors.markObtained}
                        />
                      </div>
                      {markObtained && parseFloat(maxMarks) > 0 && (
                        <ScoreSummary
                          total={parseFloat(markObtained || '0')}
                          max={parseFloat(maxMarks)}
                          pct={nurseryPct}
                          grade={gradeFromPct(nurseryPct)}
                        />
                      )}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                          Academic Comment
                        </label>
                        <textarea
                          value={academicComment}
                          onChange={(e) => setAcademicComment(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none"
                          placeholder="Enter academic comment…"
                        />
                      </div>
                    </div>
                  ) : (
                    <NurseryPhysicalFields
                      physicalDev={physicalDev} setPhysicalDev={setPhysicalDev}
                      health={health} setHealth={setHealth}
                      cleanliness={cleanliness} setCleanliness={setCleanliness}
                      generalConduct={generalConduct} setGeneralConduct={setGeneralConduct}
                      heightBegin={heightBegin} setHeightBegin={setHeightBegin}
                      heightEnd={heightEnd} setHeightEnd={setHeightEnd}
                      weightBegin={weightBegin} setWeightBegin={setWeightBegin}
                      weightEnd={weightEnd} setWeightEnd={setWeightEnd}
                    />
                  )}
                </>
              )}

              {/* NON-NURSERY: dynamic component inputs */}
              {!isNursery && (
                <>
                  {loadingComponents ? (
                    <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Loading assessment components…
                    </div>
                  ) : components.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">No components configured</p>
                        <p className="text-xs text-amber-700 mt-1">
                          Go to Settings → Exams & Results → Assessment Components and add components
                          for {LEVEL_LABELS[selectedStudent.education_level]} before recording scores.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* CA components */}
                      {caComponents.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                            Continuous Assessment
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {caComponents.map((c) => (
                              <ScoreInput
                                key={c.id}
                                label={`${c.name} (max ${c.max_score})`}
                                value={componentScores[c.id] || ''}
                                onChange={(v) =>
                                  setComponentScores((prev) => ({ ...prev, [c.id]: v }))
                                }
                                max={parseFloat(c.max_score)}
                                error={errors[`comp_${c.id}`]}
                              />
                            ))}
                          </div>
                          <div className="mt-2 text-right text-xs text-slate-500">
                            CA Total: <strong className="text-slate-900">{caTotal.toFixed(1)}</strong>
                          </div>
                        </div>
                      )}

                      {/* Exam components */}
                      {examComponents.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                            Examination
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {examComponents.map((c) => (
                              <ScoreInput
                                key={c.id}
                                label={`${c.name} (max ${c.max_score})`}
                                value={componentScores[c.id] || ''}
                                onChange={(v) =>
                                  setComponentScores((prev) => ({ ...prev, [c.id]: v }))
                                }
                                max={parseFloat(c.max_score)}
                                error={errors[`comp_${c.id}`]}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Summary */}
                      {totalScore > 0 && (
                        <ScoreSummary
                          total={totalScore}
                          max={maxPossible}
                          pct={percentage}
                          grade={overallGrade}
                        />
                      )}
                    </div>
                  )}

                  {/* Teacher remark */}
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      Teacher Remark
                    </label>
                    <textarea
                      value={teacherRemark}
                      onChange={(e) => setTeacherRemark(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none"
                      placeholder="Enter teacher remark…"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedStudent || !selectedSubject || !selectedSession}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                <><Save className="w-4 h-4" /> Record Result</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function ScoreInput({
  label, value, onChange, max, error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        max={max}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none ${
          error ? 'border-red-400 bg-red-50' : 'border-slate-300'
        }`}
        placeholder={`0–${max}`}
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  );
}

function ScoreSummary({
  total, max, pct, grade,
}: {
  total: number;
  max: number;
  pct: number;
  grade: string;
}) {
  const gradeColors: Record<string, string> = {
    A: 'text-emerald-700 bg-emerald-50',
    B: 'text-blue-700 bg-blue-50',
    C: 'text-amber-700 bg-amber-50',
    D: 'text-orange-700 bg-orange-50',
    E: 'text-red-600 bg-red-50',
    F: 'text-red-800 bg-red-100',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-slate-500">Total Score</p>
        <p className="text-xl font-bold text-slate-900">
          {total.toFixed(1)}<span className="text-sm font-normal text-slate-400">/{max.toFixed(1)}</span>
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{pct.toFixed(1)}%</p>
      </div>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${gradeColors[grade] || 'text-slate-600 bg-slate-50'}`}>
        {grade}
      </div>
    </div>
  );
}

const PHYSICAL_OPTIONS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];

function NurseryPhysicalFields({
  physicalDev, setPhysicalDev,
  health, setHealth,
  cleanliness, setCleanliness,
  generalConduct, setGeneralConduct,
  heightBegin, setHeightBegin,
  heightEnd, setHeightEnd,
  weightBegin, setWeightBegin,
  weightEnd, setWeightEnd,
}: Record<string, string | ((v: string) => void)>) {
  const rating = (label: string, value: string, onChange: (v: string) => void) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <select
          value={value as string}
          onChange={(e) => (onChange as (v: string) => void)(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-slate-900 outline-none appearance-none"
        >
          <option value="">Select…</option>
          {PHYSICAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {rating('Physical Development', physicalDev as string, setPhysicalDev as (v: string) => void)}
        {rating('Health', health as string, setHealth as (v: string) => void)}
        {rating('Cleanliness', cleanliness as string, setCleanliness as (v: string) => void)}
        {rating('General Conduct', generalConduct as string, setGeneralConduct as (v: string) => void)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['Height (Begin) cm', 'Height (End) cm', 'Weight (Begin) kg', 'Weight (End) kg'] as const).map(
          (lbl, i) => {
            const vals = [heightBegin, heightEnd, weightBegin, weightEnd] as string[];
            const setters = [setHeightBegin, setHeightEnd, setWeightBegin, setWeightEnd] as ((v: string) => void)[];
            return (
              <div key={lbl}>
                <label className="block text-xs font-medium text-slate-600 mb-1">{lbl}</label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={vals[i]}
                  onChange={(e) => setters[i](e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

function levelPath(level: EducationLevelType): string {
  const map: Record<EducationLevelType, string> = {
    NURSERY: 'nursery',
    PRIMARY: 'primary',
    JUNIOR_SECONDARY: 'junior-secondary',
    SENIOR_SECONDARY: 'senior-secondary',
  };
  return map[level];
}


export default AddResultForm;