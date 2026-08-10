import { useState, useRef } from 'react';
import { 
  User, 
  Bell, 
  Settings, 
  LogOut, 
  Home, 
  BookOpen, 
  Calendar, 
  FileText, 
  BarChart3, 
  Users, 
  Award, 
  HelpCircle, 
  Info,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
 
} from 'lucide-react';

const StudentProfile = () => {
  const [selectedGrade] = useState('Secondary');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Mock data for demonstration
  const studentData = {
    name: 'John Doe',
    grade: 'Grade 10',
    studentId: 'STU2024001',
    email: 'john.doe@school.com',
    phone: '+1 (555) 123-4567',
    address: '123 Student Street, Learning City, LC 12345',
    parentName: 'Jane Doe',
    parentPhone: '+1 (555) 987-6543',
    parentEmail: 'jane.doe@email.com',
    emergencyContact: 'Emergency Contact: +1 (555) 111-2222',
    medicalInfo: 'No known allergies',
    transportation: 'School Bus Route 5',
    attendance: 95,
    gpa: 3.8,
    rank: 15,
    totalStudents: 120
  };

  const recentActivities = [
    { id: 1, type: 'assignment', title: 'Math Assignment #5', date: '2024-01-15', status: 'completed' },
    { id: 2, type: 'exam', title: 'Science Midterm', date: '2024-01-12', status: 'completed' },
    { id: 3, type: 'attendance', title: 'Present', date: '2024-01-15', status: 'present' },
    { id: 4, type: 'grade', title: 'English Essay', date: '2024-01-10', status: 'graded' }
  ];

  const upcomingEvents = [
    { id: 1, title: 'Parent-Teacher Conference', date: '2024-01-20', time: '3:00 PM' },
    { id: 2, title: 'Science Fair', date: '2024-01-25', time: '2:00 PM' },
    { id: 3, title: 'Basketball Game', date: '2024-01-22', time: '4:00 PM' }
  ];

  const academicStats = [
    { subject: 'Mathematics', grade: 'A', score: 92, trend: 'up' },
    { subject: 'Science', grade: 'A-', score: 88, trend: 'up' },
    { subject: 'English', grade: 'B+', score: 85, trend: 'down' },
    { subject: 'History', grade: 'A', score: 90, trend: 'up' },
    { subject: 'Physical Education', grade: 'A', score: 95, trend: 'up' }
  ];

  const notifications = [
    { id: 1, type: 'info', message: 'New assignment posted in Math class', time: '2 hours ago' },
    { id: 2, type: 'warning', message: 'Missing assignment in Science class', time: '1 day ago' },
    { id: 3, type: 'success', message: 'Grade updated for English Essay', time: '2 days ago' }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'present':
      case 'graded':
        return 'text-green-600 bg-green-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'absent':
      case 'missing':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'present':
      case 'graded':
        return <CheckCircle className="w-4 h-4" />;
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'absent':
      case 'missing':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    return trend === 'up' ? 
      <TrendingUp className="w-4 h-4 text-green-600" /> : 
      <TrendingDown className="w-4 h-4 text-red-600" />;
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'info':
        return <Info className="w-4 h-4 text-blue-600" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      default:
        return <Bell className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Student Portal</h1>
                <p className="text-sm text-slate-600">Welcome back, {studentData.name}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button className="relative p-2 text-slate-600 hover:text-slate-900 transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <button className="p-2 text-slate-600 hover:text-slate-900 transition-colors">
                <Settings className="w-5 h-5" />
              </button>
              <button className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors">
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              {/* Student Profile Card */}
              <div className="text-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <User className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{studentData.name}</h3>
                <p className="text-sm text-slate-600">{studentData.grade}</p>
                <p className="text-xs text-slate-500 mt-1">ID: {studentData.studentId}</p>
              </div>

              {/* Quick Stats */}
              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <span className="text-sm font-medium text-blue-900">Attendance</span>
                  <span className="text-lg font-bold text-blue-600">{studentData.attendance}%</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span className="text-sm font-medium text-green-900">GPA</span>
                  <span className="text-lg font-bold text-green-600">{studentData.gpa}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                  <span className="text-sm font-medium text-purple-900">Rank</span>
                  <span className="text-lg font-bold text-purple-600">{studentData.rank}/{studentData.totalStudents}</span>
                </div>
              </div>

              {/* Navigation */}
              <nav className="space-y-2">
                {[
                  { icon: Home, label: 'Dashboard', active: true },
                  { icon: BookOpen, label: 'Courses', active: false },
                  { icon: Calendar, label: 'Schedule', active: false },
                  { icon: FileText, label: 'Assignments', active: false },
                  { icon: BarChart3, label: 'Grades', active: false },
                  { icon: Users, label: 'Classmates', active: false },
                  { icon: Award, label: 'Achievements', active: false },
                  { icon: HelpCircle, label: 'Support', active: false }
                ].map((item, index) => (
                  <button
                    key={index}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      item.active 
                        ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-8">
            {/* Recent Activities */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-slate-900">Recent Activities</h2>
                <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  View All
                </button>
              </div>
              
              <div className="space-y-4">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(activity.status)}
                      <div>
                        <h4 className="font-medium text-slate-900">{activity.title}</h4>
                        <p className="text-sm text-slate-600">{activity.date}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(activity.status)}`}>
                      {activity.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Academic Performance */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Academic Performance</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {academicStats.map((subject, index) => (
                  <div key={index} className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium text-slate-900">{subject.subject}</h4>
                        <p className="text-sm text-slate-600">Grade: {subject.grade}</p>
                      </div>
                      {getTrendIcon(subject.trend)}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-2xl font-bold text-slate-900">{subject.score}%</span>
                      <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"
                          style={{ width: `${subject.score}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Events */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Upcoming Events</h2>
              
              <div className="space-y-4">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-medium text-slate-900">{event.title}</h4>
                        <p className="text-sm text-slate-600">{event.date} at {event.time}</p>
                      </div>
                    </div>
                    <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                      Details
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Notifications</h2>
              
              <div className="space-y-4">
                {notifications.map((notification) => (
                  <div key={notification.id} className="flex items-start space-x-4 p-4 bg-slate-50 rounded-lg">
                    {getNotificationIcon(notification.type)}
                    <div className="flex-1">
                      <p className="text-sm text-slate-900">{notification.message}</p>
                      <p className="text-xs text-slate-500 mt-1">{notification.time}</p>
                    </div>
                    <button className="text-slate-400 hover:text-slate-600">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentProfile;