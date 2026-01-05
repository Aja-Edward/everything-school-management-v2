import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import TeacherDashboardContent from '@/components/dashboards/teacher/TeacherDashboardContent';
import { TeacherUserData } from '@/types/types';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import { useSettings } from '@/hooks/useSettings';
import { AlertTriangle, Lock } from 'lucide-react';

const TeacherDashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
   
  const { settings } = useSettings();
  const isTeacherPortalEnabled = settings?.teacher_portal_enabled !== false;
 
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || !user) {
        console.log('🔍 TeacherDashboard - Not authenticated or no user, redirecting to login');
        navigate('/teacher-login');
        return;
      }

      // Check if user is a teacher
      if (user.role !== 'teacher') {
        console.log('🔍 TeacherDashboard - User is not a teacher, redirecting to home');
        navigate('/');
        return;
      }

      console.log('🔍 TeacherDashboard - User is authenticated teacher, loading dashboard data');
      
      // Only load dashboard data if portal is enabled
      if (isTeacherPortalEnabled) {
        loadDashboardData();
      } else {
        setLoading(false);
      }
    } else {
      console.log('🔍 TeacherDashboard - Still loading auth state');
    }
  }, [isAuthenticated, user, isLoading, navigate, isTeacherPortalEnabled]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
            
      // Get teacher ID using the new method
      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      
      if (!teacherId) {
        console.error('🔍 Teacher Dashboard - No teacher ID found!');
        throw new Error('Teacher ID not found. Please ensure your teacher profile is properly set up.');
      }
      
      // Fetch comprehensive dashboard data from the database
      const [data, teacherProfile] = await Promise.all([
        TeacherDashboardService.getTeacherDashboardData(teacherId),
        TeacherDashboardService.getTeacherProfile(teacherId)
      ]);
      
      // Combine with user data and teacher profile
      const completeData = {
        teacher: {
          ...user,
          teacher_data: teacherProfile || (user as TeacherUserData)?.teacher_data
        } as TeacherUserData,
        ...data
      };
      
      console.log('🔍 Teacher Dashboard - Complete data set:', completeData);
      
      // Ensure data is safe before setting state
      if (completeData && typeof completeData === 'object') {
        setDashboardData(completeData);
      } else {
        console.error('🔍 Teacher Dashboard - Invalid data received:', completeData);
        setDashboardData({
          teacher: user as TeacherUserData,
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
        });
      }
    } catch (error) {
      console.error('Error loading teacher dashboard data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dashboard data');
      
      // Fallback to mock data if API fails
      const mockData = {
        teacher: user as TeacherUserData,
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
      
      setDashboardData(mockData);
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (isLoading || (loading && isTeacherPortalEnabled)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="text-white/70 text-sm">Loading Teacher Dashboard...</p>
        </div>
      </div>
    );
  }

  // Auth check
  if (!isAuthenticated || !user || user.role !== 'teacher') {
    return null; // Will redirect
  }

  // Portal disabled state - RENDER WITHOUT LAYOUT
  if (!isTeacherPortalEnabled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="flex items-center justify-center min-h-screen p-8">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-12 shadow-2xl border border-gray-100 dark:border-slate-700 text-center max-w-2xl transition-colors duration-300">
            <div className="w-24 h-24 bg-gradient-to-br from-red-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Lock className="text-white" size={40} />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-slate-100 mb-3">
              Teacher Portal Access Disabled
            </h2>
            <p className="text-lg text-gray-600 dark:text-slate-400 mb-6">
              The teacher portal has been temporarily disabled by the system administrator.
            </p>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 mb-6">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>Need access?</strong> Please contact your school administrator or IT support team for assistance.
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 text-sm text-gray-500 dark:text-slate-500">
              <AlertTriangle className="w-4 h-4" />
              <span>This restriction is applied system-wide and affects all teacher accounts</span>
            </div>
            <button
              onClick={() => navigate('/')}
              className="mt-8 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading data state
  if (!dashboardData && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="text-white/70 text-sm">Loading Dashboard Data...</p>
        </div>
      </div>
    );
  }

  // Main dashboard - ONLY RENDER LAYOUT WHEN PORTAL IS ENABLED
  return (
    <TeacherDashboardLayout>
      <TeacherDashboardContent 
        dashboardData={dashboardData}
        onRefresh={loadDashboardData}
        error={error}
      />
    </TeacherDashboardLayout>
  );
};

export default TeacherDashboard;