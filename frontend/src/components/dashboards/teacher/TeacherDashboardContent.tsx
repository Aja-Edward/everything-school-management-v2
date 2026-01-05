
import React from 'react';
import { 
  GraduationCap, 
  Users, 
  Calendar, 
  FileText, 
  MessageSquare, 
  Clock,
  TrendingUp,
  Award,
  CheckSquare,
  BarChart3,
  Bell,
  Activity,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { TeacherUserData } from '@/types/types';

interface TeacherDashboardContentProps {
  dashboardData: any;
  onRefresh: () => void;
  error?: string | null;
  isLoadingSecondaryData?: boolean;
}

const TeacherDashboardContent: React.FC<TeacherDashboardContentProps> = ({ 
  dashboardData
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const teacher = user as TeacherUserData;
  const teacherData = teacher?.teacher_data;

  console.log("Teacher data", teacherData);

  if (!dashboardData) {
    return (
      <div className="p-3 sm:p-4 md:p-6">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200 text-sm">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  const stats = dashboardData?.stats || {
    totalStudents: 0,
    totalClasses: 0,
    totalSubjects: 0,
    attendanceRate: 0,
    pendingExams: 0,
    unreadMessages: 0,
    upcomingLessons: 0,
    recentResults: 0
  };

  const safeStats = {
    totalStudents: Number(stats.totalStudents) || 0,
    totalClasses: Number(stats.totalClasses) || 0,
    totalSubjects: Number(stats.totalSubjects) || 0,
    attendanceRate: Number(stats.attendanceRate) || 0,
    pendingExams: Number(stats.pendingExams) || 0,
    unreadMessages: Number(stats.unreadMessages) || 0,
    upcomingLessons: Number(stats.upcomingLessons) || 0,
    recentResults: Number(stats.recentResults) || 0
  };

  const activities = dashboardData?.activities || [];
  const events = dashboardData?.events || [];
  const classes = dashboardData?.classes || [];
  const subjects = dashboardData?.subjects || [];
  const exams = dashboardData?.exams || [];

  const quickActions = [
    {
      id: 'attendance',
      title: 'Attendance',
      icon: CheckSquare,
      color: 'bg-green-500',
      path: '/teacher/classes'
    },
    {
      id: 'exam',
      title: 'Exam',
      icon: FileText,
      color: 'bg-blue-500',
      path: '/teacher/exams'
    },
    {
      id: 'result',
      title: 'Results',
      icon: Award,
      color: 'bg-purple-500',
      path: '/teacher/results'
    },
    {
      id: 'message',
      title: 'Messages',
      icon: MessageSquare,
      color: 'bg-orange-500',
      path: '/'
    },
    {
      id: 'schedule',
      title: 'Schedule',
      icon: Calendar,
      color: 'bg-indigo-500',
      path: '/teacher/schedule'
    },
    {
      id: 'reports',
      title: 'Reports',
      icon: BarChart3,
      color: 'bg-teal-500',
      path: '/teacher/reports'
    }
  ];

  const handleQuickAction = (action: any) => {
    navigate(action.path);
  };

  try {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
          
          {/* Welcome Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-4 sm:p-6 text-white">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 sm:mb-2 truncate">
                  Welcome back, {teacherData?.user?.first_name || user?.first_name || 'Teacher'}!
                </h1>
                <p className="text-blue-100 text-xs sm:text-sm md:text-base mb-2 sm:mb-4">
                  Ready to inspire and educate today?
                </p>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-xs sm:text-sm">
                  <div className="flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="truncate">{new Date().toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="truncate">Active</span>
                  </div>
                  <div className="hidden xs:flex items-center space-x-1.5">
                    <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="truncate">{teacherData?.department || 'Secondary'}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center space-y-2 flex-shrink-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/20 rounded-full flex items-center justify-center border-3 border-white/30 flex-shrink-0">
                  {teacherData?.photo ? (
                    <img 
                      src={teacherData.photo} 
                      alt="Teacher Profile" 
                      className="w-14 h-14 sm:w-18 sm:h-18 rounded-full object-cover"
                    />
                  ) : (
                    <Users className="w-8 h-8 sm:w-10 sm:h-10 text-white/80" />
                  )}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">
                    {teacherData?.user?.first_name} {teacherData?.user?.last_name}
                  </p>
                  <p className="text-blue-100 text-xs truncate">
                    {teacherData?.employee_id || 'ID'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            <StatCard 
              label="Students" 
              value={safeStats.totalStudents} 
              icon={Users} 
              color="blue" 
            />
            <StatCard 
              label="Classes" 
              value={safeStats.totalClasses} 
              icon={GraduationCap} 
              color="green" 
            />
            <StatCard 
              label="Subjects" 
              value={safeStats.totalSubjects} 
              icon={Award} 
              color="purple" 
            />
            <StatCard 
              label="Tasks" 
              value={safeStats.pendingExams} 
              icon={Bell} 
              color="orange" 
            />
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action)}
                className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:shadow-lg transition-all active:scale-95"
              >
                <div className={`${action.color} p-2 rounded-lg text-white mb-2 inline-block`}>
                  <action.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white text-left">
                  {action.title}
                </h3>
              </button>
            ))}
          </div>

          {/* Classes & Subjects */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <Section
              title="My Classes"
              icon={GraduationCap}
              items={classes}
              renderItem={(classItem, index) => (
                <div className="flex items-center space-x-2 p-2.5 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white truncate">
                      {classItem.name || `Class ${index + 1}`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {classItem.grade_level || 'Grade'} - {classItem.section || 'Section'}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                    {classItem.student_count || 0}
                  </span>
                </div>
              )}
              emptyMessage="No classes assigned"
            />

            <Section
              title="My Subjects"
              icon={Award}
              items={subjects}
              renderItem={(subject) => (
                <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-3 sm:p-4 bg-slate-50 dark:bg-slate-700/50">
                  <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0"></div>
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-base font-semibold text-slate-900 dark:text-white truncate">
                          {subject.name}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {subject.code}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                      {subject.assignments?.length || 0}
                    </span>
                  </div>
                  {subject.assignments?.length > 0 && (
                    <div className="space-y-1.5 sm:space-y-2">
                      {subject.assignments.slice(0, 2).map((assignment: any, idx: number) => (
                        <div key={assignment.id || idx} className="text-xs p-1.5 sm:p-2 bg-white dark:bg-slate-600 rounded border border-slate-200 dark:border-slate-500">
                          <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {assignment.classroom_name}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 truncate">
                            {assignment.grade_level} {assignment.section}
                          </p>
                        </div>
                      ))}
                      {subject.assignments?.length > 2 && (
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          +{subject.assignments.length - 2} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              emptyMessage="No subjects assigned"
            />
          </div>

          {/* Exams */}
          <Section
            title="My Exams & Tests"
            icon={FileText}
            items={exams}
            actionButtons={[
              { label: 'Results', onClick: () => navigate('/teacher/results'), color: 'purple' },
              { label: 'Manage', onClick: () => navigate('/teacher/exams'), color: 'blue' }
            ]}
            renderItem={(exam) => (
              <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <div className="flex items-center space-x-2 min-w-0">
                  <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white truncate">
                      {exam.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {exam.subject_name || exam.subject?.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {exam.exam_date && (
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {new Date(exam.exam_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            )}
            emptyMessage="No exams yet"
          />

          {/* Recent Results */}
          <Section
            title="Recent Results"
            icon={Award}
            items={dashboardData?.recentResults}
            actionButtons={[
              { label: 'View All', onClick: () => navigate('/teacher/results'), color: 'purple' }
            ]}
            renderItem={(result) => (
              <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <div className="flex items-center space-x-2 min-w-0">
                  <div className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0"></div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white truncate">
                      {result.student_name || 'Student'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {result.subject_name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {result.total_score || 0}%
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded whitespace-nowrap ${
                    result.grade === 'A' ? 'bg-green-100 text-green-800' :
                    result.grade === 'B' ? 'bg-blue-100 text-blue-800' :
                    result.grade === 'C' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {result.grade || 'N/A'}
                  </span>
                </div>
              </div>
            )}
            emptyMessage="No recent results"
          />

          {/* Activities & Events */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <Section
              title="Recent Activities"
              icon={Clock}
              items={activities}
              renderItem={(activity) => (
                <div className="flex items-center space-x-2 p-2.5 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white truncate">
                      {activity.title || 'Activity'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {activity.description || 'No description'}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                    {activity.time || 'Soon'}
                  </span>
                </div>
              )}
              emptyMessage="No recent activities"
            />

            <Section
              title="Upcoming Events"
              icon={Calendar}
              items={events}
              renderItem={(event) => (
                <div className="flex items-center space-x-2 p-2.5 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white truncate">
                      {event.title || 'Event'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {event.description || 'No description'}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                    {event.date || 'Soon'}
                  </span>
                </div>
              )}
              emptyMessage="No upcoming events"
            />
          </div>

          {/* Performance Overview */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                Performance Overview
              </h3>
              <TrendingUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
              <PerformanceCard 
                value={`${safeStats.attendanceRate}%`} 
                label="Attendance Rate" 
                color="blue" 
              />
              <PerformanceCard 
                value={safeStats.recentResults} 
                label="Recent Results" 
                color="green" 
              />
              <PerformanceCard 
                value={safeStats.upcomingLessons} 
                label="Upcoming Lessons" 
                color="purple" 
              />
            </div>
          </div>

          {/* Success Message */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 sm:p-4">
            <p className="text-green-800 dark:text-green-200 text-xs sm:text-sm">
              Dashboard loaded: {safeStats.totalStudents} students, {safeStats.totalClasses} classes, {safeStats.totalSubjects} subjects
            </p>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error during render:', error);
    return (
      <div className="p-3 sm:p-4 md:p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200 text-sm">
            Error rendering dashboard
          </p>
        </div>
      </div>
    );
  }
};

// Reusable Components
interface StatCardProps {
  label: string;
  value: number;
  icon: any;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, color }) => {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-4 shadow-sm border border-slate-200 dark:border-slate-700">
      <div className={`${colorClasses[color]} w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mb-2 flex-shrink-0`}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm font-medium mb-1">
        {label}
      </p>
      <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
};

interface SectionProps {
  title: string;
  icon: any;
  items: any[];
  renderItem: (item: any, index: number) => React.ReactNode;
  actionButtons?: Array<{ label: string; onClick: () => void; color: string }>;
  emptyMessage: string;
}

const Section: React.FC<SectionProps> = ({ title, icon: Icon, items, renderItem, actionButtons, emptyMessage }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
    <div className="flex items-center justify-between mb-4 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-5 h-5 text-slate-400 flex-shrink-0" />
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate">
          {title}
        </h3>
      </div>
      {actionButtons && (
        <div className="flex gap-1.5 flex-shrink-0">
          {actionButtons.map((btn, idx) => (
            <button
              key={idx}
              onClick={btn.onClick}
              className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
              style={{
                backgroundColor: btn.color === 'purple' ? '#a855f7' : '#3b82f6',
                color: 'white'
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
    
    {items && items.length > 0 ? (
      <div className="space-y-2 sm:space-y-3">
        {items.slice(0, 5).map((item, idx) => (
          <div key={item.id || idx}>
            {renderItem(item, idx)}
          </div>
        ))}
      </div>
    ) : (
      <div className="text-center py-6 sm:py-8">
        <Icon className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mx-auto mb-2 sm:mb-3" />
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          {emptyMessage}
        </p>
      </div>
    )}
  </div>
);

interface PerformanceCardProps {
  value: string | number;
  label: string;
  color: 'blue' | 'green' | 'purple';
}

const PerformanceCard: React.FC<PerformanceCardProps> = ({ value, label, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
  };

  return (
    <div className={`${colorClasses[color]} rounded-lg p-3 sm:p-4 text-center`}>
      <div className="text-xl sm:text-2xl font-bold">
        {value}
      </div>
      <div className="text-xs sm:text-sm font-medium mt-1">
        {label}
      </div>
    </div>
  );
};

export default TeacherDashboardContent;