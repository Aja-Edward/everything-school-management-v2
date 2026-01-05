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
  grade_level_id: number; // Add grade_level_id
  grade_level_name: string;
  education_level: string;
  student_count: number;
  max_capacity: number;
  subject_id: number; // Add subject_id
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
  // Get teacher dashboard statistics
  async getTeacherDashboardStats(teacherId: number): Promise<TeacherDashboardStats> {
    try {
      console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - STAT - teacherId:', teacherId);
      
      // Get teacher's classroom assignments
      const teacherResponse = await TeacherService.getTeacher(teacherId);
      // console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - teacherResponse:', teacherResponse);
      
      const classroomAssignments = teacherResponse.classroom_assignments || [];
      console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - classroomAssignments:', classroomAssignments);
      
      // Calculate total students
      // Prefer backend-provided aggregates if available, else compute from assignments
      const totalStudents = (typeof (teacherResponse as any).total_students === 'number'
        ? (teacherResponse as any).total_students
        : (() => {
            // Avoid double counting: sum unique classrooms' student_count
            const seen = new Set<number>();
            let sum = 0;
            classroomAssignments.forEach((a: any) => {
              if (a && typeof a.classroom_id === 'number' && !seen.has(a.classroom_id)) {
                seen.add(a.classroom_id);
                sum += a.student_count || 0;
              }
            });
            return sum;
          })());
      console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - totalStudents:', totalStudents);
      
      // Calculate total classes
      // Unique classrooms count
      const totalClasses = (() => {
        try {
          const ids = new Set<number>();
          classroomAssignments.forEach((a: any) => {
            if (a && typeof a.classroom_id === 'number') ids.add(a.classroom_id);
          });
          return ids.size || classroomAssignments.length;
        } catch (_e) {
          return classroomAssignments.length;
        }
      })();
      console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - totalClasses:', totalClasses);
      
      // Calculate total subjects
      const totalSubjects = (typeof (teacherResponse as any).total_subjects === 'number'
        ? (teacherResponse as any).total_subjects
        : (() => {
            const uniqueSubjects = new Set(
              classroomAssignments.map((assignment: any) => assignment.subject_name).filter(Boolean)
            );
            return uniqueSubjects.size;
          })());
      console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - totalSubjects:', totalSubjects);
      
      // Get attendance rate for the current month
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - About to call getAttendance');
      const attendanceResponse = await getAttendance({
        teacher: teacherId,
        date__gte: startOfMonth.toISOString().split('T')[0],
        date__lte: endOfMonth.toISOString().split('T')[0]
      });
      console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - getAttendance response:', attendanceResponse);
      
      let attendanceRate = 0;
      if (attendanceResponse && attendanceResponse.length > 0) {
        const totalRecords = attendanceResponse.length;
        const presentRecords = attendanceResponse.filter((record: any) => record.status === 'P').length;
        attendanceRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;
      }
      
      // Get pending exams (lessons that are scheduled but not completed)
      const pendingExamsResponse = await LessonService.getLessons({
        teacher_id: teacherId,
        status_filter: 'scheduled',
        date_from: new Date().toISOString().split('T')[0]
      });
      
      const pendingExams = pendingExamsResponse?.length || 0;
      
      // Get upcoming lessons
      const upcomingLessonsResponse = await LessonService.getLessons({
        teacher_id: teacherId,
        date_from: new Date().toISOString().split('T')[0],
        status_filter: 'scheduled'
      });
      
      const upcomingLessons = upcomingLessonsResponse?.length || 0;
      
      // Get recent results count (using term results for now)
      console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - About to call ResultService.getTermResults');
      const recentResultsResponse = await ResultService.getTermResults({
        // Note: created_at__gte is not supported, using default behavior
      });
      console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - ResultService.getTermResults response:', recentResultsResponse);
      
      const recentResults = recentResultsResponse?.length || 0;
      
      // Mock unread messages (this would need a messaging service)
      const unreadMessages = 0;
      
      const stats = {
        totalStudents,
        totalClasses,
        totalSubjects,
        attendanceRate,
        pendingExams,
        unreadMessages,
        upcomingLessons,
        recentResults
      };
      
      console.log('🔍 TeacherDashboardService.getTeacherDashboardStats - RETURNING stats:', stats);
      return stats;
    } catch (error: any) {
      console.error('🔍 TeacherDashboardService.getTeacherDashboardStats - ERROR:', error);
      console.error('🔍 TeacherDashboardService.getTeacherDashboardStats - Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
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

  // Get teacher's recent activities
  async getTeacherRecentActivities(teacherId: number): Promise<TeacherRecentActivity[]> {
    try {
      const activities: TeacherRecentActivity[] = [];
      
      // Get recent attendance records
      const attendanceResponse = await getAttendance({
        teacher: teacherId,
        date__gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        ordering: '-date'
      });
      
      if (attendanceResponse && attendanceResponse.length > 0) {
        const latestAttendance = attendanceResponse[0];
        const presentCount = attendanceResponse.filter((record: any) => record.status === 'P').length;
        const absentCount = attendanceResponse.filter((record: any) => record.status === 'A').length;
        
        activities.push({
          id: latestAttendance.id,
          type: 'attendance',
          title: 'Marked attendance',
          description: `${presentCount} students present, ${absentCount} absent`,
          time: this.getTimeAgo(new Date(latestAttendance.date)),
          timestamp: latestAttendance.date
        });
      }
      
      // Get recent lessons
      const lessonsResponse = await LessonService.getLessons({
        teacher_id: teacherId,
        ordering: '-created_at'
      });
      
      if (lessonsResponse && lessonsResponse.length > 0) {
        const recentLesson = lessonsResponse[0];
        activities.push({
          id: recentLesson.id,
          type: 'lesson',
          title: `${recentLesson.status === 'completed' ? 'Completed' : 'Started'} lesson`,
          description: `${recentLesson.subject_name} - ${recentLesson.classroom_name}`,
          time: this.getTimeAgo(new Date(recentLesson.created_at)),
          timestamp: recentLesson.created_at
        });
      }
      
      // Get recent results (using term results for now)
      const resultsResponse = await ResultService.getTermResults({
        // Note: ordering is not supported in getTermResults
      });
      
      if (resultsResponse && resultsResponse.length > 0) {
        const recentResult = resultsResponse[0];
        activities.push({
          id: recentResult.id,
          type: 'result',
          title: 'Updated results',
          description: `${recentResult.subject_name} - ${recentResult.student_count || 0} students`,
          time: this.getTimeAgo(new Date(recentResult.created_at)),
          timestamp: recentResult.created_at
        });
      }
      
      // Sort activities by timestamp (most recent first)
      return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error: any) {
      console.error('Error fetching teacher recent activities:', error);
      return [];
    }
  }

  // Get teacher's upcoming events
  async getTeacherUpcomingEvents(teacherId: number): Promise<TeacherUpcomingEvent[]> {
    try {
      const events: TeacherUpcomingEvent[] = [];
      
      // Get upcoming lessons
      const upcomingLessonsResponse = await LessonService.getLessons({
        teacher_id: teacherId,
        date_from: new Date().toISOString().split('T')[0],
        status_filter: 'scheduled',
        ordering: 'date'
      });
      
      if (upcomingLessonsResponse && upcomingLessonsResponse.length > 0) {
        upcomingLessonsResponse.forEach((lesson: any) => {
          events.push({
            id: lesson.id,
            title: `${lesson.subject_name} - ${lesson.classroom_name}`,
            time: this.formatEventTime(lesson.date, lesson.start_time),
            type: 'lesson',
            date: lesson.date,
            description: `Lesson scheduled for ${lesson.classroom_name}`
          });
        });
      }
      
      // Get upcoming exams (lessons with exam type)
      const upcomingExamsResponse = await LessonService.getLessons({
        teacher_id: teacherId,
        date_from: new Date().toISOString().split('T')[0],
        lesson_type: 'exam',
        status_filter: 'scheduled',
        ordering: 'date'
      });
      
      if (upcomingExamsResponse && upcomingExamsResponse.length > 0) {
        upcomingExamsResponse.forEach((exam: any) => {
          events.push({
            id: exam.id,
            title: `${exam.subject_name} Test - ${exam.classroom_name}`,
            time: this.formatEventTime(exam.date, exam.start_time),
            type: 'exam',
            date: exam.date,
            description: `Exam scheduled for ${exam.classroom_name}`
          });
        });
      }
      
      // Sort events by date (earliest first)
      return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error: any) {
      console.error('Error fetching teacher upcoming events:', error);
      return [];
    }
  }

  // Get teacher's assigned classes
  async getTeacherClasses(teacherId: number): Promise<TeacherClassData[]> {
    try {
      const teacherResponse = await TeacherService.getTeacher(teacherId);
      const classroomAssignments = teacherResponse.classroom_assignments || [];
      
      // Group assignments by classroom AND subject to handle same subject across multiple grade levels
      const assignmentGroups = new Map();
      
      classroomAssignments.forEach((assignment: any) => {
        // Create a unique key combining classroom and subject
        const uniqueKey = `${assignment.classroom_id}_${assignment.subject_id || assignment.subject?.id}`;
        
        if (!assignmentGroups.has(uniqueKey)) {
                  // Initialize assignment data
        assignmentGroups.set(uniqueKey, {
          id: assignment.classroom_id, // Use classroom ID for unique identification
          classroom_id: assignment.classroom_id,
            name: assignment.classroom_name,
            section_id: assignment.section_id,
            section_name: assignment.section_name,
            grade_level_id: assignment.grade_level_id, // Add grade_level_id
            grade_level_name: assignment.grade_level_name,
            education_level: assignment.education_level,
            student_count: assignment.student_count,
            max_capacity: assignment.max_capacity,
            room_number: assignment.room_number,
            is_primary_teacher: assignment.is_primary_teacher,
            periods_per_week: assignment.periods_per_week,
            stream_name: assignment.stream_name,
            stream_type: assignment.stream_type,
            // Single subject for this assignment
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
      
      // Transform to match TeacherClassData interface
      return Array.from(assignmentGroups.values()).map((assignment: any) => ({
        id: assignment.id,
        name: assignment.name,
        section_id: assignment.section_id,
        section_name: assignment.section_name,
        grade_level_id: assignment.grade_level_id, // Add grade_level_id
        grade_level_name: assignment.grade_level_name,
        education_level: assignment.education_level,
        student_count: assignment.student_count,
        max_capacity: assignment.max_capacity,
        subject_id: assignment.subject.id, // Add subject_id
        subject_name: assignment.subject.name,
        subject_code: assignment.subject.code,
        room_number: assignment.room_number,
        is_primary_teacher: assignment.is_primary_teacher,
        periods_per_week: assignment.periods_per_week,
        stream_name: assignment.stream_name,
        stream_type: assignment.stream_type,
        // Add the single subject for display
        all_subjects: [assignment.subject]
      }));
    } catch (error: any) {
      console.error('Error fetching teacher classes:', error);
      return [];
    }
  }

  // Get teacher ID from user data or fetch teacher profile
  async getTeacherIdFromUser(user: any): Promise<number | null> {
    try {
      // 1) Direct mapping on user object if present
      // First, try to get teacher ID from user data structure
      let teacherId = (user as any)?.teacher_data?.id;
      
      if (teacherId) {
        console.log('🔍 TeacherDashboardService.getTeacherIdFromUser - Found teacher ID from teacher_data.id:', teacherId);
        return Number(teacherId);
      }
      
      // Also check profile.teacher_data
      teacherId = (user as any)?.profile?.teacher_data?.id;
      if (teacherId) {
        console.log('🔍 TeacherDashboardService.getTeacherIdFromUser - Found teacher ID from profile.teacher_data.id:', teacherId);
        return Number(teacherId);
      }
      
      // 2) Try direct backend endpoint by user id first (strongest signal)
      const userId = user?.id;
      if (userId) {
        console.log('🔍 TeacherDashboardService.getTeacherIdFromUser - Trying direct teacher lookup by user ID:', userId);
        try {
          const directTeacherResponse = await TeacherService.getTeacherByUserId(userId);
          if (directTeacherResponse && directTeacherResponse.id) {
            console.log('🔍 TeacherDashboardService.getTeacherIdFromUser - Found teacher by direct lookup:', directTeacherResponse.id);
            return Number(directTeacherResponse.id);
          }
        } catch (directError) {
          console.log('🔍 TeacherDashboardService.getTeacherIdFromUser - Direct lookup failed:', directError);
        }

        // 3) Fallback: search by email or username
        console.log('🔍 TeacherDashboardService.getTeacherIdFromUser - Fallback search by email/username');
        const teachersResponse = await TeacherService.getTeachers({ 
          search: user?.email || user?.username 
        });
        if (teachersResponse.results && teachersResponse.results.length > 0) {
          const teacher = teachersResponse.results.find((t: any) => 
            t.user?.id === userId || t.user?.email === user?.email || t.username === user?.username
          );
          if (teacher?.id) {
            console.log('🔍 TeacherDashboardService.getTeacherIdFromUser - Found teacher via search:', teacher.id);
            return Number(teacher.id);
          }
        }

        // 4) Last resort: broad scan to match by user.id/email
        if (teachersResponse.results && teachersResponse.results.length > 0) {
          const byId = teachersResponse.results.find((t: any) => t.user?.id === userId);
          if (byId?.id) return Number(byId.id);
          const byEmail = teachersResponse.results.find((t: any) => t.user?.email === user?.email);
          if (byEmail?.id) return Number(byEmail.id);
        }
      }
      
      console.log('🔍 TeacherDashboardService.getTeacherIdFromUser - No teacher ID found');
      return null;
    } catch (error: any) {
      console.error('Error getting teacher ID from user:', error);
      return null;
    }
  }

  // Get teacher's assigned subjects
  async getTeacherSubjects(teacherId: number): Promise<TeacherSubjectData[]> {
    try {
      const teacherResponse = await TeacherService.getTeacher(teacherId);
      const classroomAssignments = teacherResponse.classroom_assignments || [];
      
      console.log('🔍 getTeacherSubjects - teacherResponse:', teacherResponse);
      console.log('🔍 getTeacherSubjects - classroomAssignments:', classroomAssignments);
      
      // Group assignments by SUBJECT to show all classes for each subject
      const subjectMap = new Map();
      
      classroomAssignments.forEach((assignment: any) => {
        console.log('🔍 Processing assignment:', assignment);
        console.log('🔍 Assignment details:', {
          id: assignment.id,
          classroom_name: assignment.classroom_name,
          classroom_id: assignment.classroom_id,
          subject_id: assignment.subject_id,
          subject_name: assignment.subject_name,
          subject_code: assignment.subject_code,
          grade_level: assignment.grade_level_name,
          section: assignment.section_name
        });
        
        const subjectId = assignment.subject_id;
        const subjectName = assignment.subject_name;
        console.log('🔍 Subject ID:', subjectId, 'Subject Name:', subjectName);
        
        if (!subjectId) {
          console.warn('⚠️ Assignment missing subject_id:', assignment);
          return; // Skip assignments without subject_id
        }
        
        if (!subjectMap.has(subjectId)) {
          // Initialize new subject
          subjectMap.set(subjectId, {
            id: subjectId,
            name: subjectName,
            code: assignment.subject_code || '',
            assignments: []
          });
          console.log('🔍 Added new subject to map:', subjectId, subjectName);
        }
        
        // Add classroom assignment details to this subject
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
      
      const result = Array.from(subjectMap.values());
      console.log('🔍 getTeacherSubjects - Final result:', result);
      
      // Transform to match TeacherSubjectData interface
      return result;
    } catch (error: any) {
      console.error('Error fetching teacher subjects:', error);
      return [];
    }
  }

  // Helper function to format time ago
  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
  }

  // Helper function to format event time
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

  // Get students for a specific classroom
  async getStudentsForClass(classroomId: number) {
    try {
      // Note: Backend mounts classroom urls at /api/classrooms/, and within it defines
      // "classrooms/<int:classroom_id>/students/", so the full path is:
      // /api/classrooms/classrooms/:classroom_id/students/
      const response = await api.get(`/api/classrooms/classrooms/${classroomId}/students/`);
      // api.get returns parsed JSON directly. Handle array or paginated/object shapes defensively.
      if (Array.isArray(response)) return response;
      if (response && Array.isArray((response as any).results)) return (response as any).results;
      if (response && Array.isArray((response as any).data)) return (response as any).data;
      return [];
    } catch (error) {
      console.error('Error fetching students for class:', error);
      throw error;
    }
  }

  // Get comprehensive teacher dashboard data
  async getTeacherDashboardData(teacherId: number) {
    try {
      const [stats, activities, events, classes, subjects, exams] = await Promise.all([
        this.getTeacherDashboardStats(teacherId),
        this.getTeacherRecentActivities(teacherId),
        this.getTeacherUpcomingEvents(teacherId),
        this.getTeacherClasses(teacherId),
        this.getTeacherSubjects(teacherId),
        ExamService.getExamsByTeacher(teacherId)
      ]);

      return {
        stats,
        activities,
        events,
        classes,
        subjects,
        exams: Array.isArray(exams) ? exams : []
      };
    } catch (error: any) {
      console.error('Error fetching teacher dashboard data:', error);
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
        subjects: []
      };
    }
  }

  // Get teacher profile data
  async getTeacherProfile(teacherId: number) {
    try {
      const teacherResponse = await TeacherService.getTeacher(teacherId);
      return teacherResponse;
    } catch (error) {
      console.error('Error fetching teacher profile:', error);
      return null;
    }
  }
}

export default new TeacherDashboardService();
