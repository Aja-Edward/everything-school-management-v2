import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  GraduationCap,
  Users,
  BookOpen,
  Calendar,
  FileText,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  ChevronDown,
  Home,
  CheckSquare,
  Award,
  BarChart3,
  Search,
  ClipboardList,
  Monitor,
} from 'lucide-react';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { getAbsoluteUrl } from '@/utils/urlUtils';
import NotificationBell from '@/components/common/NotificationBell';

interface TeacherDashboardLayoutProps {
  children: React.ReactNode;
}

const TeacherDashboardLayout: React.FC<TeacherDashboardLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode, toggleTheme } = useGlobalTheme();
  const { settings } = useSettings();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/teacher-login');
  };

  const isNonTeaching = (user as any)?.teacher_data?.staff_type === 'non-teaching'
    || (user as any)?.profile?.teacher_data?.staff_type === 'non-teaching';

  const navigationItems = [
    { id: 'dashboard', name: 'Dashboard', icon: Home, path: '/teacher/dashboard' },
    { id: 'profile', name: 'Profile', icon: User, path: '/teacher/profile' },
    // Teaching-specific items (hidden for non-teaching staff)
    ...(!isNonTeaching ? [
      { id: 'classes', name: 'My Classes', icon: GraduationCap, path: '/teacher/classes' },
      { id: 'subjects', name: 'My Subjects', icon: BookOpen, path: '/teacher/subjects' },
      { id: 'students', name: 'Students', icon: Users, path: '/teacher/students' },
      { id: 'attendance', name: 'Attendance', icon: CheckSquare, path: '/teacher/classes' },
      { id: 'assignments', name: 'Assignments', icon: ClipboardList, path: '/teacher/assignments' },
      { id: 'exams', name: 'Exams & Tests', icon: FileText, path: '/teacher/exams' },
      { id: 'invigilate', name: 'CBT Invigilation', icon: Monitor, path: '/teacher/invigilate' },
      { id: 'results', name: 'Results', icon: Award, path: '/teacher/results' },
      { id: 'schedule', name: 'Schedule', icon: Calendar, path: '/teacher/schedule' },
      { id: 'reports', name: 'Reports', icon: BarChart3, path: '/teacher/reports' },
    ] : []),
    // Activity log — for non-teaching staff (and all staff)
    { id: 'activity-log', name: 'My Activity Log', icon: ClipboardList, path: '/teacher/activity-log' },
    { id: 'messages', name: 'Messages', icon: MessageSquare, path: '/teacher/messages' },
    { id: 'settings', name: 'Settings', icon: Settings, path: '/teacher/settings' },
  ];

  // Helper function to get teacher profile picture
  const getTeacherProfilePicture = () => {
    // Check for different possible photo field names
    const teacherData = (user as any)?.profile?.teacher_data; // Fixed: check profile.teacher_data
    const profileData = (user as any)?.profile;
    let photoUrl = null;
    
    // First check teacher_data (if it exists)
    if (teacherData && Object.keys(teacherData).length > 0) {
      if (teacherData.photo) {
        photoUrl = teacherData.photo;
      } else if (teacherData.profile_picture) {
        photoUrl = teacherData.profile_picture;
      } else if (teacherData.avatar) {
        photoUrl = teacherData.avatar;
      } else if (teacherData.avatar_url) {
        photoUrl = teacherData.avatar_url;
      } else if (teacherData.image) {
        photoUrl = teacherData.image;
      }
    }
    
    // If no photo found in teacher_data, check profile object
    if (!photoUrl && profileData) {
      if (profileData.profile_image_url) {
        photoUrl = profileData.profile_image_url;
      } else if (profileData.profile_picture) {
        photoUrl = profileData.profile_picture;
      } else if (profileData.avatar_url) {
        photoUrl = profileData.avatar_url;
      } else if (profileData.avatar) {
        photoUrl = profileData.avatar;
      }
    }
    
    // If still no photo found, check user object directly
    if (!photoUrl) {
      if ((user as any)?.avatar_url) {
        photoUrl = (user as any).avatar_url;
      } else if ((user as any)?.profile_picture) {
        photoUrl = (user as any).profile_picture;
      } else if ((user as any)?.photo) {
        photoUrl = (user as any).photo;
      }
    }
    
    if (photoUrl) {
      // Check if it's a full URL or just a path
      const finalUrl = photoUrl.startsWith('http') 
        ? photoUrl 
        : `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}${photoUrl}`;
      
      return finalUrl;
    }
    
    return null;
  };

  // Helper function to get teacher initials
  const getTeacherInitials = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();
    }
    return 'T';
  };

  return (
    <div className={`min-h-screen overflow-x-hidden ${isDarkMode ? 'dark' : ''}`}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex w-full">
        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 flex-shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="flex flex-col h-full">
            {/* Logo and School Name */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg flex border items-center justify-center">
                  {settings?.logo ? (
                    <img 
                      src={getAbsoluteUrl(settings.logo)} 
                      alt="Logo"
                      className="w-10 h-10 object-cover"
                    />
                  ) : (
                    <GraduationCap className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                    {settings?.school_name || 'School'}
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Teacher Portal</p>
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
                  (item.path !== '/teacher/dashboard' && location.pathname.startsWith(item.path));
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
                 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                   {getTeacherProfilePicture() ? (
                     <img 
                       src={getTeacherProfilePicture()!} 
                       alt="Profile"
                       className="w-10 h-10 rounded-full object-cover"
                       onError={(e) => {
                         e.currentTarget.style.display = 'none';
                         e.currentTarget.nextElementSibling?.classList.remove('hidden');
                       }}
                     />
                   ) : null}
                   <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ${getTeacherProfilePicture() ? 'hidden' : ''}`}>
                     <span className="text-sm font-bold text-white">
                       {getTeacherInitials()}
                     </span>
                   </div>
                 </div>
                 <div className="flex-1 min-w-0">
                   <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                     {user?.first_name} {user?.last_name}
                   </p>
                   <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                     Teacher
                   </p>
                 </div>
               </div>
             </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 w-full lg:ml-0">
          {/* Top Navigation Bar */}
          <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-3 sm:px-4 py-3 gap-2">
              {/* Left side */}
              <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0"
                >
                  <Menu className="w-5 h-5" />
                </button>

                <div className="hidden md:flex items-center space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search..."
                      className="pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
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
                <NotificationBell
                  buttonClassName="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors duration-200 relative"
                  iconClassName="w-5 h-5 text-slate-600 dark:text-slate-300"
                />

                {/* User Menu */}
                <div className="relative">
                                     <button
                     onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                     className="flex items-center space-x-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors duration-200"
                   >
                     <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                       {getTeacherProfilePicture() ? (
                         <img 
                           src={getTeacherProfilePicture()!} 
                           alt="Profile"
                           className="w-8 h-8 rounded-full object-cover"
                           onError={(e) => {
                             e.currentTarget.style.display = 'none';
                             e.currentTarget.nextElementSibling?.classList.remove('hidden');
                           }}
                         />
                       ) : null}
                       <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ${getTeacherProfilePicture() ? 'hidden' : ''}`}>
                         <span className="text-sm font-bold text-white">
                           {getTeacherInitials()}
                         </span>
                       </div>
                     </div>
                     <span className="hidden md:block text-sm font-medium text-slate-700 dark:text-slate-300">
                       {user?.first_name}
                     </span>
                     <ChevronDown className="w-4 h-4 text-slate-400" />
                   </button>

                  {userDropdownOpen && (
                    <div className="fixed sm:absolute right-0 sm:right-0 mt-2 w-full sm:w-56 max-w-xs bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 mx-2 sm:mx-0">
                                             {/* User Info */}
                       <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                         <div className="flex items-center space-x-3">
                           <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                             {getTeacherProfilePicture() ? (
                               <img 
                                 src={getTeacherProfilePicture()!} 
                                 alt="Profile"
                                 className="w-10 h-10 rounded-full object-cover"
                                 onError={(e) => {
                                   e.currentTarget.style.display = 'none';
                                   e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                 }}
                               />
                             ) : null}
                             <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ${getTeacherProfilePicture() ? 'hidden' : ''}`}>
                               <span className="text-sm font-bold text-white">
                                 {getTeacherInitials()}
                               </span>
                             </div>
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
                            navigate('/teacher/dashboard');
                          }}
                          className="flex items-center space-x-3 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-200 w-full"
                        >
                          <BarChart3 className="w-4 h-4" />
                          <span>Dashboard</span>
                        </button>
                        <button
                          onClick={() => {
                            setUserDropdownOpen(false);
                            navigate('/teacher/classes');
                          }}
                          className="flex items-center space-x-3 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-200 w-full"
                        >
                          <GraduationCap className="w-4 h-4" />
                          <span>My Classes</span>
                        </button>
                        <button
                          onClick={() => {
                            setUserDropdownOpen(false);
                            navigate('/teacher/attendance');
                          }}
                          className="flex items-center space-x-3 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-200 w-full"
                        >
                          <CheckSquare className="w-4 h-4" />
                          <span>Attendance</span>
                        </button>
                        <button
                          onClick={() => {
                            setUserDropdownOpen(false);
                            navigate('/teacher/messages');
                          }}
                          className="flex items-center space-x-3 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-200 w-full"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>Messages</span>
                        </button>
                      </div>

                      {/* Account Options */}
                      <div className="py-2 border-t border-slate-200 dark:border-slate-700">
                        <button
                          onClick={() => {
                            setUserDropdownOpen(false);
                            navigate('/teacher/profile');
                          }}
                          className="flex items-center space-x-3 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-200 w-full"
                        >
                          <User className="w-4 h-4" />
                          <span>Profile</span>
                        </button>

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

export default TeacherDashboardLayout;
