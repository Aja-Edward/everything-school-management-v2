import React, { useState, useEffect } from 'react';
import {
  Home,
  Users,
  GraduationCap,
  UserCheck,
  BookOpen,
  School,
  Clock,
  FileText,
  BarChart3,
  CheckSquare,
  MessageSquare,
  User,
  Settings,
  LogOut,
  Search,
  ChevronLeft,
  ChevronRight,
  Key,
  Calendar,
  Menu,
  X,
  PenTool
} from 'lucide-react';
import StudentResultChecker from './StudentResultChecker';
import TokenGenerator from '@/pages/admin/TokenGenerator';
import {
  UserProfile,
  AdminDashboardStats,
  AdminUserManagement,
  UserRole,
  FullUserData,
  Student,
  Teacher,
  Parent,
  Message,
  Classroom,
  DashboardStats,
  AttendanceData
} from '@/types/types';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext';
import { getAbsoluteUrl } from '@/utils/urlUtils';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';

interface AdminDashboardProps {
  dashboardStats: DashboardStats | null;
  students: Student[] | null;
  teachers: Teacher[] | null;
  parents: Parent[] | null;
  attendanceData: AttendanceData | null;
  classrooms: Classroom[] | null;
  messages: Message[] | null;
  userProfile: UserProfile | null;
  notificationCount: number;
  messageCount: number;
  onRefresh: () => void;
  currentUser?: FullUserData | null;
  onLogout?: () => void;
  isAdmin?: boolean;
  adminMethods?: {
    getUsers: (params?: {
      page?: number;
      limit?: number;
      role?: UserRole;
      search?: string;
      is_active?: boolean;
      is_verified?: boolean;
    }) => Promise<{
      users: AdminUserManagement[];
      total: number;
      page: number;
      total_pages: number;
    }>;
    getDashboardStats: () => Promise<AdminDashboardStats>;
    getUserProfile: (userId: number) => Promise<UserProfile>;
  };
  children?: React.ReactNode;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onLogout,
  children
}) => {
  const { settings } = useSettings();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showStudentResultChecker, setShowStudentResultChecker] = useState(false);
  const [showTokenGenerator, setShowTokenGenerator] = useState(false);

  const {
    canViewStudents,
    canViewTeachers,
    canViewAttendance,
    canViewSettings,
    canViewAdminList,
    canAccessPasswordRecovery,
    isSuperAdmin,
    isSectionAdmin
  } = usePermissions();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMobileMenuOpen]);

  // Build navigation items
  const buildNavigationItems = () => {
    const items: Array<{ name: string; icon: any; path: string }> = [
      { name: 'Dashboard', icon: Home, path: '/admin/dashboard' },
    ];

    if (canViewTeachers()) {
      items.push({ name: 'Teachers', icon: Users, path: '/admin/teachers' });
    }

    if (canViewStudents()) {
      items.push({ name: 'Students', icon: GraduationCap, path: '/admin/students' });
    }

    if (canViewAttendance()) {
      items.push({ name: 'Attendance', icon: CheckSquare, path: '/admin/attendance' });
    }

    items.push({ name: 'Parents', icon: UserCheck, path: '/admin/parents' });

    if (canViewAdminList()) {
      items.push({ name: 'Admins', icon: User, path: '/admin/admins' });
    }

    if (canAccessPasswordRecovery()) {
      items.push({ name: 'Password Recovery', icon: Key, path: '/admin/password-recovery' });
    }

    items.push(
      { name: 'Subjects', icon: BookOpen, path: '/admin/subjects' },
      { name: 'Classes', icon: School, path: '/admin/classes' },
      { name: 'Lessons', icon: Clock, path: '/admin/lessons' },
      { name: 'Exams', icon: FileText, path: '/admin/exams' },
      { name: 'Exam Schedules', icon: Calendar, path: '/admin/exam-schedules' },
      { name: 'Results', icon: BarChart3, path: '/admin/results' },
      { name: 'Result Checker', icon: Search, path: '/admin/result-checker' },
      { name: 'Admin Remarks', icon: PenTool, path: '/admin/admin-remarks' },
      { name: 'Student Result Checker', icon: Search, path: '/admin/student-result-checker' },
      { name: 'Token Generator', icon: Key, path: '/admin/token-generator' },
      { name: 'Messages', icon: MessageSquare, path: '/admin/messages' }
    );

    if (canViewSettings()) {
      items.push({ name: 'Settings', icon: Settings, path: '/admin/settings' });
    }

    return items;
  };

  const navigationItems = buildNavigationItems();

  const handleLogout = async () => {
    try {
      if (onLogout) await onLogout();
      else {
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('userProfile');
      }
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Logout failed:', error);
      localStorage.clear();
      navigate('/', { replace: true });
    }
  };

  const handleNavigationClick = (itemName: string, path: string) => {
    setIsMobileMenuOpen(false);

    if (itemName === 'Student Result Checker') {
      setShowStudentResultChecker(true);
      return;
    }
    if (itemName === 'Token Generator') {
      setShowTokenGenerator(true);
      return;
    }
    navigate(path);
  };

  const getAdminRoleDisplay = () => {
    if (isSuperAdmin()) return 'Super Admin';
    if (isSectionAdmin()) {
      const role = user?.role || '';
      const roleMap: Record<string, string> = {
        'primary_admin': 'Primary Admin',
        'nursery_admin': 'Nursery Admin',
        'secondary_admin': 'Secondary Admin',
        'senior_secondary_admin': 'Senior Secondary Admin',
        'junior_secondary_admin': 'Junior Secondary Admin'
      };
      return roleMap[role] || 'Section Admin';
    }
    return 'Admin';
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        {/* Mobile Overlay */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          ${isSidebarCollapsed ? 'w-[72px]' : 'w-64'}
          bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300 ease-out
          fixed md:relative z-50
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          {/* Logo Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
                {settings?.logo ? (
                  <img
                    src={getAbsoluteUrl(settings.logo)}
                    alt="Logo"
                    className="w-6 h-6 object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <GraduationCap className="w-5 h-5 text-white" />
                )}
              </div>
              {!isSidebarCollapsed && (
                <div className="overflow-hidden">
                  <h1 className="text-sm font-semibold text-gray-900 truncate">
                    {settings?.tenant_name || 'School Portal'}
                  </h1>
                  <p className="text-xs text-gray-500 truncate">{getAdminRoleDisplay()}</p>
                </div>
              )}
            </div>

            {/* Mobile close button */}
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <div className="space-y-1">
              {navigationItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.name}
                    onClick={() => handleNavigationClick(item.name, item.path)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150
                      ${isSidebarCollapsed ? 'justify-center' : ''}
                      ${active
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                    title={isSidebarCollapsed ? item.name : ''}
                  >
                    <item.icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-gray-400'}`} />
                    {!isSidebarCollapsed && (
                      <span className="text-sm font-medium truncate">{item.name}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="p-3 border-t border-gray-100">
            <button
              onClick={handleLogout}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150
                text-gray-600 hover:bg-red-50 hover:text-red-600
                ${isSidebarCollapsed ? 'justify-center' : ''}
              `}
              title={isSidebarCollapsed ? 'Logout' : ''}
            >
              <LogOut className="w-5 h-5 flex-shrink-0 text-gray-400" />
              {!isSidebarCollapsed && (
                <span className="text-sm font-medium">Logout</span>
              )}
            </button>
          </div>

          {/* Collapse Toggle (Desktop only) */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center shadow-sm hover:shadow transition-shadow"
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
            )}
          </button>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile Header */}
          <header className="md:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-sm font-semibold text-gray-900">
              {settings?.tenant_name || 'Admin Portal'}
            </h1>
            <div className="w-9" />
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-auto bg-gray-50 p-4 md:p-6">
            {children}
          </main>
        </div>

        {/* Floating Password Recovery Button */}
        {canAccessPasswordRecovery() && !isMobileMenuOpen && (
          <button
            onClick={() => navigate('/admin/password-recovery')}
            className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-800 hover:shadow-xl transition-all"
            title="Password Recovery"
          >
            <Key className="w-5 h-5" />
          </button>
        )}

        {/* Student Result Checker Modal */}
        {showStudentResultChecker && (
          <StudentResultChecker onClose={() => setShowStudentResultChecker(false)} />
        )}

        {/* Token Generator Modal */}
        {showTokenGenerator && (
          <div className="fixed inset-0 z-50 overflow-auto bg-black/50 backdrop-blur-sm">
            <div className="min-h-screen flex items-start justify-center pt-8 pb-8 px-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Result Token Generator</h2>
                  <button
                    onClick={() => setShowTokenGenerator(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <div className="p-6">
                  <TokenGenerator />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
