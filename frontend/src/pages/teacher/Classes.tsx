import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import { toast } from 'react-toastify';
import { 
  GraduationCap, 
  Users, 
  BookOpen, 
  CheckSquare, 
  MessageSquare, 
  Search,
  Eye,
  MoreHorizontal,
  MapPin,
  BarChart3,
  RefreshCw,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface TeacherClassData {
  id: number;
  name: string;
  section_id: number;
  section_name: string;
  grade_level_name: string;
  education_level: string;
  student_count: number;
  max_capacity: number;
  subject_name: string;
  subject_id: number;
  subject_code: string;
  room_number: string;
  is_class_teacher: boolean;
  classroom_id?: number;
  all_subjects?: any[]; // Added for displaying individual subjects

}

const Classes: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedClass, setSelectedClass] = useState<TeacherClassData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSection, setFilterSection] = useState('all');
  const [classes, setClasses] = useState<TeacherClassData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load teacher classes on component mount and when user changes
  useEffect(() => {
    if (user) {
      loadTeacherClasses();
    }
  }, [user]);

  const loadTeacherClasses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get teacher ID from user data with retry mechanism
      let teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      
      if (!teacherId) {
        console.log('🔍 Teacher ID not found, trying to refresh user data...');
        // Try to refresh user data and get teacher ID again
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
        
        if (!teacherId) {
          throw new Error('Teacher ID not found. Please ensure your teacher profile is properly set up.');
        }
      }

      // Fetch teacher classes from the database
      const classesData = await TeacherDashboardService.getTeacherClasses(teacherId);
      // Ensure is_class_teacher exists on each class object
      const normalizedClasses = classesData.map((cls: any) => ({
        ...cls,
        is_class_teacher: cls.is_class_teacher ?? false,
      }));
      setClasses(normalizedClasses);
      
      console.log('🔍 Loaded teacher classes:', normalizedClasses);
    } catch (error) {
      console.error('Error loading teacher classes:', error);
      setError(error instanceof Error ? error.message : 'Failed to load classes');
      toast.error('Failed to load classes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTeacherClasses();
    setRefreshing(false);
    toast.success('Classes refreshed successfully!');
  };

  const filteredClasses = classes.filter(cls => {
    const matchesSearch = cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cls.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (cls.all_subjects && cls.all_subjects.some((subject: any) => 
                           subject.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           subject.code.toLowerCase().includes(searchTerm.toLowerCase())
                         ));
    const matchesFilter = filterSection === 'all' || 
                         (cls.education_level.toLowerCase() ?? '') === filterSection.toLowerCase();
    return matchesSearch && matchesFilter;
  });

  const handleClassSelect = (cls: TeacherClassData) => {
    setSelectedClass(cls);
  };

  const handleMarkAttendance = (classId: number) => {
    navigate(`/teacher/attendance/${classId}`);
  };

  const handleViewStudents = (classId: number) => {
    navigate(`/teacher/students/${classId}`);
  };

  const handleSendMessage = (classId: number) => {
    navigate(`/teacher/messages/class/${classId}`);
  };

  const getEducationLevelColor = (level: string) => {
    if (!level) return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    switch (level.toUpperCase()) {
      case 'SENIOR_SECONDARY':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'JUNIOR_SECONDARY':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'PRIMARY':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'NURSERY':
        return 'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const getEducationLevelDisplay = (level: string) => {
    return level.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <TeacherDashboardLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="text-slate-600 dark:text-slate-400">Loading your classes...</p>
            </div>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  return (
    <TeacherDashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">My Classes & Attendance</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Select a class to mark attendance, view students, or manage class information
            </p>
            {classes.length > 0 && (
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600 dark:text-slate-400">
                    {classes.length} class{classes.length !== 1 ? 'es' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <BookOpen className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600 dark:text-slate-400">
                    {classes.reduce((sum, cls) => sum + (cls.all_subjects?.length || 1), 0)} subject{classes.reduce((sum, cls) => sum + (cls.all_subjects?.length || 1), 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            )}
          </div>
          <button 
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-800 dark:text-red-200 text-sm font-medium mb-2">
                  {error}
                </p>
                {error.includes('Teacher ID not found') && (
                  <p className="text-red-700 dark:text-red-300 text-xs mb-3">
                    This usually happens when the page is refreshed. Try clicking "Retry" or navigate to another tab and back.
                  </p>
                )}
                <div className="flex space-x-2">
                  <button
                    onClick={loadTeacherClasses}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-sm font-medium bg-red-100 dark:bg-red-900/30 px-3 py-1 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-sm font-medium bg-red-100 dark:bg-red-900/30 px-3 py-1 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Refresh Page
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-blue-800 dark:text-blue-200 text-sm font-medium mb-1">
                How to Mark Attendance
              </h3>
              <p className="text-blue-700 dark:text-blue-300 text-xs">
                Click on any class card below, then click the "Mark Attendance" button to record student attendance for that class. 
                Each class card shows all subjects you teach in that classroom.
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search classes, subjects, or subject codes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Education Levels</option>
            <option value="nursery">Nursery</option>
            <option value="primary">Primary</option>
            <option value="junior_secondary">Junior Secondary</option>
            <option value="senior_secondary">Senior Secondary</option>
          </select>
        </div>

        {/* Classes Count */}
        <div className="flex items-center justify-between">
          <div className="text-slate-600 dark:text-slate-400">
            <p>Showing {filteredClasses.length} of {classes.length} classes</p>
            {classes.length > 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-500">
                Total subjects: {classes.reduce((sum, cls) => sum + (cls.all_subjects?.length || 1), 0)}
              </p>
            )}
          </div>
          {classes.length === 0 && (
            <p className="text-orange-600 dark:text-orange-400 text-sm">
              No classes assigned yet. Please contact the administrator.
            </p>
          )}
        </div>

        {/* Classes Grid */}
        {filteredClasses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClasses.map((cls) => (
              <div
                  key={cls.id}
                className={`bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all duration-200 cursor-pointer ${
                  selectedClass?.id === cls.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => handleClassSelect(cls)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{cls.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {cls.grade_level_name} • {cls.section_name}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {cls.is_class_teacher && (
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs rounded-full">
                        Class Teacher
                      </span>
                    )}
                    <button className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">
                      <MoreHorizontal className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4" />
                      <span>{cls.student_count} / {cls.max_capacity} students</span>
                    </div>
                    {cls.all_subjects && cls.all_subjects.length > 0 && (
                      <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-1 rounded-full">
                        {cls.all_subjects.length} subject{cls.all_subjects.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                    <MapPin className="w-4 h-4" />
                    <span>{cls.room_number || 'Room not assigned'}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                      <BookOpen className="w-4 h-4" />
                      <span className="font-medium">Subjects:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cls.all_subjects && cls.all_subjects.length > 0 ? (
                        cls.all_subjects.map((subject: any, index: number) => (
                          <span
                            key={subject.id || index}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                          >
                            {subject.name} ({subject.code})
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {cls.subject_name} ({cls.subject_code})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${getEducationLevelColor(cls.education_level)}`}>
                      {getEducationLevelDisplay(cls.education_level)}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkAttendance(cls.id);
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-1"
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span>Mark Attendance</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewStudents(cls.id);
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-1"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View Students</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No classes found</h3>
            <p className="text-slate-500 dark:text-slate-400">
              {searchTerm || filterSection !== 'all' 
                ? 'Try adjusting your search or filter criteria.'
                : 'You haven\'t been assigned to any classes yet.'
              }
            </p>
          </div>
        )}

        {/* Selected Class Details */}
        {selectedClass && (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {selectedClass.name} - Class Details
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleSendMessage(selectedClass.id)}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Send Message</span>
                </button>
                <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200">
                  <BarChart3 className="w-4 h-4" />
                  <span>View Reports</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Class Information */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Class Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Grade Level:</span>
                    <span className="font-medium text-slate-900 dark:text-white">{selectedClass.grade_level_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Section:</span>
                    <span className="font-medium text-slate-900 dark:text-white">{selectedClass.section_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Education Level:</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {getEducationLevelDisplay(selectedClass.education_level)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Room:</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {selectedClass.room_number || 'Not assigned'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Subjects:</span>
                    <div className="text-right">
                      {selectedClass.all_subjects && selectedClass.all_subjects.length > 0 ? (
                        <div className="space-y-1">
                          {selectedClass.all_subjects.map((subject: any, index: number) => (
                            <div key={subject.id || index} className="text-sm">
                              <span className="font-medium text-slate-900 dark:text-white">
                                {subject.name} ({subject.code})
                              </span>
                              {subject.is_primary_teacher && (
                                <span className="ml-2 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-1 rounded-full">
                                  Primary
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="font-medium text-slate-900 dark:text-white">
                          {selectedClass.subject_name} ({selectedClass.subject_code})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Enrollment:</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {selectedClass.student_count} / {selectedClass.max_capacity} students
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Role:</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {selectedClass.is_class_teacher ? 'Class Teacher' : 'Subject Teacher'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => handleMarkAttendance(selectedClass.id)}
                    className="w-full flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors duration-200"
                  >
                    <div className="flex items-center space-x-3">
                      <CheckSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <div className="text-left">
                        <p className="font-medium text-green-900 dark:text-green-100">Mark Attendance</p>
                        <p className="text-sm text-green-600 dark:text-green-400">Record today's attendance</p>
                      </div>
                    </div>
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </button>

                  <button
                    onClick={() => handleViewStudents(selectedClass.id)}
                    className="w-full flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors duration-200"
                  >
                    <div className="flex items-center space-x-3">
                      <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <div className="text-left">
                        <p className="font-medium text-blue-900 dark:text-blue-100">View Students</p>
                        <p className="text-sm text-blue-600 dark:text-blue-400">See class roster and details</p>
                      </div>
                    </div>
                    <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </button>

                  <button
                    onClick={() => handleSendMessage(selectedClass.id)}
                    className="w-full flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors duration-200"
                  >
                    <div className="flex items-center space-x-3">
                      <MessageSquare className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      <div className="text-left">
                        <p className="font-medium text-orange-900 dark:text-orange-100">Send Message</p>
                        <p className="text-sm text-orange-600 dark:text-orange-400">Communicate with students/parents</p>
                      </div>
                    </div>
                    <CheckCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TeacherDashboardLayout>
  );
};

export default Classes;
