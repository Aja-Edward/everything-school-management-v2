import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import TeacherDashboardContent from '@/components/dashboards/teacher/TeacherDashboardContent';
import { TeacherUserData } from '@/types/types';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import { useSettings } from '@/hooks/useSettings';
import { AlertTriangle, Lock } from 'lucide-react';

// ⚡ NEW: Loading stages for progressive rendering
type LoadingStage = 'initial' | 'essential' | 'complete';

const TeacherDashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('initial');
  const [error, setError] = useState<string | null>(null);
   
  const { settings } = useSettings();
  const isTeacherPortalEnabled = settings?.teacher_portal_enabled !== false;
 
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || !user) {
        console.log('🔍 Not authenticated, redirecting to login');
        navigate('/teacher-login');
        return;
      }

      if (user.role !== 'teacher') {
        console.log('🔍 User is not a teacher, redirecting to home');
        navigate('/');
        return;
      }

      console.log('✅ User authenticated as teacher');
      
      if (isTeacherPortalEnabled) {
        loadDashboardData();
      } else {
        setLoadingStage('complete');
      }
    }
  }, [isAuthenticated, user, isLoading, navigate, isTeacherPortalEnabled]);

  // ⚡ OPTIMIZED: Progressive data loading
  const loadDashboardData = useCallback(async () => {
    try {
      setLoadingStage('initial');
      setError(null);
      
      console.log('🚀 Starting dashboard load...');
      const startTime = performance.now();
            
      // Get teacher ID
      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      
      if (!teacherId) {
        console.error('❌ No teacher ID found!');
        throw new Error('Teacher ID not found. Please ensure your teacher profile is properly set up.');
      }
      
      console.log(`✅ Teacher ID: ${teacherId}`);
      
      // ⚡ STAGE 1: Load essential data first (stats, classes, subjects)
      console.log('📦 Loading essential data...');
      const essentialStartTime = performance.now();
      
      const data = await TeacherDashboardService.getTeacherDashboardData(teacherId);
      const teacherProfile = await TeacherDashboardService.getTeacherProfile(teacherId);
      
      const essentialLoadTime = performance.now() - essentialStartTime;
      console.log(`⚡ Essential data loaded in ${essentialLoadTime.toFixed(0)}ms`);
      
      // Combine with user data
      const completeData = {
        teacher: {
          ...user,
          teacher_data: teacherProfile || (user as TeacherUserData)?.teacher_data
        } as TeacherUserData,
        ...data
      };
      
      // ⚡ Set data immediately - UI can render with essential data
      if (completeData && typeof completeData === 'object') {
        setDashboardData(completeData);
        setLoadingStage('essential'); // UI shows with loading placeholders for secondary data
        
        const totalLoadTime = performance.now() - startTime;
        console.log(`✅ Dashboard visible in ${totalLoadTime.toFixed(0)}ms`);
        console.log('📊 Dashboard data:', {
          stats: completeData.stats,
          classesCount: completeData.classes?.length || 0,
          subjectsCount: completeData.subjects?.length || 0,
          activitiesCount: completeData.activities?.length || 0,
          eventsCount: completeData.events?.length || 0
        });
        
        // ⚡ STAGE 2: Secondary data loads in background
        // Activities and events will populate as they become available
        setTimeout(() => {
          setLoadingStage('complete');
          console.log('✅ All data loaded');
        }, 500);
      } else {
        throw new Error('Invalid data structure received');
      }
    } catch (error) {
      console.error('❌ Error loading dashboard:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dashboard data');
      
      // Fallback data
      const fallbackData = {
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
        subjects: [],
        exams: []
      };
      
      setDashboardData(fallbackData);
      setLoadingStage('complete');
    }
  }, [user]);

  // ⚡ Refresh handler with cache clearing
  const handleRefresh = useCallback(async () => {
    console.log('🔄 Refreshing dashboard...');
    TeacherDashboardService.clearCache(); // Clear cache before refresh
    await loadDashboardData();
  }, [loadDashboardData]);

  // ⚡ OPTIMIZATION: Show content faster with progressive loading
  const isInitialLoading = isLoading || loadingStage === 'initial';
  const showLoadingPlaceholders = loadingStage === 'essential';

  // Initial auth loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="text-white/70 text-sm">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Auth check
  if (!isAuthenticated || !user || user.role !== 'teacher') {
    return null; // Will redirect
  }

  // Portal disabled state
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

  // ⚡ NEW: Show loading only during initial load
  if (loadingStage === 'initial' && !dashboardData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="text-white/70 text-sm">Loading Dashboard...</p>
          <p className="text-white/50 text-xs">Getting your classes and subjects</p>
        </div>
      </div>
    );
  }

  // ⚡ OPTIMIZATION: Render dashboard with progressive data
  // Even if loadingStage is 'essential', we show the UI with loading placeholders
  return (
    <TeacherDashboardLayout>
      {dashboardData ? (
        <TeacherDashboardContent 
          dashboardData={dashboardData}
          onRefresh={handleRefresh}
          error={error}
          isLoadingSecondaryData={showLoadingPlaceholders}
        />
      ) : (
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Preparing dashboard...</p>
          </div>
        </div>
      )}
    </TeacherDashboardLayout>
  );
};

export default TeacherDashboard;