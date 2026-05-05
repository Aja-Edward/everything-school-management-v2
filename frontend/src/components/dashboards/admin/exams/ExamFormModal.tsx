import React, { useState, useEffect, useMemo } from 'react';
import {
  X, ChevronRight, AlertCircle, CheckCircle2,
  FileText, List, BookOpen, FlaskConical, LayoutGrid, Settings2,
} from 'lucide-react';
import {
  Exam, ExamCreateData, ExamService,
  PrintSettings, DEFAULT_PRINT_SETTINGS,
} from '@/services/ExamService';
import {
  ObjectiveQuestion, TheoryQuestion, PracticalQuestion, CustomSection,
} from '@/types/types';
import QuestionSectionObjectives from './QuestionSectionObjectives';
import QuestionSectionTheory from './QuestionSectionTheory';
import QuestionSectionPractical from './QuestionSectionPractical';
import QuestionSectionCustom from './QuestionSectionCustom';
import ClassroomService from '@/services/ClassroomService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExamFormModalProps {
  open: boolean;
  exam?: Exam | null;
  onClose: () => void;
  onSubmit: (data: ExamCreateData) => void;
}

type Tab = 'details' | 'mcq' | 'theory' | 'practical' | 'custom' | 'print';

const TABS: { key: Tab; label: string; icon: React.ReactNode; section: string }[] = [
  { key: 'details',   label: 'Details',       icon: <FileText size={15} />,     section: '' },
  { key: 'mcq',       label: 'Section A – MCQ',   icon: <List size={15} />,     section: 'A' },
  { key: 'theory',    label: 'Section B – Theory', icon: <BookOpen size={15} />, section: 'B' },
  { key: 'practical', label: 'Section C – Practical', icon: <FlaskConical size={15} />, section: 'C' },
  { key: 'custom',    label: 'Section D – Custom', icon: <LayoutGrid size={15} />, section: 'D' },
  { key: 'print',     label: 'Print Settings',  icon: <Settings2 size={15} />, section: '' },
];

// ─── Print settings panel ─────────────────────────────────────────────────────

const PrintSettingsPanel: React.FC<{
  value: PrintSettings;
  onChange: (v: PrintSettings) => void;
}> = ({ value, onChange }) => {
  const set = <K extends keyof PrintSettings>(k: K, v: PrintSettings[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Font Family</label>
        <select
          value={value.font_family}
          onChange={e => set('font_family', e.target.value as PrintSettings['font_family'])}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="times_new_roman">Times New Roman</option>
          <option value="arial">Arial</option>
          <option value="georgia">Georgia</option>
          <option value="calibri">Calibri</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Font Size — {value.font_size}pt
        </label>
        <input
          type="range" min={10} max={14} step={1}
          value={value.font_size}
          onChange={e => set('font_size', Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>10pt</span><span>12pt</span><span>14pt</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Line Spacing</label>
        <div className="flex gap-2">
          {([1.0, 1.5, 2.0] as const).map(v => (
            <button
              key={v} type="button"
              onClick={() => set('line_height', v)}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                value.line_height === v
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {v === 1.0 ? 'Single' : v === 1.5 ? '1.5×' : 'Double'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">MCQ Option Layout</label>
        <div className="flex gap-2">
          {(['auto', 'inline', 'stacked'] as const).map(v => (
            <button
              key={v} type="button"
              onClick={() => set('option_layout', v)}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${
                value.option_layout === v
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {v === 'auto' ? 'Auto (Smart)' : v}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Auto: options flow inline after short questions; stack after long ones.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Column Layout</label>
        <div className="flex gap-2">
          {([1, 2] as const).map(v => (
            <button
              key={v} type="button"
              onClick={() => set('column_layout', v)}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                value.column_layout === v
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {v === 1 ? '1 Column' : '2 Columns'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Page Margins</label>
        <div className="flex gap-2">
          {(['narrow', 'normal', 'wide'] as const).map(v => (
            <button
              key={v} type="button"
              onClick={() => set('margin', v)}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${
                value.margin === v
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">Normal = 1 inch all sides (default).</p>
      </div>

      <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
        <span className="text-sm font-medium text-gray-700">Show marks per question</span>
        <button
          type="button"
          onClick={() => set('show_marks', !value.show_marks)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            value.show_marks ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            value.show_marks ? 'translate-x-5' : ''
          }`} />
        </button>
      </div>

      <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
        <span className="text-sm font-medium text-gray-700">Show section instructions</span>
        <button
          type="button"
          onClick={() => set('show_instructions', !value.show_instructions)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            value.show_instructions ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            value.show_instructions ? 'translate-x-5' : ''
          }`} />
        </button>
      </div>
    </div>
  );
};

// ─── Form input helper ────────────────────────────────────────────────────────

const Field: React.FC<{
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}> = ({ label, required, hint, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const ExamFormModal: React.FC<ExamFormModalProps> = ({ open, exam, onClose, onSubmit }) => {
  const isEdit = !!exam?.id;

  // ── Basic form state ───────────────────────────────────────────────────────
  const [title,             setTitle]             = useState('');
  const [description,       setDescription]       = useState('');
  const [subject,           setSubject]           = useState<number>(0);
  const [gradeLevel,        setGradeLevel]        = useState<number>(0);
  const [examType,          setExamType]          = useState('quiz');
  const [difficulty,        setDifficulty]        = useState('medium');
  const [examDate,          setExamDate]          = useState('');
  const [startTime,         setStartTime]         = useState('');
  const [endTime,           setEndTime]           = useState('');
  const [totalMarks,        setTotalMarks]        = useState(100);
  const [passMarks,         setPassMarks]         = useState<number | ''>('');
  const [venue,             setVenue]             = useState('');
  const [instructions,      setInstructions]      = useState('');
  const [materialsAllowed,  setMaterialsAllowed]  = useState('');
  const [status,            setStatus]            = useState('draft');
  const [isPractical,       setIsPractical]       = useState(false);
  const [requiresComputer,  setRequiresComputer]  = useState(false);
  const [isOnline,          setIsOnline]          = useState(false);

  // Section instructions
  const [objInstructions,  setObjInstructions]  = useState('Answer ALL questions. Each question carries equal marks.');
  const [theoInstructions, setTheoInstructions] = useState('Answer any FIVE questions. All questions carry equal marks.');
  const [practInstructions,setPractInstructions]= useState('Complete ALL practical tasks as instructed.');

  // Questions
  const [objectiveQs,  setObjectiveQs]  = useState<ObjectiveQuestion[]>([]);
  const [theoryQs,     setTheoryQs]     = useState<TheoryQuestion[]>([]);
  const [practicalQs,  setPracticalQs]  = useState<PracticalQuestion[]>([]);
  const [customSecs,   setCustomSecs]   = useState<CustomSection[]>([]);

  // Print settings
  const [printSettings, setPrintSettings] = useState<PrintSettings>({ ...DEFAULT_PRINT_SETTINGS });

  // Reference data
  const [subjects,    setSubjects]    = useState<any[]>([]);
  const [gradeLevels, setGradeLevels] = useState<any[]>([]);

  // UI state
  const [activeTab,  setActiveTab]  = useState<Tab>('details');
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // ── Load reference data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    ClassroomService.getGradeLevels()
      .then(r => setGradeLevels(Array.isArray(r) ? r : (r as any).results ?? []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !gradeLevel) return;
    ClassroomService.getSubjectsForGrade({ grade_id: gradeLevel })
      .then((r: any) => setSubjects(Array.isArray(r) ? r : r?.results ?? []))
      .catch(() => {});
  }, [open, gradeLevel]);

  // ── Populate form from exam (edit mode) ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (exam) {
      setTitle(exam.title || '');
      setDescription(exam.description || '');
      setSubject(typeof exam.subject === 'number' ? exam.subject : exam.subject?.id ?? 0);
      setGradeLevel(typeof exam.grade_level === 'number' ? exam.grade_level : exam.grade_level?.id ?? 0);
      setExamType(exam.exam_type || 'quiz');
      setDifficulty(exam.difficulty_level || 'medium');
      setExamDate(exam.exam_date || '');
      setStartTime(exam.start_time || '');
      setEndTime(exam.end_time || '');
      setTotalMarks(exam.total_marks || 100);
      setPassMarks(exam.pass_marks ?? '');
      setVenue(exam.venue || '');
      setInstructions(exam.instructions || '');
      setMaterialsAllowed(exam.materials_allowed || '');
      setStatus(exam.status || 'draft');
      setIsPractical(exam.is_practical || false);
      setRequiresComputer(exam.requires_computer || false);
      setIsOnline(exam.is_online || false);
      setObjInstructions(exam.objective_instructions || objInstructions);
      setTheoInstructions(exam.theory_instructions || theoInstructions);
      setPractInstructions(exam.practical_instructions || practInstructions);
      setObjectiveQs(exam.objective_questions || []);
      setTheoryQs(exam.theory_questions || []);
      setPracticalQs(exam.practical_questions || []);
      setCustomSecs(exam.custom_sections || []);
      setPrintSettings({ ...DEFAULT_PRINT_SETTINGS, ...(exam as any).print_settings });
    } else {
      // Reset for create
      setTitle(''); setDescription(''); setSubject(0); setGradeLevel(0);
      setExamType('quiz'); setDifficulty('medium'); setExamDate('');
      setStartTime(''); setEndTime(''); setTotalMarks(100); setPassMarks('');
      setVenue(''); setInstructions(''); setMaterialsAllowed('');
      setStatus('draft'); setIsPractical(false); setRequiresComputer(false); setIsOnline(false);
      setObjectiveQs([]); setTheoryQs([]); setPracticalQs([]); setCustomSecs([]);
      setPrintSettings({ ...DEFAULT_PRINT_SETTINGS });
    }
    setActiveTab('details');
    setErrors({});
  }, [open, exam]);

  // ── Marks totals ───────────────────────────────────────────────────────────
  const marksBreakdown = useMemo(() => {
    const mcq  = objectiveQs.reduce((s, q) => s + (Number(q.marks) || 0), 0);
    const theo = theoryQs.reduce((s, q) => s + (Number(q.marks) || 0), 0);
    const prac = practicalQs.reduce((s, q) => s + (Number(q.marks) || 0), 0);
    const cust = customSecs.reduce((s, sec) =>
      s + ((sec as any).questions || []).reduce((ss: number, q: any) => ss + (Number(q.marks) || 0), 0), 0);
    return { mcq, theo, prac, cust, total: mcq + theo + prac + cust };
  }, [objectiveQs, theoryQs, practicalQs, customSecs]);

  const marksOk   = marksBreakdown.total === totalMarks;
  const marksOver = marksBreakdown.total > totalMarks;

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim())    e.title      = 'Title is required';
    if (!subject)         e.subject    = 'Subject is required';
    if (!gradeLevel)      e.gradeLevel = 'Grade level is required';
    if (!examDate)        e.examDate   = 'Exam date is required';
    if (!startTime)       e.startTime  = 'Start time is required';
    if (!endTime)         e.endTime    = 'End time is required';
    if (totalMarks < 1)   e.totalMarks = 'Total marks must be at least 1';
    if (marksOver)        e.marks      = `Questions add up to ${marksBreakdown.total}, but total marks is ${totalMarks}`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      setActiveTab('details');
      return;
    }
    setSubmitting(true);
    try {
      const data: ExamCreateData = {
        title: title.trim(),
        description: description.trim(),
        subject,
        grade_level: gradeLevel,
        exam_type: examType,
        difficulty_level: difficulty,
        exam_date: examDate,
        start_time: startTime,
        end_time: endTime,
        total_marks: totalMarks,
        pass_marks: passMarks === '' ? undefined : Number(passMarks),
        venue: venue.trim(),
        instructions: instructions.trim(),
        materials_allowed: materialsAllowed.trim(),
        status,
        is_practical: isPractical,
        requires_computer: requiresComputer,
        is_online: isOnline,
        objective_questions: objectiveQs,
        theory_questions: theoryQs,
        practical_questions: practicalQs,
        custom_sections: customSecs,
        objective_instructions: objInstructions,
        theory_instructions: theoInstructions,
        practical_instructions: practInstructions,
        print_settings: printSettings,
      };
      onSubmit(data);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // ── Tab badge helper ───────────────────────────────────────────────────────
  const tabBadge = (tab: Tab) => {
    const counts: Record<Tab, number> = {
      mcq: objectiveQs.length, theory: theoryQs.length,
      practical: practicalQs.length, custom: customSecs.length,
      details: 0, print: 0,
    };
    return counts[tab] > 0 ? counts[tab] : null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {isEdit ? 'Edit Exam' : 'Create New Exam'}
            </h2>
            {isEdit && (
              <p className="text-sm text-gray-500 mt-0.5">{exam?.title}</p>
            )}
          </div>

          {/* Marks tracker */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              marksOk   ? 'bg-green-50 text-green-700 border border-green-200' :
              marksOver ? 'bg-red-50 text-red-700 border border-red-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {marksOk   ? <CheckCircle2 size={14} /> :
               marksOver ? <AlertCircle size={14} /> :
                           <AlertCircle size={14} />}
              {marksBreakdown.total} / {totalMarks} marks
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto flex-shrink-0 bg-gray-50 dark:bg-gray-800">
          {TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors relative ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600 bg-white dark:bg-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tabBadge(tab.key) !== null && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                  {tabBadge(tab.key)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6">

            {/* Validation errors */}
            {Object.keys(errors).length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-700 mb-1 flex items-center gap-1.5">
                  <AlertCircle size={14} /> Please fix the following:
                </p>
                <ul className="list-disc list-inside text-sm text-red-600 space-y-0.5">
                  {Object.values(errors).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {/* ─── DETAILS TAB ─── */}
            {activeTab === 'details' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <Field label="Exam Title" required>
                    <input
                      type="text" value={title} onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. First Term Mathematics Examination"
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.title ? 'border-red-400' : 'border-gray-300'}`}
                    />
                  </Field>
                </div>

                <Field label="Grade Level" required>
                  <select
                    value={gradeLevel} onChange={e => setGradeLevel(Number(e.target.value))}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.gradeLevel ? 'border-red-400' : 'border-gray-300'}`}
                  >
                    <option value={0}>Select grade level…</option>
                    {gradeLevels.map((g: any) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Subject" required>
                  <select
                    value={subject} onChange={e => setSubject(Number(e.target.value))}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.subject ? 'border-red-400' : 'border-gray-300'}`}
                    disabled={!gradeLevel}
                  >
                    <option value={0}>{gradeLevel ? 'Select subject…' : 'Select grade first…'}</option>
                    {subjects.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Exam Type">
                  <select
                    value={examType} onChange={e => setExamType(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {ExamService.getExamTypes().map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Difficulty Level">
                  <select
                    value={difficulty} onChange={e => setDifficulty(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {ExamService.getDifficultyLevels().map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Exam Date" required>
                  <input
                    type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.examDate ? 'border-red-400' : 'border-gray-300'}`}
                  />
                </Field>

                <Field label="Status">
                  <select
                    value={status} onChange={e => setStatus(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </Field>

                <Field label="Start Time" required>
                  <input
                    type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.startTime ? 'border-red-400' : 'border-gray-300'}`}
                  />
                </Field>

                <Field label="End Time" required>
                  <input
                    type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.endTime ? 'border-red-400' : 'border-gray-300'}`}
                  />
                </Field>

                <Field label="Total Marks" required>
                  <input
                    type="number" min={1} value={totalMarks}
                    onChange={e => setTotalMarks(Number(e.target.value))}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.totalMarks ? 'border-red-400' : 'border-gray-300'}`}
                  />
                </Field>

                <Field label="Pass Marks" hint="Leave blank to use default percentage">
                  <input
                    type="number" min={0} value={passMarks}
                    onChange={e => setPassMarks(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 50"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </Field>

                <Field label="Venue">
                  <input
                    type="text" value={venue} onChange={e => setVenue(e.target.value)}
                    placeholder="e.g. Exam Hall 1"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="General Instructions">
                    <textarea
                      value={instructions} onChange={e => setInstructions(e.target.value)}
                      rows={3}
                      placeholder="General instructions for the entire exam…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </Field>
                </div>

                <div className="md:col-span-2">
                  <Field label="Materials Allowed">
                    <input
                      type="text" value={materialsAllowed} onChange={e => setMaterialsAllowed(e.target.value)}
                      placeholder="e.g. Calculator, ruler, graph paper"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </Field>
                </div>

                <div className="md:col-span-2">
                  <Field label="Description">
                    <textarea
                      value={description} onChange={e => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Optional description or notes about this exam…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </Field>
                </div>

                {/* Flags */}
                <div className="md:col-span-2 flex flex-wrap gap-4">
                  {[
                    { label: 'Practical Exam', value: isPractical, set: setIsPractical },
                    { label: 'Requires Computer', value: requiresComputer, set: setRequiresComputer },
                    { label: 'Online Exam', value: isOnline, set: setIsOnline },
                  ].map(({ label, value, set }) => (
                    <label key={label} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox" checked={value} onChange={e => set(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>

                {/* Marks breakdown summary */}
                {marksBreakdown.total > 0 && (
                  <div className="md:col-span-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Marks Breakdown</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'MCQ', value: marksBreakdown.mcq },
                        { label: 'Theory', value: marksBreakdown.theo },
                        { label: 'Practical', value: marksBreakdown.prac },
                        { label: 'Custom', value: marksBreakdown.cust },
                      ].map(r => (
                        <div key={r.label} className="text-center p-2 bg-white rounded-lg border">
                          <p className="text-lg font-bold text-gray-900">{r.value}</p>
                          <p className="text-xs text-gray-500">{r.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className={`mt-2 text-sm font-medium ${marksOk ? 'text-green-600' : marksOver ? 'text-red-600' : 'text-amber-600'}`}>
                      Total: {marksBreakdown.total} / {totalMarks} marks
                      {marksOk && ' ✓ Balanced'}
                      {marksOver && ` — ${marksBreakdown.total - totalMarks} marks over limit`}
                      {!marksOk && !marksOver && ` — ${totalMarks - marksBreakdown.total} marks remaining`}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── MCQ TAB ─── */}
            {activeTab === 'mcq' && (
              <div>
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Field label="Section A Instructions">
                    <textarea
                      value={objInstructions} onChange={e => setObjInstructions(e.target.value)}
                      rows={2} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm resize-none bg-white"
                    />
                  </Field>
                </div>
                <QuestionSectionObjectives value={objectiveQs} onChange={setObjectiveQs} />
              </div>
            )}

            {/* ─── THEORY TAB ─── */}
            {activeTab === 'theory' && (
              <div>
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <Field label="Section B Instructions">
                    <textarea
                      value={theoInstructions} onChange={e => setTheoInstructions(e.target.value)}
                      rows={2} className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm resize-none bg-white"
                    />
                  </Field>
                </div>
                <QuestionSectionTheory value={theoryQs} onChange={setTheoryQs} />
              </div>
            )}

            {/* ─── PRACTICAL TAB ─── */}
            {activeTab === 'practical' && (
              <div>
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <Field label="Section C Instructions">
                    <textarea
                      value={practInstructions} onChange={e => setPractInstructions(e.target.value)}
                      rows={2} className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm resize-none bg-white"
                    />
                  </Field>
                </div>
                <QuestionSectionPractical value={practicalQs} onChange={setPracticalQs} />
              </div>
            )}

            {/* ─── CUSTOM TAB ─── */}
            {activeTab === 'custom' && (
              <QuestionSectionCustom value={customSecs} onChange={setCustomSecs} />
            )}

            {/* ─── PRINT SETTINGS TAB ─── */}
            {activeTab === 'print' && (
              <div>
                <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700">
                  These settings control how the exam looks when printed. They are saved with this exam.
                </div>
                <PrintSettingsPanel value={printSettings} onChange={setPrintSettings} />
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm">
              {TABS.filter(t => tabBadge(t.key) !== null).map(t => (
                <span key={t.key} className="flex items-center gap-1 text-gray-500">
                  {t.section}: <strong>{tabBadge(t.key)}</strong>
                </span>
              ))}
            </div>

            <div className="flex gap-3">
              {activeTab !== 'details' && (
                <button
                  type="button"
                  onClick={() => {
                    const idx = TABS.findIndex(t => t.key === activeTab);
                    if (idx > 0) setActiveTab(TABS[idx - 1].key);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 text-sm transition-colors"
                >
                  Back
                </button>
              )}

              {activeTab !== 'print' ? (
                <button
                  type="button"
                  onClick={() => {
                    const idx = TABS.findIndex(t => t.key === activeTab);
                    if (idx < TABS.length - 1) setActiveTab(TABS[idx + 1].key);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm transition-colors"
                >
                  Next <ChevronRight size={14} />
                </button>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Exam'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExamFormModal;
