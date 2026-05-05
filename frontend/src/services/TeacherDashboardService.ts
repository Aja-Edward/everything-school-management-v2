import TeacherService from './TeacherService';
import { ExamService } from './ExamService';
import { getAttendance } from './AttendanceService';
import { LessonService } from './LessonService';
import ResultService, { EducationLevelType } from './ResultService';
import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TeacherAssignment {
  id: number;
  classroom_id: number;
  classroom_name: string;
  section_id: number;
  section_name: string;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  education_level: EducationLevelType;
  student_count: number;
  is_primary_teacher: boolean;
  periods_per_week: number;
}

export interface TeacherDashboardStats {
  totalStudents: number;
  totalClasses: number;
  totalSubjects: number;
  attendanceRate: number;
  pendingExams: number;
  unreadMessages: number;
  upcomingLessons: number;
  recentResults: number;
}

export interface TeacherRecentActivity {
  id: number;
  type: 'attendance' | 'exam' | 'result' | 'message' | 'lesson';
  title: string;
  description: string;
  time: string;
  timestamp: string;
}

export interface TeacherUpcomingEvent {
  id: number;
  title: string;
  time: string;
  type: 'exam' | 'meeting' | 'lesson' | 'event';
  date: string;
  description?: string;
}

export interface TeacherClassData {
  id: number;
  name: string;
  section_id: number;
  section_name: string;
  grade_level_id: number;
  grade_level_name: string;
  education_level: string;
  student_count: number;
  max_capacity: number;
  subject_id: number;
  subject_name: string;
  is_class_teacher: boolean;
  subject_code: string;
  room_number: string;
  is_primary_teacher: boolean;
  periods_per_week: number;
  stream_name?: string;
  stream_type?: string;
}

export interface TeacherSubjectData {
  id: number;
  name: string;
  code: string;
  assignments: Array<{
    id: number;
    classroom_name: string;
    classroom_id: number;
    grade_level: string;
    section: string;
    education_level: string;
    stream_type?: string;
    student_count: number;
    is_class_teacher: boolean;
    periods_per_week: number;
  }>;
}

export interface TeacherSubject {
  id: number;
  name: string;
  code: string;
  subject_id: number;
  education_level?: EducationLevelType;
  assignments: TeacherAssignment[];
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract the unique education levels a teacher is assigned to.
 * Used to scope ResultService calls to only the relevant levels.
 */
function extractTeacherLevels(classroomAssignments: any[]): EducationLevelType[] {
  return [...new Set(
    classroomAssignments
      .map((a: any) => a.education_level)
      .filter(Boolean)
  )] as EducationLevelType[];
}

/**
 * Fetch subject results across all levels a teacher teaches.
 * Returns a flat, deduplicated, time-sorted array.
 */
async function fetchTeacherSubjectResults(
  levels: EducationLevelType[],
  pageSize = 50
) {
  if (levels.length === 0) return [];

  const settled = await Promise.allSettled(
    levels.map(level => ResultService.getSubjectResults(level, { page_size: pageSize }))
  );

  return settled
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, Promise<any>>();
  private readonly TTL = 60_000; // 1 minute

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp >= this.TTL) {
      this.cache.delete(key);
      return null;
    }
    console.log(`✅ Cache HIT: ${key}`);
    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  getPending<T>(key: string): Promise<T> | null {
    return this.pendingRequests.get(key) ?? null;
  }

  setPending<T>(key: string, promise: Promise<T>): void {
    this.pendingRequests.set(key, promise);
  }

  removePending(key: string): void {
    this.pendingRequests.delete(key);
  }

  clear(): void {

    this.cache.clear();
    this.pendingRequests.clear();
  }

  clearKey(key: string): void {
    this.cache.delete(key);
    this.pendingRequests.delete(key);
  }
}

// ============================================================================
// MAIN SERVICE CLASS
// ============================================================================

class TeacherDashboardService {
  private cacheManager = new CacheManager();

  // ── Optimized single-call dashboard ───────────────────────────────────────

  async getOptimizedDashboard(teacherId: number) {
    const cacheKey = `dashboard-optimized-${teacherId}`;

    const cached = this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const pending = this.cacheManager.getPending(cacheKey);
    if (pending) {
  
      return pending;
    }


  ;

    const promise = api.get(`/api/dashboard/teacher/${teacherId}/summary/`)
      .then(response => {
       
        const transformed = this.transformOptimizedResponse(response);
        this.cacheManager.set(cacheKey, transformed);
        this.cacheManager.removePending(cacheKey);
        return transformed;
      })
      .catch(async (error) => {
        console.warn('⚠️ Optimized endpoint unavailable, falling back:', error.message);
        this.cacheManager.removePending(cacheKey);
        return this.getTeacherDashboardData(teacherId);
      });

    this.cacheManager.setPending(cacheKey, promise);
    return promise;
  }

  // ── Extended (progressive) data ───────────────────────────────────────────

  async getExtendedDashboardData(teacherId: number) {
    const cacheKey = `extended-${teacherId}`;

    const cached = this.cacheManager.get(cacheKey);
    if (cached) {
   
      return cached;
    }

    const pending = this.cacheManager.getPending(cacheKey);
    if (pending) {
   
      return pending;
    }

   

    const promise = api.get(`/api/dashboard/teacher/${teacherId}/extended/`)
      .then(response => {
        
        this.cacheManager.set(cacheKey, response);
        this.cacheManager.removePending(cacheKey);
        return response;
      })
      .catch(error => {
        console.warn('⚠️ Extended data unavailable (non-critical):', error);
        this.cacheManager.removePending(cacheKey);
        return null;
      });

    this.cacheManager.setPending(cacheKey, promise);
    return promise;
  }

  // ── Transform helpers ──────────────────────────────────────────────────────

  private transformOptimizedResponse(backendData: any) {
    return {
      teacher: backendData.teacher || {},
      stats: {
        totalStudents:  backendData.stats?.total_students  || 0,
        totalClasses:   backendData.stats?.total_classes   || 0,
        totalSubjects:  backendData.stats?.total_subjects  || 0,
        attendanceRate: backendData.stats?.attendance_rate || 0,
        pendingExams:   backendData.quick_info?.pending_attendance || 0,
        unreadMessages: 0,
        upcomingLessons: backendData.today_schedule?.length || 0,
        recentResults: 0,
      },
      todaySchedule: backendData.today_schedule || [],
      classes: this.deriveClassesFromAssignments(backendData.classroom_assignments || []).map((a: any) => ({
        id:               a.classroom_id,
        name:             a.classroom_name,
        grade_level_id:   a.grade_level_id   || 0,
        grade_level_name: a.classroom_name?.split(' ')[0] || '',
        section_id:       a.section_id       || 0,
        section_name:     a.classroom_name?.split(' ')[1] || '',
        education_level:  a.education_level  || '',
        student_count:    a.student_count    || 0,
        max_capacity:     a.max_capacity     || 0,
        subject_id:       a.subject_id,
        subject_name:     a.subject_name,
        subject_code:     a.subject_code     || '',
        room_number:      a.room_number      || '',
        is_primary_teacher: a.is_primary_teacher || false,
        periods_per_week: a.periods_per_week || 0,
      })),
      subjects:     this.groupSubjectsFromAssignments(backendData.classroom_assignments || []),
      activities:   [],
      events:       [],
      exams:        [],
      recentResults: [],
      loadedAt:   backendData.loaded_at,
      dataScope:  backendData.data_scope,
      quickInfo:  backendData.quick_info,
    };
  }

  private groupSubjectsFromAssignments(assignments: any[]): TeacherSubjectData[] {
    const subjectMap = new Map<number, TeacherSubjectData>();

    assignments.forEach((a: any) => {
      const subjectId: number = a.subject_id;
      if (!subjectId) return;

      if (!subjectMap.has(subjectId)) {
        subjectMap.set(subjectId, {
          id:   subjectId,
          name: a.subject_name,
          code: a.subject_code || `SUB-${subjectId}`,
          assignments: [],
        });
      }

      subjectMap.get(subjectId)!.assignments.push({
        id:               a.id,
        classroom_name:   a.classroom_name,
        classroom_id:     a.classroom_id,
        grade_level:      a.classroom_name?.split(' ')[0] || '',
        section:          a.classroom_name?.split(' ')[1] || '',
        education_level:  a.education_level || '',
        stream_type:      a.stream_type,
        student_count:    a.student_count    || 0,
        is_class_teacher: a.is_primary_teacher || false,
        periods_per_week: a.periods_per_week || 0,
      });
    });

    return Array.from(subjectMap.values());
  }

  // ── Dashboard stats ────────────────────────────────────────────────────────

  async getTeacherDashboardStats(teacherId: number): Promise<TeacherDashboardStats> {
    const cacheKey = `stats-${teacherId}`;

    const cached = this.cacheManager.get<TeacherDashboardStats>(cacheKey);
    if (cached) return cached;

    const pending = this.cacheManager.getPending<TeacherDashboardStats>(cacheKey);
    if (pending) return pending;

    const promise = (async (): Promise<TeacherDashboardStats> => {
      try {
        const teacherResponse      = await TeacherService.getTeacher(teacherId);
        const classroomAssignments = teacherResponse.classroom_assignments || [];

        // ── totals derived from assignment data (no extra API calls) ──────────
        const totalStudents = (() => {
  const seen = new Set<number>(); let sum = 0;
  classroomAssignments.forEach((a: any) => {
    if (typeof a.classroom_id === 'number' && !seen.has(a.classroom_id)) {
      seen.add(a.classroom_id); sum += a.student_count || 0;
    }
  });
  return sum;
})();

        const totalClasses = (() => {
          const ids = new Set<number>();
          classroomAssignments.forEach((a: any) => {
            if (typeof a.classroom_id === 'number') ids.add(a.classroom_id);
          });
          return ids.size || classroomAssignments.length;
        })();

        const totalSubjects = new Set(
          classroomAssignments.map((a: any) => a.subject_name).filter(Boolean)
        ).size;

        // ── attendance rate (single scoped API call) ───────────────────────
        let attendanceRate = 0;
        try {
          const now          = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0);

          const attendance = await getAttendance({
            teacher:    teacherId,
            date__gte:  startOfMonth.toISOString().split('T')[0],
            date__lte:  endOfMonth.toISOString().split('T')[0],
          });

          if (attendance?.length) {
            const present = attendance.filter((r: any) => r.status === 'P').length;
            attendanceRate = Math.round((present / attendance.length) * 100);
          }
        } catch {
          console.warn('Could not fetch attendance rate');
        }

        // ── pending exams / upcoming lessons ──────────────────────────────
        const today = new Date().toISOString().split('T')[0];

        const [pendingExamsRes, upcomingLessonsRes] = await Promise.allSettled([
          LessonService.getLessons({ teacher_id: teacherId, status_filter: 'scheduled', date_from: today }),
          LessonService.getLessons({ teacher_id: teacherId, status_filter: 'scheduled', date_from: today }),
        ]);

        const pendingExams    = pendingExamsRes.status    === 'fulfilled' ? (pendingExamsRes.value?.length    || 0) : 0;
        const upcomingLessons = upcomingLessonsRes.status === 'fulfilled' ? (upcomingLessonsRes.value?.length || 0) : 0;

        // ── recent results — only the levels this teacher actually teaches ──
        const teacherLevels  = extractTeacherLevels(classroomAssignments);
        const subjectResults = await fetchTeacherSubjectResults(teacherLevels, 50);
        const recentResults  = subjectResults.length;

        const stats: TeacherDashboardStats = {
          totalStudents,
          totalClasses,
          totalSubjects,
          attendanceRate,
          pendingExams,
          unreadMessages: 0,
          upcomingLessons,
          recentResults,
        };

        this.cacheManager.set(cacheKey, stats);
        this.cacheManager.removePending(cacheKey);
        return stats;

      } catch (error: any) {
        console.error('❌ Error fetching teacher dashboard stats:', error);
        this.cacheManager.removePending(cacheKey);
        return {
          totalStudents: 0, totalClasses: 0, totalSubjects: 0,
          attendanceRate: 0, pendingExams: 0, unreadMessages: 0,
          upcomingLessons: 0, recentResults: 0,
        };
      }
    })();

    this.cacheManager.setPending(cacheKey, promise);
    return promise;
  }

  // ── Recent activities ──────────────────────────────────────────────────────

  async getTeacherRecentActivities(teacherId: number): Promise<TeacherRecentActivity[]> {
    const cacheKey = `activities-${teacherId}`;

    const cached = this.cacheManager.get<TeacherRecentActivity[]>(cacheKey);
    if (cached) return cached;

    try {
      const activities: TeacherRecentActivity[] = [];

      // Fetch teacher data to resolve education levels (needed for results)
      const teacherResponse      = await TeacherService.getTeacher(teacherId);
      const classroomAssignments = teacherResponse.classroom_assignments || [];
      const teacherLevels        = extractTeacherLevels(classroomAssignments);

      // ── attendance ─────────────────────────────────────────────────────
      try {
        const attendance = await getAttendance({
          teacher:   teacherId,
          date__gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          ordering:  '-date',
        });

        if (attendance?.length) {
          const latest  = attendance[0];
          const present = attendance.filter((r: any) => r.status === 'P').length;
          const absent  = attendance.filter((r: any) => r.status === 'A').length;
          activities.push({
            id:          latest.id,
            type:        'attendance',
            title:       'Marked attendance',
            description: `${present} present, ${absent} absent`,
            time:        this.getTimeAgo(new Date(latest.date)),
            timestamp:   latest.date,
          });
        }
      } catch {
        console.warn('Could not fetch attendance activity');
      }

      // ── lessons ────────────────────────────────────────────────────────
      try {
        const lessons = await LessonService.getLessons({ teacher_id: teacherId, ordering: '-created_at' });
        if (lessons?.length) {
          const lesson = lessons[0];
          activities.push({
            id:          lesson.id,
            type:        'lesson',
            title:       lesson.status === 'completed' ? 'Completed lesson' : 'Started lesson',
            description: `${lesson.subject_name} — ${lesson.classroom_name}`,
            time:        this.getTimeAgo(new Date(lesson.created_at)),
            timestamp:   lesson.created_at,
          });
        }
      } catch {
        console.warn('Could not fetch lesson activity');
      }

      // ── subject results (teacher-scoped, correct levels only) ──────────
      try {
        const results = await fetchTeacherSubjectResults(teacherLevels, 10);
        if (results.length) {
          const latest = results[0];
          activities.push({
            id:          Number(latest.id),
            type:        'result',
            title:       'Updated results',
            description: `${latest.subject.name} — ${latest.student.full_name}`,
            time:        this.getTimeAgo(new Date(latest.updated_at)),
            timestamp:   latest.updated_at,
          });
        }
      } catch {
        console.warn('Could not fetch result activity');
      }

      const sorted = activities.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      this.cacheManager.set(cacheKey, sorted);
      return sorted;

    } catch (error: any) {
      console.error('Error fetching recent activities:', error);
      return [];
    }
  }

  // ── Upcoming events ────────────────────────────────────────────────────────

  async getTeacherUpcomingEvents(teacherId: number): Promise<TeacherUpcomingEvent[]> {
  const cacheKey = `events-${teacherId}`;
  const cached = this.cacheManager.get<TeacherUpcomingEvent[]>(cacheKey);
  if (cached) return cached;

  try {
    const events: TeacherUpcomingEvent[] = [];
    const today = new Date().toISOString().split('T')[0];

    const [lessonsRes, examsRes] = await Promise.allSettled([
      LessonService.getLessons({ teacher_id: teacherId, date_from: today, status_filter: 'scheduled', ordering: 'date' }),
      LessonService.getLessons({ teacher_id: teacherId, date_from: today, status_filter: 'scheduled', lesson_type: 'exam', ordering: 'date' }),
    ]);

    // Track seen ids per type to prevent cross-list duplicates
    const seenIds = new Set<string>(); // use "type-id" as key

    if (lessonsRes.status === 'fulfilled') {
      (lessonsRes.value || []).forEach((lesson: any) => {
        const key = `lesson-${lesson.id}`;
        if (seenIds.has(key)) return;
        seenIds.add(key);
        events.push({
          id:          lesson.id,
          title:       `${lesson.subject_name} — ${lesson.classroom_name}`,
          time:        this.formatEventTime(lesson.date, lesson.start_time),
          type:        'lesson',
          date:        lesson.date,
          description: `Lesson scheduled for ${lesson.classroom_name}`,
        });
      });
    }

    if (examsRes.status === 'fulfilled') {
      (examsRes.value || []).forEach((exam: any) => {
        const key = `exam-${exam.id}`;
        if (seenIds.has(key)) return;
        seenIds.add(key);
        events.push({
          id:          exam.id,
          title:       `${exam.subject_name} Test — ${exam.classroom_name}`,
          time:        this.formatEventTime(exam.date, exam.start_time),
          type:        'exam',
          date:        exam.date,
          description: `Exam scheduled for ${exam.classroom_name}`,
        });
      });
    }

    const sorted = events.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    this.cacheManager.set(cacheKey, sorted);
    return sorted;
  } catch (error: any) {
    console.error('Error fetching upcoming events:', error);
    return [];
  }
}

  // ── Teacher classes ────────────────────────────────────────────────────────

  async getTeacherClasses(teacherId: number): Promise<TeacherClassData[]> {
    const cacheKey = `classes-${teacherId}`;

    const cached = this.cacheManager.get<TeacherClassData[]>(cacheKey);
    if (cached) return cached;

    try {
      const teacherResponse      = await TeacherService.getTeacher(teacherId);
      const classroomAssignments = teacherResponse.classroom_assignments || [];
      const result               = this.deriveClassesFromAssignments(classroomAssignments);

      this.cacheManager.set(cacheKey, result);
      return result;
    } catch (error: any) {
      console.error('Error fetching teacher classes:', error);
      return [];
    }
  }

  // ── Teacher subjects ───────────────────────────────────────────────────────

  async getTeacherSubjects(teacherId: number): Promise<TeacherSubjectData[]> {
    const cacheKey = `subjects-${teacherId}`;

    const cached = this.cacheManager.get<TeacherSubjectData[]>(cacheKey);
    if (cached) return cached;

    try {
      const teacherResponse      = await TeacherService.getTeacher(teacherId);
      const classroomAssignments = teacherResponse.classroom_assignments || [];
      const result               = this.deriveSubjectsFromAssignments(classroomAssignments);

      this.cacheManager.set(cacheKey, result);
      return result;
    } catch (error: any) {
      console.error('Error fetching teacher subjects:', error);
      return [];
    }
  }

  // ── Teacher ID resolution ──────────────────────────────────────────────────

  async getTeacherIdFromUser(user: any): Promise<number | null> {
    const cacheKey = `teacher-id-${user?.id}`;

    const cached = this.cacheManager.get<number>(cacheKey);
    if (cached) return cached;

    try {
      const store = (id: number) => { this.cacheManager.set(cacheKey, id); return id; };

      // 1. Direct mapping on user object
      const fromTeacherData = (user as any)?.teacher_data?.id;
      if (fromTeacherData) return store(Number(fromTeacherData));

      const fromProfile = (user as any)?.profile?.teacher_data?.id;
      if (fromProfile) return store(Number(fromProfile));

      const userId = user?.id;
      if (!userId) return null;

      // 2. Direct backend lookup by user ID
      try {
        const direct = await TeacherService.getTeacherByUserId(userId);
        if (direct?.id) return store(Number(direct.id));
      } catch {
      
      }

      // 3. Search by email or username
      const response = await TeacherService.getTeachers({ search: user?.email || user?.username });
      const results  = response?.results || [];

      const match = results.find((t: any) =>
        t.user?.id === userId ||
        t.user?.email === user?.email ||
        t.username === user?.username
      );
      if (match?.id) return store(Number(match.id));

      return null;

    } catch (error: any) {
      console.error('Error getting teacher ID from user:', error);
      return null;
    }
  }

  // ── Students for classroom ─────────────────────────────────────────────────

  async getStudentsForClass(classroomId: number) {
    try {
      const response = await api.get(`/api/classrooms/classrooms/${classroomId}/students/`);
      if (Array.isArray(response))                       return response;
      if (response && Array.isArray((response as any).results)) return (response as any).results;
      if (response && Array.isArray((response as any).data))    return (response as any).data;
      return [];
    } catch (error) {
      console.error('Error fetching students for class:', error);
      throw error;
    }
  }

  // ── Full dashboard data (legacy fallback) ──────────────────────────────────

  async getTeacherDashboardData(teacherId: number) {
    const cacheKey = `dashboard-legacy-${teacherId}`;

    const cached = this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const pending = this.cacheManager.getPending(cacheKey);
    if (pending) return pending;

    const promise = (async () => {
      try {
        
        const startTime = performance.now();

        const teacherResponse      = await TeacherService.getTeacher(teacherId);
        const classroomAssignments = teacherResponse.classroom_assignments || [];

        const [classes, subjects, stats, exams] = await Promise.all([
          Promise.resolve(this.deriveClassesFromAssignments(classroomAssignments)),
          Promise.resolve(this.deriveSubjectsFromAssignments(classroomAssignments)),
          this.calculateStatsFromTeacherData(teacherId, teacherResponse, classroomAssignments),
          ExamService.getExamsByTeacher(teacherId).catch(() => []),
        ]);

       

        const result = {
          stats,
          activities: [],
          events:     [],
          classes,
          subjects,
          exams: Array.isArray(exams) ? exams : [],
        };

        this.cacheManager.set(cacheKey, result);
        this.cacheManager.removePending(cacheKey);
        return result;

      } catch (error: any) {
        console.error('Error fetching teacher dashboard data:', error);
        this.cacheManager.removePending(cacheKey);
        return {
          stats: {
            totalStudents: 0, totalClasses: 0, totalSubjects: 0,
            attendanceRate: 0, pendingExams: 0, unreadMessages: 0,
            upcomingLessons: 0, recentResults: 0,
          },
          activities: [], events: [], classes: [], subjects: [], exams: [],
        };
      }
    })();

    this.cacheManager.setPending(cacheKey, promise);
    return promise;
  }

  // ── Private derivation helpers ─────────────────────────────────────────────

  private deriveClassesFromAssignments(assignments: any[]): TeacherClassData[] {
  const groups = new Map<number, any>();

  assignments.forEach((a: any) => {
    const classroomId = a.classroom_id;
    if (!classroomId) return;

    if (!groups.has(classroomId)) {
      groups.set(classroomId, {
        id:               classroomId,
        name:             a.classroom_name,
        section_id:       a.section_id,
        section_name:     a.section_name,
        grade_level_id:   a.grade_level_id   ?? a.grade_level?.id   ?? a.classroom_grade_level_id,
        grade_level_name: a.grade_level_name ?? a.grade_level?.name ?? a.classroom_grade_level_name,
        education_level:  a.education_level ?? '',
        student_count:    a.student_count,
        max_capacity:     a.max_capacity,
        room_number:      a.room_number,
        is_primary_teacher: a.is_primary_teacher || false,
        stream_name:      a.stream_name,
        stream_type:      a.stream_type,
        // Keep first subject as fallback for legacy fields
        subject_id:       a.subject_id,
        subject_name:     a.subject_name,
        subject_code:     a.subject_code,
        periods_per_week: a.periods_per_week,
        all_subjects:     [],
      });
    }

    // Accumulate every subject this teacher takes in this classroom
    const group = groups.get(classroomId)!;
    const alreadyAdded = group.all_subjects.some(
      (s: any) => s.id === (a.subject_id ?? a.subject?.id)
    );
    if (!alreadyAdded) {
      group.all_subjects.push({
        id:               a.subject_id ?? a.subject?.id,
        name:             a.subject_name,
        code:             a.subject_code || '',
        periods_per_week: a.periods_per_week || 1,
        is_primary_teacher: a.is_primary_teacher || false,
      });
    }
  });

  return Array.from(groups.values());
}

  private deriveSubjectsFromAssignments(assignments: any[]): TeacherSubjectData[] {
    const subjectMap = new Map<number, TeacherSubjectData>();

    assignments.forEach((a: any) => {
      const subjectId: number = a.subject_id;
      if (!subjectId) return;

      if (!subjectMap.has(subjectId)) {
        subjectMap.set(subjectId, { id: subjectId, name: a.subject_name, code: a.subject_code || '', assignments: [] });
      }

      subjectMap.get(subjectId)!.assignments.push({
        id:               a.id,
        classroom_name:   a.classroom_name,
        classroom_id:     a.classroom_id,
        grade_level:      a.grade_level_name,
        section:          a.section_name,
        education_level:  a.education_level,
        stream_type:      a.stream_type,
        student_count:    a.student_count    || 0,
        is_class_teacher: a.is_primary_teacher || false,
        periods_per_week: a.periods_per_week || 1,
      });
    });

    return Array.from(subjectMap.values());
  }

  private async calculateStatsFromTeacherData(
    teacherId: number,
    teacherResponse: any,
    classroomAssignments: any[]
  ): Promise<TeacherDashboardStats> {
    const totalStudents = typeof teacherResponse.total_students === 'number'
      ? teacherResponse.total_students
      : (() => {
          const seen = new Set<number>(); let sum = 0;
          classroomAssignments.forEach((a: any) => {
            if (typeof a.classroom_id === 'number' && !seen.has(a.classroom_id)) {
              seen.add(a.classroom_id); sum += a.student_count || 0;
            }
          });
          return sum;
        })();

    const totalClasses = (() => {
      const ids = new Set<number>();
      classroomAssignments.forEach((a: any) => { if (typeof a.classroom_id === 'number') ids.add(a.classroom_id); });
      return ids.size || classroomAssignments.length;
    })();

    const totalSubjects = typeof teacherResponse.total_subjects === 'number'
      ? teacherResponse.total_subjects
      : new Set(classroomAssignments.map((a: any) => a.subject_name).filter(Boolean)).size;

    let attendanceRate = 0;
    try {
      const now          = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const attendance   = await getAttendance({
        teacher:   teacherId,
        date__gte: startOfMonth.toISOString().split('T')[0],
        limit:     100,
      });
      if (attendance?.length) {
        const present = attendance.filter((r: any) => r.status === 'P').length;
        attendanceRate = Math.round((present / attendance.length) * 100);
      }
    } catch {
      console.warn('Could not fetch attendance rate');
    }

    return {
      totalStudents, totalClasses, totalSubjects, attendanceRate,
      pendingExams: 0, unreadMessages: 0, upcomingLessons: 0, recentResults: 0,
    };
  }

  // ── Teacher profile ────────────────────────────────────────────────────────

  async getTeacherProfile(teacherId: number) {
    try {
      return await TeacherService.getTeacher(teacherId);
    } catch (error) {
      console.error('Error fetching teacher profile:', error);
      return null;
    }
  }

  // ── Cache utilities ────────────────────────────────────────────────────────

  clearCache(): void {
    this.cacheManager.clear();
  }

  clearTeacherCache(teacherId: number): void {
    [
      'dashboard-optimized', 'dashboard-legacy', 'stats',
      'activities', 'events', 'classes', 'subjects',
    ].forEach(key => this.cacheManager.clearKey(`${key}-${teacherId}`));
  }

  // ── Time formatting ────────────────────────────────────────────────────────

  private getTimeAgo(date: Date): string {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs <    60) return 'Just now';
    if (secs <  3600) { const m = Math.floor(secs / 60);   return `${m} minute${m > 1 ? 's' : ''} ago`; }
    if (secs < 86400) { const h = Math.floor(secs / 3600); return `${h} hour${h   > 1 ? 's' : ''} ago`; }
    const d = Math.floor(secs / 86400);
    return `${d} day${d > 1 ? 's' : ''} ago`;
  }

  private formatEventTime(date: string, time?: string): string {
    const eventDate = new Date(date);
    const today     = new Date();
    const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);

    const label = eventDate.toDateString() === today.toDateString()    ? 'Today'
                : eventDate.toDateString() === tomorrow.toDateString() ? 'Tomorrow'
                : eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    return `${label}, ${time || '9:00 AM'}`;
  }
}

export default new TeacherDashboardService();