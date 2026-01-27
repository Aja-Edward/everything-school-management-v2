import { useState, useEffect } from 'react';
import { Users, BookOpen, Calendar, Loader2, Trophy, Clock, AlertCircle, TrendingUp, Bell, CheckCircle, Target, GraduationCap, MessageSquare, ChevronRight } from 'lucide-react';
import StudentService from '@/services/StudentService';

interface DashboardData {
  student_info: {
    name: string;
    class: string;
    education_level: string;
    registration_number: string;
    admission_date: string;
  };
  statistics: {
    performance: {
      average_score: number;
      label: string;
    };
    attendance: {
      rate: number;
      present: number;
      total: number;
      label: string;
    };
    subjects: {
      count: number;
      label: string;
    };
    schedule: {
      classes_today: number;
      label: string;
    };
  };
  recent_activities: Array<{
    type: string;
    title: string;
    description: string;
    date: string;
    time_ago: string;
  }>;
  announcements: Array<{
    id: number;
    title: string;
    content: string;
    type: string;
    is_pinned: boolean;
    created_at: string;
    time_ago: string;
  }>;
  upcoming_events: Array<{
    id: number;
    title: string;
    subtitle: string;
    description: string;
    type: string;
    start_date: string;
    end_date: string;
    days_until: number;
  }>;
  academic_calendar: Array<{
    id: number;
    title: string;
    description: string;
    type: string;
    start_date: string;
    end_date: string;
    location: string;
    days_until: number;
  }>;
  quick_stats: {
    total_results: number;
    this_term_results: number;
    attendance_this_month: number;
  };
  today_schedule?: Array<{
    subject_name: string;
    teacher_name: string;
    classroom_name: string;
    start_time: string;
    end_time: string;
    is_completed?: boolean;
  }>;
  subject_performance?: Array<{
    subject_name: string;
    name?: string;
    average_score?: number;
    score?: number;
    next_assignment?: string;
  }>;
}

const DashboardContent = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const data = await StudentService.getDashboardData();
        console.log("Dashboard API response:", data);
        setDashboardData(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <span className="text-gray-600 dark:text-gray-400 font-medium text-sm">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Error Loading Dashboard</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Check if dashboardData exists and has required properties
  if (!dashboardData || !dashboardData.student_info || !dashboardData.statistics) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800">
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Dashboard Data</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">No dashboard data available</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Please contact your administrator</p>
        </div>
      </div>
    );
  }

  // Safe access with default values
  const studentInfo = dashboardData.student_info || {};
  const statistics = dashboardData.statistics || {};
  const recentActivities = dashboardData.recent_activities || [];
  const announcements = dashboardData.announcements || [];
  const academicCalendar = dashboardData.academic_calendar || [];

  return (
    <div className="space-y-6">
      {/* Welcome Header - Simple and Clean */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1">
              Welcome back, {studentInfo.name || 'Student'}!
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base">
              {studentInfo.class || 'N/A'} • {studentInfo.education_level || 'N/A'}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Student ID</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{studentInfo.registration_number || 'N/A'}</p>
            </div>
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Date</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid - Minimal Color */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <Trophy className="text-gray-700 dark:text-gray-300" size={20} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
            {statistics.performance?.average_score || 0}%
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Overall Performance</p>
          <div className="mt-3 bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
            <div
              className="bg-gray-900 dark:bg-white h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${statistics.performance?.average_score || 0}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <Clock className="text-gray-700 dark:text-gray-300" size={20} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
            {statistics.attendance?.rate || 0}%
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Attendance Rate</p>
          <div className="mt-3 bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
            <div
              className="bg-gray-900 dark:bg-white h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${statistics.attendance?.rate || 0}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <BookOpen className="text-gray-700 dark:text-gray-300" size={20} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
            {statistics.subjects?.count || 0}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Enrolled Subjects</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <Calendar className="text-gray-700 dark:text-gray-300" size={20} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
            {statistics.schedule?.classes_today || 0}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Classes Today</p>
        </div>
      </div>

      {/* Today's Schedule & Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <Calendar className="mr-2 text-gray-700 dark:text-gray-300" size={20} />
              Today's Schedule
            </h3>
            <span className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-md font-medium">
              {statistics.schedule?.classes_today || 0} classes
            </span>
          </div>
          <div className="space-y-3">
            {dashboardData.today_schedule && dashboardData.today_schedule.length > 0 ? (
              dashboardData.today_schedule.slice(0, 5).map((scheduleItem: any, index: number) => (
                <div key={index} className="flex items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="w-14 h-14 bg-gray-900 dark:bg-white rounded-lg flex flex-col items-center justify-center text-white dark:text-gray-900 font-semibold flex-shrink-0">
                    <span className="text-xs">{scheduleItem.start_time?.substring(0, 5) || '00:00'}</span>
                  </div>
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{scheduleItem.subject_name || 'Unknown'}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {scheduleItem.classroom_name || 'TBA'} • {scheduleItem.teacher_name || 'TBA'}
                    </p>
                  </div>
                  {scheduleItem.is_completed && (
                    <CheckCircle className="text-gray-400 flex-shrink-0 ml-2" size={18} />
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <Calendar className="mx-auto text-gray-300 dark:text-gray-700 mb-3" size={40} />
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No classes scheduled for today</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Enjoy your day!</p>
              </div>
            )}
          </div>
        </div>

        {/* Announcements */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <Bell className="mr-2 text-gray-700 dark:text-gray-300" size={20} />
              Announcements
            </h3>
            <span className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-md font-medium">
              {announcements.length} new
            </span>
          </div>
          <div className="space-y-3">
            {announcements.length > 0 ? (
              announcements.slice(0, 4).map((announcement) => (
                <div key={announcement.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-gray-900 dark:bg-white rounded-full"></div>
                      <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{announcement.type || 'General'}</span>
                    </div>
                    {announcement.is_pinned && (
                      <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded font-medium">
                        Pinned
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white font-medium mb-1">{announcement.content}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">{announcement.time_ago}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <Bell className="mx-auto text-gray-300 dark:text-gray-700 mb-3" size={40} />
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No announcements</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Check back later for updates</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Academic Progress */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <TrendingUp className="mr-2 text-gray-700 dark:text-gray-300" size={20} />
            Academic Progress
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Current Term</span>
        </div>
        <div className="space-y-4">
          {dashboardData.subject_performance && dashboardData.subject_performance.length > 0 ? (
            dashboardData.subject_performance.slice(0, 6).map((subject: any, index: number) => {
              const score = subject.average_score || subject.score || 0;
              const getGrade = (score: number) => {
                if (score >= 90) return 'A+';
                if (score >= 80) return 'A';
                if (score >= 70) return 'B';
                if (score >= 60) return 'C';
                if (score >= 50) return 'D';
                return 'F';
              };
              return (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{subject.subject_name || subject.name}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Score: {score}%</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div className="bg-gray-900 dark:bg-white h-1.5 rounded-full transition-all duration-500" style={{ width: `${score}%` }}></div>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white min-w-[2rem] text-right">{getGrade(score)}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12">
              <BookOpen className="mx-auto text-gray-300 dark:text-gray-700 mb-3" size={40} />
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No performance data available</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Performance data will appear after assessments</p>
            </div>
          )}
        </div>
      </div>

      {/* Academic Calendar */}
      {academicCalendar.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <Calendar className="mr-2 text-gray-700 dark:text-gray-300" size={20} />
              Upcoming Events
            </h3>
            <span className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-md font-medium">
              {academicCalendar.length} events
            </span>
          </div>
          <div className="space-y-3">
            {academicCalendar.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 bg-gray-900 dark:bg-white rounded-lg flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-xs text-white dark:text-gray-900 font-semibold">
                      {new Date(event.start_date).toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className="text-lg text-white dark:text-gray-900 font-bold leading-none">
                      {new Date(event.start_date).getDate()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm truncate">{event.title}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{event.description}</p>
                    {event.location && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 truncate">{event.location}</p>
                    )}
                  </div>
                </div>
                <ChevronRight className="text-gray-400 flex-shrink-0 ml-2" size={16} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activities */}
      {recentActivities.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Recent Activities</h3>
          <div className="space-y-3">
            {recentActivities.slice(0, 5).map((activity, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="w-2 h-2 bg-gray-900 dark:bg-white rounded-full mt-1.5 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{activity.title}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{activity.description}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{activity.time_ago}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardContent;
