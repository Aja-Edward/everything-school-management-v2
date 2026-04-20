import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { useAdminAuth } from '@/services/AuthServiceAdmin';
import { useDashboardRefresh } from '@/hooks/useDashboardRefresh';
import api from '@/services/api';
import AdminDashboard from '@/components/dashboards/admin/Admin';
import {
  UserProfile,
  Student,
  Teacher,
  Message,
  Classroom,
  DashboardStats,
  AttendanceData,
} from '@/types/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  dashboardStats: DashboardStats | null;
  students: Student[] | null;
  teachers: Teacher[] | null;
  parents: any[] | null;
  attendanceData: AttendanceData | null;
  classrooms: Classroom[] | null;
  messages: Message[] | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: DashboardData = {
  dashboardStats: null,
  students: null,
  teachers: null,
  parents: null,
  attendanceData: null,
  classrooms: null,
  messages: null,
  userProfile: null,
  loading: true,
  error: null,
};

// ─── Component ────────────────────────────────────────────────────────────────

const DashboardHome: React.FC = () => {
  const {
    user,
    isAuthenticated,
    logout,
    isAdmin,
    getUsers,
    getDashboardStats,
    getUserProfile,
  } = useAdminAuth();

  const [dashboardData, setDashboardData] = useState<DashboardData>(INITIAL_STATE);
  const [refreshKey, setRefreshKey] = useState(0);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchDashboardData = useCallback(async () => {
    setDashboardData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      if (!isAuthenticated || !user) {
        throw new Error('User not authenticated. Please login again.');
      }
      if (!isAdmin()) {
        throw new Error('Admin access required. Insufficient permissions.');
      }

      const response = await api.get('/api/dashboard/admin/optimized/', {
        params: { page: 1, page_size: 100 },
      });

      const raw = response.data;

      setDashboardData({
        dashboardStats: raw.dashboardStats
          ? {
              totalStudents: raw.dashboardStats.total_students ?? 0,
              activeStudents: raw.dashboardStats.active_students ?? 0,
              activeTeachers: raw.dashboardStats.active_teachers ?? 0,
              totalTeachers: raw.dashboardStats.total_teachers ?? 0,
              totalClasses: raw.dashboardStats.total_classes ?? 0,
              totalUsers: raw.dashboardStats.total_users ?? 0,
              totalParents: raw.dashboardStats.total_parents ?? 0,
              activeUsers: raw.dashboardStats.active_students ?? 0,
              inactiveUsers: raw.dashboardStats.inactive_students ?? 0,
              pendingVerifications: raw.dashboardStats.pending_verifications ?? 0,
              recentRegistrations: raw.dashboardStats.recent_registrations ?? 0,
            }
          : null,
        students: raw.students?.results ?? null,
        teachers: raw.teachers?.results ?? null,
        parents: raw.parents?.results ?? null,
        attendanceData: raw.attendanceData ?? null,
        classrooms: raw.classrooms ?? null,
        messages: raw.messages ?? null,
        userProfile: raw.userProfile ?? null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setDashboardData((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'An unknown error occurred',
      }));
    }
  }, [isAuthenticated, isAdmin, user]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleUserStatusUpdate = useCallback(
    (userId: number, userType: 'student' | 'teacher' | 'parent', isActive: boolean) => {
      setDashboardData((prev) => {
        const patch = (users: any[] | null) =>
          users?.map((u) => {
            const id = u.user?.id ?? u.user_id ?? u.id;
            if (id !== userId) return u;
            return { ...u, user: u.user ? { ...u.user, is_active: isActive } : undefined, is_active: isActive };
          }) ?? null;

        return {
          ...prev,
          students: userType === 'student' ? patch(prev.students) : prev.students,
          teachers: userType === 'teacher' ? patch(prev.teachers) : prev.teachers,
          parents: userType === 'parent' ? patch(prev.parents) : prev.parents,
        };
      });
    },
    []
  );

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  useDashboardRefresh(handleRefresh);

  useEffect(() => {
    fetchDashboardData();
  }, [refreshKey]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (dashboardData.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-4">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (dashboardData.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
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
          <h3 className="text-base font-semibold text-gray-900 mb-2">Something went wrong</h3>
          <p className="text-sm text-gray-500 mb-4">{dashboardData.error}</p>
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
    <AdminDashboard
      dashboardStats={dashboardData.dashboardStats}
      students={dashboardData.students}
      teachers={dashboardData.teachers}
      parents={dashboardData.parents}
      attendanceData={dashboardData.attendanceData}
      classrooms={dashboardData.classrooms}
      messages={dashboardData.messages}
      userProfile={dashboardData.userProfile}
      notificationCount={0}
      messageCount={0}
      onRefresh={handleRefresh}
      currentUser={user}
      onLogout={logout}
      isAdmin={isAdmin()}
      adminMethods={{ getUsers, getDashboardStats, getUserProfile }}
    >
      <Outlet />
    </AdminDashboard>
  );
};

export default DashboardHome;