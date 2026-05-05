import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import ResultService from '@/services/ResultService';
import type { EducationLevelType, SubjectResultParams } from '@/services/ResultService';
import ResultCreateTab from '@/components/dashboards/teacher/ResultCreateTab';
import useResultActionsManager from '@/components/dashboards/teacher/ResultActionsManager';
import ComponentScoreRecordingModal from '@/components/dashboards/teacher/ComponentScoreRecordingModal';
import { toast } from 'react-toastify';
import {
  TeacherAssignment,
  StudentResult,
  AcademicSession,
  EducationLevel,
  ResultStatus,
} from '@/types/types';
import {
  Plus, Edit, Trash2, Eye, CheckCircle, AlertCircle, RefreshCw,
  Search, X, FileText, Filter, TrendingUp, Award, Calendar,
  GraduationCap, Grid, List,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'table' | 'card';

/**
 * Internal assignment shape used only within this component.
 * Deliberately does NOT extend TeacherAssignment because the legacy
 * interface has required non-nullable fields (teacher, grade_level, section,
 * academic_year, grade_level_id) that the API never returns for this view.
 */
interface ExtendedAssignment {
  id: number;
  classroom_name: string;
  classroom_id?: number | null;
  section_name: string;
  section_id?: number | null;
  grade_level_name: string;
  education_level?: EducationLevel;
  subject_name: string;
  subject_code: string;
  subject_id: number;
  student_count: number;
  periods_per_week: number;
  is_primary_teacher: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map frontend EducationLevel to the ResultService EducationLevelType */
const toServiceLevel = (level: EducationLevel): EducationLevelType => {
  const map: Record<EducationLevel, EducationLevelType> = {
    NURSERY:           'NURSERY',
    PRIMARY:           'PRIMARY',
    JUNIOR_SECONDARY:  'JUNIOR_SECONDARY',
    SENIOR_SECONDARY:  'SENIOR_SECONDARY',
  };
  return map[level];
};

/** Derive education level from a classroom name when the API doesn't supply it */
const deriveLevel = (className: string): EducationLevel | undefined => {
  if (!className) return undefined;
  const u = className.toUpperCase();
  if (u.includes('JSS') || u.includes('JUNIOR'))   return 'JUNIOR_SECONDARY';
  if (u.includes('SSS') || u.includes('SENIOR'))   return 'SENIOR_SECONDARY';
  if (u.includes('PRIMARY') || /\bP\s*\d/.test(u)) return 'PRIMARY';
  if (u.includes('NURSERY') || u.includes('KG') || u.includes('KINDERGARTEN')) return 'NURSERY';
  return undefined;
};

const safeNum = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

// ─── Component ────────────────────────────────────────────────────────────────

const TeacherResults: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();

  const [results, setResults]                       = useState<StudentResult[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading]                       = useState(true);
  const [error, setError]                           = useState<string | null>(null);
  const [searchTerm, setSearchTerm]                 = useState('');
  const [filterSubject, setFilterSubject]           = useState('all');
  const [filterStatus, setFilterStatus]             = useState('all');
  const [filterLevel, setFilterLevel]               = useState<EducationLevel | 'all'>('all');
  const [showFilters, setShowFilters]               = useState(false);
  const [activeTab, setActiveTab]                   = useState<'results' | 'record'>('results');
  const [viewMode, setViewMode]                     = useState<ViewMode>('table');
  const [showComponentModal, setShowComponentModal] = useState(false);
  const [isMobile, setIsMobile]                     = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Data loading ────────────────────────────────────────────────────────────

  async function loadTeacherData() {
    try {
      setLoading(true);
      setError(null);

      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user as any);
      if (!teacherId) throw new Error('Teacher ID not found');

      const subjects = await TeacherDashboardService.getTeacherSubjects(teacherId);

      // ── Build assignments ──────────────────────────────────────────────────
      const assignments: ExtendedAssignment[] = subjects.flatMap((subject: any) => {
        if (!Array.isArray(subject.assignments)) return [];
        return subject.assignments.map((a: any): ExtendedAssignment => ({
          id: a.id,
          classroom_name: a.classroom_name || 'Unknown',
          classroom_id: a.classroom_id || null,
          section_name: a.section_name || a.section || 'Unknown',
          section_id: a.section_id || null,
          grade_level_name: a.grade_level || 'Unknown',
          education_level: (a.education_level as EducationLevel) || deriveLevel(a.classroom_name),
          subject_name: subject.name || 'Unknown Subject',
          subject_code: subject.code || '',
          subject_id: Number(subject.id),
          student_count: a.student_count || 0,
          periods_per_week: a.periods_per_week || 0,
          is_primary_teacher: a.is_primary_teacher || a.is_class_teacher || false,
        }));
      });

      setTeacherAssignments(assignments as unknown as TeacherAssignment[]);

      // ── Group subject IDs by education level ───────────────────────────────
      const subjectsByLevel: Record<EducationLevel, number[]> = {
        NURSERY: [], PRIMARY: [], JUNIOR_SECONDARY: [], SENIOR_SECONDARY: [],
      };

      // Track classroom info per subject for filtering later
      const classroomIdsBySubject   = new Map<number, Set<number>>();
      const classroomNamesBySubject = new Map<number, Set<string>>();
      const assignmentsBySubject    = new Map<number, ExtendedAssignment[]>();

      assignments.forEach((a) => {
        const level     = a.education_level || deriveLevel(a.classroom_name);
        const subjectId = Number(a.subject_id);
        if (!level || !subjectId) return;

        if (!subjectsByLevel[level].includes(subjectId))
          subjectsByLevel[level].push(subjectId);

        // classroom IDs
        if (!classroomIdsBySubject.has(subjectId))
          classroomIdsBySubject.set(subjectId, new Set());
        if (a.classroom_id)
          classroomIdsBySubject.get(subjectId)!.add(Number(a.classroom_id));

        // classroom names
        if (!classroomNamesBySubject.has(subjectId))
          classroomNamesBySubject.set(subjectId, new Set());
        if (a.classroom_name)
          classroomNamesBySubject.get(subjectId)!.add(a.classroom_name.trim());

        // assignments
        if (!assignmentsBySubject.has(subjectId))
          assignmentsBySubject.set(subjectId, []);
        assignmentsBySubject.get(subjectId)!.push(a);
      });

      const allSubjectIds = new Set(
        Object.values(subjectsByLevel).flat()
      );

      if (allSubjectIds.size === 0) {
        setResults([]);
        return;
      }

      // ── Fetch results per level + subject ──────────────────────────────────
      const fetchPromises = (Object.entries(subjectsByLevel) as [EducationLevel, number[]][])
        .filter(([, ids]) => ids.length > 0)
        .flatMap(([level, ids]) =>
          ids.map((subjectId) => {
            const params: SubjectResultParams = { subject: String(subjectId) };
            const serviceLevel = toServiceLevel(level);

            return ResultService
              .getSubjectResults(serviceLevel, params)         // ✅ correct call
              .then((data) => ({
                data,
                subjectId,
                level,
                classroomIds:   Array.from(classroomIdsBySubject.get(subjectId) || []),
                classroomNames: Array.from(classroomNamesBySubject.get(subjectId) || []),
              }))
              .catch((err) => {
                console.error(`❌ Failed to fetch ${level} results for subject ${subjectId}:`, err);
                return { data: [], subjectId, level, classroomIds: [], classroomNames: [] };
              });
          })
        );

      const settled = await Promise.allSettled(fetchPromises);

      // ── Filter to this teacher's classrooms ────────────────────────────────
      const raw: any[] = [];
      settled.forEach((res) => {
        if (res.status !== 'fulfilled') return;
        const { data, classroomIds, classroomNames } = res.value;

        const idSet   = new Set(classroomIds.map(Number));
        const nameSet = new Set(classroomNames.map((n: string) => n.trim()));

        data.forEach((result: any) => {
          if (!result.student?.id) return;

          const resultName = (
            result.student?.student_class_display ||
            result.student?.student_class ||
            result.classroom_name || ''
          ).trim();

          const resultId = Number(result.classroom_id || result.student?.classroom_id || 0);

          // Include if no classroom filter, or if classroom matches by ID or name
          if (idSet.size === 0 && nameSet.size === 0) { raw.push(result); return; }
          if (idSet.size > 0 && resultId > 0 && idSet.has(resultId)) { raw.push(result); return; }
          if (resultName && nameSet.has(resultName)) { raw.push(result); return; }
        });
      });

      // ── Normalize ──────────────────────────────────────────────────────────
      const normalized: StudentResult[] = raw.map((r: any): StudentResult => {
        const studentId      = r.student?.id ?? r.student_id;
        const subjectId      = r.subject?.id ?? r.subject_id;
        const examSessionId  = r.exam_session?.id ?? r.exam_session_id ?? r.session_id;
        const educationLevel = (r.education_level ?? r.student?.education_level) as EducationLevel;

        let ca_score = 0, exam_score = 0, total_score = 0;

        if (educationLevel === 'NURSERY') {
          total_score = safeNum(r.mark_obtained);
          exam_score  = total_score;
        } else {
          const caTotal = r.ca_total !== undefined
            ? safeNum(r.ca_total)
            : safeNum(r.first_test_score) + safeNum(r.second_test_score) + safeNum(r.third_test_score) +
              safeNum(r.continuous_assessment_score) + safeNum(r.take_home_test_score) +
              safeNum(r.appearance_score) + safeNum(r.practical_score) +
              safeNum(r.project_score) + safeNum(r.note_copying_score);
          ca_score    = r.total_ca_score !== undefined ? safeNum(r.total_ca_score) : caTotal;
          exam_score  = safeNum(r.exam_score ?? r.exam);
          total_score = safeNum(r.total_score) || (ca_score + exam_score);
        }

        const examSession       = typeof r.exam_session === 'object' ? r.exam_session : null;
        const termDisplay       = examSession?.term_display ?? examSession?.term ?? r.term_display ?? 'N/A';
        const examSessionName   = examSession?.name ?? r.exam_session_name ?? 'N/A';

        let academicSessionName = 'N/A';
        if (examSession?.academic_session_name)           academicSessionName = String(examSession.academic_session_name);
        else if (typeof examSession?.academic_session === 'string') academicSessionName = examSession.academic_session;
        else if (examSession?.academic_session?.name)     academicSessionName = String(examSession.academic_session.name);
        else if (r.academic_session_name)                 academicSessionName = String(r.academic_session_name);
        else if (r.academic_session)
          academicSessionName = typeof r.academic_session === 'string'
            ? r.academic_session : (r.academic_session?.name ?? 'N/A');

        const rawSession = r.academic_session && typeof r.academic_session === 'object' ? r.academic_session : null;

        return {
          id: safeNum(r.id),
          student: {
            id: safeNum(studentId),
            full_name: r.student?.full_name ?? r.student_name ?? 'Unknown Student',
            registration_number: r.student?.username ?? r.registration_number ?? '',
            profile_picture: r.student?.profile_picture ?? null,
            education_level: educationLevel,
          },
          subject: {
            id: safeNum(subjectId),
            name: r.subject?.name ?? r.subject_name ?? 'Unknown Subject',
            code: r.subject?.code ?? r.subject_code ?? '',
          },
          exam_session: {
            id: safeNum(examSessionId),
            name: examSessionName,
            term: termDisplay,
            academic_session: academicSessionName,
          },
          academic_session: {
            id: String(rawSession?.id ?? 0),
            name: rawSession?.name || academicSessionName,
            start_date: rawSession?.start_date ?? '',
            end_date: rawSession?.end_date ?? '',
            is_current: rawSession?.is_current ?? false,
            is_active: rawSession?.is_active ?? false,
            created_at: rawSession?.created_at ?? '',
            updated_at: rawSession?.updated_at ?? '',
          } as AcademicSession,
          first_test_score:            safeNum(r.first_test_score),
          second_test_score:           safeNum(r.second_test_score),
          third_test_score:            safeNum(r.third_test_score),
          continuous_assessment_score: safeNum(r.continuous_assessment_score),
          take_home_test_score:        safeNum(r.take_home_test_score),
          appearance_score:            safeNum(r.appearance_score),
          practical_score:             safeNum(r.practical_score),
          project_score:               safeNum(r.project_score),
          note_copying_score:          safeNum(r.note_copying_score),
          ca_score,
          ca_total: ca_score,
          exam_score,
          total_score,
          education_level: educationLevel,
          grade: r.grade ?? r.letter_grade,
          status: (typeof r.status === 'string' ? r.status.toUpperCase() : 'DRAFT') as ResultStatus,
          remarks: r.remarks ?? '',
          created_at: r.created_at ?? '',
          updated_at: r.updated_at ?? '',
        };
      });

      // Final filter: only subjects this teacher teaches
      const finalResults = normalized.filter((r) => allSubjectIds.has(Number(r.subject.id)));
      setResults(finalResults);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load data';
      console.error('❌ Error loading teacher data:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Action manager ──────────────────────────────────────────────────────────

  const {
    handleEditResult,
    handleViewResult,
    handleDeleteResult,
    ResultModalsComponent,
  } = useResultActionsManager(loadTeacherData);

  useEffect(() => {
    if (user && !authLoading) void loadTeacherData();
  }, [user, authLoading]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const availableEducationLevels = useMemo(
    () => Array.from(new Set(results.map((r) => r.education_level))).filter(Boolean) as EducationLevel[],
    [results]
  );

  const availableSubjects = useMemo(
    () =>
      (teacherAssignments as unknown as ExtendedAssignment[]).map((a) => ({
        id: String(a.subject_id),
        name: String(a.subject_name || 'Unknown'),
        code: String(a.subject_code || ''),
      })),
    [teacherAssignments]
  );

  const filteredResults = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return results.filter((r) => {
      const matchSearch =
        (r.student?.full_name || '').toLowerCase().includes(term) ||
        (r.student?.registration_number || '').toLowerCase().includes(term) ||
        (r.subject?.name || '').toLowerCase().includes(term);
      const matchSubject = filterSubject === 'all' || String(r.subject?.id ?? '') === filterSubject;
      const matchStatus  = filterStatus  === 'all' || (r.status || '').toLowerCase() === filterStatus.toLowerCase();
      const matchLevel   = filterLevel   === 'all' || r.education_level === filterLevel;
      return matchSearch && matchSubject && matchStatus && matchLevel;
    });
  }, [results, searchTerm, filterSubject, filterStatus, filterLevel]);

  const stats = useMemo(() => {
    const total     = results.length;
    const published = results.filter((r) => r.status === 'PUBLISHED').length;
    const valid     = results.filter((r) => r.total_score > 0);
    const average   = valid.length > 0
      ? Math.round(valid.reduce((s, r) => s + r.total_score, 0) / valid.length) : 0;
    const aGrades   = results.filter((r) => r.grade === 'A' || r.grade === 'A+').length;
    return [
      { label: 'Total',     value: total,     icon: FileText,    color: 'bg-blue-500'   },
      { label: 'Published', value: published, icon: CheckCircle, color: 'bg-green-500'  },
      { label: 'Average',   value: average,   icon: TrendingUp,  color: 'bg-purple-500' },
      { label: 'A Grades',  value: aGrades,   icon: Award,       color: 'bg-amber-500'  },
    ];
  }, [results]);

  // ── Colours ─────────────────────────────────────────────────────────────────

  // ResultStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED' (SUBMITTED removed from backend)
  const statusColor = (status: string) => ({
    DRAFT:     'bg-amber-100 text-amber-700 border-amber-200',
    APPROVED:  'bg-blue-100 text-blue-700 border-blue-200',
    PUBLISHED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  }[status] || 'bg-amber-100 text-amber-700 border-amber-200');

  const gradeColor = (grade?: string) => ({
    A: 'bg-green-500 text-white', B: 'bg-blue-500 text-white',
    C: 'bg-yellow-500 text-white', D: 'bg-orange-500 text-white',
    F: 'bg-red-500 text-white',
  }[grade || ''] || 'bg-gray-400 text-white');

  // ── Guards ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <TeacherDashboardLayout>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600" />
          <p className="text-gray-600 font-medium">Loading Results…</p>
        </div>
      </div>
    </TeacherDashboardLayout>
  );

  if (error) return (
    <TeacherDashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <div className="max-w-2xl mx-auto bg-red-50 border-2 border-red-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
            <h3 className="text-lg font-semibold text-red-900">Error Loading Data</h3>
          </div>
          <p className="text-sm text-red-800 mb-4">{error}</p>
          <button onClick={loadTeacherData}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
            Try Again
          </button>
        </div>
      </div>
    </TeacherDashboardLayout>
  );

  if (activeTab === 'record') return (
    <TeacherDashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6">
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-lg p-4 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Record Result</h2>
            <button onClick={() => setActiveTab('results')}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-2">
              <X className="w-4 h-4" /> Close
            </button>
          </div>
          <ResultCreateTab
            onResultCreated={loadTeacherData}
            onSuccess={async () => { await loadTeacherData(); setActiveTab('results'); toast.success('Result saved'); }}
            onClose={() => setActiveTab('results')}
          />
        </div>
      </div>
    </TeacherDashboardLayout>
  );

  // ── Main view ───────────────────────────────────────────────────────────────

  const EmptyState = () => (
    <div className="p-8 md:p-12 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <FileText className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">No results found</h3>
      <p className="text-sm text-gray-500 mb-6">
        {searchTerm || filterSubject !== 'all' || filterStatus !== 'all' || filterLevel !== 'all'
          ? 'Try adjusting your filters'
          : 'Start by recording your first result'}
      </p>
      <button onClick={() => setActiveTab('record')}
        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg inline-flex items-center gap-2 font-medium text-sm">
        <Plus className="w-4 h-4" /> Record First Result
      </button>
    </div>
  );

  return (
    <TeacherDashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">

        {/* ── Sticky header ── */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base md:text-lg font-bold text-gray-900 truncate">Results</h1>
                <p className="text-xs text-gray-500 hidden sm:block">Manage student performance</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={loadTeacherData} disabled={loading}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50" title="Refresh">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowComponentModal(true)}
                className="px-3 md:px-4 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 flex items-center gap-1.5 text-sm font-medium transition-colors"
                title="Record one component at a time (CA, Test, Exam…)"
              >
                <GraduationCap className="w-4 h-4" />
                <span className="hidden sm:inline">Record by Component</span>
              </button>
              <button onClick={() => setActiveTab('record')}
                className="px-3 md:px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg flex items-center gap-1.5 text-sm font-medium">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Record All</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4 space-y-3 md:space-y-4">

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
            {stats.map((s, i) => (
              <div key={i} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600 truncate">{s.label}</p>
                    <p className="text-xl md:text-2xl font-bold text-gray-900">{s.value}</p>
                  </div>
                  <div className={`w-9 h-9 md:w-10 md:h-10 ${s.color} rounded-lg flex items-center justify-center shrink-0`}>
                    <s.icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Search + Filters ── */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input type="text" placeholder="Search student, subject…"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <button onClick={() => setShowFilters(!showFilters)}
                className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm flex items-center gap-1.5">
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                {(filterSubject !== 'all' || filterStatus !== 'all' || filterLevel !== 'all') && (
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                )}
              </button>
              <div className="hidden md:flex border border-gray-200 rounded-lg overflow-hidden">
                {(['table', 'card'] as ViewMode[]).map((m, i) => (
                  <button key={m} onClick={() => setViewMode(m)}
                    className={`p-2 transition-colors ${viewMode === m ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'} ${i > 0 ? 'border-l border-gray-200' : ''}`}>
                    {m === 'table' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value as EducationLevel | 'all')}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">All Levels</option>
                  {availableEducationLevels.map((l) => (
                    <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">All Subjects</option>
                  {availableSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">All Status</option>
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                  <option value="published">Published</option>
                </select>
              </div>
            )}
          </div>

          {/* ── Results ── */}
          {(viewMode === 'card' || isMobile) ? (
            /* Card view */
            <div className="space-y-3">
              <p className="text-xs md:text-sm text-gray-600 px-1">
                {filteredResults.length} of {results.length} results
              </p>
              {filteredResults.length === 0 ? (
                <div className="bg-white rounded-lg"><EmptyState /></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredResults.map((result) => (
                    <div key={result.id} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 border-b border-gray-100">
                        <div className="flex items-start gap-2">
                          {result.student.profile_picture ? (
                            <img src={result.student.profile_picture} alt={result.student.full_name}
                              className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold shrink-0 text-sm">
                              {result.student.full_name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-gray-900 truncate">{result.student.full_name}</h3>
                            <p className="text-xs text-gray-500 truncate">{result.student.registration_number || 'N/A'}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${statusColor(result.status ?? 'DRAFT')}`}>
                            {result.status ?? 'DRAFT'}
                          </span>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">Subject</span>
                          <span className="font-medium text-gray-900 truncate ml-2">{result.subject?.name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{result.exam_session?.term || 'N/A'} · {result.exam_session?.academic_session || 'N/A'}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                          {[
                            { label: 'CA', value: result.ca_score, bg: 'bg-blue-50', text: 'text-blue-900' },
                            { label: 'Exam', value: result.exam_score, bg: 'bg-purple-50', text: 'text-purple-900' },
                            { label: 'Total', value: result.total_score, bg: 'bg-green-50', text: 'text-green-900' },
                          ].map(({ label, value, bg, text }) => (
                            <div key={label} className="text-center">
                              <p className="text-xs text-gray-500 mb-1">{label}</p>
                              <div className={`${bg} rounded-lg py-1.5`}>
                                <p className={`text-base font-bold ${text}`}>{value}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between pt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Grade</span>
                            <span className={`w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center ${gradeColor(result.grade)}`}>
                              {result.grade ?? '—'}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => handleViewResult(result)} className="p-1.5 hover:bg-blue-50 rounded-lg" title="View"><Eye className="w-4 h-4 text-gray-600" /></button>
                            <button onClick={() => handleEditResult(result)} className="p-1.5 hover:bg-indigo-50 rounded-lg" title="Edit"><Edit className="w-4 h-4 text-gray-600" /></button>
                            <button onClick={() => handleDeleteResult(result)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4 text-gray-600" /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Table view */
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-3 md:p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base md:text-lg font-semibold text-gray-900">Student Results</h2>
                  <p className="text-xs md:text-sm text-gray-500">{filteredResults.length} of {results.length} results</p>
                </div>
              </div>

              {filteredResults.length === 0 ? <EmptyState /> : (
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ minWidth: 1100 }}>
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                      <tr>
                        {[
                          { label: 'Student', w: 200 },
                          { label: 'Subject', w: 160 },
                          { label: 'Session', w: 180 },
                          { label: 'CA', w: 80, cls: 'text-center bg-blue-50 text-blue-800' },
                          { label: 'Exam', w: 80, cls: 'text-center bg-purple-50 text-purple-800' },
                          { label: 'Total', w: 80, cls: 'text-center bg-green-50 text-green-800' },
                          { label: 'Grade', w: 70, cls: 'text-center' },
                          { label: 'Status', w: 110, cls: 'text-center' },
                          { label: 'Actions', w: 130, cls: 'text-center' },
                        ].map(({ label, w, cls }) => (
                          <th key={label} style={{ minWidth: w }}
                            className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-700 ${cls || 'text-left'}`}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {filteredResults.map((result, idx) => (
                        <tr key={result.id} className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                          <td className="px-3 py-2.5" style={{ minWidth: 200 }}>
                            <div className="flex items-center gap-2">
                              {result.student.profile_picture ? (
                                <img src={result.student.profile_picture} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                                  {result.student.full_name?.charAt(0) || '?'}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-gray-900 truncate">{result.student.full_name}</p>
                                <p className="text-xs text-gray-500 truncate">{result.student.registration_number || 'N/A'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth: 160 }}>
                            <p className="text-xs font-medium text-gray-900 truncate">{result.subject?.name || 'N/A'}</p>
                            <p className="text-xs text-gray-500">{result.subject?.code || ''}</p>
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth: 180 }}>
                            <p className="text-xs text-gray-900 truncate">{result.exam_session?.term || 'N/A'}</p>
                            <p className="text-xs text-gray-500 truncate">{result.exam_session?.academic_session || 'N/A'}</p>
                          </td>
                          {[
                            { v: result.ca_score,    bg: 'bg-blue-100',   text: 'text-blue-900'   },
                            { v: result.exam_score,  bg: 'bg-purple-100', text: 'text-purple-900' },
                            { v: result.total_score, bg: 'bg-green-100',  text: 'text-green-900'  },
                          ].map(({ v, bg, text }, i) => (
                            <td key={i} className="px-3 py-2.5 text-center" style={{ minWidth: 80 }}>
                              <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg ${bg} ${text} font-bold text-xs`}>{v}</span>
                            </td>
                          ))}
                          <td className="px-3 py-2.5 text-center" style={{ minWidth: 70 }}>
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-xs ${gradeColor(result.grade)}`}>
                              {result.grade ?? '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center" style={{ minWidth: 110 }}>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor(result.status ?? 'DRAFT')}`}>
                              {result.status ?? 'DRAFT'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center" style={{ minWidth: 130 }}>
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleViewResult(result)}   className="p-1.5 hover:bg-blue-50 rounded-lg" title="View"><Eye className="w-4 h-4 text-gray-600" /></button>
                              <button onClick={() => handleEditResult(result)}   className="p-1.5 hover:bg-indigo-50 rounded-lg" title="Edit"><Edit className="w-4 h-4 text-gray-600" /></button>
                              <button onClick={() => handleDeleteResult(result)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4 text-gray-600" /></button>
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

        <ResultModalsComponent />
      </div>

      {/* Component-by-component score recording modal */}
      <ComponentScoreRecordingModal
        open={showComponentModal}
        onClose={() => { setShowComponentModal(false); void loadTeacherData(); }}
        assignments={(teacherAssignments as unknown as ExtendedAssignment[]).map(a => ({
          subject_id:      a.subject_id,
          subject_name:    a.subject_name,
          subject_code:    a.subject_code,
          classroom_id:    a.classroom_id ?? null,
          classroom_name:  a.classroom_name,
          education_level: a.education_level as string | undefined,
        }))}
      />
    </TeacherDashboardLayout>
  );
};

export default TeacherResults;