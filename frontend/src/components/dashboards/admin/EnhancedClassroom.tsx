import { useState, useEffect } from 'react';
import { 
  School,
  Plus,
  Search,
  Filter,
  Edit3,
  Trash2,
  Eye,
  Users,
  BookOpen,
  Calendar,
  MapPin,
  X,
  Check,
  Baby,
  GraduationCap,
  Save,
  UserCheck,
  Grid3X3,
  List,
} from 'lucide-react';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import { classroomService, Classroom, ClassroomStats, CreateClassroomData } from '@/services/ClassroomService';
import { toast } from 'react-toastify';


interface DropdownData {
  sections: any[];
  academicYears: any[];
  terms: any[];
  teachers: any[];
}

const EnhancedClassroom = () => {
  const { isDarkMode } = useGlobalTheme();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [filteredClassrooms, setFilteredClassrooms] = useState<Classroom[]>([]);
  const [stats, setStats] = useState<ClassroomStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [classroomToDelete, setClassroomToDelete] = useState<Classroom | null>(null);

  // Form state and validation
  const [formData, setFormData] = useState<CreateClassroomData>({
    name: '',
    section: 0,
    academic_session: 0,
    term: 0,
    class_teacher: undefined,
    room_number: '',
    max_capacity: 30
  });

  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [dropdownData, setDropdownData] = useState<DropdownData>({
    sections: [],
    academicYears: [],
    terms: [],
    teachers: []
  });

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log('🔄 Loading classroom data...');
        
        const token = localStorage.getItem('authToken');
        console.log('🔑 Auth token exists:', !!token);
        
        const [classroomsData, statsData] = await Promise.all([
          classroomService.getClassrooms(),
          classroomService.getClassroomStats(),
        ]);

        console.log('📊 Data loaded successfully:');
        console.log('  - Classrooms:', classroomsData);

        setClassrooms(classroomsData.results || classroomsData);
        setStats(statsData);
        
        // Load dropdown data
        await loadDropdownData();
        
      } catch (error: any) {
        console.error('❌ Error loading classroom data:', error);
        console.error('Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        });
        toast.error('Failed to load classroom data');
        
        setDropdownData({
          sections: [],
          academicYears: [],
          terms: [],
          teachers: []
        });
        setClassrooms([]);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Load dropdown data separately
  const loadDropdownData = async () => {
    try {
      console.log('🔄 Loading dropdown data...');

      // Load academic years
      const academicYearsData = await classroomService.getAcademicYears().catch(() => ({ results: [] }));
      const safeAcademicYears = Array.isArray(academicYearsData.results) ? academicYearsData.results :
                              Array.isArray(academicYearsData) ? academicYearsData : [];

      // Load teachers
      const teachersData = await classroomService.getAllTeachers().catch(() => ({ results: [] }));
      const safeTeachers = Array.isArray(teachersData.results) ? teachersData.results :
                         Array.isArray(teachersData) ? teachersData : [];

      // ✅ FIX: Load ALL terms (not just for one academic year)
      console.log('📚 Loading all terms...');
      const termsData = await classroomService.getTerms().catch((error) => {
        console.error('❌ Error loading terms:', error);
        return { results: [] };
      });
      console.log('📚 Raw terms data:', termsData);
      const safeTerms = Array.isArray(termsData.results) ? termsData.results :
                       Array.isArray(termsData) ? termsData : [];
      console.log('✅ Terms loaded:', safeTerms.length);
      if (safeTerms.length > 0) {
        console.log('📚 Sample term:', safeTerms[0]);
      }

      // ✅ FIX: Load ALL sections from ALL grade levels
      console.log('🏫 Loading all sections...');
      let safeSections = [];
      try {
        // Get all grade levels
        const gradeLevelsData = await classroomService.getGradeLevels().catch(() => ({ results: [] }));
        const gradeLevels = Array.isArray(gradeLevelsData.results) ? gradeLevelsData.results :
                           Array.isArray(gradeLevelsData) ? gradeLevelsData : [];
        console.log('📊 Grade levels found:', gradeLevels.length);

        // Load sections for EACH grade level and combine them
        const sectionPromises = gradeLevels.map((gradeLevel: any) =>
          classroomService.getSections(gradeLevel.id)
            .then((sectionsData: any) => {
              const sections = Array.isArray(sectionsData.results) ? sectionsData.results :
                             Array.isArray(sectionsData) ? sectionsData : [];
              console.log(`  ✓ Grade ${gradeLevel.name}: ${sections.length} sections`);
              return sections;
            })
            .catch(() => [])
        );

        const allSectionsArrays = await Promise.all(sectionPromises);
        safeSections = allSectionsArrays.flat(); // Flatten all sections into one array
        console.log('✅ Total sections loaded:', safeSections.length);
      } catch (sectionError) {
        console.error('❌ Error loading sections:', sectionError);
      }

      setDropdownData({
        sections: safeSections,
        academicYears: safeAcademicYears,
        terms: safeTerms,
        teachers: safeTeachers
      });

      console.log('✅ Dropdown data set:', {
        sectionsCount: safeSections.length,
        academicYearsCount: safeAcademicYears.length,
        termsCount: safeTerms.length,
        teachersCount: safeTeachers.length
      });
    } catch (error: any) {
      console.error('❌ Error loading dropdown data:', error);
    }
  };

  // Filter classrooms
  useEffect(() => {
    let filtered = classrooms;

    if (searchTerm) {
      filtered = filtered.filter(classroom =>
        classroom.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classroom.section_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classroom.class_teacher_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classroom.room_number.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (levelFilter !== 'all') {
      filtered = filtered.filter(classroom => classroom.education_level === levelFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(classroom => classroom.is_active === (statusFilter === 'active'));
    }

    setFilteredClassrooms(filtered);
  }, [classrooms, searchTerm, levelFilter, statusFilter]);

  const getLevelIcon = (level: string) => {
    switch(level) {
      case 'nursery': return <Baby size={20} />;
      case 'primary': return <BookOpen size={20} />;
      case 'secondary': return <School size={20} />;
      default: return <GraduationCap size={20} />;
    }
  };

  const getLevelColor = (level: string) => {
    if (isDarkMode) {
      switch(level) {
        case 'nursery': return 'bg-pink-900/20 text-pink-300 border-pink-700/50';
        case 'primary': return 'bg-blue-900/20 text-blue-300 border-blue-700/50';
        case 'secondary': return 'bg-purple-900/20 text-purple-300 border-purple-700/50';
        default: return 'bg-gray-900/20 text-gray-300 border-gray-700/50';
      }
    } else {
      switch(level) {
        case 'nursery': return 'bg-pink-100 text-pink-800 border-pink-200';
        case 'primary': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'secondary': return 'bg-purple-100 text-purple-800 border-purple-200';
        default: return 'bg-gray-100 text-gray-800 border-gray-200';
      }
    }
  };

  const getStats = () => {
    if (!stats) return { total: 0, active: 0, nursery: 0, primary: 0, secondary: 0, totalEnrollment: 0 };
    
    return {
      total: stats.total_classrooms,
      active: stats.active_classrooms,
      nursery: stats.by_education_level.nursery,
      primary: stats.by_education_level.primary,
      secondary: stats.by_education_level.secondary,
      totalEnrollment: stats.total_enrollment
    };
  };

  const currentStats = getStats();

  // Form handling functions
  const resetForm = () => {
    setFormData({
      name: '',
      section: 0,
      academic_session: 0,
      term: 0,
      class_teacher: undefined,
      room_number: '',
      max_capacity: 30
    });
    setErrors({});
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.name.trim()) newErrors.name = 'Classroom name is required';
    if (!formData.section) newErrors.section = 'Section is required';
    if (!formData.academic_session) newErrors.academic_session = 'Academic session is required';
    if (!formData.term) newErrors.term = 'Term is required';
    if (!formData.max_capacity || formData.max_capacity <= 0) newErrors.max_capacity = 'Valid capacity is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddClassroom = async () => {
    if (!validateForm()) return;

    try {
      console.log('Creating classroom with data:', formData);
      await classroomService.createClassroom(formData);
      toast.success('Classroom created successfully');
      setShowAddModal(false);
      resetForm();
      
      // Reload data
      const [classroomsData, statsData] = await Promise.all([
        classroomService.getClassrooms(),
        classroomService.getClassroomStats()
      ]);
      setClassrooms(classroomsData.results || classroomsData);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error creating classroom:', error);
      if (error.response?.data) {
        const backendErrors = error.response.data;
        const errorMessages = Object.entries(backendErrors)
          .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
          .join('\n');
        toast.error(`Failed to create classroom:\n${errorMessages}`);
      } else {
        toast.error('Failed to create classroom');
      }
    }
  };

  const handleEditClassroom = async () => {
    if (!validateForm() || !selectedClassroom) return;

    try {
      console.log('Updating classroom with data:', formData);
      // Use PATCH to only send the changed fields
      await classroomService.updateClassroom(selectedClassroom.id, formData);
      toast.success('Classroom updated successfully');
      setShowEditModal(false);
      setSelectedClassroom(null);
      resetForm();
      
      // Reload data
      const [classroomsData, statsData] = await Promise.all([
        classroomService.getClassrooms(),
        classroomService.getClassroomStats()
      ]);
      setClassrooms(classroomsData.results || classroomsData);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error updating classroom:', error);
      if (error.response?.data) {
        const backendErrors = error.response.data;
        const errorMessages = Object.entries(backendErrors)
          .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
          .join('\n');
        toast.error(`Failed to update classroom:\n${errorMessages}`);
      } else {
        toast.error('Failed to update classroom');
      }
    }
  };

  const handleDeleteClassroom = async () => {
    if (!classroomToDelete) return;

    try {
      const response = await classroomService.deleteClassroom(classroomToDelete.id);
      const successMessage = response?.message || 'Classroom deleted successfully';
      toast.success(successMessage);
      setShowDeleteModal(false);
      setClassroomToDelete(null);
      
      // Reload data
      const [classroomsData, statsData] = await Promise.all([
        classroomService.getClassrooms(),
        classroomService.getClassroomStats()
      ]);
      setClassrooms(classroomsData.results || classroomsData);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error deleting classroom:', error);
      toast.error('Failed to delete classroom');
    }
  };

  const openEditModal = (classroom: Classroom) => {
    setSelectedClassroom(classroom);
    // Pre-populate form with existing data to avoid validation errors
    setFormData({
      name: classroom.name,
      section: classroom.section,
      academic_session: classroom.academic_session,
      term: classroom.term,
      class_teacher: classroom.class_teacher || undefined,
      room_number: classroom.room_number || '',
      max_capacity: classroom.max_capacity
    });
    setShowEditModal(true);
  };

  const openViewModal = (classroom: Classroom) => {
    setSelectedClassroom(classroom);
    setShowViewModal(true);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl p-8 flex flex-col items-center`}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className={isDarkMode ? 'text-slate-300' : 'text-gray-600'}>Loading classrooms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Classroom Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage classrooms across all educational levels</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus size={16} />
            Add Classroom
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-8">
          {[
            { label: 'Total Classes', value: currentStats.total, icon: School, color: 'blue' },
            { label: 'Active', value: currentStats.active, icon: Check, color: 'green' },
            { label: 'Nursery', value: currentStats.nursery, icon: Baby, color: 'pink' },
            { label: 'Primary', value: currentStats.primary, icon: BookOpen, color: 'blue' },
            { label: 'Secondary', value: currentStats.secondary, icon: School, color: 'purple' },
            { label: 'Total Students', value: currentStats.totalEnrollment, icon: Users, color: 'orange' }
          ].map((stat, index) => (
            <div key={index} className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} rounded-xl p-6 shadow-lg border hover:shadow-xl transition-all duration-300`}>
              <div className="flex flex-col justify-center items-center text-center">
                <div className={`p-3 rounded-full mb-3 ${isDarkMode ? `bg-${stat.color}-900/20 text-${stat.color}-300` : `bg-${stat.color}-100 text-${stat.color}-600`}`}>
                  <stat.icon size={24} />
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'} mb-1`}>{stat.label}</p>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{stat.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Search, Filter, and View Toggle */}
        <div className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} rounded-xl p-6 shadow-lg border mb-8`}>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className={`absolute left-3 top-3 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`} size={20} />
              <input
                type="text"
                placeholder="Search classrooms by name, grade, teacher, or room..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                  isDarkMode 
                    ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' 
                    : 'border-gray-200 text-gray-900 placeholder-gray-400'
                }`}
              />
            </div>
            <div className="flex gap-4">
              <div className="relative">
                <Filter className={`absolute left-3 top-3 ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`} size={20} />
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className={`pl-10 pr-8 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-slate-100' 
                      : 'bg-white border-gray-200 text-gray-900'
                  }`}
                >
                  <option value="all">All Levels</option>
                  <option value="nursery">Nursery</option>
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                </select>
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={`px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-slate-100' 
                      : 'bg-white border-gray-200 text-gray-900'
                  }`}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex border rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-3 transition-colors duration-200 ${
                    viewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : isDarkMode
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Grid3X3 size={20} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-3 transition-colors duration-200 ${
                    viewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : isDarkMode
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <List size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Classrooms Display */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClassrooms.map((classroom) => (
              <div
                key={classroom.id}
                className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} rounded-xl shadow-lg border overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:scale-105`}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg border ${getLevelColor(classroom.education_level)}`}>
                        {getLevelIcon(classroom.education_level)}
                      </div>
                      <div>
                        <h3 className={`text-xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                          {classroom.name}
                        </h3>
                        <p className="text-blue-600 font-semibold">{classroom.section_name}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      classroom.is_active 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                    }`}>
                      {classroom.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center text-gray-600 dark:text-slate-400">
                      <UserCheck size={16} className="mr-2" />
                      <span className="text-sm truncate">{classroom.class_teacher_name || 'No teacher assigned'}</span>
                    </div>
                    <div className="flex items-center text-gray-600 dark:text-slate-400">
                      <MapPin size={16} className="mr-2" />
                      <span className="text-sm truncate">{classroom.room_number || 'No room assigned'}</span>
                    </div>
                    <div className="flex items-center text-gray-600 dark:text-slate-400">
                      <Users size={16} className="mr-2" />
                      <span className="text-sm">{classroom.current_enrollment}/{classroom.max_capacity} students</span>
                    </div>
                    <div className="flex items-center text-gray-600 dark:text-slate-400">
                      <Calendar size={16} className="mr-2" />
                      <span className="text-sm truncate">{classroom.academic_session_name} - {classroom.term_name}</span>
                    </div>
                    <div className="flex items-center text-gray-600 dark:text-slate-400">
                      <BookOpen size={16} className="mr-2" />
                      <span className="text-sm">{classroom.education_level} Level</span>
                    </div>
                  </div>

                  {/* Enrollment Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-600 dark:text-slate-400 mb-1">
                      <span>Enrollment</span>
                      <span>{Math.round(classroom.enrollment_percentage)}%</span>
                    </div>
                    <div className={`w-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'} rounded-full h-2`}>
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${classroom.enrollment_percentage}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openViewModal(classroom)}
                      className="flex-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg font-medium flex items-center justify-center gap-1 transition-colors duration-200"
                    >
                      <Eye size={16} />
                      View
                    </button>
                    <button
                      onClick={() => openEditModal(classroom)}
                      className="flex-1 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-2 rounded-lg font-medium flex items-center justify-center gap-1 transition-colors duration-200"
                    >
                      <Edit3 size={16} />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setClassroomToDelete(classroom);
                        setShowDeleteModal(true);
                      }}
                      className="flex-1 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg font-medium flex items-center justify-center gap-1 transition-colors duration-200"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} rounded-xl shadow-lg border overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${isDarkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                  <tr>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-500'} uppercase tracking-wider`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-200'}`}>
                  {filteredClassrooms.map((classroom) => (
                    <tr key={classroom.id} className={`${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-50'} transition-colors duration-200`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className={`text-sm font-medium ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                            {classroom.name}
                          </div>
                          <div className="text-sm text-blue-600">{classroom.grade_level_name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`p-1 rounded border ${getLevelColor(classroom.education_level)}`}>
                            {getLevelIcon(classroom.education_level)}
                          </div>
                          <span className={`ml-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-500'}`}>
                            {classroom.education_level.charAt(0).toUpperCase() + classroom.education_level.slice(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-900'}`}>
                          {classroom.class_teacher_name || 'Not Assigned'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-900'}`}>
                          {classroom.current_enrollment}/{classroom.max_capacity}
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1 mt-1">
                          <div 
                            className="bg-blue-600 h-1 rounded-full"
                            style={{ width: `${classroom.enrollment_percentage}%` }}
                          ></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          classroom.is_active 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                        }`}>
                          {classroom.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => openViewModal(classroom)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={() => openEditModal(classroom)}
                            className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button 
                            onClick={() => {
                              setClassroomToDelete(classroom);
                              setShowDeleteModal(true);
                            }}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {filteredClassrooms.length === 0 && (
          <div className="text-center py-12">
            <School size={48} className={`mx-auto ${isDarkMode ? 'text-slate-400' : 'text-gray-400'} mb-4`} />
            <p className={`text-lg ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              No classrooms found matching your criteria.
            </p>
            <p className={`text-sm mt-2 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Try adjusting your search terms or filters.
            </p>
          </div>
        )}

        {/* Add/Edit Classroom Modal */}
        {(showAddModal || showEditModal) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  {showAddModal ? 'Add New Classroom' : 'Edit Classroom'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors duration-200"
                >
                  <X size={24} className={isDarkMode ? 'text-slate-400' : 'text-gray-600'} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Classroom Name */}
                <div>
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                    Classroom Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      errors.name ? 'border-red-500' : isDarkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-200'
                    }`}
                    placeholder="e.g., Primary 4A, SS2 Science"
                  />
                  {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
                </div>

                {/* Section */}
                <div>
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                    Section *
                  </label>
                  <select
                    value={formData.section}
                    onChange={(e) => setFormData({...formData, section: Number(e.target.value)})}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      errors.section ? 'border-red-500' : isDarkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-200'
                    }`}
                  >
                    <option value={0}>Select Section</option>
                    {Array.isArray(dropdownData.sections) && dropdownData.sections.map((section: any) => (
                      <option key={section.id} value={section.id}>
                        {section.name} ({section.grade_level_name})
                      </option>
                    ))}
                  </select>
                  {errors.section && <p className="text-red-500 text-sm mt-1">{errors.section}</p>}
                </div>

                {/* Academic Session */}
                <div>
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                    Academic Session *
                  </label>
                  <select
                    value={formData.academic_session}
                    onChange={(e) => setFormData({...formData, academic_session: Number(e.target.value)})}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      errors.academic_session ? 'border-red-500' : isDarkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-200'
                    }`}
                  >
                    <option value={0}>Select Academic Session</option>
                    {Array.isArray(dropdownData.academicYears) && dropdownData.academicYears.map((year: any) => (
                      <option key={year.id} value={year.id}>
                        {year.name}
                      </option>
                    ))}
                  </select>
                  {errors.academic_session && <p className="text-red-500 text-sm mt-1">{errors.academic_session}</p>}
                </div>

                {/* Term */}
                <div>
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                    Term *
                  </label>
                  <select
                    value={formData.term}
                    onChange={(e) => setFormData({...formData, term: Number(e.target.value)})}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      errors.term ? 'border-red-500' : isDarkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-200'
                    }`}
                  >
                    <option value={0}>Select Term</option>
                    {Array.isArray(dropdownData.terms) && dropdownData.terms.map((term: any) => (
                      <option key={term.id} value={term.id}>
                        {term.name_display}
                      </option>
                    ))}
                  </select>
                  {errors.term && <p className="text-red-500 text-sm mt-1">{errors.term}</p>}
                </div>

                {/* Class Teacher */}
                <div>
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                    Class Teacher
                  </label>
                  <select
                    value={formData.class_teacher || ''}
                    onChange={(e) => setFormData({...formData, class_teacher: e.target.value ? Number(e.target.value) : undefined})}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      isDarkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-200'
                    }`}
                  >
                    <option value="">Select Teacher (Optional)</option>
                    {Array.isArray(dropdownData.teachers) && dropdownData.teachers.map((teacher: any) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.full_name || `${teacher.first_name} ${teacher.last_name}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Room Number */}
                <div>
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                    Room Number
                  </label>
                  <input
                    type="text"
                    value={formData.room_number}
                    onChange={(e) => setFormData({...formData, room_number: e.target.value})}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      isDarkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-200'
                    }`}
                    placeholder="e.g., Room 101, Block A"
                  />
                </div>

                {/* Max Capacity */}
                <div>
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                    Maximum Capacity *
                  </label>
                  <input
                    type="number"
                    value={formData.max_capacity}
                    onChange={(e) => setFormData({...formData, max_capacity: Number(e.target.value)})}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      errors.max_capacity ? 'border-red-500' : isDarkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-200'
                    }`}
                    placeholder="e.g., 30"
                    min="1"
                    max="100"
                  />
                  {errors.max_capacity && <p className="text-red-500 text-sm mt-1">{errors.max_capacity}</p>}
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={showAddModal ? handleAddClassroom : handleEditClassroom}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {showAddModal ? <Plus size={16} /> : <Save size={16} />}
                  {showAddModal ? 'Add Classroom' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && classroomToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl p-6 max-w-md w-full`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>Confirm Deletion</h2>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors duration-200"
                >
                  <X size={24} className={isDarkMode ? 'text-slate-400' : 'text-gray-600'} />
                </button>
              </div>
              <p className={`${isDarkMode ? 'text-slate-300' : 'text-gray-700'} mb-6`}>
                Are you sure you want to delete the classroom "{classroomToDelete.name}"? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className={`px-6 py-3 rounded-xl font-semibold ${
                    isDarkMode 
                      ? 'text-slate-300 border border-slate-600 hover:border-slate-500' 
                      : 'text-gray-700 border border-gray-300 hover:border-gray-400'
                  } transition-colors duration-200`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteClassroom}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                >
                  <Trash2 size={20} />
                  Delete Classroom
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Classroom Modal */}
        {showViewModal && selectedClassroom && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>Classroom Details</h2>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors duration-200"
                >
                  <X size={24} className={isDarkMode ? 'text-slate-400' : 'text-gray-600'} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Classroom Name:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.name}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Section:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.section_name}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Education Level:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.education_level}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Grade:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.grade_level_name}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Academic Session:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.academic_session_name}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Term:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.term_name}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Class Teacher:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.class_teacher_name || 'Not Assigned'}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Room Number:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.room_number || 'Not Assigned'}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Capacity:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.max_capacity}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Current Enrollment:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.current_enrollment}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Available Spots:</p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{selectedClassroom.available_spots}</p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Status:</p>
                  <p className={`text-lg font-semibold ${
                    selectedClassroom.is_active 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {selectedClassroom.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedClassroom;