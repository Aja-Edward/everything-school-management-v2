import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { toast } from 'react-toastify';
import classroomService, {
  Classroom,
  ClassroomStats,
  ClassroomTeacherAssignment,
  CreateClassroomData,
  UpdateClassroomData,
  AssignTeacherData,
  RemoveTeacherAssignmentData,
  CreateTeacherAssignmentData,
  UpdateTeacherAssignmentData,
  TransferStudentData,
  TransferStudentResponse,
  GradeLevel,
  Section,
  AcademicSession,
  Term,
  Stream,
  Teacher,
  Subject,
  EducationLevelType,
} from '@/services/ClassroomService';

// ============================================================================
// TYPES
// ============================================================================

interface LoadingState {
  classrooms: boolean;
  stats: boolean;
  gradeLevels: boolean;
  sections: boolean;
  academicSessions: boolean;
  terms: boolean;
  teachers: boolean;
  subjects: boolean;
  streams: boolean;
  students: boolean; // per-classroom student fetches
  transferring: boolean;
}

interface ClassroomContextValue {
  // ── DATA ──────────────────────────────────────────────────────────────────
  classrooms: Classroom[];
  filteredClassrooms: Classroom[];
  selectedClassroom: Classroom | null;
  stats: ClassroomStats | null;
  gradeLevels: GradeLevel[];
  sections: Section[];
  academicSessions: AcademicSession[];
  terms: Term[];
  teachers: Teacher[];
  subjects: Subject[];
  streams: Stream[];

  // ── LOADING / ERROR ───────────────────────────────────────────────────────
  loading: LoadingState;
  error: string | null;

  // ── FILTERS ───────────────────────────────────────────────────────────────
  searchTerm: string;
  levelFilter: EducationLevelType | 'all';
  statusFilter: 'all' | 'active' | 'inactive';
  setSearchTerm: (v: string) => void;
  setLevelFilter: (v: EducationLevelType | 'all') => void;
  setStatusFilter: (v: 'all' | 'active' | 'inactive') => void;

  // ── SELECTION ─────────────────────────────────────────────────────────────
  setSelectedClassroom: (c: Classroom | null) => void;

  // ── CLASSROOM CRUD ────────────────────────────────────────────────────────
  loadClassrooms: () => Promise<void>;
  createClassroom: (data: CreateClassroomData) => Promise<Classroom>;
  updateClassroom: (id: number, data: UpdateClassroomData) => Promise<Classroom>;
  deleteClassroom: (id: number) => Promise<void>;
  refreshClassroom: (id: number) => Promise<void>;

  // ── STATS ─────────────────────────────────────────────────────────────────
  loadStats: () => Promise<void>;

  // ── ACADEMIC STRUCTURE ────────────────────────────────────────────────────
  loadGradeLevels: () => Promise<void>;
  loadSections: (gradeLevelId: number) => Promise<void>;
  loadAcademicSessions: () => Promise<void>;
  loadTerms: (academicSessionId?: number) => Promise<void>;
  loadStreams: () => Promise<void>;

  // ── PEOPLE ────────────────────────────────────────────────────────────────
  loadTeachers: () => Promise<void>;
  loadSubjects: () => Promise<void>;

  // ── TEACHER ASSIGNMENTS ───────────────────────────────────────────────────
  assignTeacher: (classroomId: number, data: AssignTeacherData) => Promise<void>;
  removeTeacher: (classroomId: number, data: RemoveTeacherAssignmentData) => Promise<void>;
  createTeacherAssignment: (data: CreateTeacherAssignmentData) => Promise<void>;
  updateTeacherAssignment: (id: number, data: UpdateTeacherAssignmentData) => Promise<void>;
  deleteTeacherAssignment: (id: number) => Promise<void>;

  // ── STUDENT ENROLLMENT ────────────────────────────────────────────────────
  enrollStudent: (classroomId: number, studentId: number) => Promise<void>;
  unenrollStudent: (classroomId: number, studentId: number) => Promise<void>;
  transferStudent: (
    sourceClassroomId: number,
    data: TransferStudentData
  ) => Promise<TransferStudentResponse>;

  // ── CAPACITY ──────────────────────────────────────────────────────────────
  setCapacity: (classroomId: number, maxCapacity: number) => Promise<void>;

  // ── CLASSROOM DETAIL DATA ─────────────────────────────────────────────────
  getClassroomStudents: (classroomId: number) => Promise<any[]>;
  getClassroomTeachers: (classroomId: number) => Promise<ClassroomTeacherAssignment[]>;
  getClassroomSchedule: (classroomId: number) => Promise<any[]>;
  getClassroomSubjects: (classroomId: number) => Promise<Subject[]>;

  // ── UTILITY ───────────────────────────────────────────────────────────────
  loadInitialData: () => Promise<void>;
  clearError: () => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const ClassroomContext = createContext<ClassroomContextValue | null>(null);

// ============================================================================
// HELPERS
// ============================================================================

const toArray = <T,>(res: any): T[] => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res?.data)) return res.data;
  return [];
};

const initialLoading: LoadingState = {
  classrooms: false,
  stats: false,
  gradeLevels: false,
  sections: false,
  academicSessions: false,
  terms: false,
  teachers: false,
  subjects: false,
  streams: false,
  students: false,
  transferring: false,
};

// ============================================================================
// PROVIDER
// ============================================================================

export const ClassroomProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // ── Core data ──────────────────────────────────────────────────────────────
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [filteredClassrooms, setFilteredClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [stats, setStats] = useState<ClassroomStats | null>(null);

  // ── Academic structure ─────────────────────────────────────────────────────
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [academicSessions, setAcademicSessions] = useState<AcademicSession[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);

  // ── People ─────────────────────────────────────────────────────────────────
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState<LoadingState>(initialLoading);
  const [error, setError] = useState<string | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<EducationLevelType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Prevent double-loading on mount
  const initialLoadDone = useRef(false);

  // ── Filter effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    let result = classrooms;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          c.grade_level_name.toLowerCase().includes(q) ||
          c.section_name.toLowerCase().includes(q) ||
          c.academic_session_name.toLowerCase().includes(q)
      );
    }

    if (levelFilter !== 'all') {
      result = result.filter(c => c.education_level === levelFilter);
    }

    if (statusFilter !== 'all') {
      result = result.filter(c => c.is_active === (statusFilter === 'active'));
    }

    setFilteredClassrooms(result);
  }, [classrooms, searchTerm, levelFilter, statusFilter]);

  // ── Loading helpers ────────────────────────────────────────────────────────
  const setLoadingKey = (key: keyof LoadingState, value: boolean) =>
    setLoading(prev => ({ ...prev, [key]: value }));

  const handleError = (err: any, fallback: string) => {
    const msg =
      err?.response?.data?.detail ||
      err?.response?.data?.error ||
      err?.message ||
      fallback;
    setError(msg);
    return msg;
  };

  // ============================================================================
  // CLASSROOM CRUD
  // ============================================================================

  const loadClassrooms = useCallback(async () => {
    setLoadingKey('classrooms', true);
    setError(null);
    try {
      const res = await classroomService.getClassrooms();
      setClassrooms(toArray<Classroom>(res));
    } catch (err: any) {
      handleError(err, 'Failed to load classrooms');
    } finally {
      setLoadingKey('classrooms', false);
    }
  }, []);

  const createClassroom = useCallback(async (data: CreateClassroomData): Promise<Classroom> => {
    try {
      const res = await classroomService.createClassroom(data);
      const created = res as Classroom;
      setClassrooms(prev => [...prev, created]);
      toast.success(`Classroom "${created.name}" created successfully`);
      return created;
    } catch (err: any) {
      const msg = handleError(err, 'Failed to create classroom');
      toast.error(msg);
      throw err;
    }
  }, []);

  const updateClassroom = useCallback(
    async (id: number, data: UpdateClassroomData): Promise<Classroom> => {
      try {
        const res = await classroomService.updateClassroom(id, data);
        const updated = res as Classroom;
        setClassrooms(prev => prev.map(c => (c.id === id ? updated : c)));
        if (selectedClassroom?.id === id) setSelectedClassroom(updated);
        toast.success(`Classroom updated successfully`);
        return updated;
      } catch (err: any) {
        const msg = handleError(err, 'Failed to update classroom');
        toast.error(msg);
        throw err;
      }
    },
    [selectedClassroom]
  );

  const deleteClassroom = useCallback(async (id: number) => {
    try {
      await classroomService.deleteClassroom(id);
      setClassrooms(prev => prev.filter(c => c.id !== id));
      if (selectedClassroom?.id === id) setSelectedClassroom(null);
      toast.success('Classroom deleted successfully');
    } catch (err: any) {
      const msg = handleError(err, 'Failed to delete classroom');
      toast.error(msg);
      throw err;
    }
  }, [selectedClassroom]);

  const refreshClassroom = useCallback(async (id: number) => {
    try {
      const res = await classroomService.getClassroom(id);
      const updated = res as Classroom;
      setClassrooms(prev => prev.map(c => (c.id === id ? updated : c)));
      if (selectedClassroom?.id === id) setSelectedClassroom(updated);
    } catch (err: any) {
      handleError(err, 'Failed to refresh classroom');
    }
  }, [selectedClassroom]);

  // ============================================================================
  // STATS
  // ============================================================================

  const loadStats = useCallback(async () => {
    setLoadingKey('stats', true);
    try {
      const res = await classroomService.getClassroomStats();
      setStats(res as ClassroomStats);
    } catch (err: any) {
      handleError(err, 'Failed to load classroom statistics');
    } finally {
      setLoadingKey('stats', false);
    }
  }, []);

  // ============================================================================
  // ACADEMIC STRUCTURE
  // ============================================================================

  const loadGradeLevels = useCallback(async () => {
    setLoadingKey('gradeLevels', true);
    try {
      const res = await classroomService.getGradeLevels();
      setGradeLevels(toArray<GradeLevel>(res));
    } catch (err: any) {
      handleError(err, 'Failed to load grade levels');
    } finally {
      setLoadingKey('gradeLevels', false);
    }
  }, []);

  const loadSections = useCallback(async (gradeLevelId: number) => {
    setLoadingKey('sections', true);
    try {
      const res = await classroomService.getSections(gradeLevelId);
      setSections(toArray<Section>(res));
    } catch (err: any) {
      handleError(err, 'Failed to load sections');
      setSections([]);
    } finally {
      setLoadingKey('sections', false);
    }
  }, []);

  const loadAcademicSessions = useCallback(async () => {
    setLoadingKey('academicSessions', true);
    try {
      const res = await classroomService.getAcademicYears();
      setAcademicSessions(toArray<AcademicSession>(res));
    } catch (err: any) {
      handleError(err, 'Failed to load academic sessions');
    } finally {
      setLoadingKey('academicSessions', false);
    }
  }, []);

  const loadTerms = useCallback(async (academicSessionId?: number) => {
    setLoadingKey('terms', true);
    try {
      const res = await classroomService.getTerms(academicSessionId);
      setTerms(toArray<Term>(res));
    } catch (err: any) {
      handleError(err, 'Failed to load terms');
      setTerms([]);
    } finally {
      setLoadingKey('terms', false);
    }
  }, []);

  const loadStreams = useCallback(async () => {
    setLoadingKey('streams', true);
    try {
      const res = await classroomService.getStreams();
      setStreams(toArray<Stream>(res));
    } catch (err: any) {
      handleError(err, 'Failed to load streams');
    } finally {
      setLoadingKey('streams', false);
    }
  }, []);

  // ============================================================================
  // PEOPLE
  // ============================================================================

  const loadTeachers = useCallback(async () => {
    setLoadingKey('teachers', true);
    try {
      const res = await classroomService.getAllTeachers();
      setTeachers(toArray<Teacher>(res));
    } catch (err: any) {
      handleError(err, 'Failed to load teachers');
    } finally {
      setLoadingKey('teachers', false);
    }
  }, []);

  const loadSubjects = useCallback(async () => {
    setLoadingKey('subjects', true);
    try {
      const res = await classroomService.getAllSubjects();
      setSubjects(toArray<Subject>(res));
    } catch (err: any) {
      handleError(err, 'Failed to load subjects');
    } finally {
      setLoadingKey('subjects', false);
    }
  }, []);

  // ============================================================================
  // TEACHER ASSIGNMENTS
  // ============================================================================

  const assignTeacher = useCallback(
    async (classroomId: number, data: AssignTeacherData) => {
      try {
        await classroomService.assignTeacherToClassroom(classroomId, data);
        toast.success('Teacher assigned successfully');
        await refreshClassroom(classroomId);
      } catch (err: any) {
        const msg = handleError(err, 'Failed to assign teacher');
        toast.error(msg);
        throw err;
      }
    },
    [refreshClassroom]
  );

  const removeTeacher = useCallback(
    async (classroomId: number, data: RemoveTeacherAssignmentData) => {
      try {
        await classroomService.removeTeacherFromClassroom(classroomId, data);
        toast.success('Teacher removed successfully');
        await refreshClassroom(classroomId);
      } catch (err: any) {
        const msg = handleError(err, 'Failed to remove teacher');
        toast.error(msg);
        throw err;
      }
    },
    [refreshClassroom]
  );

  const createTeacherAssignment = useCallback(async (data: CreateTeacherAssignmentData) => {
    try {
      await classroomService.createTeacherAssignment(data);
      toast.success('Teacher assignment created');
      await refreshClassroom(data.classroom_id);
    } catch (err: any) {
      const msg = handleError(err, 'Failed to create teacher assignment');
      toast.error(msg);
      throw err;
    }
  }, [refreshClassroom]);

  const updateTeacherAssignment = useCallback(
    async (id: number, data: UpdateTeacherAssignmentData) => {
      try {
        await classroomService.updateTeacherAssignment(id, data);
        toast.success('Assignment updated');
      } catch (err: any) {
        const msg = handleError(err, 'Failed to update assignment');
        toast.error(msg);
        throw err;
      }
    },
    []
  );

  const deleteTeacherAssignment = useCallback(async (id: number) => {
    try {
      await classroomService.deleteTeacherAssignment(id);
      toast.success('Assignment removed');
      // Refresh all classrooms to sync assignment counts
      await loadClassrooms();
    } catch (err: any) {
      const msg = handleError(err, 'Failed to delete assignment');
      toast.error(msg);
      throw err;
    }
  }, [loadClassrooms]);

  // ============================================================================
  // STUDENT ENROLLMENT
  // ============================================================================

  const enrollStudent = useCallback(async (classroomId: number, studentId: number) => {
    try {
      await classroomService.enrollStudent(classroomId, { student_id: studentId });
      toast.success('Student enrolled successfully');
      await refreshClassroom(classroomId);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to enroll student';
      toast.error(msg);
      throw err;
    }
  }, [refreshClassroom]);

  const unenrollStudent = useCallback(async (classroomId: number, studentId: number) => {
    try {
      await classroomService.unenrollStudent(classroomId, { student_id: studentId });
      toast.success('Student unenrolled successfully');
      await refreshClassroom(classroomId);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to unenroll student';
      toast.error(msg);
      throw err;
    }
  }, [refreshClassroom]);

  const transferStudent = useCallback(
    async (
      sourceClassroomId: number,
      data: TransferStudentData
    ): Promise<TransferStudentResponse> => {
      setLoadingKey('transferring', true);
      try {
        const result = await classroomService.transferStudent(sourceClassroomId, data);
        toast.success(result.message || 'Student transferred successfully');
        // Refresh both source and target classrooms
        await Promise.all([
          refreshClassroom(sourceClassroomId),
          refreshClassroom(data.target_classroom_id),
        ]);
        return result;
      } catch (err: any) {
        const msg =
          err?.response?.data?.error ||
          err?.response?.data?.detail ||
          err?.message ||
          'Transfer failed';
        toast.error(msg);
        throw err;
      } finally {
        setLoadingKey('transferring', false);
      }
    },
    [refreshClassroom]
  );

  // ============================================================================
  // CAPACITY
  // ============================================================================

  const setCapacity = useCallback(async (classroomId: number, maxCapacity: number) => {
    try {
      await classroomService.updateClassroom(classroomId, { max_capacity: maxCapacity });
      setClassrooms(prev =>
        prev.map(c => (c.id === classroomId ? { ...c, max_capacity: maxCapacity } : c))
      );
      if (selectedClassroom?.id === classroomId) {
        setSelectedClassroom(prev => prev ? { ...prev, max_capacity: maxCapacity } : prev);
      }
      toast.success('Capacity updated successfully');
    } catch (err: any) {
      const msg = handleError(err, 'Failed to update capacity');
      toast.error(msg);
      throw err;
    }
  }, [selectedClassroom]);

  // ============================================================================
  // CLASSROOM DETAIL DATA (fetched on demand, not stored globally)
  // ============================================================================

  const getClassroomStudents = useCallback(async (classroomId: number): Promise<any[]> => {
    setLoadingKey('students', true);
    try {
      const res = await classroomService.getClassroomStudents(classroomId);
      return toArray(res);
    } catch (err: any) {
      handleError(err, 'Failed to load students');
      return [];
    } finally {
      setLoadingKey('students', false);
    }
  }, []);

  const getClassroomTeachers = useCallback(
    async (classroomId: number): Promise<ClassroomTeacherAssignment[]> => {
      try {
        const res = await classroomService.getClassroomTeachers(classroomId);
        return toArray<ClassroomTeacherAssignment>(res);
      } catch {
        return [];
      }
    },
    []
  );

  const getClassroomSchedule = useCallback(async (classroomId: number): Promise<any[]> => {
    try {
      const res = await classroomService.getClassroomSchedule(classroomId);
      return toArray(res);
    } catch {
      return [];
    }
  }, []);

  const getClassroomSubjects = useCallback(async (classroomId: number): Promise<Subject[]> => {
    try {
      const res = await classroomService.getClassroomSubjects(classroomId);
      return toArray<Subject>(res);
    } catch {
      return [];
    }
  }, []);

  // ============================================================================
  // INITIAL LOAD
  // ============================================================================

  const loadInitialData = useCallback(async () => {
    await Promise.all([
      loadClassrooms(),
      loadGradeLevels(),
      loadAcademicSessions(),
      loadTeachers(),
      loadSubjects(),
      loadStreams(),
    ]);
  }, [
    loadClassrooms,
    loadGradeLevels,
    loadAcademicSessions,
    loadTeachers,
    loadSubjects,
    loadStreams,
  ]);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    loadInitialData();
  }, [loadInitialData]);

  const clearError = useCallback(() => setError(null), []);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: ClassroomContextValue = {
    // Data
    classrooms,
    filteredClassrooms,
    selectedClassroom,
    stats,
    gradeLevels,
    sections,
    academicSessions,
    terms,
    teachers,
    subjects,
    streams,

    // Loading / error
    loading,
    error,

    // Filters
    searchTerm,
    levelFilter,
    statusFilter,
    setSearchTerm,
    setLevelFilter,
    setStatusFilter,

    // Selection
    setSelectedClassroom,

    // Classroom CRUD
    loadClassrooms,
    createClassroom,
    updateClassroom,
    deleteClassroom,
    refreshClassroom,

    // Stats
    loadStats,

    // Academic structure
    loadGradeLevels,
    loadSections,
    loadAcademicSessions,
    loadTerms,
    loadStreams,

    // People
    loadTeachers,
    loadSubjects,

    // Teacher assignments
    assignTeacher,
    removeTeacher,
    createTeacherAssignment,
    updateTeacherAssignment,
    deleteTeacherAssignment,

    // Student enrollment
    enrollStudent,
    unenrollStudent,
    transferStudent,

    // Capacity
    setCapacity,

    // Classroom detail data
    getClassroomStudents,
    getClassroomTeachers,
    getClassroomSchedule,
    getClassroomSubjects,

    // Utility
    loadInitialData,
    clearError,
  };

  return (
    <ClassroomContext.Provider value={value}>
      {children}
    </ClassroomContext.Provider>
  );
};

// ============================================================================
// HOOK
// ============================================================================

export const useClassroom = (): ClassroomContextValue => {
  const ctx = useContext(ClassroomContext);
  if (!ctx) {
    throw new Error('useClassroom must be used inside <ClassroomProvider>');
  }
  return ctx;
};

// ============================================================================
// FOCUSED SELECTOR HOOKS  (prevent unnecessary re-renders)
// ============================================================================

/** Only re-renders when the classroom list changes */
export const useClassroomList = () => {
  const { classrooms, filteredClassrooms, loading, error } = useClassroom();
  return { classrooms, filteredClassrooms, loading: loading.classrooms, error };
};

/** Only re-renders when the selected classroom changes */
export const useSelectedClassroom = () => {
  const { selectedClassroom, setSelectedClassroom, refreshClassroom } = useClassroom();
  return { selectedClassroom, setSelectedClassroom, refreshClassroom };
};

/** All filter state and setters */
export const useClassroomFilters = () => {
  const {
    searchTerm, levelFilter, statusFilter,
    setSearchTerm, setLevelFilter, setStatusFilter,
  } = useClassroom();
  return { searchTerm, levelFilter, statusFilter, setSearchTerm, setLevelFilter, setStatusFilter };
};

/** Academic structure data — grade levels, sections, sessions, terms */
export const useAcademicStructure = () => {
  const {
    gradeLevels, sections, academicSessions, terms, streams,
    loadSections, loadTerms,
    loading,
  } = useClassroom();
  return {
    gradeLevels,
    sections,
    academicSessions,
    terms,
    streams,
    loadSections,
    loadTerms,
    loadingGrades: loading.gradeLevels,
    loadingSections: loading.sections,
    loadingTerms: loading.terms,
  };
};

/** Teacher and subject data */
export const usePeopleData = () => {
  const { teachers, subjects, loading } = useClassroom();
  return {
    teachers,
    subjects,
    loadingTeachers: loading.teachers,
    loadingSubjects: loading.subjects,
  };
};

/** Student enrollment operations */
export const useStudentEnrollment = () => {
  const {
    enrollStudent,
    unenrollStudent,
    transferStudent,
    getClassroomStudents,
    loading,
  } = useClassroom();
  return {
    enrollStudent,
    unenrollStudent,
    transferStudent,
    getClassroomStudents,
    transferring: loading.transferring,
    loadingStudents: loading.students,
  };
};

/** Stats */
export const useClassroomStats = () => {
  const { stats, loadStats, loading } = useClassroom();
  return { stats, loadStats, loading: loading.stats };
};

export default ClassroomContext;