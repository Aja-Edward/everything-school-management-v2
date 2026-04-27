import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit, Trash2, Save, X, Calculator,
  BookOpen, FileText, Award, Users, Eye, EyeOff,
  CheckCircle, AlertCircle, Info, Star, Calendar, Layers,
  AlertTriangle, ChevronRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import resultSettingsService, {
  GradingSystem, GradeRange, AssessmentType, ExamSession, ExamType,
  ScoringConfiguration, ScoringConfigurationCreateUpdate,
  GradingSystemCreateUpdate, AssessmentTypeCreateUpdate,
  GradeCreateUpdate, ExamSessionCreateUpdate, ExamTypeCreateUpdate,
  AssessmentComponent, AssessmentComponentCreateUpdate,
} from '@/services/ResultSettingsService';
import { AcademicSession } from '@/types/types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface EducationLevel {
  id: number;
  name: string;
  level_type: string; // e.g. 'NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const COMPONENT_TYPE_OPTIONS = [
  { value: 'CA',         label: 'Continuous Assessment' },
  { value: 'EXAM',       label: 'Examination'           },
  { value: 'PRACTICAL',  label: 'Practical'             },
  { value: 'PROJECT',    label: 'Project'               },
  { value: 'ORAL',       label: 'Oral Assessment'       },
  { value: 'OTHER',      label: 'Other'                 },
];

const RESULT_TYPE_OPTIONS = [
  { value: 'TERMLY',  label: 'Termly Result'  },
  { value: 'SESSION', label: 'Session Result' },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const resolveEducationLevel = (raw: any): { id: number | string; name: string; level_type: string } => {
  if (raw && typeof raw === 'object') {
    return { id: raw.id, name: raw.name || raw.level_type, level_type: raw.level_type || '' };
  }
  return { id: raw, name: String(raw), level_type: String(raw) };
};

// ─────────────────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────

const SectionHeader = ({
  title, subtitle, icon: Icon, count, sectionKey, activeSections, onToggle, onAdd, addLabel,
}: {
  title: string; subtitle: string; icon: React.ElementType; count: number;
  sectionKey: string; activeSections: Set<string>;
  onToggle: (k: string) => void; onAdd: () => void; addLabel: string;
}) => (
  <div className="bg-black px-8 py-6">
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div className="bg-white/20 p-3 rounded-xl"><Icon className="h-6 w-6 text-white" /></div>
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-white/70 text-sm">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <span className="bg-white/20 text-white text-sm font-medium px-3 py-1 rounded-full">{count}</span>
        <button
          onClick={() => onToggle(sectionKey)}
          className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center space-x-2 text-sm transition-colors"
        >
          {activeSections.has(sectionKey)
            ? <><EyeOff className="h-4 w-4" /><span>Hide</span></>
            : <><Eye className="h-4 w-4" /><span>Show</span></>}
        </button>
        <button
          onClick={onAdd}
          className="bg-white text-black hover:bg-gray-100 px-4 py-2 rounded-lg flex items-center space-x-2 font-medium text-sm transition-colors"
        >
          <Plus className="h-4 w-4" /><span>{addLabel}</span>
        </button>
      </div>
    </div>
  </div>
);

const ModalShell = ({ title, subtitle, icon: Icon, onClose, children, wide }: {
  title: string; subtitle: string; icon: React.ElementType;
  onClose: () => void; children: React.ReactNode; wide?: boolean;
}) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-2xl'} my-4`}>
      <div className="bg-black px-8 py-6 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-white/20 p-3 rounded-xl"><Icon className="h-6 w-6 text-white" /></div>
          <div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="text-white/70 text-sm">{subtitle}</p>
          </div>
        </div>
        <button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);

const FormField = ({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

const inputCls = "w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm";

const SaveButton = ({ saving, label, onClick }: { saving: boolean; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    disabled={saving}
    className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center space-x-2 font-medium text-sm transition-colors"
  >
    {saving
      ? <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /><span>Saving…</span></>
      : <><Save className="h-4 w-4" /><span>{label}</span></>}
  </button>
);

const EmptyState = ({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) => (
  <div className="text-center py-12 text-gray-400">
    <Icon className="h-10 w-10 mx-auto mb-3 opacity-40" />
    <p className="font-medium text-gray-500">{title}</p>
    {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
  </div>
);

const InfoBanner = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 text-sm text-blue-800">
    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
    <span>{children}</span>
  </div>
);

const WarnBanner = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-800">
    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
    <span>{children}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT SUMMARY PANEL (used inside ScoringConfig modal)
// ─────────────────────────────────────────────────────────────────────────────

const ComponentSummaryPanel = ({
  educationLevelId,
  assessmentComponents,
  totalMaxScore,
}: {
  educationLevelId: number | string | null;
  assessmentComponents: AssessmentComponent[];
  totalMaxScore: number;
}) => {
  if (!educationLevelId) return null;

  const components = assessmentComponents.filter((c) => {
    const elId = typeof c.education_level === 'object'
      ? (c.education_level as any).id
      : c.education_level;
    return String(elId) === String(educationLevelId) && c.is_active;
  });

  if (components.length === 0) {
    return (
      <WarnBanner>
        No active Assessment Components configured for this education level.
        The <strong>Total Max Score</strong> you enter cannot be validated against components.
        Add components first for best results.
      </WarnBanner>
    );
  }

  const componentSum = components.reduce((sum, c) => sum + Number(c.max_score), 0);
  const mismatch = totalMaxScore > 0 && componentSum !== totalMaxScore;

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Active Components for this Level</p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          mismatch ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          Sum: {componentSum}
        </span>
      </div>
      <div className="space-y-1.5">
        {components.sort((a, b) => a.display_order - b.display_order).map((c) => (
          <div key={c.id} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-gray-600">
              <ChevronRight className="w-3 h-3 text-gray-400" />
              {c.name}
              {c.contributes_to_ca && (
                <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[10px]">CA</span>
              )}
            </span>
            <span className="font-semibold text-gray-800">{c.max_score}</span>
          </div>
        ))}
      </div>
      {mismatch && (
        <p className="text-xs text-red-600 font-medium pt-1 border-t border-red-200">
          ⚠ Component sum ({componentSum}) ≠ Total Max Score ({totalMaxScore}). The backend will reject this.
          Update Total Max Score to {componentSum}.
        </p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NURSERY MODE BANNER
// ─────────────────────────────────────────────────────────────────────────────

const NurseryModeBanner = ({
  educationLevelId,
  assessmentComponents,
}: {
  educationLevelId: number | string;
  assessmentComponents: AssessmentComponent[];
}) => {
  const nurseryComponents = assessmentComponents.filter((c) => {
    const elId = typeof c.education_level === 'object'
      ? (c.education_level as any).id
      : c.education_level;
    const levelType = typeof c.education_level === 'object'
      ? (c.education_level as any).level_type
      : '';
    return String(elId) === String(educationLevelId) || levelType === 'NURSERY';
  });

  if (nurseryComponents.length === 0) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
        <div className="bg-purple-100 p-2 rounded-lg flex-shrink-0">
          <Info className="w-4 h-4 text-purple-700" />
        </div>
        <div>
          <p className="text-sm font-semibold text-purple-800">Single Score Mode (Active)</p>
          <p className="text-xs text-purple-700 mt-0.5">
            No components configured for this level. Teachers will enter <strong>Score Obtainable</strong> and{' '}
            <strong>Score Obtained</strong> directly per subject — no CA breakdown.
            Add components below to switch to component-based entry.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
      <div className="bg-emerald-100 p-2 rounded-lg flex-shrink-0">
        <CheckCircle className="w-4 h-4 text-emerald-700" />
      </div>
      <div>
        <p className="text-sm font-semibold text-emerald-800">Component Mode (Active)</p>
        <p className="text-xs text-emerald-700 mt-0.5">
          {nurseryComponents.length} component{nurseryComponents.length > 1 ? 's' : ''} configured.
          Teachers will enter individual component scores. Remove all components to switch back to single score mode.
        </p>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const ExamsResultTab: React.FC = () => {
  const [activeSections, setActiveSections] = useState<Set<string>>(
    new Set(['assessment-components'])
  );

  // ── Data ──────────────────────────────────────────────────────────────────
  const [gradingSystems,        setGradingSystems]        = useState<GradingSystem[]>([]);
  const [grades,                setGrades]                = useState<GradeRange[]>([]);
  const [examSessions,          setExamSessions]          = useState<ExamSession[]>([]);
  const [examTypes,             setExamTypes]             = useState<ExamType[]>([]);
  const [academicSessions,      setAcademicSessions]      = useState<AcademicSession[]>([]);
  const [scoringConfigurations, setScoringConfigurations] = useState<ScoringConfiguration[]>([]);
  const [assessmentComponents,  setAssessmentComponents]  = useState<AssessmentComponent[]>([]);
  const [educationLevels,       setEducationLevels]       = useState<EducationLevel[]>([]);
  const [selectedGradingSystem, setSelectedGradingSystem] = useState<GradingSystem | null>(null);
  const [academicTerms,         setAcademicTerms]         = useState<any[]>([]);

  // ── Modal visibility ──────────────────────────────────────────────────────
  const [showScoringConfigForm,   setShowScoringConfigForm]   = useState(false);
  const [showGradingSystemForm,   setShowGradingSystemForm]   = useState(false);
  const [showExamSessionForm,     setShowExamSessionForm]     = useState(false);
  const [showExamTypeForm,        setShowExamTypeForm]        = useState(false);
  const [showGradesModal,         setShowGradesModal]         = useState(false);
  const [showGradeForm,           setShowGradeForm]           = useState(false);
  const [showComponentForm,       setShowComponentForm]       = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────

  // ScoringConfiguration — only fields that exist on the backend model
  const blankScoringConfig = (): ScoringConfigurationCreateUpdate & { id?: string } => ({
    name: '',
    education_level: '' as any,
    result_type: 'TERMLY',
    description: '',
    total_max_score: 100,
    is_active: true,
    is_default: false,
  });
  const [scoringConfigForm, setScoringConfigForm] = useState(blankScoringConfig());

  const blankGradingSystem = (): GradingSystemCreateUpdate & { id?: string } => ({
    name: '', grading_type: 'PERCENTAGE', description: '',
    min_score: 0, max_score: 100, pass_mark: 50, is_active: true,
  });
  const [gradingSystemForm, setGradingSystemForm] = useState(blankGradingSystem());

  const blankExamSession = (): ExamSessionCreateUpdate & { id?: string } => ({
    name: '', exam_type: '', term: '', academic_session: '',
    start_date: '', end_date: '', result_release_date: '', is_published: false, is_active: true,
  });
  const [examSessionForm, setExamSessionForm] = useState(blankExamSession());

  const blankExamType = (): ExamTypeCreateUpdate & { id?: number } => ({
    name: '', code: '', category: 'OTHER', description: '', display_order: 0, is_active: true,
  });
  const [examTypeForm, setExamTypeForm] = useState(blankExamType());

  const blankGrade = (gsId = ''): GradeCreateUpdate & { id?: string } => ({
    grading_system: gsId, grade: '', remark: '',
    min_score: 0, max_score: 0, grade_point: undefined, description: '', is_passing: true,
  });
  const [gradeForm, setGradeForm] = useState(blankGrade());

  const blankComponent = (): AssessmentComponentCreateUpdate & { id?: number } => ({
    education_level: 0 as any, name: '', code: '', component_type: 'CA',
    max_score: '10', contributes_to_ca: true, display_order: 0, is_active: true,
  });
  const [componentForm, setComponentForm] = useState(blankComponent());

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // ── Derived — nursery level id ────────────────────────────────────────────
  const nurseryLevelId = educationLevels.find(
    (l) => l.level_type === 'NURSERY' || l.name.toUpperCase().includes('NURSERY')
  )?.id ?? null;

  // ─────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [gs, gr, es, sc, as_, et, ac] = await Promise.all([
        resultSettingsService.getGradingSystems(),
        resultSettingsService.getGrades(),
        resultSettingsService.getExamSessions(),
        resultSettingsService.getScoringConfigurations(),
        resultSettingsService.getAcademicSessions(),
        resultSettingsService.getExamTypes(),
        resultSettingsService.getAssessmentComponents(),
      ]);
      setGradingSystems(gs);
      setGrades(gr);
      setExamSessions(es);
      setScoringConfigurations(sc);
      setAcademicSessions(as_);
      setExamTypes(et);
      setAssessmentComponents(ac);

      // Load education levels and academic terms
      try {
        const { default: api } = await import('@/services/api');
        const [lvls, terms] = await Promise.all([
          api.get('/api/academics/education-levels/'),
          api.get('/api/academics/terms/').catch(() => ({ results: [] })),
        ]);
        setEducationLevels(Array.isArray(lvls) ? lvls : lvls?.results ?? []);
        setAcademicTerms(Array.isArray(terms) ? terms : terms?.results ?? []);
      } catch {
        // graceful — education levels fall back to component-derived list
      }
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleSection = (key: string) => {
    const s = new Set(activeSections);
    s.has(key) ? s.delete(key) : s.add(key);
    setActiveSections(s);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS — education level resolution
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns a display name for a component's education_level field,
   * which may be an object (from API) or a raw ID.
   */
  const resolveELName = (el: any): string => {
    if (!el) return '—';
    if (typeof el === 'object') return el.name || el.level_type || String(el.id);
    // It's a raw ID — look up in our loaded list
    const found = educationLevels.find((l) => String(l.id) === String(el));
    return found?.name ?? String(el);
  };

  /**
   * Get the numeric ID from an education_level field (object or raw).
   */
  const resolveELId = (el: any): number | string => {
    if (!el) return '';
    if (typeof el === 'object') return el.id;
    return el;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ASSESSMENT COMPONENTS CRUD
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateComponent = async () => {
    setSaving(true);
    try {
      if (!componentForm.name || !componentForm.code) { toast.error('Name and code are required'); return; }
      if (!componentForm.education_level) { toast.error('Education level is required'); return; }
      const { id, ...data } = componentForm;
      await resultSettingsService.createAssessmentComponent(data);
      toast.success('Assessment component created');
      setShowComponentForm(false);
      setComponentForm(blankComponent());
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || JSON.stringify(e?.response?.data) || 'Failed to create component');
    } finally { setSaving(false); }
  };

  const handleUpdateComponent = async (id: number) => {
    setSaving(true);
    try {
      const { id: _, ...data } = componentForm;
      await resultSettingsService.updateAssessmentComponent(id, data);
      toast.success('Assessment component updated');
      setShowComponentForm(false);
      setComponentForm(blankComponent());
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update component');
    } finally { setSaving(false); }
  };

  const handleDeleteComponent = async (id: number) => {
    if (!window.confirm('Delete this assessment component?')) return;
    try {
      await resultSettingsService.deleteAssessmentComponent(id);
      toast.success('Component deleted');
      loadData();
    } catch { toast.error('Failed to delete component'); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EXAM TYPES CRUD
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateExamType = async () => {
    setSaving(true);
    try {
      if (!examTypeForm.name || !examTypeForm.code) { toast.error('Name and code are required'); return; }
      const { id, ...data } = examTypeForm;
      await resultSettingsService.createExamType(data);
      toast.success('Exam type created');
      setShowExamTypeForm(false);
      setExamTypeForm(blankExamType());
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to create exam type');
    } finally { setSaving(false); }
  };

  const handleUpdateExamType = async (id: number) => {
    setSaving(true);
    try {
      const { id: _, ...data } = examTypeForm;
      await resultSettingsService.updateExamType(id, data);
      toast.success('Exam type updated');
      setShowExamTypeForm(false);
      loadData();
    } catch { toast.error('Failed to update exam type'); }
    finally { setSaving(false); }
  };

  const handleDeleteExamType = async (id: number) => {
    if (!window.confirm('Delete this exam type?')) return;
    try { await resultSettingsService.deleteExamType(id); toast.success('Exam type deleted'); loadData(); }
    catch { toast.error('Failed to delete exam type'); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EXAM SESSIONS CRUD
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateExamSession = async () => {
    setSaving(true);
    try {
      if (!examSessionForm.academic_session) { toast.error('Academic session required'); return; }
      if (!examSessionForm.exam_type)        { toast.error('Exam type required');        return; }
      if (!examSessionForm.term)             { toast.error('Term required');             return; }
      await resultSettingsService.createExamSession({
        ...examSessionForm,
        academic_session: Number(examSessionForm.academic_session),
        exam_type:        Number(examSessionForm.exam_type),
        term:             examSessionForm.term, // keep as-is (term FK id)
      });
      toast.success('Exam session created');
      setShowExamSessionForm(false);
      setExamSessionForm(blankExamSession());
      loadData();
    } catch (e: any) {
      const data = e?.response?.data;
      if (data && typeof data === 'object') {
        const msgs = Object.values(data).flat();
        toast.error(String(msgs[0]));
      } else { toast.error('Failed to create exam session'); }
    } finally { setSaving(false); }
  };

  const handleUpdateExamSession = async (id: string) => {
    setSaving(true);
    try {
      await resultSettingsService.updateExamSession(id, {
        ...examSessionForm,
        academic_session: Number(examSessionForm.academic_session),
        exam_type:        Number(examSessionForm.exam_type),
        term:             examSessionForm.term,
      });
      toast.success('Exam session updated');
      setShowExamSessionForm(false);
      setExamSessionForm(blankExamSession());
      loadData();
    } catch { toast.error('Failed to update exam session'); }
    finally { setSaving(false); }
  };

  const handleDeleteExamSession = async (id: string) => {
    if (!window.confirm('Delete this exam session?')) return;
    try { await resultSettingsService.deleteExamSession(id); toast.success('Exam session deleted'); loadData(); }
    catch { toast.error('Failed to delete exam session'); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GRADING SYSTEMS CRUD
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateGradingSystem = async () => {
    setSaving(true);
    try {
      await resultSettingsService.createGradingSystem(gradingSystemForm);
      toast.success('Grading system created');
      setShowGradingSystemForm(false);
      setGradingSystemForm(blankGradingSystem());
      loadData();
    } catch { toast.error('Failed to create grading system'); }
    finally { setSaving(false); }
  };

  const handleUpdateGradingSystem = async (id: string) => {
    setSaving(true);
    try {
      await resultSettingsService.updateGradingSystem(id, gradingSystemForm);
      toast.success('Grading system updated');
      setShowGradingSystemForm(false);
      loadData();
    } catch { toast.error('Failed to update grading system'); }
    finally { setSaving(false); }
  };

  const handleDeleteGradingSystem = async (id: string) => {
    if (!window.confirm('Delete this grading system? This will remove all associated grades.')) return;
    try { await resultSettingsService.deleteGradingSystem(id); toast.success('Deleted'); loadData(); }
    catch { toast.error('Failed to delete — it may be in use'); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GRADES CRUD
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateGrade = async () => {
    setSaving(true);
    try {
      if (!gradeForm.grade || !gradeForm.remark) { toast.error('Grade and remark required'); return; }
      if (Number(gradeForm.min_score) >= Number(gradeForm.max_score)) {
        toast.error('Min score must be less than max score'); return;
      }
      const { id, ...data } = gradeForm;
      await resultSettingsService.createGrade(data);
      toast.success('Grade created');
      setShowGradeForm(false);
      setGradeForm(blankGrade(selectedGradingSystem?.id || ''));
      loadData();
    } catch { toast.error('Failed to create grade'); }
    finally { setSaving(false); }
  };

  const handleUpdateGrade = async (id: string) => {
    setSaving(true);
    try {
      const { id: _, ...data } = gradeForm;
      await resultSettingsService.updateGrade(id, data);
      toast.success('Grade updated');
      setShowGradeForm(false);
      loadData();
    } catch { toast.error('Failed to update grade'); }
    finally { setSaving(false); }
  };

  const handleDeleteGrade = async (id: string) => {
    if (!window.confirm('Delete this grade?')) return;
    try { await resultSettingsService.deleteGrade(id); toast.success('Deleted'); loadData(); }
    catch { toast.error('Failed'); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SCORING CONFIGURATION CRUD
  // ─────────────────────────────────────────────────────────────────────────

  const handleSaveScoringConfig = async () => {
    setSaving(true);
    try {
      if (!scoringConfigForm.name) { toast.error('Name is required'); return; }
      if (!scoringConfigForm.education_level) { toast.error('Education level is required'); return; }

      // Clean payload — only send fields the backend model actually has
      const payload: ScoringConfigurationCreateUpdate = {
        name:              scoringConfigForm.name,
        education_level:   scoringConfigForm.education_level,
        result_type:       scoringConfigForm.result_type,
        description:       scoringConfigForm.description,
        total_max_score:   scoringConfigForm.total_max_score,
        is_active:         scoringConfigForm.is_active,
        is_default:        scoringConfigForm.is_default,
      };

      if (scoringConfigForm.id) {
        await resultSettingsService.updateScoringConfiguration(scoringConfigForm.id, payload);
        toast.success('Configuration updated');
      } else {
        await resultSettingsService.createScoringConfiguration(payload);
        toast.success('Configuration created');
      }
      setShowScoringConfigForm(false);
      setScoringConfigForm(blankScoringConfig());
      loadData();
    } catch (e: any) {
      const d = e?.response?.data;
      if (d && typeof d === 'object') {
        // Surface Django validation errors cleanly
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\n');
        toast.error(msgs || 'Failed to save configuration');
      } else {
        toast.error('Failed to save configuration');
      }
    } finally { setSaving(false); }
  };

  const handleDeleteScoringConfig = async (id: string) => {
    if (!window.confirm('Delete this scoring configuration?')) return;
    try { await resultSettingsService.deleteScoringConfiguration(id); toast.success('Deleted'); loadData(); }
    catch { toast.error('Failed to delete — it may be in use'); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-black mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading settings…</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // Group components by level for the Nursery banner
  const componentsByLevel = assessmentComponents.reduce<Record<string, AssessmentComponent[]>>((acc, c) => {
    const id = String(resolveELId(c.education_level));
    acc[id] = [...(acc[id] ?? []), c];
    return acc;
  }, {});

  return (
    <div className="space-y-6 p-6">

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Grading Systems',   value: gradingSystems.length,       icon: Award    },
          { label: 'Exam Types',        value: examTypes.length,            icon: FileText },
          { label: 'Exam Sessions',     value: examSessions.length,         icon: Calendar },
          { label: 'A. Components',     value: assessmentComponents.length, icon: Layers   },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
              <div className="bg-gray-100 p-3 rounded-lg">
                <Icon className="h-5 w-5 text-gray-700" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ASSESSMENT COMPONENTS
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <SectionHeader
          title="Assessment Components"
          subtitle="Configure score columns per education level — drives result entry forms and report cards"
          icon={Layers} count={assessmentComponents.length}
          sectionKey="assessment-components" activeSections={activeSections} onToggle={toggleSection}
          onAdd={() => { setComponentForm(blankComponent()); setShowComponentForm(true); }}
          addLabel="Add Component"
        />

        {activeSections.has('assessment-components') && (
          <div className="p-6 space-y-5">

            {/* Nursery mode banners — one per nursery level */}
            {educationLevels
              .filter((l) => l.level_type === 'NURSERY' || l.name.toUpperCase().includes('NURSERY'))
              .map((l) => (
                <NurseryModeBanner
                  key={l.id}
                  educationLevelId={l.id}
                  assessmentComponents={assessmentComponents}
                />
              ))}

            {/* Level breakdown badges */}
            <div className="flex flex-wrap gap-2">
              {educationLevels.map((l) => {
                const cnt = (componentsByLevel[String(l.id)] ?? []).length;
                return (
                  <span key={l.id} className="text-xs px-3 py-1 bg-gray-100 rounded-full font-medium text-gray-700">
                    {l.name}: {cnt}
                  </span>
                );
              })}
            </div>

            {assessmentComponents.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No components configured"
                subtitle="Add components to enable dynamic score entry in result forms"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Name', 'Code', 'Level', 'Type', 'Max Score', 'CA?', 'Order', 'Status', ''].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...assessmentComponents]
                      .sort((a, b) => {
                        const la = resolveELName(a.education_level);
                        const lb = resolveELName(b.education_level);
                        return la.localeCompare(lb) || a.display_order - b.display_order;
                      })
                      .map((comp) => (
                        <tr key={comp.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{comp.name}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{comp.code}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                              {resolveELName(comp.education_level)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {(comp as any).component_type_display || comp.component_type}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{comp.max_score}</td>
                          <td className="px-4 py-3">
                            {comp.contributes_to_ca
                              ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                              : <X className="w-4 h-4 text-gray-300" />}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{comp.display_order}</td>
                          <td className="px-4 py-3">
                            {comp.is_active
                              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                              : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Inactive</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  const elId = resolveELId(comp.education_level);
                                  setComponentForm({
                                    id: comp.id,
                                    education_level: elId as any,
                                    name: comp.name,
                                    code: comp.code,
                                    component_type: comp.component_type as any,
                                    max_score: comp.max_score,
                                    contributes_to_ca: comp.contributes_to_ca,
                                    display_order: comp.display_order,
                                    is_active: comp.is_active,
                                  });
                                  setShowComponentForm(true);
                                }}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteComponent(comp.id)}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          EXAM TYPES
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <SectionHeader
          title="Exam Types"
          subtitle="Label the kind of exam event — used to categorise Exam Sessions"
          icon={FileText} count={examTypes.length}
          sectionKey="exam-types" activeSections={activeSections} onToggle={toggleSection}
          onAdd={() => { setExamTypeForm(blankExamType()); setShowExamTypeForm(true); }}
          addLabel="Add Exam Type"
        />
        {activeSections.has('exam-types') && (
          <div className="p-6">
            {examTypes.length === 0 ? (
              <EmptyState icon={FileText} title="No exam types configured" subtitle="Default types are seeded when the school is created" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {examTypes.map((et) => (
                  <div key={et.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{et.name}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{et.code}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setExamTypeForm({ id: et.id, name: et.name, code: et.code, category: et.category, description: et.description, display_order: et.display_order, is_active: et.is_active });
                            setShowExamTypeForm(true);
                          }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteExamType(et.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                        {(et as any).category_display || et.category}
                      </span>
                      {et.is_active
                        ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                        : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Inactive</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          EXAM SESSIONS
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <SectionHeader
          title="Exam Sessions"
          subtitle="Schedule examination periods — ties an Exam Type to a Term and Academic Session"
          icon={Calendar} count={examSessions.length}
          sectionKey="exam-sessions" activeSections={activeSections} onToggle={toggleSection}
          onAdd={() => { setExamSessionForm(blankExamSession()); setShowExamSessionForm(true); }}
          addLabel="Add Session"
        />
        {activeSections.has('exam-sessions') && (
          <div className="p-6">
            {examSessions.length === 0 ? (
              <EmptyState icon={Calendar} title="No exam sessions" subtitle="Create exam types and academic sessions first" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {examSessions.map((sess) => {
                  const sessionName = (() => {
                    if (typeof sess.academic_session === 'object' && (sess.academic_session as any)?.name)
                      return (sess.academic_session as any).name;
                    return academicSessions.find((s) => String(s.id) === String(sess.academic_session))?.name || '—';
                  })();
                  const examTypeName = (() => {
                    if (typeof sess.exam_type === 'object') return (sess.exam_type as any).name;
                    return examTypes.find((et) => String(et.id) === String(sess.exam_type))?.name || String(sess.exam_type);
                  })();
                  const termName = (() => {
                    if (typeof sess.term === 'object') return (sess.term as any).name;
                    return academicTerms.find((t) => String(t.id) === String(sess.term))?.name || String(sess.term || '—');
                  })();
                  return (
                    <div key={sess.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">{sess.name}</p>
                            {sess.is_published && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />Published
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{sessionName}</p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{examTypeName}</span>
                            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{termName}</span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              const etId  = typeof sess.exam_type === 'object' ? (sess.exam_type as any).id : sess.exam_type;
                              const asId  = typeof sess.academic_session === 'object' ? (sess.academic_session as any).id : sess.academic_session;
                              const tId   = typeof sess.term === 'object' ? (sess.term as any).id : sess.term;
                              setExamSessionForm({
                                id: sess.id, name: sess.name, exam_type: etId, term: tId,
                                academic_session: asId, start_date: sess.start_date, end_date: sess.end_date,
                                result_release_date: sess.result_release_date, is_published: sess.is_published,
                                is_active: sess.is_active,
                              });
                              setShowExamSessionForm(true);
                            }}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteExamSession(sess.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                        <div className="bg-gray-50 rounded-lg p-2">
                          <span className="font-medium">Start:</span>{' '}
                          {sess.start_date ? new Date(sess.start_date).toLocaleDateString() : '—'}
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <span className="font-medium">End:</span>{' '}
                          {sess.end_date ? new Date(sess.end_date).toLocaleDateString() : '—'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          GRADING SYSTEMS
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <SectionHeader
          title="Grading Systems"
          subtitle="Define grading scales — each education level's results reference one of these"
          icon={Award} count={gradingSystems.length}
          sectionKey="grading-systems" activeSections={activeSections} onToggle={toggleSection}
          onAdd={() => { setGradingSystemForm(blankGradingSystem()); setShowGradingSystemForm(true); }}
          addLabel="Add System"
        />
        {activeSections.has('grading-systems') && (
          <div className="p-6">
            {gradingSystems.length === 0 ? (
              <EmptyState icon={Award} title="No grading systems" subtitle="Create a grading system then add grade ranges to it" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {gradingSystems.map((gs) => {
                  const gsGrades = grades.filter((g) => g.grading_system === gs.id);
                  return (
                    <div key={gs.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">{gs.name}</p>
                            {gs.is_active && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>}
                          </div>
                          <div className="flex gap-2 text-xs flex-wrap">
                            <span className="bg-gray-100 px-2 py-0.5 rounded-full">{gs.grading_type}</span>
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Pass: {gs.pass_mark}</span>
                            <span className="bg-gray-100 px-2 py-0.5 rounded-full">{gsGrades.length} grades</span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setSelectedGradingSystem(gs); setShowGradesModal(true); }}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <Users className="w-3 h-3" />Grades
                          </button>
                          <button
                            onClick={() => {
                              setGradingSystemForm({ id: gs.id, name: gs.name, grading_type: gs.grading_type, description: gs.description, min_score: gs.min_score, max_score: gs.max_score, pass_mark: gs.pass_mark, is_active: gs.is_active });
                              setShowGradingSystemForm(true);
                            }}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteGradingSystem(gs.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {/* Grade range preview */}
                      {gsGrades.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-2">
                          {[...gsGrades].sort((a, b) => Number(b.min_score) - Number(a.min_score)).map((g) => (
                            <span key={g.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${g.is_passing ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                              {g.grade}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SCORING CONFIGURATIONS
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <SectionHeader
          title="Scoring Configurations"
          subtitle="High-level scoring parameters per education level — used by the report generator"
          icon={Calculator} count={scoringConfigurations.length}
          sectionKey="scoring-configs" activeSections={activeSections} onToggle={toggleSection}
          onAdd={() => { setScoringConfigForm(blankScoringConfig()); setShowScoringConfigForm(true); }}
          addLabel="Add Config"
        />
        {activeSections.has('scoring-configs') && (
          <div className="p-6">
            <InfoBanner>
              Scoring Configurations set high-level parameters (total max score, result type) used by the PDF
              report generator. The actual per-subject score columns are defined in{' '}
              <strong>Assessment Components</strong> above. The total max score here must equal the sum of
              active components for the same education level.
            </InfoBanner>

            {scoringConfigurations.length === 0 ? (
              <EmptyState icon={Calculator} title="No scoring configurations" subtitle="Add components first, then create a scoring configuration" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                {scoringConfigurations.map((cfg) => {
                  const elName = resolveELName((cfg as any).education_level_name || cfg.education_level);
                  const elId   = resolveELId(cfg.education_level);
                  const activeComponents = assessmentComponents.filter((c) => {
                    const cId = resolveELId(c.education_level);
                    return String(cId) === String(elId) && c.is_active;
                  });
                  const componentSum = activeComponents.reduce((s, c) => s + Number(c.max_score), 0);
                  const mismatch = componentSum > 0 && componentSum !== Number(cfg.total_max_score);

                  return (
                    <div key={cfg.id} className={`border rounded-xl p-5 hover:shadow-md transition-shadow ${mismatch ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">{cfg.name}</p>
                            {cfg.is_default && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Star className="w-3 h-3" />Default
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 text-xs flex-wrap">
                            <span className="bg-gray-100 px-2 py-0.5 rounded-full">{elName}</span>
                            <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{cfg.result_type}</span>
                            <span className="bg-gray-100 px-2 py-0.5 rounded-full">Max: {cfg.total_max_score}</span>
                            {cfg.is_active
                              ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                              : <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Inactive</span>}
                          </div>
                          {mismatch && (
                            <p className="text-xs text-red-600 mt-1.5 font-medium">
                              ⚠ Components sum to {componentSum}, not {cfg.total_max_score}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setScoringConfigForm({
                                id:              cfg.id,
                                name:            cfg.name,
                                education_level: resolveELId(cfg.education_level) as any,
                                result_type:     cfg.result_type || 'TERMLY',
                                description:     cfg.description || '',
                                total_max_score: Number(cfg.total_max_score),
                                is_active:       cfg.is_active,
                                is_default:      cfg.is_default,
                              });
                              setShowScoringConfigForm(true);
                            }}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteScoringConfig(cfg.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>


      {/* ═══════════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* ── Assessment Component Modal ── */}
      {showComponentForm && (
        <ModalShell
          title={componentForm.id ? 'Edit Component' : 'Add Assessment Component'}
          subtitle="Defines a score column on the result entry form and report card"
          icon={Layers}
          onClose={() => { setShowComponentForm(false); setComponentForm(blankComponent()); }}
        >
          <FormField label="Education Level" required hint="The level whose result forms will show this column">
            <select
              value={String(componentForm.education_level)}
              onChange={(e) => setComponentForm((f) => ({ ...f, education_level: Number(e.target.value) as any }))}
              className={inputCls}
            >
              <option value="">Select level…</option>
              {educationLevels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </FormField>

          {/* Nursery hint when a nursery level is selected */}
          {(() => {
            const sel = educationLevels.find((l) => String(l.id) === String(componentForm.education_level));
            if (sel && (sel.level_type === 'NURSERY' || sel.name.toUpperCase().includes('NURSERY'))) {
              return (
                <InfoBanner>
                  Adding components to Nursery switches it from <strong>Single Score Mode</strong> to{' '}
                  <strong>Component Mode</strong>. Remove all components to revert to Score Obtainable / Score
                  Obtained entry.
                </InfoBanner>
              );
            }
            return null;
          })()}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Name" required>
              <input
                type="text"
                value={componentForm.name}
                onChange={(e) => setComponentForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="e.g. Test 1"
              />
            </FormField>
            <FormField label="Code" required hint="Auto-formatted — no spaces">
              <input
                type="text"
                value={componentForm.code}
                onChange={(e) =>
                  setComponentForm((f) => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))
                }
                className={inputCls}
                placeholder="e.g. test_1"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Component Type">
              <select
                value={componentForm.component_type}
                onChange={(e) => setComponentForm((f) => ({ ...f, component_type: e.target.value as any }))}
                className={inputCls}
              >
                {COMPONENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Max Score" required hint="The maximum score a student can earn in this column">
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={componentForm.max_score}
                onChange={(e) => setComponentForm((f) => ({ ...f, max_score: e.target.value }))}
                className={inputCls}
                placeholder="e.g. 10"
              />
            </FormField>
          </div>

          <FormField label="Display Order" hint="Lower numbers appear first in the result form">
            <input
              type="number"
              min={0}
              value={componentForm.display_order}
              onChange={(e) => setComponentForm((f) => ({ ...f, display_order: Number(e.target.value) }))}
              className={inputCls}
            />
          </FormField>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={componentForm.contributes_to_ca}
                onChange={(e) => setComponentForm((f) => ({ ...f, contributes_to_ca: e.target.checked }))}
                className="w-4 h-4"
              />
              <span>Contributes to CA sub-total</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={componentForm.is_active}
                onChange={(e) => setComponentForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4"
              />
              <span>Active</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => { setShowComponentForm(false); setComponentForm(blankComponent()); }}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <SaveButton
              saving={saving}
              label={componentForm.id ? 'Update Component' : 'Create Component'}
              onClick={() => componentForm.id ? handleUpdateComponent(componentForm.id) : handleCreateComponent()}
            />
          </div>
        </ModalShell>
      )}

      {/* ── Exam Type Modal ── */}
      {showExamTypeForm && (
        <ModalShell
          title={examTypeForm.id ? 'Edit Exam Type' : 'Create Exam Type'}
          subtitle="Labels the category of an exam session"
          icon={FileText}
          onClose={() => { setShowExamTypeForm(false); setExamTypeForm(blankExamType()); }}
        >
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Name" required>
              <input
                type="text"
                value={examTypeForm.name}
                onChange={(e) => setExamTypeForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="e.g. First CA"
              />
            </FormField>
            <FormField label="Code" required>
              <input
                type="text"
                value={examTypeForm.code}
                onChange={(e) =>
                  setExamTypeForm((f) => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))
                }
                className={inputCls}
                placeholder="e.g. first_ca"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category">
              <select
                value={examTypeForm.category}
                onChange={(e) => setExamTypeForm((f) => ({ ...f, category: e.target.value as any }))}
                className={inputCls}
              >
                <option value="CA">Continuous Assessment</option>
                <option value="EXAM">Examination</option>
                <option value="PRACTICAL">Practical</option>
                <option value="PROJECT">Project</option>
                <option value="OTHER">Other</option>
              </select>
            </FormField>
            <FormField label="Display Order">
              <input
                type="number"
                min={0}
                value={examTypeForm.display_order}
                onChange={(e) => setExamTypeForm((f) => ({ ...f, display_order: Number(e.target.value) }))}
                className={inputCls}
              />
            </FormField>
          </div>
          <FormField label="Description">
            <textarea
              value={examTypeForm.description}
              onChange={(e) => setExamTypeForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className={inputCls}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={examTypeForm.is_active}
              onChange={(e) => setExamTypeForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="w-4 h-4"
            />
            Active
          </label>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => { setShowExamTypeForm(false); setExamTypeForm(blankExamType()); }}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <SaveButton
              saving={saving}
              label={examTypeForm.id ? 'Update' : 'Create'}
              onClick={() => examTypeForm.id ? handleUpdateExamType(examTypeForm.id) : handleCreateExamType()}
            />
          </div>
        </ModalShell>
      )}

      {/* ── Exam Session Modal ── */}
      {showExamSessionForm && (
        <ModalShell
          title={examSessionForm.id ? 'Edit Exam Session' : 'Create Exam Session'}
          subtitle="Schedule an exam period within a term and academic session"
          icon={Calendar}
          onClose={() => { setShowExamSessionForm(false); setExamSessionForm(blankExamSession()); }}
        >
          <FormField label="Session Name" required>
            <input
              type="text"
              value={examSessionForm.name}
              onChange={(e) => setExamSessionForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="e.g. 2024/2025 First Term CA"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Exam Type" required>
              <select
                value={String(examSessionForm.exam_type)}
                onChange={(e) => setExamSessionForm((f) => ({ ...f, exam_type: e.target.value }))}
                className={inputCls}
              >
                <option value="">Select exam type…</option>
                {examTypes.filter((et) => et.is_active).map((et) => (
                  <option key={et.id} value={et.id}>{et.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Term" required>
              <select
                value={String(examSessionForm.term)}
                onChange={(e) => setExamSessionForm((f) => ({ ...f, term: e.target.value }))}
                className={inputCls}
              >
                <option value="">Select term…</option>
                {academicTerms.length > 0
                  ? academicTerms.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))
                  : (
                    <>
                      <option value="1">First Term</option>
                      <option value="2">Second Term</option>
                      <option value="3">Third Term</option>
                    </>
                  )}
              </select>
            </FormField>
          </div>
          <FormField label="Academic Session" required>
            <select
              value={String(examSessionForm.academic_session)}
              onChange={(e) => setExamSessionForm((f) => ({ ...f, academic_session: e.target.value }))}
              className={inputCls}
            >
              <option value="">Select academic session…</option>
              {academicSessions.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date">
              <input
                type="date"
                value={examSessionForm.start_date}
                onChange={(e) => setExamSessionForm((f) => ({ ...f, start_date: e.target.value }))}
                className={inputCls}
              />
            </FormField>
            <FormField label="End Date">
              <input
                type="date"
                value={examSessionForm.end_date}
                onChange={(e) => setExamSessionForm((f) => ({ ...f, end_date: e.target.value }))}
                className={inputCls}
              />
            </FormField>
          </div>
          <FormField label="Result Release Date">
            <input
              type="date"
              value={examSessionForm.result_release_date}
              onChange={(e) => setExamSessionForm((f) => ({ ...f, result_release_date: e.target.value }))}
              className={inputCls}
            />
          </FormField>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={examSessionForm.is_active}
                onChange={(e) => setExamSessionForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4"
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={examSessionForm.is_published}
                onChange={(e) => setExamSessionForm((f) => ({ ...f, is_published: e.target.checked }))}
                className="w-4 h-4"
              />
              Published
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => { setShowExamSessionForm(false); setExamSessionForm(blankExamSession()); }}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <SaveButton
              saving={saving}
              label={examSessionForm.id ? 'Update Session' : 'Create Session'}
              onClick={() => examSessionForm.id
                ? handleUpdateExamSession(examSessionForm.id)
                : handleCreateExamSession()}
            />
          </div>
        </ModalShell>
      )}

      {/* ── Grading System Modal ── */}
      {showGradingSystemForm && (
        <ModalShell
          title={gradingSystemForm.id ? 'Edit Grading System' : 'Create Grading System'}
          subtitle="Define the grading scale — then add grade ranges inside it"
          icon={Award}
          onClose={() => { setShowGradingSystemForm(false); setGradingSystemForm(blankGradingSystem()); }}
        >
          <FormField label="Name" required>
            <input
              type="text"
              value={gradingSystemForm.name}
              onChange={(e) => setGradingSystemForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="e.g. Nigerian Secondary School Scale"
            />
          </FormField>
          <FormField label="Grading Type">
            <select
              value={gradingSystemForm.grading_type}
              onChange={(e) => setGradingSystemForm((f) => ({ ...f, grading_type: e.target.value as any }))}
              className={inputCls}
            >
              <option value="PERCENTAGE">Percentage (0–100)</option>
              <option value="POINTS">Points (GPA)</option>
              <option value="LETTER">Letter Grades</option>
              <option value="PASS_FAIL">Pass / Fail</option>
            </select>
          </FormField>
          <FormField label="Description">
            <textarea
              value={gradingSystemForm.description}
              onChange={(e) => setGradingSystemForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className={inputCls}
            />
          </FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Min Score">
              <input
                type="number"
                value={gradingSystemForm.min_score}
                onChange={(e) => setGradingSystemForm((f) => ({ ...f, min_score: Number(e.target.value) }))}
                className={inputCls}
              />
            </FormField>
            <FormField label="Max Score">
              <input
                type="number"
                value={gradingSystemForm.max_score}
                onChange={(e) => setGradingSystemForm((f) => ({ ...f, max_score: Number(e.target.value) }))}
                className={inputCls}
              />
            </FormField>
            <FormField label="Pass Mark">
              <input
                type="number"
                value={gradingSystemForm.pass_mark}
                onChange={(e) => setGradingSystemForm((f) => ({ ...f, pass_mark: Number(e.target.value) }))}
                className={inputCls}
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={gradingSystemForm.is_active}
              onChange={(e) => setGradingSystemForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="w-4 h-4"
            />
            Active
          </label>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => { setShowGradingSystemForm(false); setGradingSystemForm(blankGradingSystem()); }}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <SaveButton
              saving={saving}
              label={gradingSystemForm.id ? 'Update' : 'Create'}
              onClick={() => gradingSystemForm.id
                ? handleUpdateGradingSystem(gradingSystemForm.id)
                : handleCreateGradingSystem()}
            />
          </div>
        </ModalShell>
      )}

      {/* ── Grades Management Modal ── */}
      {showGradesModal && selectedGradingSystem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="bg-black px-8 py-5 rounded-t-2xl flex items-center justify-between">
              <div>
                <p className="text-xl font-bold text-white">Grades — {selectedGradingSystem.name}</p>
                <p className="text-white/70 text-sm">
                  Range: {selectedGradingSystem.min_score}–{selectedGradingSystem.max_score} · Pass mark: {selectedGradingSystem.pass_mark}
                </p>
              </div>
              <button
                onClick={() => { setShowGradesModal(false); setSelectedGradingSystem(null); }}
                className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <button
                onClick={() => {
                  setGradeForm(blankGrade(selectedGradingSystem.id));
                  setShowGradeForm(true);
                }}
                className="mb-5 flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Grade
              </button>
              <div className="space-y-3">
                {grades
                  .filter((g) => g.grading_system === selectedGradingSystem.id)
                  .sort((a, b) => Number(b.min_score) - Number(a.min_score))
                  .map((g) => (
                    <div key={g.id} className="border border-gray-200 rounded-xl p-4 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="bg-gray-100 text-gray-900 font-bold text-lg w-10 h-10 rounded-full flex items-center justify-center">
                          {g.grade}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{g.remark}</p>
                          <p className="text-xs text-gray-500">
                            {g.min_score}–{g.max_score}
                            {g.grade_point !== undefined ? ` · GP: ${g.grade_point}` : ''}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${g.is_passing ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {g.is_passing ? 'Pass' : 'Fail'}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setGradeForm({ id: g.id, grading_system: g.grading_system, grade: g.grade, remark: g.remark, min_score: g.min_score, max_score: g.max_score, grade_point: g.grade_point, description: g.description, is_passing: g.is_passing });
                            setShowGradeForm(true);
                          }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteGrade(g.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                {grades.filter((g) => g.grading_system === selectedGradingSystem.id).length === 0 && (
                  <EmptyState icon={Award} title="No grades defined yet" subtitle="Add grade ranges to define the grading scale" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Grade Form Modal ── */}
      {showGradeForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="bg-black px-8 py-5 rounded-t-2xl flex items-center justify-between">
              <p className="text-xl font-bold text-white">{gradeForm.id ? 'Edit' : 'Create'} Grade</p>
              <button
                onClick={() => { setShowGradeForm(false); setGradeForm(blankGrade(selectedGradingSystem?.id || '')); }}
                className="bg-white/20 text-white p-2 rounded-lg hover:bg-white/30 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Grade" required>
                  <input
                    type="text"
                    value={gradeForm.grade}
                    onChange={(e) => setGradeForm((f) => ({ ...f, grade: e.target.value }))}
                    className={inputCls}
                    placeholder="A, B+…"
                  />
                </FormField>
                <FormField label="Remark" required>
                  <input
                    type="text"
                    value={gradeForm.remark}
                    onChange={(e) => setGradeForm((f) => ({ ...f, remark: e.target.value }))}
                    className={inputCls}
                    placeholder="Excellent, Very Good…"
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField label="Min Score">
                  <input
                    type="number"
                    value={gradeForm.min_score}
                    onChange={(e) => setGradeForm((f) => ({ ...f, min_score: Number(e.target.value) }))}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Max Score">
                  <input
                    type="number"
                    value={gradeForm.max_score}
                    onChange={(e) => setGradeForm((f) => ({ ...f, max_score: Number(e.target.value) }))}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Grade Point" hint="Optional — for GPA systems">
                  <input
                    type="number"
                    step="0.1"
                    value={gradeForm.grade_point ?? ''}
                    onChange={(e) =>
                      setGradeForm((f) => ({ ...f, grade_point: e.target.value ? Number(e.target.value) : undefined }))
                    }
                    className={inputCls}
                    placeholder="4.0"
                  />
                </FormField>
              </div>
              <FormField label="Description">
                <input
                  type="text"
                  value={gradeForm.description}
                  onChange={(e) => setGradeForm((f) => ({ ...f, description: e.target.value }))}
                  className={inputCls}
                  placeholder="Optional notes"
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={gradeForm.is_passing}
                  onChange={(e) => setGradeForm((f) => ({ ...f, is_passing: e.target.checked }))}
                  className="w-4 h-4"
                />
                Passing grade
              </label>
              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  onClick={() => { setShowGradeForm(false); setGradeForm(blankGrade(selectedGradingSystem?.id || '')); }}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <SaveButton
                  saving={saving}
                  label={gradeForm.id ? 'Update Grade' : 'Create Grade'}
                  onClick={() => gradeForm.id ? handleUpdateGrade(gradeForm.id) : handleCreateGrade()}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Scoring Configuration Modal ── */}
      {showScoringConfigForm && (
        <ModalShell
          title={scoringConfigForm.id ? 'Edit Configuration' : 'Create Scoring Configuration'}
          subtitle="High-level parameters used by the PDF report generator"
          icon={Calculator}
          onClose={() => { setShowScoringConfigForm(false); setScoringConfigForm(blankScoringConfig()); }}
          wide
        >
          <InfoBanner>
            Component-level score limits (Test 1, Test 2, Exam…) are defined in{' '}
            <strong>Assessment Components</strong>. This configuration sets the total and type used by the
            report generator. The Total Max Score must equal the sum of active components for this level.
          </InfoBanner>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Configuration Name" required>
              <input
                type="text"
                value={scoringConfigForm.name}
                onChange={(e) => setScoringConfigForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="e.g. Senior Secondary Termly"
              />
            </FormField>
            <FormField label="Education Level" required>
              <select
                value={String(scoringConfigForm.education_level)}
                onChange={(e) =>
                  setScoringConfigForm((f) => ({ ...f, education_level: Number(e.target.value) as any }))
                }
                className={inputCls}
              >
                <option value="">Select level…</option>
                {educationLevels.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Result Type" hint="Termly = per-term report; Session = full academic year report">
            <select
              value={scoringConfigForm.result_type}
              onChange={(e) => setScoringConfigForm((f) => ({ ...f, result_type: e.target.value as any }))}
              className={inputCls}
            >
              {RESULT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FormField>

          {/* Live component summary — updates when education_level changes */}
          <ComponentSummaryPanel
            educationLevelId={scoringConfigForm.education_level || null}
            assessmentComponents={assessmentComponents}
            totalMaxScore={scoringConfigForm.total_max_score}
          />

          <FormField
            label="Total Max Score"
            required
            hint="Must match the sum of active Assessment Components for this level"
          >
            <input
              type="number"
              min={1}
              value={scoringConfigForm.total_max_score}
              onChange={(e) => setScoringConfigForm((f) => ({ ...f, total_max_score: Number(e.target.value) }))}
              className={inputCls}
            />
          </FormField>

          <FormField label="Description">
            <textarea
              value={scoringConfigForm.description}
              onChange={(e) => setScoringConfigForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className={inputCls}
              placeholder="Optional notes about this configuration"
            />
          </FormField>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={scoringConfigForm.is_active}
                onChange={(e) => setScoringConfigForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4"
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={scoringConfigForm.is_default}
                onChange={(e) => setScoringConfigForm((f) => ({ ...f, is_default: e.target.checked }))}
                className="w-4 h-4"
              />
              Set as Default
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => { setShowScoringConfigForm(false); setScoringConfigForm(blankScoringConfig()); }}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <SaveButton
              saving={saving}
              label={scoringConfigForm.id ? 'Update Configuration' : 'Create Configuration'}
              onClick={handleSaveScoringConfig}
            />
          </div>
        </ModalShell>
      )}
    </div>
  );
};

export default ExamsResultTab;