/**
 * Admin Dashboard Service
 *
 * Provides optimized data fetching for the admin dashboard with:
 * - Single optimized API call (when backend supports it)
 * - Request deduplication
 * - Caching with TTL
 * - Graceful fallback to individual calls
 */

import api from './api';
import type {DashboardStats} from '../types/types';

export interface AttendanceSummary {
  todayRate: number;
  weeklyAverage: number;
  monthlyAverage: number;
  trends: Array<{
    date: string;
    present: number;
    absent: number;
    rate: number;
  }>;
}

export interface GradeDistribution {
  level: string;
  count: number;
  percentage: number;
}

export interface RecentActivity {
  id: string;
  type: 'enrollment' | 'result' | 'payment' | 'attendance' | 'exam';
  description: string;
  entityName: string;
  timestamp: string;
}

export interface OptimizedDashboardData {
  stats: DashboardStats;
  attendance: AttendanceSummary;
  gradeDistribution: GradeDistribution[];
  recentActivity: RecentActivity[];
  classrooms: any[];
  lastUpdated: string;
}

// ============================================================================
// ENHANCED DASHBOARD STATISTICS (DASH-001)
// ============================================================================

export interface PaymentStatistics {
  total_fees_expected: number;
  total_collected: number;
  total_pending: number;
  total_failed: number;
  total_overdue: number;
  this_month_collected: number;
  collection_rate: number;
  payments_count: number;
  completed_count: number;
  pending_count: number;
  payment_trends: Array<{
    date: string;
    amount: number;
    count: number;
  }>;
}

export interface AttendanceTrends {
  overall_rate: number;
  total_records: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  chart_data: Array<{
    date: string;
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendance_rate: number;
  }>;
  period: string;
}

export interface GradeDistributionData {
  distribution: Array<{
    grade: string;
    count: number;
    percentage: number;
  }>;
  pass_rate: number;
  pass_count: number;
  fail_count: number;
  total_results: number;
  top_subjects: Array<{
    subject: string;
    average: number;
    student_count: number;
  }>;
}

export interface ActivityItem {
  type: 'enrollment' | 'exam' | 'announcement' | string;
  icon: string;
  title: string;
  description: string;
  timestamp: string;
  priority: 'low' | 'normal' | 'high';
}

export interface Alert {
  type: 'info' | 'warning' | 'error';
  severity: 'low' | 'medium' | 'high';
  icon: string;
  title: string;
  message: string;
  action: string;
  action_url: string;
}

export interface EnhancedDashboardStats {
  payment_statistics: PaymentStatistics;
  attendance_trends: AttendanceTrends;
  grade_distribution: GradeDistributionData;
  recent_activities: ActivityItem[];
  alerts: Alert[];
  summary: {
    total_students: number;
    total_teachers: number;
    total_classrooms: number;
    attendance_rate: number;
    collection_rate: number;
    pass_rate: number;
  };
  generated_at: string;
  period: string;
}

// Cache configuration
const CACHE_TTL = 60000; // 1 minute cache

// In-memory cache
let dashboardCache: {
  data: OptimizedDashboardData | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0
};

// Request deduplication
let pendingRequest: Promise<OptimizedDashboardData> | null = null;

/**
 * Check if cache is still valid
 */
const isCacheValid = (): boolean => {
  return dashboardCache.data !== null &&
         (Date.now() - dashboardCache.timestamp) < CACHE_TTL;
};

/**
 * Clear the dashboard cache
 */
export const clearDashboardCache = (): void => {
  dashboardCache = { data: null, timestamp: 0 };
  pendingRequest = null;
};

/**
 * Fetch optimized dashboard data
 *
 * First tries the optimized endpoint, falls back to individual calls if not available
 */
export const fetchOptimizedDashboard = async (forceRefresh = false): Promise<OptimizedDashboardData> => {
  // Return cached data if valid and not forcing refresh
  if (!forceRefresh && isCacheValid() && dashboardCache.data) {
    console.log('📦 Returning cached dashboard data');
    return dashboardCache.data;
  }

  // Return pending request if one exists (deduplication)
  if (pendingRequest) {
    console.log('⏳ Returning pending dashboard request');
    return pendingRequest;
  }

  // Start new request
  console.log('🔄 Fetching fresh dashboard data');
  pendingRequest = fetchDashboardData();

  try {
    const data = await pendingRequest;

    // Update cache
    dashboardCache = {
      data,
      timestamp: Date.now()
    };

    return data;
  } finally {
    pendingRequest = null;
  }
};

/**
 * Internal function to fetch dashboard data
 * Tries optimized endpoint first, falls back to parallel individual calls
 */
const fetchDashboardData = async (): Promise<OptimizedDashboardData> => {
  try {
    // Try optimized endpoint first
    const optimizedData = await api.get('/api/dashboard/admin/optimized/');
    console.log('✅ Got data from optimized endpoint');
    console.log("OPTIMIZED DATA:", optimizedData.data);
    return transformOptimizedResponse(optimizedData);
  } catch (error: any) {
    // If optimized endpoint doesn't exist (404), fall back to parallel calls
    if (error?.response?.status === 404) {
      console.log('⚠️ Optimized endpoint not available, falling back to parallel calls');
      return fetchDashboardDataFallback();
    }
    throw error;
  }
};

/**
 * Fallback: Fetch dashboard data using parallel individual API calls
 * This is used when the optimized endpoint is not available
 */
const fetchDashboardDataFallback = async (): Promise<OptimizedDashboardData> => {
  // Make all independent calls in parallel
  const [
    statsResponse,
    studentsResponse,
    teachersResponse,
    parentsResponse,
    classroomsResponse,
    attendanceResponse
  ] = await Promise.allSettled([
    api.get('/api/dashboard/admin/summary/'),
    api.get('/api/students/students/', { limit: 500 }), // Get counts without full data
    api.get('/api/teachers/teachers/', { limit: 500 }),
    api.get('/api/parents/', { limit: 500 }),
    api.get('/api/classrooms/classrooms/'),
    api.get('/api/attendance/attendance/', { limit: 100, days: 7 }) // Limit attendance to last 7 days
  ]);

  // Extract data from settled promises
  const stats = statsResponse.status === 'fulfilled' ? statsResponse.value : null;
  const students = studentsResponse.status === 'fulfilled' ? studentsResponse.value : { results: [], count: 0 };
  const teachers = teachersResponse.status === 'fulfilled' ? teachersResponse.value : { results: [], count: 0 };
  const parents = parentsResponse.status === 'fulfilled' ? parentsResponse.value : { results: [], count: 0 };
  const classrooms = classroomsResponse.status === 'fulfilled' ? classroomsResponse.value : [];
  const attendance = attendanceResponse.status === 'fulfilled' ? attendanceResponse.value : [];

  // Transform to OptimizedDashboardData format
  const studentsArray = students?.results || (Array.isArray(students) ? students : []);
  const teachersArray = teachers?.results || (Array.isArray(teachers) ? teachers : []);
  const parentsArray = parents?.results || (Array.isArray(parents) ? parents : []);
  const classroomsArray = Array.isArray(classrooms) ? classrooms : [];
  const attendanceArray = Array.isArray(attendance) ? attendance : [];

  // Calculate stats
  const totalStudents = students?.count || studentsArray.length;
  const totalTeachers = teachers?.count || teachersArray.length;
  const totalParents = parents?.count || parentsArray.length;
  const totalClasses = classroomsArray.length;

  const activeStudents = studentsArray.filter((s: any) =>
    s.is_active || s.user?.is_active
  ).length;
  const activeTeachers = teachersArray.filter((t: any) =>
    t.is_active || t.user?.is_active
  ).length;

  // Calculate grade distribution
  const gradeDistribution = calculateGradeDistribution(studentsArray);

  // Calculate attendance summary
  const attendanceSummary = calculateAttendanceSummary(attendanceArray);

  return {
    stats: {
      totalStudents,
      totalTeachers,
      totalUsers: totalStudents + totalTeachers + totalParents,
      totalParents,
      totalClasses,
      activeStudents,
      activeTeachers
    },
    attendance: attendanceSummary,
    gradeDistribution,
    recentActivity: [], // Would need separate API call or be included in optimized endpoint
    classrooms: classroomsArray,
    lastUpdated: new Date().toISOString()
  };
};

/**
 * Transform optimized API response to our format
 */
const transformOptimizedResponse = (response: any): OptimizedDashboardData => {
  return {
    stats: {
      totalStudents: response.stats?.total_students || 0,
      totalTeachers: response.stats?.total_teachers || 0,
      totalParents: response.stats?.total_parents || 0,
      totalUsers: (response.stats?.total_students || 0) + (response.stats?.total_teachers || 0) + (response.stats?.total_parents || 0),
      totalClasses: response.stats?.total_classes || 0,
      activeStudents: response.stats?.active_students || 0,
      activeTeachers: response.stats?.active_teachers || 0
    },
    attendance: {
      todayRate: response.attendance?.today_rate || 0,
      weeklyAverage: response.attendance?.weekly_average || 0,
      monthlyAverage: response.attendance?.monthly_average || 0,
      trends: response.attendance?.trends || []
    },
    gradeDistribution: response.grade_distribution || [],
    recentActivity: response.recent_activity || [],
    classrooms: response.classrooms || [],
    lastUpdated: response.last_updated || new Date().toISOString()
  };
};

/**
 * Calculate grade distribution from students array
 */
const calculateGradeDistribution = (students: any[]): GradeDistribution[] => {
  if (!students.length) return [];

  const levels: Record<string, number> = {};
  students.forEach((s: any) => {
    const level = s.education_level || 'Other';
    levels[level] = (levels[level] || 0) + 1;
  });

  const total = students.length;
  return Object.entries(levels).map(([level, count]) => ({
    level: level.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    count,
    percentage: Math.round((count / total) * 100)
  }));
};

/**
 * Calculate attendance summary from attendance records
 */
const calculateAttendanceSummary = (records: any[]): AttendanceSummary => {
  if (!records.length) {
    return {
      todayRate: 0,
      weeklyAverage: 0,
      monthlyAverage: 0,
      trends: []
    };
  }

  const today = new Date().toISOString().split('T')[0];
  const attendanceByDate: Record<string, { present: number; absent: number }> = {};

  records.forEach((record: any) => {
    const date = record.date || record.attendance_date;
    if (!date) return;

    if (!attendanceByDate[date]) {
      attendanceByDate[date] = { present: 0, absent: 0 };
    }

    const status = record.status;
    if (status === 'P' || status === 'present') {
      attendanceByDate[date].present++;
    } else if (status === 'A' || status === 'absent') {
      attendanceByDate[date].absent++;
    }
  });

  // Calculate today's rate
  const todayData = attendanceByDate[today];
  const todayTotal = todayData ? todayData.present + todayData.absent : 0;
  const todayRate = todayTotal > 0 ? (todayData.present / todayTotal) * 100 : 0;

  // Calculate weekly and monthly averages
  const dates = Object.keys(attendanceByDate).sort().reverse();
  const weekDates = dates.slice(0, 7);
  const monthDates = dates.slice(0, 30);

  const calculateAverage = (selectedDates: string[]): number => {
    if (!selectedDates.length) return 0;
    let totalPresent = 0;
    let totalRecords = 0;
    selectedDates.forEach(date => {
      const data = attendanceByDate[date];
      totalPresent += data.present;
      totalRecords += data.present + data.absent;
    });
    return totalRecords > 0 ? (totalPresent / totalRecords) * 100 : 0;
  };

  // Create trends array
  const trends = weekDates.map(date => {
    const data = attendanceByDate[date];
    const total = data.present + data.absent;
    return {
      date,
      present: data.present,
      absent: data.absent,
      rate: total > 0 ? (data.present / total) * 100 : 0
    };
  });

  return {
    todayRate: Math.round(todayRate * 10) / 10,
    weeklyAverage: Math.round(calculateAverage(weekDates) * 10) / 10,
    monthlyAverage: Math.round(calculateAverage(monthDates) * 10) / 10,
    trends
  };
};

// ============================================================================
// ENHANCED DASHBOARD STATISTICS METHODS (DASH-001)
// ============================================================================

// Cache for enhanced stats
let enhancedStatsCache: {
  data: EnhancedDashboardStats | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0
};

let pendingEnhancedRequest: Promise<EnhancedDashboardStats> | null = null;

/**
 * Check if enhanced stats cache is still valid
 */
const isEnhancedCacheValid = (): boolean => {
  return enhancedStatsCache.data !== null &&
         (Date.now() - enhancedStatsCache.timestamp) < CACHE_TTL;
};

/**
 * Clear the enhanced stats cache
 */
export const clearEnhancedStatsCache = (): void => {
  enhancedStatsCache = { data: null, timestamp: 0 };
  pendingEnhancedRequest = null;
};

/**
 * Fetch enhanced dashboard statistics
 *
 * GET /api/dashboard/admin/enhanced-stats/
 *
 * Returns comprehensive dashboard data including:
 * - Payment statistics with trends
 * - Attendance trends with chart data
 * - Grade distribution with pass rates
 * - Recent activity feed
 * - System alerts and notifications
 */
export const fetchEnhancedStats = async (forceRefresh = false): Promise<EnhancedDashboardStats> => {
  
  // Return cached data if valid and not forcing refresh
  if (!forceRefresh && isEnhancedCacheValid() && enhancedStatsCache.data) {
    console.log('📦 Returning cached enhanced stats data');
    return enhancedStatsCache.data;
  }

  // Return pending request if one exists (deduplication)
  if (pendingEnhancedRequest) {
    console.log('⏳ Returning pending enhanced stats request');
    return pendingEnhancedRequest;
  }

  // Start new request
  console.log('🔄 Fetching fresh enhanced stats data');
  pendingEnhancedRequest = fetchEnhancedStatsData();

  try {
    const data = await pendingEnhancedRequest;

    // Update cache
    enhancedStatsCache = {
      data,
      timestamp: Date.now()
    };

    return data;
  } finally {
    pendingEnhancedRequest = null;
  }
};

/**
 * Internal function to fetch enhanced stats data from API
 */
const fetchEnhancedStatsData = async (): Promise<EnhancedDashboardStats> => {
  try {
    const response = await api.get('/api/dashboard/admin/enhanced-stats/');
    console.log("OPTIMIZED DATA:", response.data);
    console.log('✅ Got enhanced stats from API');
    return response;
  } catch (error: any) {
    console.error('❌ Failed to fetch enhanced stats:', error);
    throw error;
  }
};

/**
 * Get payment statistics only
 */
export const fetchPaymentStatistics = async (): Promise<PaymentStatistics | null> => {
  try {
    const stats = await fetchEnhancedStats();
    return stats.payment_statistics;
  } catch (error) {
    console.error('Failed to fetch payment statistics:', error);
    return null;
  }
};

/**
 * Get attendance trends only
 */
export const fetchAttendanceTrends = async (): Promise<AttendanceTrends | null> => {
  try {
    const stats = await fetchEnhancedStats();
    return stats.attendance_trends;
  } catch (error) {
    console.error('Failed to fetch attendance trends:', error);
    return null;
  }
};

/**
 * Get grade distribution only
 */
export const fetchGradeDistribution = async (): Promise<GradeDistributionData | null> => {
  try {
    const stats = await fetchEnhancedStats();
    return stats.grade_distribution;
  } catch (error) {
    console.error('Failed to fetch grade distribution:', error);
    return null;
  }
};

/**
 * Get recent activities only
 */
export const fetchRecentActivities = async (): Promise<ActivityItem[]> => {
  try {
    const stats = await fetchEnhancedStats();
    return stats.recent_activities;
  } catch (error) {
    console.error('Failed to fetch recent activities:', error);
    return [];
  }
};

/**
 * Get alerts only
 */
export const fetchAlerts = async (): Promise<Alert[]> => {
  try {
    const stats = await fetchEnhancedStats();
    return stats.alerts;
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    return [];
  }
};

/**
 * Clear all caches
 */
export const clearAllCaches = (): void => {
  clearDashboardCache();
  clearEnhancedStatsCache();
};

// Export service object
const AdminDashboardService = {
  // Original methods
  fetchOptimizedDashboard,
  clearDashboardCache,
  isCacheValid,

  // Enhanced stats methods (DASH-001)
  fetchEnhancedStats,
  fetchPaymentStatistics,
  fetchAttendanceTrends,
  fetchGradeDistribution,
  fetchRecentActivities,
  fetchAlerts,
  clearEnhancedStatsCache,
  clearAllCaches
};

export default AdminDashboardService;
