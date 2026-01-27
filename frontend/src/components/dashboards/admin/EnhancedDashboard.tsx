import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  GraduationCap,
  UserCheck,
  BookOpen,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Calendar,
  Clock,
  MoreHorizontal,
  RefreshCw,
  ChevronRight,
  Activity,
  Zap,
  Target
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import AdminDashboardService, { EnhancedDashboardStats } from '../../../services/AdminDashboardService';
import {
  AttendanceChart,
  GradeChart,
  ActivityFeed,
  AlertBanner
} from './widgets';

interface EnhancedDashboardProps {
  dashboardStats: any;
  students: any;
  teachers: any;
  attendanceData: any;
  classrooms: any;
  parents: any;
  onRefresh?: () => void;
  onUserStatusUpdate?: (userId: number, userType: 'student' | 'teacher' | 'parent', isActive: boolean) => void;
  user?: any;
  activateStudent?: (studentId: number) => Promise<void>;
  activateTeacher?: (teacherId: number) => Promise<void>;
  activateParent?: (parentId: number) => Promise<void>;
}

// Static color map - moved outside component to prevent recreation
const COLOR_MAP: Record<string, { bg: string; text: string; light: string }> = {
  blue: { bg: 'bg-blue-500', text: 'text-blue-600', light: 'bg-blue-50' },
  violet: { bg: 'bg-violet-500', text: 'text-violet-600', light: 'bg-violet-50' },
  amber: { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50' },
  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50' }
};

// Removed static dummy data - now using real data from API

const QUICK_ACTIONS = [
  { label: 'Add New Student', icon: Users, color: 'blue' },
  { label: 'Record Attendance', icon: Activity, color: 'emerald' },
  { label: 'Create Exam', icon: Target, color: 'violet' },
  { label: 'Send Announcement', icon: Zap, color: 'amber' }
];

const UPCOMING_EVENTS = [
  { title: 'Parent-Teacher Meeting', date: 'Jan 25', type: 'Meeting', color: 'blue' },
  { title: 'Annual Sports Day', date: 'Jan 30', type: 'Event', color: 'emerald' },
  { title: 'Mid-term Examinations', date: 'Feb 5', type: 'Exam', color: 'violet' },
  { title: 'School Anniversary', date: 'Feb 12', type: 'Event', color: 'amber' }
];

const EnhancedDashboard: React.FC<EnhancedDashboardProps> = ({
  dashboardStats: _dashboardStats,
  students: _students,
  teachers: _teachers,
  classrooms: _classrooms,
  parents: _parents,
  onRefresh,
  user
}) => {
  const [mounted, setMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [enhancedStats, setEnhancedStats] = useState<EnhancedDashboardStats | null>(null);
  const [enhancedStatsLoading, setEnhancedStatsLoading] = useState(true);
  const [enhancedStatsError, setEnhancedStatsError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch enhanced statistics (DASH-001)
  useEffect(() => {
    const loadEnhancedStats = async () => {
      try {
        setEnhancedStatsLoading(true);
        setEnhancedStatsError(null);
        const data = await AdminDashboardService.fetchEnhancedStats();
        setEnhancedStats(data);
      } catch (err: any) {
        console.error('Failed to load enhanced stats:', err);
        setEnhancedStatsError(err.message || 'Failed to load dashboard statistics');
      } finally {
        setEnhancedStatsLoading(false);
      }
    };

    loadEnhancedStats();

    // Refresh every 2 minutes
    const interval = setInterval(() => {
      loadEnhancedStats();
    }, 120000);

    return () => clearInterval(interval);
  }, []);

  // Extract arrays from paginated data - memoized to prevent recalculation
  const studentsArray = useMemo(
    () => _students?.results || (Array.isArray(_students) ? _students : []),
    [_students]
  );
  const teachersArray = useMemo(
    () => _teachers?.results || (Array.isArray(_teachers) ? _teachers : []),
    [_teachers]
  );
  const parentsArray = useMemo(
    () => _parents?.results || (Array.isArray(_parents) ? _parents : []),
    [_parents]
  );
  const classroomsArray = useMemo(
    () => (Array.isArray(_classrooms) ? _classrooms : []),
    [_classrooms]
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      // Refresh enhanced stats with cache clear
      AdminDashboardService.clearEnhancedStatsCache();
      const data = await AdminDashboardService.fetchEnhancedStats(true);
      setEnhancedStats(data);

      // Also trigger parent refresh if available
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error('Failed to refresh:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  // Stats - memoized to prevent recalculation on every render
  const totalStudents = useMemo(
    () => _students?.count || studentsArray.length || 0,
    [_students, studentsArray]
  );
  const totalTeachers = useMemo(
    () => _teachers?.count || teachersArray.length || 0,
    [_teachers, teachersArray]
  );
  const totalParents = useMemo(
    () => _parents?.count || parentsArray.length || 0,
    [_parents, parentsArray]
  );
  const totalClasses = useMemo(
    () => classroomsArray.length || 0,
    [classroomsArray]
  );
  const activeStudents = useMemo(
    () => studentsArray.filter((s: any) => s.is_active || s.user?.is_active)?.length || 0,
    [studentsArray]
  );
  const activeTeachers = useMemo(
    () => teachersArray.filter((t: any) => t.is_active || t.user?.is_active)?.length || 0,
    [teachersArray]
  );

  // User display
  const getUserName = () => {
    if (user?.first_name) return user.first_name;
    return user?.email?.split('@')[0] || 'Admin';
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };


  // Memoized stats for cards
  const stats = useMemo(() => [
    {
      title: 'Total Students',
      value: totalStudents,
      change: '+12%',
      trend: 'up',
      icon: Users,
      color: 'blue',
      subtitle: `${activeStudents} active`
    },
    {
      title: 'Total Teachers',
      value: totalTeachers,
      change: '+5%',
      trend: 'up',
      icon: GraduationCap,
      color: 'violet',
      subtitle: `${activeTeachers} active`
    },
    {
      title: 'Total Parents',
      value: totalParents,
      change: '+8%',
      trend: 'up',
      icon: UserCheck,
      color: 'amber',
      subtitle: 'Registered'
    },
    {
      title: 'Classrooms',
      value: totalClasses,
      change: '0%',
      trend: 'stable',
      icon: BookOpen,
      color: 'emerald',
      subtitle: 'All levels'
    }
  ], [totalStudents, totalTeachers, totalParents, totalClasses, activeStudents, activeTeachers]);

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className={`mb-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {getGreeting()}, {getUserName()}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Here's what's happening with your school today.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600">
              <Clock className="w-4 h-4" />
              {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Alert Banner (DASH-001) */}
      {enhancedStats?.alerts && enhancedStats.alerts.length > 0 && (
        <div className={`mb-6 transition-all duration-700 delay-50 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <AlertBanner
            alerts={enhancedStats.alerts}
            loading={enhancedStatsLoading}
            maxVisible={3}
          />
        </div>
      )}

      {/* Stats Grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {stats.map((stat, index) => (
          <div
            key={stat.title}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all duration-200"
            style={{ transitionDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 ${COLOR_MAP[stat.color].light} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${COLOR_MAP[stat.color].text}`} />
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium ${
                stat.trend === 'up' ? 'text-emerald-600' : stat.trend === 'down' ? 'text-red-600' : 'text-gray-500'
              }`}>
                {stat.trend === 'up' && <TrendingUp className="w-3 h-3" />}
                {stat.trend === 'down' && <TrendingDown className="w-3 h-3" />}
                {stat.change}
              </div>
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{stat.value.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-0.5">{stat.title}</p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">{stat.subtitle}</span>
            </div>
          </div>
        ))}
      </div>

      {/* DASH-001 Widgets Grid */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Attendance Trends Chart */}
        <AttendanceChart
          data={enhancedStats?.attendance_trends || null}
          loading={enhancedStatsLoading}
          chartType="area"
        />

        {/* Grade Distribution Chart */}
        <GradeChart
          data={enhancedStats?.grade_distribution || null}
          loading={enhancedStatsLoading}
        />

        {/* Activity Feed */}
        <ActivityFeed
          activities={enhancedStats?.recent_activities || []}
          loading={enhancedStatsLoading}
          maxItems={10}
        />
      </div>

      {/* Second Row */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Academic Performance - Top Subjects */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Academic Performance</h3>
              <p className="text-xs text-gray-500 mt-0.5">Top performing subjects by average score</p>
            </div>
            {enhancedStats?.summary?.pass_rate && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-600">{enhancedStats.summary.pass_rate}% Pass Rate</span>
              </div>
            )}
          </div>
          {enhancedStatsLoading ? (
            <div className="h-[200px] flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
            </div>
          ) : enhancedStats?.grade_distribution?.top_subjects && enhancedStats.grade_distribution.top_subjects.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={enhancedStats.grade_distribution.top_subjects.slice(0, 6)}>
                <defs>
                  <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="subject"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#9ca3af' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#fff'
                  }}
                  formatter={(value: any, name: string) => [
                    `${value}%`,
                    name === 'average' ? 'Average Score' : name
                  ]}
                  labelFormatter={(label) => `Subject: ${label}`}
                />
                <Bar
                  dataKey="average"
                  fill="url(#colorBar)"
                  radius={[8, 8, 0, 0]}
                  name="Average Score"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
              No performance data available
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-gray-100 hover:border-gray-200 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 ${COLOR_MAP[action.color].light} rounded-lg flex items-center justify-center`}>
                    <action.icon className={`w-4 h-4 ${COLOR_MAP[action.color].text}`} />
                  </div>
                  <span className="text-sm text-gray-700">{action.label}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row - Upcoming Events */}
      <div className={`transition-all duration-700 delay-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Upcoming Events */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-gray-900">Upcoming Events</h3>
            <button className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              Calendar
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {UPCOMING_EVENTS.map((event, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex flex-col items-center justify-center w-12 h-12 bg-white rounded-lg border border-gray-200">
                  <span className="text-xs text-gray-500">{event.date.split(' ')[0]}</span>
                  <span className="text-sm font-semibold text-gray-900">{event.date.split(' ')[1]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                  <span className={`inline-block px-2 py-0.5 text-xs rounded ${COLOR_MAP[event.color].light} ${COLOR_MAP[event.color].text}`}>
                    {event.type}
                  </span>
                </div>
                <Calendar className="w-4 h-4 text-gray-400" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedDashboard;
