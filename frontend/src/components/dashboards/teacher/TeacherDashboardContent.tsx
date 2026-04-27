
import React, { useMemo, memo } from 'react';
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
  BookOpen,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { TeacherUserData } from '@/types/types';
import TeacherDashboardSkeleton from './TeacherDashboardSkeleton';

// Static data moved outside component to prevent recreation on every render
const QUICK_ACTIONS = [
  {
    id: 'attendance',
    title: 'Attendance',
    description: 'Track daily attendance',
    icon: CheckSquare,
    gradient: 'from-emerald-500 to-teal-600',
    bgLight: 'bg-emerald-50 dark:bg-emerald-900/20',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    path: '/teacher/classes'
  },
  {
    id: 'exam',
    title: 'Examinations',
    description: 'Manage tests & exams',
    icon: FileText,
    gradient: 'from-blue-500 to-indigo-600',
    bgLight: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-600 dark:text-blue-400',
    path: '/teacher/exams'
  },
  {
    id: 'result',
    title: 'Results',
    description: 'Enter & view scores',
    icon: Award,
    gradient: 'from-violet-500 to-purple-600',
    bgLight: 'bg-violet-50 dark:bg-violet-900/20',
    textColor: 'text-violet-600 dark:text-violet-400',
    path: '/teacher/results'
  },
  {
    id: 'message',
    title: 'Messages',
    description: 'Communication hub',
    icon: MessageSquare,
    gradient: 'from-amber-500 to-orange-600',
    bgLight: 'bg-amber-50 dark:bg-amber-900/20',
    textColor: 'text-amber-600 dark:text-amber-400',
    path: '/'
  },
  {
    id: 'schedule',
    title: 'Schedule',
    description: 'View timetable',
    icon: Calendar,
    gradient: 'from-rose-500 to-pink-600',
    bgLight: 'bg-rose-50 dark:bg-rose-900/20',
    textColor: 'text-rose-600 dark:text-rose-400',
    path: '/teacher/schedule'
  },
  {
    id: 'reports',
    title: 'Reports',
    description: 'Analytics & insights',
    icon: BarChart3,
    gradient: 'from-cyan-500 to-blue-600',
    bgLight: 'bg-cyan-50 dark:bg-cyan-900/20',
    textColor: 'text-cyan-600 dark:text-cyan-400',
    path: '/teacher/reports'
  }
];



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
  const teacherData = teacher?.profile?.teacher_data ?? teacher?.teacher_data ?? null;

  // Memoize safe stats to prevent recalculation on every render
  const safeStats = useMemo(() => {
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
    return {
      totalStudents: Number(stats.totalStudents) || 0,
      totalClasses: Number(stats.totalClasses) || 0,
      totalSubjects: Number(stats.totalSubjects) || 0,
      attendanceRate: Number(stats.attendanceRate) || 0,
      pendingExams: Number(stats.pendingExams) || 0,
      unreadMessages: Number(stats.unreadMessages) || 0,
      upcomingLessons: Number(stats.upcomingLessons) || 0,
      recentResults: Number(stats.recentResults) || 0
    };
  }, [dashboardData?.stats]);

  // Show skeleton loader while loading
  if (!dashboardData) {
    return <TeacherDashboardSkeleton />;
  }

  const activities = dashboardData?.activities || [];
  const events = dashboardData?.events || [];
  const classes = dashboardData?.classes || [];
  const subjects = dashboardData?.subjects || [];
  const exams = dashboardData?.exams || [];

  const handleQuickAction = (action: any) => {
    navigate(action.path);
  };

  try {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">

          {/* Welcome Header */}
          <div className="relative overflow-hidden bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-900 dark:to-slate-950 rounded-2xl p-6 sm:p-8">
            {/* Subtle decorative elements */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-slate-700/30 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-slate-600/20 rounded-full blur-2xl"></div>
            </div>

            <div className="relative flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-slate-400 text-sm font-medium mb-2">Teacher Dashboard</p>
              
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                  Welcome back, {teacherData?.user?.first_name || user?.first_name || 'Teacher'}
                </h1>
                <p className="text-slate-400 text-sm sm:text-base mb-4">
                  Here's your overview for today.
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{new Date().toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric'
                    })}</span>
                  </div>
                  {teacherData?.department && (
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      <span>{teacherData.department}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-700/50 overflow-hidden">
                  {teacherData?.photo ? (
                    <img
                      src={teacherData.photo}
                      alt="Teacher Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Users className="w-8 h-8 text-slate-500" />
                    </div>
                  )}
                </div>
                <div className="hidden sm:block">
                  <p className="font-semibold text-white">
                    {teacherData?.user?.first_name} {teacherData?.user?.last_name}
                  </p>
                  <p className="text-slate-400 text-sm">
                    {teacherData?.employee_id || 'Teacher'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Students"
              value={safeStats.totalStudents}
              icon={Users}
              gradient=""
              bgColor=""
              iconBg="bg-slate-100 dark:bg-slate-700/50"
              iconColor="text-slate-600 dark:text-slate-400"
            />
            <StatCard
              label="Classes"
              value={safeStats.totalClasses}
              icon={GraduationCap}
              gradient=""
              bgColor=""
              iconBg="bg-slate-100 dark:bg-slate-700/50"
              iconColor="text-slate-600 dark:text-slate-400"
            />
            <StatCard
              label="Subjects"
              value={safeStats.totalSubjects}
              icon={BookOpen}
              gradient=""
              bgColor=""
              iconBg="bg-slate-100 dark:bg-slate-700/50"
              iconColor="text-slate-600 dark:text-slate-400"
            />
            <StatCard
              label="Pending Tasks"
              value={safeStats.pendingExams}
              icon={Bell}
              gradient=""
              bgColor=""
              iconBg="bg-slate-100 dark:bg-slate-700/50"
              iconColor="text-slate-600 dark:text-slate-400"
            />
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action)}
                className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-slate-200/60 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm hover:shadow-md transition-all text-left"
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mb-2 sm:mb-3">
                  <action.icon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-400" />
                </div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-white mb-0.5 truncate">
                  {action.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 hidden sm:block">
                  {action.description}
                </p>
              </button>
            ))}
          </div>

          {/* Classes & Subjects */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Section
              title="My Classes"
              icon={GraduationCap}
              iconColor="text-slate-500"
              items={classes}
              renderItem={(classItem, index) => (
                <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-slate-50/80 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-200 dark:bg-slate-600/50 flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-white truncate">
                      {classItem.name || `Class ${index + 1}`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {classItem.grade_level || 'Grade'} • {classItem.section || 'Section'}
                    </p>
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 flex-shrink-0">
                    {classItem.student_count || 0}
                  </span>
                </div>
              )}
              emptyMessage="No classes assigned"
              emptyIcon={GraduationCap}
            />

            <Section
              title="My Subjects"
              icon={BookOpen}
              iconColor="text-slate-500"
              items={subjects}
              renderItem={(subject) => (
                <div className="p-3 sm:p-4 rounded-xl bg-slate-50/80 dark:bg-slate-700/30">
                  <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-200 dark:bg-slate-600/50 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-medium text-slate-800 dark:text-white truncate">
                          {subject.name}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {subject.code}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap flex-shrink-0">
                      {subject.assignments?.length || 0} classes
                    </span>
                  </div>
                  {subject.assignments?.length > 0 && (
                    <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-slate-200/80 dark:border-slate-600/50 space-y-1.5">
                      {subject.assignments.slice(0, 2).map((assignment: any, idx: number) => (
                        <div key={assignment.id || idx} className="text-xs text-slate-600 dark:text-slate-400 pl-10 sm:pl-12 truncate">
                          {assignment.classroom_name} • {assignment.grade_level} {assignment.section}
                        </div>
                      ))}
                      {subject.assignments?.length > 2 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 pl-10 sm:pl-12">
                          +{subject.assignments.length - 2} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              emptyMessage="No subjects assigned"
              emptyIcon={BookOpen}
            />
          </div>

          {/* Exams */}
          <Section
            title="Exams & Tests"
            icon={FileText}
            iconColor="text-blue-500"
            items={exams}
            actionButtons={[
              { label: 'View Results', onClick: () => navigate('/teacher/results') },
              { label: 'Manage', onClick: () => navigate('/teacher/exams') }
            ]}
            renderItem={(exam) => (
              <div className="flex items-center justify-between gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-slate-50/80 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-white truncate">
                      {exam.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {exam.subject_name || exam.subject?.name}
                    </p>
                  </div>
                </div>
                {exam.exam_date && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap flex-shrink-0">
                    {new Date(exam.exam_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            )}
            emptyMessage="No exams scheduled"
            emptyIcon={FileText}
          />

          {/* Recent Results */}
          <Section
            title="Recent Results"
            icon={Award}
            iconColor="text-violet-500"
            items={dashboardData?.recentResults}
            actionButtons={[
              { label: 'View All', onClick: () => navigate('/teacher/results') }
            ]}
            renderItem={(result) => (
              <div className="flex items-center justify-between gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-slate-50/80 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                    <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-white truncate">
                      {result.student_name || 'Student'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {result.subject_name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {result.total_score || 0}%
                  </span>
                  <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                    {result.grade || '-'}
                  </span>
                </div>
              </div>
            )}
            emptyMessage="No recent results"
            emptyIcon={Award}
          />

          {/* Activities & Events */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Section
              title="Recent Activities"
              icon={Activity}
              iconColor="text-slate-500"
              items={activities}
              renderItem={(activity) => (
                <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-slate-50/80 dark:bg-slate-700/30">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-white truncate">
                      {activity.title || 'Activity'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {activity.description || 'No description'}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap flex-shrink-0">
                    {activity.time || 'Soon'}
                  </span>
                </div>
              )}
              emptyMessage="No recent activities"
              emptyIcon={Activity}
            />

            <Section
              title="Upcoming Events"
              icon={Calendar}
              iconColor="text-slate-500"
              items={events}
              renderItem={(event) => (
                <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-slate-50/80 dark:bg-slate-700/30">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-white truncate">
                      {event.title || 'Event'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {event.description || 'No description'}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap flex-shrink-0">
                    {event.date || 'Soon'}
                  </span>
                </div>
              )}
              emptyMessage="No upcoming events"
              emptyIcon={Calendar}
            />
          </div>

          {/* Performance Overview */}
          <div className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Performance Overview
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Your teaching metrics at a glance
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <PerformanceCard
                value={`${safeStats.attendanceRate}%`}
                label="Attendance Rate"
                icon={CheckSquare}
              />
              <PerformanceCard
                value={safeStats.recentResults}
                label="Results Recorded"
                icon={Award}
              />
              <PerformanceCard
                value={safeStats.upcomingLessons}
                label="Upcoming Lessons"
                icon={Calendar}
              />
            </div>
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

// Reusable Components - wrapped with React.memo for performance
interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  gradient: string;
  bgColor: string;
  iconBg: string;
  iconColor: string;
}

const StatCard = memo<StatCardProps>(({ label, value, icon: Icon, trend, trendUp, iconBg, iconColor }) => {
  return (
    <div className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-5 border border-slate-200/60 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`${iconBg} w-11 h-11 rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trendUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-white mb-1">
        {value}
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
        {label}
      </p>
    </div>
  );
});
StatCard.displayName = 'StatCard';

interface SectionProps {
  title: string;
  icon: LucideIcon;
  iconColor?: string;
  items: any[];
  renderItem: (item: any, index: number) => React.ReactNode;
  actionButtons?: Array<{ label: string; onClick: () => void }>;
  emptyMessage: string;
  emptyIcon?: LucideIcon;
}

const Section = memo<SectionProps>(({ title, icon: Icon, iconColor = 'text-slate-400', items, renderItem, actionButtons, emptyMessage, emptyIcon: EmptyIcon }) => (
  <div className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-5">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center flex-shrink-0">
          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${iconColor}`} />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-white">
          {title}
        </h3>
      </div>
      {actionButtons && (
        <div className="flex gap-2 flex-wrap">
          {actionButtons.map((btn, idx) => (
            <button
              key={idx}
              onClick={btn.onClick}
              className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
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
          <div key={`${item.id ?? 'item'}-${idx}`}>
            {renderItem(item, idx)}
          </div>  
        ))}
      </div>
    ) : (
      <div className="text-center py-8 sm:py-10">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mx-auto mb-3 sm:mb-4">
          {EmptyIcon ? (
            <EmptyIcon className="w-6 h-6 sm:w-7 sm:h-7 text-slate-400 dark:text-slate-500" />
          ) : (
            <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-slate-400 dark:text-slate-500" />
          )}
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
          {emptyMessage}
        </p>
      </div>
    )}
  </div>
));
Section.displayName = 'Section';

interface PerformanceCardProps {
  value: string | number;
  label: string;
  icon: LucideIcon;
}

const PerformanceCard = memo<PerformanceCardProps>(({ value, label, icon: Icon }) => {
  return (
    <div className="bg-slate-50/80 dark:bg-slate-700/30 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-600/50 flex items-center justify-center shadow-sm">
          <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </div>
        <span className="text-2xl font-bold text-slate-800 dark:text-white">
          {value}
        </span>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
        {label}
      </p>
    </div>
  );
});
PerformanceCard.displayName = 'PerformanceCard';

export default TeacherDashboardContent;