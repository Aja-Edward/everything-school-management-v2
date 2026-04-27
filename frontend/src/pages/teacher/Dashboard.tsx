import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { TeacherUserData } from '@/types/types';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import { useSettings } from '@/hooks/useSettings';
import { AlertTriangle, Lock, RefreshCw } from 'lucide-react';
import { LoadingScreen } from '@/components/common/LoadingScreen';

// Lazy load heavy components
const TeacherDashboardLayout = React.lazy(() => import('@/components/layouts/TeacherDashboardLayout'));
const TeacherDashboardContent = React.lazy(() => import('@/components/dashboards/teacher/TeacherDashboardContent'));

const TeacherDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { settings } = useSettings();
  
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingExtended, setLoadingExtended] = useState(false);
  
  const isTeacherPortalEnabled = settings?.teacher_portal_enabled !== false;

  /**
   * ⚡ OPTIMIZED: Load dashboard data using single API call
   */
  const loadDashboardData = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const startTime = performance.now();
      
      // Get teacher ID from user data (cached)
      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      
      if (!teacherId) {
        throw new Error('Teacher profile not found. Please contact your administrator.');
      }
      
      // ⚡ Single optimized API call
      const data = await TeacherDashboardService.getOptimizedDashboard(teacherId);
      
      const loadTime = performance.now() - startTime;
      console.log(`✅ Dashboard loaded in ${loadTime.toFixed(0)}ms`);
      
      // Validate and combine data
      const dashboardDataResponse = data && typeof data === 'object' ? data : {};
      
      const completeData = {
        teacher: {
          ...user,
          teacher_data: (dashboardDataResponse as any).teacher || (user as TeacherUserData)?.teacher_data
        } as TeacherUserData,
        ...(dashboardDataResponse as Record<string, any>)
      };
      
      setDashboardData(completeData);
      
      // Load extended data in background (non-blocking)
      loadExtendedData(teacherId);
      
    } catch (error) {
      console.error('❌ Error loading dashboard:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dashboard data');
      
      // Fallback data
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
    } finally {
      setLoading(false);
    }
  }, [user]);

  /**
   * 📊 Load extended data in background
   */
  const loadExtendedData = async (teacherId: number) => {
  try {
    setLoadingExtended(true);
    const extendedData = await TeacherDashboardService.getExtendedDashboardData(teacherId);

    if (extendedData && typeof extendedData === 'object') {
      setDashboardData((prev: any) => {
        const merged: any = { ...prev };

        for (const key of Object.keys(extendedData as object)) {
          const incoming = (extendedData as any)[key];
          const existing = prev[key];

          // If both are arrays, deduplicate by id
          if (Array.isArray(incoming) && Array.isArray(existing)) {
            const existingIds = new Set(existing.map((i: any) => i?.id));
            merged[key] = [
              ...existing,
              ...incoming.filter((i: any) => !existingIds.has(i?.id)),
            ];
          } else {
            // Scalars and objects: extended data wins
            merged[key] = incoming;
          }
        }

        return merged;
      });
    }
  } catch (error) {
    console.warn('⚠️ Extended data unavailable:', error);
  } finally {
    setLoadingExtended(false);
  }
};

  /**
   * 🔄 Manual refresh handler
   */
  const handleRefresh = useCallback(async () => {
    if (!user) return;
    
    const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
    if (teacherId) {
      TeacherDashboardService.clearTeacherCache(teacherId);
    }
    
    await loadDashboardData();
  }, [user, loadDashboardData]);

  // Auth and portal check
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || !user) {
        navigate('/teacher-login');
        return;
      }

      if (user.role !== 'teacher') {
        navigate('/');
        return;
      }

      if (isTeacherPortalEnabled) {
        loadDashboardData();
      } else {
        setLoading(false);
      }
    }
  }, [isAuthenticated, user, isLoading, navigate, isTeacherPortalEnabled, loadDashboardData]);


  // Loading state
  if (isLoading || (loading && isTeacherPortalEnabled)) {
    return (
      <LoadingScreen 
        variant="teacher"
        message="Loading Teacher Dashboard..."
      />
    );
  }

  // Auth check
  if (!isAuthenticated || !user || user.role !== 'teacher') {
    return null;
  }

  // Portal disabled
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
                <strong>Need access?</strong> Please contact your school administrator or IT support team.
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 text-sm text-gray-500 dark:text-slate-500">
              <AlertTriangle className="w-4 h-4" />
              <span>This restriction is applied system-wide</span>
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

  // Error state
  if (error && !dashboardData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-8">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-12 shadow-2xl border border-gray-100 dark:border-slate-700 text-center max-w-2xl">
          <div className="w-24 h-24 bg-gradient-to-br from-red-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <AlertTriangle className="text-white" size={40} />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 dark:text-slate-100 mb-3">
            Failed to Load Dashboard
          </h2>
          <p className="text-lg text-gray-600 dark:text-slate-400 mb-6">
            {error}
          </p>
          <button
            onClick={handleRefresh}
            className="mt-4 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Main dashboard
  return (
    <React.Suspense fallback={
      <LoadingScreen 
        variant="teacher"
        message="Loading Dashboard Components..."
      />
    }>
      <TeacherDashboardLayout>
        {loadingExtended && (
          <div className="fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading additional data...</span>
          </div>
        )}
        
        <TeacherDashboardContent 
          dashboardData={dashboardData}
          onRefresh={handleRefresh}
          error={error}
        />
      </TeacherDashboardLayout>
    </React.Suspense>
  );
};

export default TeacherDashboard;