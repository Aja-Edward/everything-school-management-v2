import TeacherService from './TeacherService';
import { ExamService } from './ExamService';
import { getAttendance } from './AttendanceService';
import { LessonService } from './LessonService';
import ResultService from './ResultService';
import api from './api';

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

class TeacherDashboardService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

  // ⚡ NEW: Cache helper
  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log(`✅ Cache hit: ${key}`);
      return cached.data as T;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ⚡ OPTIMIZED: Get basic stats without expensive calls
  async getTeacherDashboardStats(teacherId: number): Promise<TeacherDashboardStats> {
    try {
      const cacheKey = `stats_${teacherId}`;
      const cached = this.getCached<TeacherDashboardStats>(cacheKey);
      if (cached) return cached;

      console.log('📊 Fetching teacher stats...');
      
      // Get teacher's classroom assignments
      const teacherResponse = await TeacherService.getTeacher(teacherId);
      const classroomAssignments = teacherResponse.classroom_assignments || [];
      
      // Calculate totals from assignments (fast)
      const totalStudents = (() => {
        if (typeof (teacherResponse as any).total_students === 'number') {
          return (teacherResponse as any).total_students;
        }
        const seen = new Set<number>();
        let sum = 0;
        classroomAssignments.forEach((a: any) => {
          if (a && typeof a.classroom_id === 'number' && !seen.has(a.classroom_id)) {
            seen.add(a.classroom_id);
            sum += a.student_count || 0;
          }
        });
        return sum;
      })();
      
      const totalClasses = (() => {
        const ids = new Set<number>();
        classroomAssignments.forEach((a: any) => {
          if (a && typeof a.classroom_id === 'number') ids.add(a.classroom_id);
        });
        return ids.size || classroomAssignments.length;
      })();
      
      const totalSubjects = (() => {
        if (typeof (teacherResponse as any).total_subjects === 'number') {
          return (teacherResponse as any).total_subjects;
        }
        const uniqueSubjects = new Set(
          classroomAssignments.map((assignment: any) => assignment.subject_name).filter(Boolean)
        );
        return uniqueSubjects.size;
      })();
      
      // ⚡ OPTIMIZATION: Fetch lightweight data only
      const stats: TeacherDashboardStats = {
        totalStudents,
        totalClasses,
        totalSubjects,
        attendanceRate: 0,
        pendingExams: 0,
        unreadMessages: 0,
        upcomingLessons: 0,
        recentResults: 0
      };

      // ⚡ Load secondary stats asynchronously (non-blocking)
      this.loadSecondaryStats(teacherId, stats);

      this.setCache(cacheKey, stats);
      return stats;
    } catch (error: any) {
      console.error('❌ Error fetching teacher stats:', error);
      return {
        totalStudents: 0,
        totalClasses: 0,
        totalSubjects: 0,
        attendanceRate: 0,
        pendingExams: 0,
        unreadMessages: 0,
        upcomingLessons: 0,
        recentResults: 0
      };
    }
  }

  // ⚡ NEW: Load secondary stats in background
  private async loadSecondaryStats(teacherId: number, stats: TeacherDashboardStats): Promise<void> {
    try {
      // Run these in parallel but don't block main stats
      const [attendanceResponse, upcomingLessonsResponse] = await Promise.allSettled([
        this.getAttendanceRate(teacherId),
        this.getUpcomingLessonsCount(teacherId)
      ]);

      if (attendanceResponse.status === 'fulfilled') {
        stats.attendanceRate = attendanceResponse.value;
      }

      if (upcomingLessonsResponse.status === 'fulfilled') {
        stats.upcomingLessons = upcomingLessonsResponse.value;
        stats.pendingExams = upcomingLessonsResponse.value; // Same for now
      }

      // ⚡ Note: recentResults removed from initial load - too expensive
    } catch (error) {
      console.warn('⚠️ Error loading secondary stats:', error);
    }
  }

  // ⚡ NEW: Lightweight attendance rate calculation
  private async getAttendanceRate(teacherId: number): Promise<number> {
    try {
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const attendanceResponse = await getAttendance({
        teacher: teacherId,
        date__gte: startOfMonth.toISOString().split('T')[0],
        date__lte: endOfMonth.toISOString().split('T')[0],
        page_size: 100 // Limit to 100 records
      });
      
      if (attendanceResponse && attendanceResponse.length > 0) {
        const totalRecords = attendanceResponse.length;
        const presentRecords = attendanceResponse.filter((record: any) => record.status === 'P').length;
        return totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;
      }
      
      return 0;
    } catch (error) {
      console.warn('⚠️ Could not fetch attendance rate:', error);
      return 0;
    }
  }

  // ⚡ NEW: Lightweight upcoming lessons count
  private async getUpcomingLessonsCount(teacherId: number): Promise<number> {
    try {
      const response = await LessonService.getLessons({
        teacher_id: teacherId,
        status_filter: 'scheduled',
        date_from: new Date().toISOString().split('T')[0],
        page_size: 10 // Only need count
      });
      
      return response?.length || 0;
    } catch (error) {
      console.warn('⚠️ Could not fetch upcoming lessons:', error);
      return 0;
    }
  }

  // ⚡ OPTIMIZED: Lazy load recent activities
  async getTeacherRecentActivities(teacherId: number, limit: number = 5): Promise<TeacherRecentActivity[]> {
    try {
      const cacheKey = `activities_${teacherId}_${limit}`;
      const cached = this.getCached<TeacherRecentActivity[]>(cacheKey);
      if (cached) return cached;

      console.log('📋 Fetching recent activities...');
      const activities: TeacherRecentActivity[] = [];
      
      // ⚡ OPTIMIZATION: Fetch with strict limits
      const [attendanceResponse, lessonsResponse] = await Promise.allSettled([
        getAttendance({
          teacher: teacherId,
          date__gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          ordering: '-date',
          page_size: limit
        }),
        LessonService.getLessons({
          teacher_id: teacherId,
          ordering: '-created_at',
          page_size: limit
        })
      ]);
      
      // Process attendance
      if (attendanceResponse.status === 'fulfilled' && attendanceResponse.value?.length > 0) {
        const latestAttendance = attendanceResponse.value[0];
        const presentCount = attendanceResponse.value.filter((record: any) => record.status === 'P').length;
        const absentCount = attendanceResponse.value.filter((record: any) => record.status === 'A').length;
        
        activities.push({
          id: latestAttendance.id,
          type: 'attendance',
          title: 'Marked attendance',
          description: `${presentCount} students present, ${absentCount} absent`,
          time: this.getTimeAgo(new Date(latestAttendance.date)),
          timestamp: latestAttendance.date
        });
      }
      
      // Process lessons
      if (lessonsResponse.status === 'fulfilled' && lessonsResponse.value?.length > 0) {
        const recentLesson = lessonsResponse.value[0];
        activities.push({
          id: recentLesson.id,
          type: 'lesson',
          title: `${recentLesson.status === 'completed' ? 'Completed' : 'Started'} lesson`,
          description: `${recentLesson.subject_name} - ${recentLesson.classroom_name}`,
          time: this.getTimeAgo(new Date(recentLesson.created_at)),
          timestamp: recentLesson.created_at
        });
      }
      
      // Sort by timestamp
      const sorted = activities.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ).slice(0, limit);

      this.setCache(cacheKey, sorted);
      return sorted;
    } catch (error: any) {
      console.error('❌ Error fetching recent activities:', error);
      return [];
    }
  }

  // ⚡ OPTIMIZED: Lazy load upcoming events
  async getTeacherUpcomingEvents(teacherId: number, limit: number = 10): Promise<TeacherUpcomingEvent[]> {
    try {
      const cacheKey = `events_${teacherId}_${limit}`;
      const cached = this.getCached<TeacherUpcomingEvent[]>(cacheKey);
      if (cached) return cached;

      console.log('📅 Fetching upcoming events...');
      const events: TeacherUpcomingEvent[] = [];
      
      // ⚡ OPTIMIZATION: Single call with limit
      const upcomingLessonsResponse = await LessonService.getLessons({
        teacher_id: teacherId,
        date_from: new Date().toISOString().split('T')[0],
        status_filter: 'scheduled',
        ordering: 'date',
        page_size: limit
      });
      
      if (upcomingLessonsResponse && upcomingLessonsResponse.length > 0) {
        upcomingLessonsResponse.forEach((lesson: any) => {
          events.push({
            id: lesson.id,
            title: `${lesson.subject_name} - ${lesson.classroom_name}`,
            time: this.formatEventTime(lesson.date, lesson.start_time),
            type: lesson.lesson_type === 'exam' ? 'exam' : 'lesson',
            date: lesson.date,
            description: `${lesson.lesson_type === 'exam' ? 'Exam' : 'Lesson'} scheduled for ${lesson.classroom_name}`
          });
        });
      }
      
      // Sort by date
      const sorted = events.sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      ).slice(0, limit);

      this.setCache(cacheKey, sorted);
      return sorted;
    } catch (error: any) {
      console.error('❌ Error fetching upcoming events:', error);
      return [];
    }
  }

  // ⚡ OPTIMIZED: Get teacher's assigned classes (cached)
  async getTeacherClasses(teacherId: number): Promise<TeacherClassData[]> {
    try {
      const cacheKey = `classes_${teacherId}`;
      const cached = this.getCached<TeacherClassData[]>(cacheKey);
      if (cached) return cached;

      console.log('🏫 Fetching teacher classes...');
      const teacherResponse = await TeacherService.getTeacher(teacherId);
      const classroomAssignments = teacherResponse.classroom_assignments || [];
      
      // Group assignments by classroom AND subject
      const assignmentGroups = new Map();
      
      classroomAssignments.forEach((assignment: any) => {
        const uniqueKey = `${assignment.classroom_id}_${assignment.subject_id || assignment.subject?.id}`;
        
        if (!assignmentGroups.has(uniqueKey)) {
          assignmentGroups.set(uniqueKey, {
            id: assignment.classroom_id,
            classroom_id: assignment.classroom_id,
            name: assignment.classroom_name,
            section_id: assignment.section_id,
            section_name: assignment.section_name,
            grade_level_id: assignment.grade_level_id,
            grade_level_name: assignment.grade_level_name,
            education_level: assignment.education_level,
            student_count: assignment.student_count,
            max_capacity: assignment.max_capacity,
            room_number: assignment.room_number,
            is_primary_teacher: assignment.is_primary_teacher,
            periods_per_week: assignment.periods_per_week,
            stream_name: assignment.stream_name,
            stream_type: assignment.stream_type,
            subject: {
              id: assignment.subject_id || assignment.subject?.id,
              name: assignment.subject_name,
              code: assignment.subject_code,
              is_primary_teacher: assignment.is_primary_teacher,
              periods_per_week: assignment.periods_per_week
            }
          });
        }
      });
      
      // Transform to TeacherClassData
      const classes = Array.from(assignmentGroups.values()).map((assignment: any) => ({
        id: assignment.id,
        name: assignment.name,
        section_id: assignment.section_id,
        section_name: assignment.section_name,
        grade_level_id: assignment.grade_level_id,
        grade_level_name: assignment.grade_level_name,
        education_level: assignment.education_level,
        student_count: assignment.student_count,
        max_capacity: assignment.max_capacity,
        subject_id: assignment.subject.id,
        subject_name: assignment.subject.name,
        subject_code: assignment.subject.code,
        room_number: assignment.room_number,
        is_primary_teacher: assignment.is_primary_teacher,
        periods_per_week: assignment.periods_per_week,
        stream_name: assignment.stream_name,
        stream_type: assignment.stream_type,
        all_subjects: [assignment.subject]
      }));

      this.setCache(cacheKey, classes);
      return classes;
    } catch (error: any) {
      console.error('❌ Error fetching teacher classes:', error);
      return [];
    }
  }

  // Get teacher ID from user data or fetch teacher profile
  async getTeacherIdFromUser(user: any): Promise<number | null> {
    try {
      // 1) Direct mapping
      let teacherId = (user as any)?.teacher_data?.id;
      if (teacherId) {
        console.log('✅ Found teacher ID from teacher_data.id:', teacherId);
        return Number(teacherId);
      }
      
      teacherId = (user as any)?.profile?.teacher_data?.id;
      if (teacherId) {
        console.log('✅ Found teacher ID from profile.teacher_data.id:', teacherId);
        return Number(teacherId);
      }
      
      // 2) Direct backend lookup
      const userId = user?.id;
      if (userId) {
        console.log('🔍 Trying direct teacher lookup by user ID:', userId);
        try {
          const directTeacherResponse = await TeacherService.getTeacherByUserId(userId);
          if (directTeacherResponse && directTeacherResponse.id) {
            console.log('✅ Found teacher by direct lookup:', directTeacherResponse.id);
            return Number(directTeacherResponse.id);
          }
        } catch (directError) {
          console.log('⚠️ Direct lookup failed:', directError);
        }

        // 3) Fallback search
        console.log('🔍 Fallback search by email/username');
        const teachersResponse = await TeacherService.getTeachers({ 
          search: user?.email || user?.username 
        });
        
        if (teachersResponse.results && teachersResponse.results.length > 0) {
          const teacher = teachersResponse.results.find((t: any) => 
            t.user?.id === userId || t.user?.email === user?.email || t.username === user?.username
          );
          if (teacher?.id) {
            console.log('✅ Found teacher via search:', teacher.id);
            return Number(teacher.id);
          }
        }
      }
      
      console.log('❌ No teacher ID found');
      return null;
    } catch (error: any) {
      console.error('❌ Error getting teacher ID from user:', error);
      return null;
    }
  }

  // ⚡ OPTIMIZED: Get teacher's assigned subjects (cached)
  async getTeacherSubjects(teacherId: number): Promise<TeacherSubjectData[]> {
    try {
      const cacheKey = `subjects_${teacherId}`;
      const cached = this.getCached<TeacherSubjectData[]>(cacheKey);
      if (cached) return cached;

      console.log('📚 Fetching teacher subjects...');
      const teacherResponse = await TeacherService.getTeacher(teacherId);
      const classroomAssignments = teacherResponse.classroom_assignments || [];
      
      // Group by subject
      const subjectMap = new Map();
      
      classroomAssignments.forEach((assignment: any) => {
        const subjectId = assignment.subject_id;
        const subjectName = assignment.subject_name;
        
        if (!subjectId) {
          console.warn('⚠️ Assignment missing subject_id:', assignment);
          return;
        }
        
        if (!subjectMap.has(subjectId)) {
          subjectMap.set(subjectId, {
            id: subjectId,
            name: subjectName,
            code: assignment.subject_code || '',
            assignments: []
          });
        }
        
        const subject = subjectMap.get(subjectId);
        subject.assignments.push({
          id: assignment.id,
          classroom_name: assignment.classroom_name,
          classroom_id: assignment.classroom_id,
          grade_level: assignment.grade_level_name,
          section: assignment.section_name,
          education_level: assignment.education_level,
          stream_type: assignment.stream_type,
          student_count: assignment.student_count || 0,
          is_class_teacher: assignment.is_primary_teacher || false,
          periods_per_week: assignment.periods_per_week || 1
        });
      });
      
      const subjects = Array.from(subjectMap.values());
      this.setCache(cacheKey, subjects);
      return subjects;
    } catch (error: any) {
      console.error('❌ Error fetching teacher subjects:', error);
      return [];
    }
  }

  // Helper functions
  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  private formatEventTime(date: string, time?: string): string {
    const eventDate = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (eventDate.toDateString() === today.toDateString()) {
      return `Today, ${time || '9:00 AM'}`;
    } else if (eventDate.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow, ${time || '9:00 AM'}`;
    } else {
      return eventDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      }) + `, ${time || '9:00 AM'}`;
    }
  }

  async getStudentsForClass(classroomId: number) {
    try {
      const cacheKey = `students_${classroomId}`;
      const cached = this.getCached<any[]>(cacheKey);
      if (cached) return cached;

      const response = await api.get(`/api/classrooms/classrooms/${classroomId}/students/`);
      
      let students = [];
      if (Array.isArray(response)) students = response;
      else if (Array.isArray((response as any).results)) students = (response as any).results;
      else if (Array.isArray((response as any).data)) students = (response as any).data;

      this.setCache(cacheKey, students);
      return students;
    } catch (error) {
      console.error('❌ Error fetching students for class:', error);
      throw error;
    }
  }

  // ⚡ CRITICAL OPTIMIZATION: Progressive data loading
  async getTeacherDashboardData(teacherId: number) {
    try {
      console.log('🚀 Loading dashboard data progressively...');
      
      // ⚡ STAGE 1: Load critical data first (FAST)
      const [stats, classes, subjects] = await Promise.all([
        this.getTeacherDashboardStats(teacherId),
        this.getTeacherClasses(teacherId),
        this.getTeacherSubjects(teacherId)
      ]);

      console.log('✅ Stage 1 complete (critical data loaded)');

      // Return immediately with essential data
      const essentialData = {
        stats,
        classes,
        subjects,
        activities: [], // Will load later
        events: [], // Will load later
        exams: [] // Will load later
      };

      // ⚡ STAGE 2: Load secondary data in background (NON-BLOCKING)
      this.loadSecondaryDashboardData(teacherId, essentialData);

      return essentialData;
    } catch (error: any) {
      console.error('❌ Error fetching teacher dashboard data:', error);
      return {
        stats: {
          totalStudents: 0,
          totalClasses: 0,
          totalSubjects: 0,
          attendanceRate: 0,
          pendingExams: 0,
          unreadMessages: 0,
          upcomingLessons: 0,
          recentResults: 0
        },
        activities: [],
        events: [],
        classes: [],
        subjects: [],
        exams: []
      };
    }
  }

  // ⚡ NEW: Load secondary data asynchronously
  private async loadSecondaryDashboardData(teacherId: number, dataObject: any): Promise<void> {
    try {
      console.log('🔄 Loading secondary data...');
      
      const [activities, events, exams] = await Promise.allSettled([
        this.getTeacherRecentActivities(teacherId, 5),
        this.getTeacherUpcomingEvents(teacherId, 10),
        ExamService.getExamsByTeacher(teacherId).catch(() => [])
      ]);

      if (activities.status === 'fulfilled') {
        dataObject.activities = activities.value;
      }

      if (events.status === 'fulfilled') {
        dataObject.events = events.value;
      }

      if (exams.status === 'fulfilled') {
        dataObject.exams = Array.isArray(exams.value) ? exams.value : [];
      }

      console.log('✅ Secondary data loaded');
    } catch (error) {
      console.warn('⚠️ Error loading secondary data:', error);
    }
  }

  async getTeacherProfile(teacherId: number) {
    try {
      const cacheKey = `profile_${teacherId}`;
      const cached = this.getCached<any>(cacheKey);
      if (cached) return cached;

      const teacherResponse = await TeacherService.getTeacher(teacherId);
      this.setCache(cacheKey, teacherResponse);
      return teacherResponse;
    } catch (error) {
      console.error('❌ Error fetching teacher profile:', error);
      return null;
    }
  }
}

export default new TeacherDashboardService();