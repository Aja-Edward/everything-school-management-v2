import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit,  
  Eye, 
  CheckCircle, 
  Clock,
  Users,
  BookOpen,
  RefreshCw,
  FileText,
  Award,
  Grid3X3,
  List,
  User,
  MoreVertical,
  X,
  AlertCircle
} from 'lucide-react';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import StudentService, { Student } from '@/services/StudentService';
import ResultService from '@/services/ResultService';
import { StandardResult } from '@/types/types';
import EnhancedResultRecording from './EnhancedResultRecording';
import EditResultForm from './EditResultForm';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { EDUCATION_LEVEL_CHOICES, CLASS_CHOICES } from '@/utils/constants';

interface EnhancedResultRecordingProps {
  onResultAdded?: () => void;
}

const EnhancedResultManagement: React.FC<EnhancedResultRecordingProps> = ({ onResultAdded }) => {
  const { isDarkMode } = useGlobalTheme();
  const navigate = useNavigate();
  
  // Data State
  const [students, setStudents] = useState<Student[]>([]);
  const [results, setResults] = useState<StandardResult[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [educationLevelFilter, setEducationLevelFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingResult, setEditingResult] = useState<any>(null);

  const themeClasses = {
    bgPrimary: isDarkMode ? 'bg-gray-900' : 'bg-white',
    bgSecondary: isDarkMode ? 'bg-gray-800' : 'bg-gray-50',
    bgCard: isDarkMode ? 'bg-gray-800' : 'bg-white',
    textPrimary: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    textTertiary: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    borderHover: isDarkMode ? 'border-gray-600' : 'border-gray-300',
    iconPrimary: isDarkMode ? 'text-blue-400' : 'text-blue-600',
    iconSecondary: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    buttonPrimary: isDarkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonSecondary: isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700',
    buttonSuccess: isDarkMode ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white',
    buttonWarning: isDarkMode ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 'bg-yellow-600 hover:bg-yellow-700 text-white',
    buttonDanger: isDarkMode ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white',
  };

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // getStudents() returns Student[] directly (not paginated)
      const studentsData = await StudentService.getStudents();

      // Fetch subject results from all 4 education levels in parallel
      const levels = ['SENIOR_SECONDARY', 'JUNIOR_SECONDARY', 'PRIMARY', 'NURSERY'] as const;
      const settled = await Promise.allSettled(
        levels.map(level => ResultService.getSubjectResults(level, { page_size: 200 } as any))
      );
      const resultsData = settled.flatMap(r =>
        r.status === 'fulfilled' ? (r.value as unknown as StandardResult[]) : []
      );

      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setResults(resultsData);
      
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data. Please check your connection and try again.');
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Filter students based on search and filters
  const filteredStudents = useMemo(() => {
    if (!students || students.length === 0) return [];
    
    return students.filter(student => {
      // Ensure we have all required student properties
      if (!student.full_name || !student.id) return false;
      
      const matchesSearch = student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           student.id.toString().toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesEducationLevel = !educationLevelFilter || student.education_level === educationLevelFilter;
      const matchesClass = !classFilter || student.student_class === classFilter;
      const matchesGender = !genderFilter || student.gender === genderFilter;
      
      return matchesSearch && matchesEducationLevel && matchesClass && matchesGender;
    });
  }, [students, searchTerm, educationLevelFilter, classFilter, genderFilter]);

  // Get results for a specific student with improved error handling
  const getStudentResults = (studentId: number | string) => {
    if (!results || results.length === 0) return [];
    
    // Convert studentId to string for consistent comparison
    const searchId = studentId.toString();
    
    return results.filter(result => {
      if (!result || !result.student) return false;
      
      // Handle both cases: when student is an object with id, or when it's just the id
      let resultStudentId: string = '';

      try {
        if (typeof result.student === 'object' && result.student !== null) {
          // If student is an object, get its id
          const studentObj = result.student as { id?: string | number };
          resultStudentId = studentObj.id ? String(studentObj.id) : '';
        } else if (result.student !== null && result.student !== undefined) {
          // If student is just an id (number or string)
          resultStudentId = String(result.student);
        }
      } catch (error) {
        console.warn('Error processing student ID:', error);
        return false;
      }

      const matches = resultStudentId === searchId;

      if (matches) {
        console.log(`Found result for student ${searchId}:`, result);
      }
      
      return matches;
    });
  };

  // Handle form close
  const handleFormClose = () => {
    setShowAddForm(false);
  };

  // Handle result added
  const handleResultAdded = () => {
    loadData();
    if (onResultAdded) {
      onResultAdded();
    }
    toast.success('Result added successfully');
  };

  // Handle edit result
  const handleEditResult = (result: StandardResult, student: Student) => {
    // Derive educationLevel from the result object (set during load) or fall back
    const level = (result as any).education_level ?? 'SENIOR_SECONDARY';
    setEditingResult({ result, student, educationLevel: level });
  };

  // Handle view student results
  const handleViewStudent = (studentId: number | string) => {
    console.log('Viewing student results for ID:', studentId);
    navigate(`/admin/results/student/${studentId}`);
  };

  // Get status badge component with improved styling
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: { 
        bg: isDarkMode ? 'bg-gray-700' : 'bg-gray-100', 
        fg: isDarkMode ? 'text-gray-300' : 'text-gray-700', 
        icon: Clock, 
        label: 'Draft' 
      },
      SUBMITTED: { 
        bg: isDarkMode ? 'bg-blue-900' : 'bg-blue-100', 
        fg: isDarkMode ? 'text-blue-300' : 'text-blue-700', 
        icon: FileText, 
        label: 'Submitted' 
      },
      APPROVED: { 
        bg: isDarkMode ? 'bg-green-900' : 'bg-green-100', 
        fg: isDarkMode ? 'text-green-300' : 'text-green-700', 
        icon: CheckCircle, 
        label: 'Approved' 
      },
      PUBLISHED: { 
        bg: isDarkMode ? 'bg-purple-900' : 'bg-purple-100', 
        fg: isDarkMode ? 'text-purple-300' : 'text-purple-700', 
        icon: Award, 
        label: 'Published' 
      }
    } as const;

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT;
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${config.bg} ${config.fg}`}>
        <IconComponent className="w-3.5 h-3.5 mr-1" />
        {config.label}
      </span>
    );
  };

  // Loading component
  if (loading) {
    return (
      <div className={`min-h-screen ${themeClasses.bgPrimary} ${themeClasses.textPrimary}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-lg">Loading data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error component
  if (error) {
    return (
      <div className={`min-h-screen ${themeClasses.bgPrimary} ${themeClasses.textPrimary}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error Loading Data</h2>
            <p className="text-gray-500 mb-4">{error}</p>
            <button
              onClick={loadData}
              className={`px-4 py-2 rounded-lg ${themeClasses.buttonPrimary} flex items-center mx-auto`}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Result Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage and track student results across all education levels
            </p>
          </div>

          {/* Add Result Button */}
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Result
          </button>
        </div>

          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search students by name or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-lg flex items-center ${themeClasses.buttonSecondary} transition-all duration-200 active:scale-[.98] ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </button>
              
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className={`px-4 py-2 rounded-lg flex items-center ${themeClasses.buttonSecondary} transition-all duration-200 active:scale-[.98] ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}
              >
                {viewMode === 'grid' ? <List className="w-4 h-4 mr-2" /> : <Grid3X3 className="w-4 h-4 mr-2" />}
                {viewMode === 'grid' ? 'List' : 'Grid'}
              </button>
              
              <button
                onClick={loadData}
                className={`px-4 py-2 rounded-lg flex items-center ${themeClasses.buttonSecondary} transition-all duration-200 active:scale-[.98] ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className={`mt-4 p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                    Education Level
                  </label>
                  <select
                    value={educationLevelFilter}
                    onChange={(e) => setEducationLevelFilter(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  >
                    <option value="">All Levels</option>
                    {EDUCATION_LEVEL_CHOICES.map(level => (
                      <option key={level.value} value={level.value}>{level.label}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                    Class
                  </label>
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  >
                    <option value="">All Classes</option>
                    {CLASS_CHOICES
                      .filter(cls => !educationLevelFilter || cls.level === educationLevelFilter)
                      .map(cls => (
                        <option key={cls.value} value={cls.value}>{cls.label}</option>
                      ))}
                  </select>
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                    Gender
                  </label>
                  <select
                    value={genderFilter}
                    onChange={(e) => setGenderFilter(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  >
                    <option value="">All Genders</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

      {/* Content */}
      <div className="px-6 py-8 max-w-7xl mx-auto">
        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className={`p-6 rounded-2xl ${themeClasses.bgCard} border ${themeClasses.border} shadow-sm ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}>
            <div className="flex items-center">
              <Users className={`w-8 h-8 ${themeClasses.iconPrimary} mr-3`} />
              <div>
                <p className={`text-sm ${themeClasses.textSecondary}`}>Total Students</p>
                <p className="text-2xl font-bold">{filteredStudents.length}</p>
              </div>
            </div>
          </div>
          
          <div className={`p-6 rounded-2xl ${themeClasses.bgCard} border ${themeClasses.border} shadow-sm ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}>
            <div className="flex items-center">
              <BookOpen className={`w-8 h-8 ${themeClasses.iconPrimary} mr-3`} />
              <div>
                <p className={`text-sm ${themeClasses.textSecondary}`}>Total Results</p>
                <p className="text-2xl font-bold">{results.length}</p>
              </div>
            </div>
          </div>
          
          <div className={`p-6 rounded-2xl ${themeClasses.bgCard} border ${themeClasses.border} shadow-sm ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}>
            <div className="flex items-center">
              <CheckCircle className={`w-8 h-8 text-green-500 mr-3`} />
              <div>
                <p className={`text-sm ${themeClasses.textSecondary}`}>Published Results</p>
                <p className="text-2xl font-bold">{results.filter(r => r.status === 'PUBLISHED').length}</p>
              </div>
            </div>
          </div>
          
          <div className={`p-6 rounded-2xl ${themeClasses.bgCard} border ${themeClasses.border} shadow-sm ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}>
            <div className="flex items-center">
              <Clock className={`w-8 h-8 text-yellow-500 mr-3`} />
              <div>
                <p className={`text-sm ${themeClasses.textSecondary}`}>Draft Results</p>
                <p className="text-2xl font-bold">{results.filter(r => r.status === 'DRAFT').length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Students List/Grid */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
            {filteredStudents.map((student) => {
              const studentResults = getStudentResults(student.id);
              return (
                <div key={student.id} className={`p-5 rounded-2xl ${themeClasses.bgCard} border ${themeClasses.border} shadow-sm ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'} transition-transform duration-200 hover:shadow-md hover:-translate-y-[1px]`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className={`w-12 h-12 rounded-full ${themeClasses.bgSecondary} flex items-center justify-center mr-3 ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}>
                        <User className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold leading-tight">{student.full_name}</h3>
                        <p className={`text-xs ${themeClasses.textSecondary}`}>ID: {student.id}</p>
                      </div>
                    </div>
                    <MoreVertical className={`w-5 h-5 ${themeClasses.iconSecondary} cursor-pointer`} />
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between">
                      <span className={`text-sm ${themeClasses.textSecondary}`}>Class:</span>
                      <span className="text-sm font-medium">{student.student_class || 'Not assigned'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`text-sm ${themeClasses.textSecondary}`}>Level:</span>
                      <span className="text-sm font-medium">{student.education_level || 'Not assigned'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`text-sm ${themeClasses.textSecondary}`}>Results:</span>
                      <span className="text-sm font-medium">{studentResults.length}</span>
                    </div>
                  </div>
                  
                  {/* Result Status Summary */}
                  {studentResults.length > 0 && (
                    <div className="mb-4">
                      <h4 className={`text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>Recent Results</h4>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {studentResults.slice(0, 5).map((result) => (
                          <div key={result.id} className="flex items-center justify-between">
                            <span className="text-xs truncate max-w-[50%]" title={result.subject?.name || 'Unknown Subject'}>
                              {result.subject?.name || 'Unknown Subject'}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {getStatusBadge(result.status)}
                              <button
                                onClick={() => handleEditResult(result, student)}
                                className="p-1 text-blue-500 hover:text-blue-700 rounded"
                                title="Edit Result"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {studentResults.length > 5 && (
                          <p className={`text-xs ${themeClasses.textSecondary} text-center`}>
                            +{studentResults.length - 5} more results
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewStudent(student.id)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm flex items-center justify-center ${themeClasses.buttonSecondary} transition-all duration-200 active:scale-[.98] ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`rounded-lg ${themeClasses.bgCard} border ${themeClasses.border} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${themeClasses.bgSecondary} border-b ${themeClasses.border}`}>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Class</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Level</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Results</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${themeClasses.border}`}>
                  {filteredStudents.map((student) => {
                    const studentResults = getStudentResults(student.id);
                    const recentResults = studentResults.slice(0, 3);
                    
                    return (
                      <tr key={student.id} className={`hover:${themeClasses.bgSecondary}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`w-10 h-10 rounded-full ${themeClasses.bgSecondary} flex items-center justify-center mr-3`}>
                              <User className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-sm font-medium">{student.full_name}</div>
                              <div className={`text-sm ${themeClasses.textSecondary}`}>ID: {student.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{student.student_class || 'Not assigned'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{student.education_level || 'Not assigned'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{studentResults.length}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-1">
                            {recentResults.map((result) => (
                              <div key={result.id} className="flex items-center justify-between min-w-[200px]">
                                <span className="text-xs truncate max-w-[100px]" title={result.subject?.name || 'Unknown'}>
                                  {result.subject?.name || 'Unknown Subject'}
                                </span>
                                {getStatusBadge(result.status)}
                              </div>
                            ))}
                            {studentResults.length > 3 && (
                              <span className={`text-xs ${themeClasses.textSecondary}`}>
                                +{studentResults.length - 3} more
                              </span>
                            )}
                            {studentResults.length === 0 && (
                              <span className={`text-xs ${themeClasses.textSecondary}`}>No results</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleViewStudent(student.id)}
                            className={`px-3 py-1 rounded text-sm ${themeClasses.buttonSecondary} flex items-center`}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredStudents.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No students found</h3>
            <p className={`text-sm ${themeClasses.textSecondary}`}>
              {searchTerm || educationLevelFilter || classFilter || genderFilter 
                ? 'Try adjusting your search criteria or filters'
                : 'No students have been added to the system yet'
              }
            </p>
          </div>
        )}
      </div>

      {/* Add Result Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bgCard} rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden`}>
            <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border}`}>
              <h2 className={`text-2xl font-bold ${themeClasses.textPrimary}`}>
                Add New Result
              </h2>
              <button
                onClick={handleFormClose}
                className={`${themeClasses.textSecondary} hover:${themeClasses.textPrimary} transition-colors duration-200`}
              >
                <X size={24} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="p-6">
                <EnhancedResultRecording 
                  onResultAdded={handleResultAdded}
                  onClose={handleFormClose}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Result Form Modal */}
      {editingResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bgCard} rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden`}>
            <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border}`}>
              <h2 className={`text-2xl font-bold ${themeClasses.textPrimary}`}>
                Edit Result
              </h2>
              <button
                onClick={() => setEditingResult(null)}
                className={`${themeClasses.textSecondary} hover:${themeClasses.textPrimary} transition-colors duration-200`}
              >
                <X size={24} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="p-6">
                <EditResultForm
                  result={editingResult.result}
                  educationLevel={editingResult.educationLevel ?? 'SENIOR_SECONDARY'}
                  onClose={() => setEditingResult(null)}
                  onSuccess={() => {
                    setEditingResult(null);
                    loadData();
                    toast.success('Result updated successfully');
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedResultManagement;