import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminDashboardService, {
  clearDashboardCache,
  ActivityItem,
} from '@/services/AdminDashboardService';
import api from '@/services/api';

import DashboardMainContent from '../../components/dashboards/admin/DashboardMainContent';
import DashboardSkeleton from '../../components/dashboards/admin/DashboardSkeleton';
import {
  Student,
  Teacher,
  Classroom,
  AttendanceData,
  DashboardStats,
  Parent,
  TrendDirection,
} from '../../types/types';

/**
 * AdminDashboardContentLoader
 *
 * Optimized dashboard content loader with:
 * - Single optimized API call via AdminDashboardService
 * - Request deduplication and caching
 * - Skeleton loading for better perceived performance
 * - Parallel data fetching where needed
 */
const AdminDashboardContentLoader = () => {
  const { user } = useAuth();

  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({} as DashboardStats);
  const [gradeDistribution, setGradeDistribution] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceData>({} as AttendanceData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchDashboardData = useCallback(async (forceRefresh = false) => {
    if (!isMounted.current) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch optimized summary + enhanced stats (activities, grade distribution) in parallel
      const [optimizedData, enhancedStats] = await Promise.all([
        AdminDashboardService.fetchOptimizedDashboard(forceRefresh),
        AdminDashboardService.fetchEnhancedStats(forceRefresh),
      ]);

      if (!isMounted.current) return;

      // Fetch list data in parallel.
      // Classrooms are fetched directly (not from optimizedData.classrooms) because
      // the optimized endpoint returns lightweight objects without student_enrollments.
      const [parentsRes, studentsRes, teachersRes, classroomsRes] = await Promise.allSettled([
        api.get('/api/parents/', { limit: 100 }),
        api.get('/api/students/students/', { limit: 100 }),
        api.get('/api/teachers/teachers/', { limit: 100 }),
        api.get('/api/classrooms/classrooms/', { limit: 200 }),
      ]);
      console.log('enhancedStats raw:', JSON.stringify(enhancedStats, null, 2));
      if (!isMounted.current) return;

      // ─── Process list responses ───────────────────────────────────────────

      const processedParents: Parent[] = parentsRes.status === 'fulfilled'
        ? (parentsRes.value.results ?? parentsRes.value ?? [])
        : [];

      const processedStudents: Student[] = studentsRes.status === 'fulfilled'
        ? (studentsRes.value.results ?? studentsRes.value ?? [])
        : [];

      const processedTeachers: Teacher[] = teachersRes.status === 'fulfilled'
        ? (teachersRes.value.results ?? teachersRes.value ?? [])
        : [];

      // Prefer full classroom data; fall back to optimized payload if call failed
      const processedClassrooms: Classroom[] = classroomsRes.status === 'fulfilled'
        ? (classroomsRes.value.results ?? classroomsRes.value ?? optimizedData.classrooms)
        : optimizedData.classrooms;

      // ─── Transform to DashboardStats ─────────────────────────────────────

      const transformedStats: DashboardStats = {
        overview: {
          total_students: optimizedData.stats.totalStudents,
          total_teachers: optimizedData.stats.totalTeachers,
          total_parents: optimizedData.stats.totalParents,
          total_subjects: 0,
          total_classes: optimizedData.stats.totalClasses,
          active_academic_year: new Date().getFullYear().toString(),
        },
        totalStudents: optimizedData.stats.totalStudents,
        totalTeachers: optimizedData.stats.totalTeachers,
        activeStudents: optimizedData.stats.activeStudents,
        activeTeachers: optimizedData.stats.activeTeachers,
        totalClasses: optimizedData.stats.totalClasses,
        totalParents: optimizedData.stats.totalParents,
        totalUsers:
          optimizedData.stats.totalStudents +
          optimizedData.stats.totalTeachers +
          optimizedData.stats.totalParents,
        activeUsers:
          optimizedData.stats.activeStudents + optimizedData.stats.activeTeachers,
        inactiveUsers:
          optimizedData.stats.totalStudents -
          optimizedData.stats.activeStudents +
          (optimizedData.stats.totalTeachers - optimizedData.stats.activeTeachers),
        pendingVerifications: 0,
        recentRegistrations: 0,
        recent_activities: [],
        upcoming_events: [],
        alerts: [],
        quick_stats: [
          {
            label: 'Attendance Today',
            value: `${optimizedData.attendance.todayRate}%`,
            trend: TrendDirection.STABLE,
          },
          {
            label: 'Weekly Average',
            value: `${optimizedData.attendance.weeklyAverage}%`,
            trend: TrendDirection.STABLE,
          },
          {
            label: 'Total Classes',
            value: optimizedData.stats.totalClasses,
            trend: TrendDirection.STABLE,
          },
        ],
      };

      // ─── Transform to AttendanceData ──────────────────────────────────────

      const transformedAttendance: AttendanceData = {
        totalPresent: 0,
        totalAbsent: 0,
        totalLate: 0,
        totalExcused: 0,
        totalUnexcused: 0,
        totalStudents: optimizedData.stats.totalStudents,
        totalTeachers: optimizedData.stats.totalTeachers,
        attendanceRate: optimizedData.attendance.todayRate,
        absenteeRate: 100 - optimizedData.attendance.todayRate,
        lateRate: 0,
        excusedRate: 0,
        dailyAttendance: optimizedData.attendance.trends.map((t: any) => ({
          date: t.date,
          present: t.present,
          absent: t.absent,
          late: 0,
          excused: 0,
          totalExpected: t.present + t.absent,
          attendanceRate: t.rate,
        })),
        weeklyAttendance: [],
        monthlyAttendance: [],
        classAttendance: [],
        studentAttendanceRecords: [],
        teacherAttendanceRecords: [],
        attendanceTrends: [],
        absenteeismPatterns: [],
        lowAttendanceAlerts: [],
        chronicAbsentees: [],
        previousPeriodComparison: {
          currentPeriod: { startDate: '', endDate: '', attendanceRate: 0 },
          previousPeriod: { startDate: '', endDate: '', attendanceRate: 0 },
          change: 0,
          changeType: 'stable' as any,
        },
        gradeComparison: [],
        reportPeriod: {
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
          totalDays: 0,
          schoolDays: 0,
          holidays: 0,
        },
        lastUpdated: optimizedData.lastUpdated,
        generatedBy: 'Dashboard Service',
        insights: [],
        recommendations: [],
      };

      // ─── Commit state ─────────────────────────────────────────────────────

      setDashboardStats(transformedStats);
      setAttendanceData(transformedAttendance);
      setParents(processedParents);
      setStudents(processedStudents);
      setTeachers(processedTeachers);
      setClassrooms(processedClassrooms);

      // Grade distribution and activities come from the enhanced endpoint
      // so they have the correct shape expected by their child components
      setGradeDistribution(enhancedStats.grade_distribution?.distribution ?? []);
      setRecentActivities(enhancedStats.recent_activities ?? []);
    } catch (err: any) {
      console.error('❌ AdminDashboardContentLoader: Error fetching data:', err);
      if (isMounted.current) {
        setError(err.message || 'Failed to load dashboard data');
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(() => {
    clearDashboardCache();
    fetchDashboardData(true);
  }, [fetchDashboardData]);

  const handleUserStatusUpdate = useCallback(
    (userId: number, userType: 'student' | 'teacher' | 'parent', isActive: boolean) => {
      const patch = (users: any[]) =>
        users.map((u) => {
          const id = u.user?.id ?? u.user_id ?? u.id;
          if (id !== userId) return u;
          return { ...u, user: u.user ? { ...u.user, is_active: isActive } : undefined, is_active: isActive };
        });

      if (userType === 'student') setStudents((prev) => patch(prev));
      else if (userType === 'teacher') setTeachers((prev) => patch(prev));
      else if (userType === 'parent') setParents((prev) => patch(prev));
    },
    []
  );

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    isMounted.current = true;
    fetchDashboardData();
    return () => { isMounted.current = false; };
  }, [fetchDashboardData]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">Failed to load dashboard</h3>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <DashboardMainContent
      dashboardStats={dashboardStats}
      students={students}
      teachers={teachers}
      parents={parents}
      attendanceData={attendanceData}
      classrooms={classrooms}
      gradeDistribution={gradeDistribution}
      recentActivities={recentActivities}
      onRefresh={handleRefresh}
      onUserStatusUpdate={handleUserStatusUpdate}
      user={user}
      activateStudent={async () => {}}
      activateTeacher={async () => {}}
      activateParent={async () => {}}
    />
  );
};

export default AdminDashboardContentLoader;