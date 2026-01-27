import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
// import { TeacherUserData } from '@/types/types';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import { 
  BookOpen, 
  Users, 
  GraduationCap, 
  Clock, 
  Search,  
  Grid3X3, 
  List, 
  Eye,
  TrendingUp,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';

interface TeacherSubject {
  id: number;
  name: string;
  code: string;
  description?: string;
  category?: string;
  education_levels?: string[];
  is_compulsory?: boolean;
  periods_per_week?: number;
  assignments: Array<{
    id: number;
    classroom_name: string;
    classroom_id: number;
    grade_level: string;
    section: string;
    education_level: string;
    stream_type?: string;
    student_count: number;
    is_class_teacher: boolean;
  }>;
}

interface SubjectStats {
  totalSubjects: number;
  totalClasses: number;
  totalStudents: number;
  averageStudentsPerClass: number;
  totalPeriodsPerWeek: number;
}

const Subjects: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<TeacherSubject[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<TeacherSubject[]>([]);
  const [stats, setStats] = useState<SubjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterEducationLevel, setFilterEducationLevel] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Load teacher subjects on component mount
  useEffect(() => {
    if (user) {
      loadTeacherSubjects();
    }
  }, [user]);

  const loadTeacherSubjects = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get teacher ID from user data
      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      if (!teacherId) {
        throw new Error('Teacher ID not found. Please ensure your teacher profile is properly set up.');
      }

      // Get teacher subjects directly (already grouped by subject)
      const subjectsData = await TeacherDashboardService.getTeacherSubjects(teacherId);
      setSubjects(subjectsData);
      setFilteredSubjects(subjectsData);
      
      // Calculate statistics
      calculateStats(subjectsData);
      
    } catch (error) {
      console.error('Error loading teacher subjects:', error);
      setError(error instanceof Error ? error.message : 'Failed to load subjects');
      toast.error('Failed to load subjects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (subjectsData: TeacherSubject[]) => {
    const totalSubjects = subjectsData.length;
    const totalClasses = subjectsData.reduce((sum, subject) => sum + subject.assignments.length, 0);
    const totalStudents = subjectsData.reduce((sum, subject) => 
      sum + subject.assignments.reduce((classSum, assignment) => classSum + assignment.student_count, 0), 0
    );
    const averageStudentsPerClass = totalClasses > 0 ? Math.round(totalStudents / totalClasses) : 0;
    const totalPeriodsPerWeek = subjectsData.reduce((sum, subject) => 
      sum + (subject.periods_per_week || 0) * subject.assignments.length, 0
    );
    
    setStats({
      totalSubjects,
      totalClasses,
      totalStudents,
      averageStudentsPerClass,
      totalPeriodsPerWeek
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTeacherSubjects();
    setRefreshing(false);
    toast.success('Subjects refreshed successfully');
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    filterSubjects(term, filterCategory, filterEducationLevel);
  };

  const handleFilterChange = (category: string, educationLevel: string) => {
    setFilterCategory(category);
    setFilterEducationLevel(educationLevel);
    filterSubjects(searchTerm, category, educationLevel);
  };

  const filterSubjects = (search: string, category: string, educationLevel: string) => {
    let filtered = subjects;
    
    // Search filter
    if (search) {
      filtered = filtered.filter(subject =>
        subject.name.toLowerCase().includes(search.toLowerCase()) ||
        subject.code.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Category filter
    if (category !== 'all') {
      filtered = filtered.filter(subject => subject.category === category);
    }
    
    // Education level filter
    if (educationLevel !== 'all') {
      filtered = filtered.filter(subject =>
        subject.education_levels?.includes(educationLevel)
      );
    }
    
    setFilteredSubjects(filtered);
  };

  const getEducationLevelDisplay = (level: string) => {
    const levelMap: { [key: string]: string } = {
      'NURSERY': 'Nursery',
      'PRIMARY': 'Primary',
      'JUNIOR_SECONDARY': 'Junior Secondary',
      'SENIOR_SECONDARY': 'Senior Secondary'
    };
    return levelMap[level] || level;
  };

  const getCategoryDisplay = (category: string) => {
    const categoryMap: { [key: string]: string } = {
      'core': 'Core',
      'elective': 'Elective',
      'cross_cutting': 'Cross-Cutting',
      'practical': 'Practical'
    };
    return categoryMap[category] || category;
  };

  if (loading) {
    return (
      <TeacherDashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-slate-600">Loading your subjects...</p>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  if (error) {
    return (
      <TeacherDashboardLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              <div>
                <h3 className="text-lg font-medium text-red-800 dark:text-red-200">Error Loading Subjects</h3>
                <p className="text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
            <button
              onClick={loadTeacherSubjects}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  return (
    <TeacherDashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">My Subjects</h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1 sm:mt-2">
                Manage and view all subjects assigned to you
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm sm:text-base w-full sm:w-auto justify-center"
            >
              {refreshing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex-shrink-0">
                  <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 truncate">Total Subjects</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.totalSubjects}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg flex-shrink-0">
                  <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 truncate">Total Classes</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.totalClasses}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex-shrink-0">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 truncate">Total Students</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.totalStudents}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex-shrink-0">
                  <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 truncate">Avg. Students/Class</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.averageStudentsPerClass}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/20 rounded-lg flex-shrink-0">
                  <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 truncate">Total Periods/Week</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.totalPeriodsPerWeek}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters and Search */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between space-y-4 lg:space-y-0 lg:space-x-4">
            {/* Search */}
            <div className="flex-1 lg:max-w-md w-full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search subjects..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm sm:text-base border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
              <select
                value={filterCategory}
                onChange={(e) => handleFilterChange(e.target.value, filterEducationLevel)}
                className="px-3 py-2 text-sm sm:text-base border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
              >
                <option value="all">All Categories</option>
                <option value="core">Core</option>
                <option value="elective">Elective</option>
                <option value="cross_cutting">Cross-Cutting</option>
                <option value="practical">Practical</option>
              </select>

              <select
                value={filterEducationLevel}
                onChange={(e) => handleFilterChange(filterCategory, e.target.value)}
                className="px-3 py-2 text-sm sm:text-base border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
              >
                <option value="all">All Levels</option>
                <option value="NURSERY">Nursery</option>
                <option value="PRIMARY">Primary</option>
                <option value="JUNIOR_SECONDARY">Junior Secondary</option>
                <option value="SENIOR_SECONDARY">Senior Secondary</option>
              </select>

              {/* View Mode Toggle */}
              <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                  aria-label="Grid view"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                  aria-label="List view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Subjects Content */}
        {filteredSubjects.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-12 shadow-sm border border-slate-200 dark:border-slate-700 text-center">
            <BookOpen className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No subjects found</h3>
            <p className="text-slate-500 dark:text-slate-400">
              {searchTerm || filterCategory !== 'all' || filterEducationLevel !== 'all'
                ? 'Try adjusting your search or filters'
                : 'You haven\'t been assigned any subjects yet'}
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6' : 'space-y-4'}>
            {filteredSubjects.map((subject) => (
              <div
                key={subject.id}
                className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden ${
                  viewMode === 'list' ? 'p-4 sm:p-6' : 'p-4 sm:p-6'
                }`}
              >
                {/* Subject Header */}
                <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate">
                        {subject.name}
                      </h3>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-mono truncate">
                      {subject.code}
                    </p>
                  </div>
                  {subject.is_compulsory && (
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 rounded-full whitespace-nowrap flex-shrink-0">
                      Compulsory
                    </span>
                  )}
                </div>

                {/* Subject Details */}
                <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
                  {subject.description && (
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      {subject.description}
                    </p>
                  )}

                  <div className="flex items-center flex-wrap gap-2 text-xs sm:text-sm">
                    {subject.category && (
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full whitespace-nowrap">
                        {getCategoryDisplay(subject.category)}
                      </span>
                    )}
                    {subject.education_levels && subject.education_levels.length > 0 && (
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full whitespace-nowrap">
                        {getEducationLevelDisplay(subject.education_levels[0])}
                      </span>
                    )}
                  </div>
                </div>

                {/* Class Assignments */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-3 sm:pt-4">
                  <h4 className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white mb-2 sm:mb-3">
                    Class Assignments ({subject.assignments.length})
                  </h4>

                  <div className="space-y-2">
                    {subject.assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-2 mb-1">
                            <span className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white truncate">
                              {assignment.classroom_name}
                            </span>
                            {assignment.is_class_teacher && (
                              <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 rounded-full whitespace-nowrap">
                                Class Teacher
                              </span>
                            )}
                          </div>
                          <div className="flex items-center flex-wrap gap-2 sm:gap-4 text-xs text-slate-500 dark:text-slate-400">
                            <span className="whitespace-nowrap">{assignment.grade_level} {assignment.section}</span>
                            {assignment.stream_type && (
                              <span className="whitespace-nowrap">• {assignment.stream_type}</span>
                            )}
                            <span className="whitespace-nowrap">• {assignment.student_count} students</span>
                          </div>
                        </div>

                        <button
                          onClick={() => navigate(`/teacher/subjects/${subject.id}`)}
                          className="flex items-center justify-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto whitespace-nowrap"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View Subject</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeacherDashboardLayout>
  );
};

export default Subjects;

