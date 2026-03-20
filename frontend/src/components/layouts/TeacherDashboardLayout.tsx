import React, { useState, useEffect } from 'react';
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
  Bell,
  User,
  ChevronDown,
  Home,
  CheckSquare,
  Award,
  BarChart3,
  Search,
  Info,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { getAbsoluteUrl } from '@/utils/urlUtils';
import TeacherNotificationService, { 
  TeacherNotification, 
  TeacherAnnouncement, 
  TeacherEvent, 
  NotificationCounts 
} from '@/services/TeacherNotificationService';

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Notification states
  const [notifications, setNotifications] = useState<TeacherNotification[]>([]);
  const [announcements, setAnnouncements] = useState<TeacherAnnouncement[]>([]);
  const [events, setEvents] = useState<TeacherEvent[]>([]);
  const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({
    total: 0,
    unread: 0,
    announcements: 0,
    events: 0,
    academic: 0,
    urgent: 0
  });
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationTab, setNotificationTab] = useState<'all' | 'announcements' | 'events'>('all');

  const handleLogout = async () => {
    await logout();
    navigate('/teacher-login');
  };

  // Load notifications
  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const data = await TeacherNotificationService.getCombinedNotifications();
      setNotifications(data.notifications);
      setAnnouncements(data.announcements);
      setEvents(data.events);
      setNotificationCounts(data.counts);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await TeacherNotificationService.markAsRead(notificationId);
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId ? { ...notif, is_read: true } : notif
        )
      );
      // Update counts
      setNotificationCounts(prev => ({
        ...prev,
        unread: Math.max(0, prev.unread - 1)
      }));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await TeacherNotificationService.markAllAsRead();
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, is_read: true }))
      );
      setNotificationCounts(prev => ({
        ...prev,
        unread: 0
      }));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleDeleteNotification = async (notificationId: number) => {
    try {
      await TeacherNotificationService.deleteNotification(notificationId);
      setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
      // Update counts
      setNotificationCounts(prev => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        unread: Math.max(0, prev.unread - 1)
      }));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'academic':
        return <BookOpen className="w-4 h-4 text-blue-600" />;
      case 'attendance':
        return <CheckSquare className="w-4 h-4 text-green-600" />;
      case 'exam':
        return <FileText className="w-4 h-4 text-purple-600" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-orange-600" />;
      case 'event':
        return <Calendar className="w-4 h-4 text-red-600" />;
      default:
        return <Bell className="w-4 h-4 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      case 'high':
        return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  const navigationItems = [
    { id: 'dashboard', name: 'Dashboard', icon: Home, path: '/teacher/dashboard' },
    { id: 'profile', name: 'Profile', icon: User, path: '/teacher/profile' },
    { id: 'classes', name: 'My Classes', icon: GraduationCap, path: '/teacher/classes' },
    { id: 'subjects', name: 'My Subjects', icon: BookOpen, path: '/teacher/subjects' },
    { id: 'students', name: 'Students', icon: Users, path: '/teacher/students' },
    { id: 'attendance', name: 'Attendance', icon: CheckSquare, path: '/teacher/classes' },
    { id: 'exams', name: 'Exams & Tests', icon: FileText, path: '/teacher/exams' },
    { id: 'results', name: 'Results', icon: Award, path: '/teacher/results' },
    { id: 'schedule', name: 'Schedule', icon: Calendar, path: '/teacher/schedule' },
    { id: 'messages', name: 'Messages', icon: MessageSquare, path: '/teacher/messages' },
    { id: 'reports', name: 'Reports', icon: BarChart3, path: '/teacher/reports' },
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
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
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
                <div className="relative">
                  <button
                    onClick={() => setNotificationsOpen(!notificationsOpen)}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors duration-200 relative"
                  >
                    <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    {notificationCounts.unread > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                        {notificationCounts.unread > 9 ? '9+' : notificationCounts.unread}
                      </span>
                    )}
                  </button>
                  
                  {notificationsOpen && (
                    <div className="fixed sm:absolute right-0 sm:right-0 mt-2 w-full sm:w-96 max-w-md bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 mx-2 sm:mx-0">
                      {/* Header */}
                      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Notifications</h3>
                          <div className="flex items-center space-x-2">
                            {notificationCounts.unread > 0 && (
                              <button
                                onClick={handleMarkAllAsRead}
                                className="text-xs text-blue-600 hover:text-blue-500 font-medium"
                              >
                                Mark all read
                              </button>
                            )}
                            <button
                              onClick={() => setNotificationsOpen(false)}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Tabs */}
                        <div className="flex space-x-1 mt-3">
                          <button
                            onClick={() => setNotificationTab('all')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              notificationTab === 'all'
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            All ({notificationCounts.total})
                          </button>
                          <button
                            onClick={() => setNotificationTab('announcements')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              notificationTab === 'announcements'
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            Announcements ({notificationCounts.announcements})
                          </button>
                          <button
                            onClick={() => setNotificationTab('events')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              notificationTab === 'events'
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            Events ({notificationCounts.events})
                          </button>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="max-h-96 overflow-y-auto">
                        {loadingNotifications ? (
                          <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2">Loading notifications...</p>
                          </div>
                        ) : (
                          <>
                            {/* All Notifications Tab */}
                            {notificationTab === 'all' && (
                              <div className="space-y-1">
                                {notifications.length === 0 && announcements.length === 0 && events.length === 0 ? (
                                  <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No notifications</p>
                                  </div>
                                ) : (
                                  <>
                                    {/* Notifications */}
                                    {notifications.map((notification) => (
                                      <div
                                        key={`notif-${notification.id}`}
                                        className={`p-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                                          !notification.is_read ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                                        }`}
                                      >
                                        <div className="flex items-start space-x-3">
                                          <div className="flex-shrink-0 mt-1">
                                            {getNotificationIcon(notification.type)}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                              <p className={`text-sm font-medium ${
                                                !notification.is_read ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'
                                              }`}>
                                                {notification.title}
                                              </p>
                                              <div className="flex items-center space-x-1">
                                                <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(notification.priority)}`}>
                                                  {notification.priority}
                                                </span>
                                                <button
                                                  onClick={() => handleMarkAsRead(notification.id)}
                                                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                                >
                                                  {notification.is_read ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                </button>
                                                <button
                                                  onClick={() => handleDeleteNotification(notification.id)}
                                                  className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                </button>
                                              </div>
                                            </div>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                              {notification.content}
                                            </p>
                                            <div className="flex items-center justify-between mt-2">
                                              <span className="text-xs text-slate-500 dark:text-slate-500">
                                                {formatTimeAgo(notification.created_at)}
                                              </span>
                                              {notification.sender && (
                                                <span className="text-xs text-slate-500 dark:text-slate-500">
                                                  from {notification.sender.name}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}

                                    {/* Announcements */}
                                    {announcements.map((announcement) => (
                                      <div
                                        key={`announcement-${announcement.id}`}
                                        className="p-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                      >
                                        <div className="flex items-start space-x-3">
                                          <div className="flex-shrink-0 mt-1">
                                            <Info className="w-4 h-4 text-blue-600" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                              <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                {announcement.title}
                                                {announcement.is_pinned && (
                                                  <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 px-2 py-1 rounded">
                                                    Pinned
                                                  </span>
                                                )}
                                              </p>
                                            </div>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                              {announcement.content}
                                            </p>
                                            <div className="flex items-center justify-between mt-2">
                                              <span className="text-xs text-slate-500 dark:text-slate-500">
                                                {formatTimeAgo(announcement.created_at)}
                                              </span>
                                              <span className="text-xs text-slate-500 dark:text-slate-500">
                                                by {announcement.created_by_name}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}

                                    {/* Events */}
                                    {events.map((event) => (
                                      <div
                                        key={`event-${event.id}`}
                                        className="p-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                      >
                                        <div className="flex items-start space-x-3">
                                          <div className="flex-shrink-0 mt-1">
                                            <Calendar className="w-4 h-4 text-red-600" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                              <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                {event.title}
                                              </p>
                                              {event.days_until !== undefined && (
                                                <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 px-2 py-1 rounded">
                                                  {event.days_until === 0 ? 'Today' : `${event.days_until}d`}
                                                </span>
                                              )}
                                            </div>
                                            {event.subtitle && (
                                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                                {event.subtitle}
                                              </p>
                                            )}
                                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                              {event.description}
                                            </p>
                                            <div className="flex items-center justify-between mt-2">
                                              <span className="text-xs text-slate-500 dark:text-slate-500">
                                                {new Date(event.start_date).toLocaleDateString()}
                                              </span>
                                              <span className="text-xs text-slate-500 dark:text-slate-500">
                                                {event.event_type}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </div>
                            )}

                            {/* Announcements Tab */}
                            {notificationTab === 'announcements' && (
                              <div className="space-y-1">
                                {announcements.length === 0 ? (
                                  <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                                    <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No announcements</p>
                                  </div>
                                ) : (
                                  announcements.map((announcement) => (
                                    <div
                                      key={`announcement-${announcement.id}`}
                                      className="p-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                    >
                                      <div className="flex items-start space-x-3">
                                        <div className="flex-shrink-0 mt-1">
                                          <Info className="w-4 h-4 text-blue-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                                              {announcement.title}
                                              {announcement.is_pinned && (
                                                <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 px-2 py-1 rounded">
                                                  Pinned
                                                </span>
                                              )}
                                            </p>
                                          </div>
                                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                            {announcement.content}
                                          </p>
                                          <div className="flex items-center justify-between mt-2">
                                            <span className="text-xs text-slate-500 dark:text-slate-500">
                                              {formatTimeAgo(announcement.created_at)}
                                            </span>
                                            <span className="text-xs text-slate-500 dark:text-slate-500">
                                              by {announcement.created_by_name}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}

                            {/* Events Tab */}
                            {notificationTab === 'events' && (
                              <div className="space-y-1">
                                {events.length === 0 ? (
                                  <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No upcoming events</p>
                                  </div>
                                ) : (
                                  events.map((event) => (
                                    <div
                                      key={`event-${event.id}`}
                                      className="p-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                    >
                                      <div className="flex items-start space-x-3">
                                        <div className="flex-shrink-0 mt-1">
                                          <Calendar className="w-4 h-4 text-red-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                                              {event.title}
                                            </p>
                                            {event.days_until !== undefined && (
                                              <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 px-2 py-1 rounded">
                                                {event.days_until === 0 ? 'Today' : `${event.days_until}d`}
                                              </span>
                                            )}
                                          </div>
                                          {event.subtitle && (
                                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                              {event.subtitle}
                                            </p>
                                          )}
                                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                            {event.description}
                                          </p>
                                          <div className="flex items-center justify-between mt-2">
                                            <span className="text-xs text-slate-500 dark:text-slate-500">
                                              {new Date(event.start_date).toLocaleDateString()}
                                            </span>
                                            <span className="text-xs text-slate-500 dark:text-slate-500">
                                              {event.event_type}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

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
