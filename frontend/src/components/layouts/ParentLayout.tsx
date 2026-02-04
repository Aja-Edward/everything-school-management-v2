import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  GraduationCap,
  User,
  Calendar,
  FileText,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronDown,
  Home,
  Award,
  BarChart3,
  Users,
  BookOpen
} from 'lucide-react';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { getAbsoluteUrl } from '@/utils/urlUtils';

interface ParentLayoutProps {
  children: React.ReactNode;
}

const ParentLayout: React.FC<ParentLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode, toggleTheme } = useGlobalTheme();
  const { settings } = useSettings();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navigationItems = [
    { id: 'dashboard', name: 'Dashboard', icon: Home, path: '/parent/dashboard' },
    // Coming soon pages - uncomment as they are implemented
    // { id: 'children', name: 'My Children', icon: Users, path: '/parent/children' },
    // { id: 'attendance', name: 'Attendance', icon: Calendar, path: '/parent/attendance' },
    // { id: 'results', name: 'Academic Results', icon: Award, path: '/parent/results' },
    // { id: 'reports', name: 'Report Cards', icon: FileText, path: '/parent/reports' },
    // { id: 'schedule', name: 'Class Schedule', icon: BookOpen, path: '/parent/schedule' },
    // { id: 'messages', name: 'Messages', icon: MessageSquare, path: '/parent/messages' },
    // { id: 'profile', name: 'Profile', icon: User, path: '/parent/profile' },
    // { id: 'settings', name: 'Settings', icon: Settings, path: '/parent/settings' },
  ];

  const getParentInitials = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();
    }
    return 'P';
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex">
        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="flex flex-col h-full">
            {/* Logo and School Name */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
                  {settings?.logo ? (
                    <img
                      src={getAbsoluteUrl(settings.logo)}
                      alt="Logo"
                      className="w-6 h-6 object-contain"
                    />
                  ) : (
                    <GraduationCap className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                    {settings?.tenant_name || 'School'}
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Parent Portal</p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path ||
                  (item.path !== '/parent/dashboard' && location.pathname.startsWith(item.path));
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSidebarOpen(false);
                      navigate(item.path);
                    }}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-slate-700 dark:text-slate-300' : ''}`} />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </nav>

            {/* User Profile */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">
                    {getParentInitials()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {user?.first_name} {user?.last_name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Parent
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 lg:ml-0">
          {/* Top Navigation Bar */}
          <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-4 py-3">
              {/* Left side */}
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <Menu className="w-5 h-5" />
                </button>

                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Parent Portal
                </h2>
              </div>

              {/* Right side */}
              <div className="flex items-center space-x-4">
                {/* Theme Toggle */}
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors duration-200"
                >
                  {isDarkMode ? (
                    <div className="w-5 h-5 text-slate-600 dark:text-slate-300">☀️</div>
                  ) : (
                    <div className="w-5 h-5 text-slate-600 dark:text-slate-300">🌙</div>
                  )}
                </button>

                {/* Notifications */}
                <button
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors duration-200 relative"
                >
                  <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                </button>

                {/* User Menu */}
                <div className="relative">
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="flex items-center space-x-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors duration-200"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
                      <span className="text-sm font-bold text-white">
                        {getParentInitials()}
                      </span>
                    </div>
                    <span className="hidden md:block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {user?.first_name}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </button>

                  {userDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50">
                      {/* User Info */}
                      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
                            <span className="text-sm font-bold text-white">
                              {getParentInitials()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {user?.first_name} {user?.last_name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {user?.email}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Navigation Options */}
                      <div className="py-2">
                        <button
                          onClick={() => {
                            setUserDropdownOpen(false);
                            navigate('/');
                          }}
                          className="flex items-center space-x-3 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-200 w-full"
                        >
                          <Home className="w-4 h-4" />
                          <span>Back to Home</span>
                        </button>
                        <button
                          onClick={() => {
                            setUserDropdownOpen(false);
                            navigate('/parent/dashboard');
                          }}
                          className="flex items-center space-x-3 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-200 w-full"
                        >
                          <BarChart3 className="w-4 h-4" />
                          <span>Dashboard</span>
                        </button>
                      </div>

                      {/* Account Options */}
                      <div className="py-2 border-t border-slate-200 dark:border-slate-700">
                        <button
                          onClick={handleLogout}
                          className="flex items-center space-x-3 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200 w-full"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Logout</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="bg-slate-50 dark:bg-slate-900 min-h-screen">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default ParentLayout;
