import { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter, 
  BookOpen, 
  Save, 
  X, 
  CheckCircle,
  Users,
  GraduationCap,
  Activity,
  Beaker,
  UserCheck,
  Loader2,
  RefreshCw,
  Tag,
  Layers,
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
  subjectService,
  Subject,
  CreateSubjectData,
  SubjectFilters,
  SubjectStatistics,
  SubjectCategory,
  SubjectType,
  GradeLevel,
} from '@/services/SubjectService';
import { API_BASE_URL } from '@/services/api';

const SubjectManagement = () => {
  // State management
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<Subject[]>([]);
  const [statistics, setStatistics] = useState<SubjectStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);

  // NEW: FK-related state
  const [categories, setCategories] = useState<SubjectCategory[]>([]);
  const [subjectTypes, setSubjectTypes] = useState<SubjectType[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [loadingMetadata, setLoadingMetadata] = useState(true);

  // Filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<SubjectFilters>({
    category_new_id: undefined,
    education_level: '',
    is_active: true,
    ordering: 'name'
  });
  const [streamFilter, setStreamFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  // Form data - UPDATED for FK support
  const [formData, setFormData] = useState<CreateSubjectData>({
    name: '',
    short_name: '',
    code: '',
    description: '',
    
    // NEW FK FIELDS (preferred)
    category_new_id: undefined,
    subject_type_new_id: undefined,
    grade_level_ids: [],
    
    // OLD FIELDS (backward compatibility)
    category: 'core',
    education_levels: ['PRIMARY'],
    ss_subject_type: undefined,
    
    // Configuration
    is_compulsory: true,
    is_core: false,
    is_cross_cutting: false,
    is_elective: false,
    elective_group: '',
    min_electives_required: 0,
    max_electives_allowed: 0,
    compatible_stream_ids: [],
    has_continuous_assessment: true,
    has_final_exam: true,
    pass_mark: 50,
    has_practical: false,
    practical_hours: 0,
    is_activity_based: false,
    requires_lab: false,
    requires_special_equipment: false,
    equipment_notes: '',
    requires_specialist_teacher: false
  });

  const [errors, setErrors] = useState<{[key: string]: string}>({});

  // LEGACY: Old constants (kept for backward compatibility)
  const legacyCategories = [
    { value: 'core', label: 'Core Subject', icon: BookOpen },
    { value: 'elective', label: 'Elective Subject', icon: GraduationCap },
    { value: 'cross_cutting', label: 'Cross Cutting Subject', icon: Activity },
    { value: 'core_science', label: 'Core Science', icon: Beaker },
    { value: 'core_art', label: 'Core Art', icon: Users },
    { value: 'core_humanities', label: 'Core Humanities', icon: UserCheck },
    { value: 'language', label: 'Language', icon: BookOpen },
    { value: 'religious', label: 'Religious Studies', icon: BookOpen },
  ];

  const educationLevels = [
    { value: 'NURSERY', label: 'Nursery' },
    { value: 'PRIMARY', label: 'Primary' },
    { value: 'JUNIOR_SECONDARY', label: 'Junior Secondary' },
    { value: 'SENIOR_SECONDARY', label: 'Senior Secondary' }
  ];

  const categoryColors: { [key: string]: string } = {
    'core': 'bg-blue-100 text-blue-800',
    'elective': 'bg-green-100 text-green-800',
    'cross_cutting': 'bg-purple-100 text-purple-800',
    'core_science': 'bg-red-100 text-red-800',
    'core_art': 'bg-yellow-100 text-yellow-800',
    'core_humanities': 'bg-indigo-100 text-indigo-800',
    'vocational': 'bg-orange-100 text-orange-800',
    'creative_arts': 'bg-pink-100 text-pink-800',
    'religious': 'bg-gray-100 text-gray-800',
    'physical': 'bg-teal-100 text-teal-800',
    'language': 'bg-cyan-100 text-cyan-800',
    'practical': 'bg-lime-100 text-lime-800',
    'nursery_activities': 'bg-rose-100 text-rose-800'
  };

  // NEW: Load metadata (categories, types, grade levels)
  useEffect(() => {
    loadMetadata();
  }, []);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  // Filter subjects
  useEffect(() => {
    let filtered = subjects;
    console.log('🔍 Filtering subjects:', { searchTerm, filters, totalSubjects: subjects.length });

    if (searchTerm) {
      filtered = filtered.filter(subject =>
        subject.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        subject.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        subject.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      console.log('🔍 After search filter:', filtered.length, 'subjects');
    }

    // NEW: Filter by category (FK)
    if (filters.category_new_id) {
      filtered = filtered.filter(subject => 
        subject.category_new_id === filters.category_new_id
      );
      console.log('🔍 After category FK filter:', filtered.length, 'subjects');
    }

    // NEW: Filter by subject type (FK)
    if (filters.subject_type_new_id) {
      filtered = filtered.filter(subject => 
        subject.subject_type_new_id === filters.subject_type_new_id
      );
      console.log('🔍 After subject type FK filter:', filtered.length, 'subjects');
    }

    // NEW: Filter by grade level (FK)
    if (filters.grade_level_id) {
      filtered = filtered.filter(subject => 
        subject.grade_level_ids?.includes(filters.grade_level_id!)
      );
      console.log('🔍 After grade level FK filter:', filtered.length, 'subjects');
    }

    // Filter by education level (still useful for cross-level queries)
    if (filters.education_level && filters.education_level !== '') {
      filtered = filtered.filter(subject => {
        // Try new field first
        if (subject.grade_levels && subject.grade_levels.length > 0) {
          return subject.grade_levels.some(gl => gl.education_level === filters.education_level);
        }
        // Fall back to old field
        return subject.education_levels && 
               Array.isArray(subject.education_levels) && 
               subject.education_levels.includes(filters.education_level!);
      });
      console.log('🔍 After education level filter:', filtered.length, 'subjects');
    }

    if (filters.is_active !== undefined) {
      filtered = filtered.filter(subject => subject.is_active === filters.is_active);
      console.log('🔍 After active filter:', filtered.length, 'subjects');
    }

    // Stream filter
    if (streamFilter !== 'all') {
      filtered = filtered.filter(subject => 
        subject.compatible_streams && 
        subject.compatible_streams.includes(streamFilter)
      );
      console.log('🔍 After stream filter:', filtered.length, 'subjects');
    }

    console.log('🔍 Final filtered subjects:', filtered.length);
    setFilteredSubjects(filtered);
    setCurrentPage(1);
  }, [subjects, searchTerm, filters, streamFilter]);

  // NEW: Load metadata
  const loadMetadata = async () => {
    try {
      setLoadingMetadata(true);
      console.log('📦 Loading metadata (categories, types, grade levels)...');

      const [categoriesData, typesData] = await Promise.all([
        subjectService.getCategories().catch(err => {
          console.warn('Could not load categories:', err);
          return [];
        }),
        subjectService.getSubjectTypes().catch(err => {
          console.warn('Could not load subject types:', err);
          return [];
        }),
        // TODO: Load grade levels when the service is available
        // gradeLevelService.getGradeLevels()
      ]);

      console.log('📦 Categories loaded:', categoriesData.length);
      console.log('📦 Subject types loaded:', typesData.length);

      setCategories(categoriesData);
      setSubjectTypes(typesData);
      // setGradeLevels(gradeLevelsData);
    } catch (error) {
      console.error('❌ Error loading metadata:', error);
      toast.error('Failed to load form options');
    } finally {
      setLoadingMetadata(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading subject data...');

      const [subjectsData, statsData] = await Promise.all([
        subjectService.getSubjects({}).catch(err => {
          console.error('❌ Error fetching subjects:', err);
          return [];
        }),
        subjectService.getSubjectStatistics().catch(err => {
          console.error('❌ Error fetching statistics:', err);
          return null;
        })
      ]);

      const subjectsList = Array.isArray(subjectsData) ? subjectsData : [];
      console.log('📋 Subjects loaded:', subjectsList.length);

      if (subjectsList.length > 0) {
        console.log('📋 Sample subject (first):', {
          name: subjectsList[0].name,
          category_new: subjectsList[0].category_new,
          category: subjectsList[0].category,
          grade_levels: subjectsList[0].grade_levels,
          education_levels: subjectsList[0].education_levels,
        });
      }

      setSubjects(subjectsList);
      setStatistics(statsData);
    } catch (error: any) {
      console.error('❌ Error loading subject data:', error);
      
      if (error.response?.status === 404) {
        toast.error('Subjects endpoint not found. Please check the API configuration.');
      } else if (error.response?.status === 401) {
        toast.error('Authentication required. Please log in.');
      } else {
        toast.error('Failed to load subjects');
      }
      
      setSubjects([]);
      setStatistics(null);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.name.trim()) newErrors.name = 'Subject name is required';
    if (!formData.code.trim()) newErrors.code = 'Subject code is required';
    
    // Validate grade levels (new FK) or education levels (old)
    if ((!formData.grade_level_ids || formData.grade_level_ids.length === 0) &&
        (!formData.education_levels || formData.education_levels.length === 0)) {
      newErrors.education_levels = 'At least one grade/education level is required';
    }

    // Validate category (new FK) or old category
    if (!formData.category_new_id && !formData.category) {
      newErrors.category = 'Category is required';
    }

    if (!formData.pass_mark || formData.pass_mark < 1 || formData.pass_mark > 100) {
      newErrors.pass_mark = 'Pass mark must be between 1 and 100';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
  if (!validateForm()) return;
  try {
    setSaving(true);
    
    const submitData: CreateSubjectData = {
      name: formData.name,
      short_name: formData.short_name,
      code: formData.code,
      description: formData.description,
      
      category_new_id: formData.category_new_id,
      subject_type_new_id: formData.subject_type_new_id,
      grade_level_ids: formData.grade_level_ids,
      
      category: formData.category_new_id,
      education_levels: formData.education_levels,
      ss_subject_type: formData.subject_type_new_id ? undefined : formData.ss_subject_type,
      
      is_compulsory: formData.is_compulsory,
      is_core: formData.is_core,
      is_cross_cutting: formData.is_cross_cutting,
      is_elective: formData.is_elective,
      elective_group: formData.elective_group,
      min_electives_required: formData.min_electives_required,
      max_electives_allowed: formData.max_electives_allowed,
      compatible_stream_ids: formData.compatible_stream_ids,
      has_continuous_assessment: formData.has_continuous_assessment,
      has_final_exam: formData.has_final_exam,
      pass_mark: formData.pass_mark,
      has_practical: formData.has_practical,
      practical_hours: formData.practical_hours,
      is_activity_based: formData.is_activity_based,
      requires_lab: formData.requires_lab,
      requires_special_equipment: formData.requires_special_equipment,
      equipment_notes: formData.equipment_notes,
      requires_specialist_teacher: formData.requires_specialist_teacher,
    };
    
    console.log('📤 Submitting subject data:', submitData);
    
    if (editingSubject) {
      await subjectService.updateSubject(editingSubject.id, submitData);
      toast.success('Subject updated successfully');
    } else {
      await subjectService.createSubject(submitData);
      toast.success('Subject created successfully');
    }
    
    resetForm();
    loadData();
  } catch (error: any) {
    console.error('Error saving subject:', error);
    
    // Parse field-level errors and surface them on the form
    if (error.message) {
      try {
        const parsed = JSON.parse(error.message);
        const fieldErrors: {[key: string]: string} = {};
        
        if (parsed.code) fieldErrors.code = parsed.code[0];
        if (parsed.category) fieldErrors.category = parsed.category[0];
        if (parsed.name) fieldErrors.name = parsed.name[0];
        if (parsed.education_levels) fieldErrors.education_levels = parsed.education_levels[0];
        
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(prev => ({ ...prev, ...fieldErrors }));
          // Show the first error as a toast
          toast.error(Object.values(fieldErrors)[0]);
          return; // Don't show generic error too
        }
      } catch {
        // JSON parse failed, fall through to generic error
      }
    }

    if (error.response?.status === 404) {
      toast.error('Subject not found. Refreshing data...');
      resetForm();
      loadData();
    } else if (error.response?.data?.non_field_errors) {
      toast.error(`Validation error: ${error.response.data.non_field_errors.join(', ')}`);
    } else {
      toast.error(error.response?.data?.message || 'Failed to save subject');
    }
  } finally {
    setSaving(false);
  }
};

  const handleEdit = (subject: Subject) => {
    console.log('✏️ Editing subject:', subject.id, subject.name);
    
    setEditingSubject(subject);
    setFormData({
      name: subject.name,
      short_name: subject.short_name || '',
      code: subject.code,
      description: subject.description || '',
      
      // NEW FK FIELDS
      category_new_id: subject.category_new_id,
      subject_type_new_id: subject.subject_type_new_id,
      grade_level_ids: subject.grade_level_ids || [],
      
      // OLD FIELDS (backward compatibility)
      category: subject.category || 'core',
      education_levels: subject.education_levels || [],
      nursery_levels: subject.nursery_levels || [],
      ss_subject_type: subject.ss_subject_type,
      
      // Rest of the fields
      is_compulsory: subject.is_compulsory ?? true,
      is_core: subject.is_core ?? false,
      is_cross_cutting: subject.is_cross_cutting,
      is_elective: subject.is_elective,
      elective_group: subject.elective_group,
      min_electives_required: subject.min_electives_required,
      max_electives_allowed: subject.max_electives_allowed,
      compatible_stream_ids: subject.compatible_streams || [],
      has_continuous_assessment: subject.has_continuous_assessment,
      has_final_exam: subject.has_final_exam,
      pass_mark: subject.pass_mark || 50,
      has_practical: subject.has_practical,
      practical_hours: subject.practical_hours,
      is_activity_based: subject.is_activity_based,
      requires_lab: subject.requires_lab,
      requires_special_equipment: subject.requires_special_equipment,
      equipment_notes: subject.equipment_notes || '',
      requires_specialist_teacher: subject.requires_specialist_teacher,
      introduced_year: subject.introduced_year,
      curriculum_version: subject.curriculum_version,
      subject_order: subject.subject_order,
      learning_outcomes: subject.learning_outcomes
    });
    setShowModal(true);
  };

  const handleDelete = (subject: Subject) => {
    setSubjectToDelete(subject);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!subjectToDelete) return;

    try {
      console.log('🗑️ Deleting subject:', subjectToDelete.id, subjectToDelete.name);
      
      await subjectService.deleteSubject(subjectToDelete.id);
      toast.success('Subject deleted successfully');
      
      setLoading(true);
      await loadData();
    } catch (error: any) {
      console.error('Error deleting subject:', error);
      
      if (error.response?.status === 404) {
        toast.error('Subject not found. Refreshing data...');
        loadData();
      } else if (error.response?.status === 403) {
        toast.error('Permission denied.');
      } else if (error.response?.status === 401) {
        toast.error('Authentication required. Please log in.');
      } else {
        toast.error(`Failed to delete subject: ${error.response?.data?.message || error.message}`);
      }
    } finally {
      setShowDeleteModal(false);
      setSubjectToDelete(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      short_name: '',
      code: '',
      description: '',
      category_new_id: categories.length > 0 ? categories[0].id : undefined,
      subject_type_new_id: undefined,
      grade_level_ids: [],
      category: 'core',
      education_levels: ['PRIMARY'],
      ss_subject_type: undefined,
      is_compulsory: true,
      is_core: false,
      is_cross_cutting: false,
      is_elective: false,
      elective_group: '',
      min_electives_required: 0,
      max_electives_allowed: 0,
      compatible_stream_ids: [],
      has_continuous_assessment: true,
      has_final_exam: true,
      pass_mark: 50,
      has_practical: false,
      practical_hours: 0,
      is_activity_based: false,
      requires_lab: false,
      requires_special_equipment: false,
      equipment_notes: '',
      requires_specialist_teacher: false
    });
    setErrors({});
    setEditingSubject(null);
    setShowModal(false);
  };

  const generateCode = (name: string, categoryId?: number) => {
  if (!name) return '';
  const namePrefix = name.substring(0, 3).toUpperCase();
  
  let categorySuffix = 'GEN';
  if (categoryId && categories.length > 0) {
    const category = categories.find(c => c.id === categoryId);
    if (category) {
      categorySuffix = category.code.substring(0, 2).toUpperCase();
    }
  }
  
  // CHANGE: Use random alphanumeric instead of timestamp slice
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${namePrefix}-${categorySuffix}-${random}`;
};

  // Auto-generate code when name or category changes
  useEffect(() => {
    if (formData.name && formData.category_new_id) {
      const autoCode = generateCode(formData.name, formData.category_new_id);
      if (!editingSubject || formData.code === generateCode(editingSubject.name, editingSubject.category_new_id)) {
        setFormData(prev => ({ ...prev, code: autoCode }));
      }
    }
  }, [formData.name, formData.category_new_id, editingSubject, categories]);

  // Pagination logic
  const totalPages = Math.ceil(filteredSubjects.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentSubjects = filteredSubjects.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // NEW: Helper function to display category name
  const getCategoryDisplay = (subject: Subject): string => {
    return subject.category_new?.name || subject.category_display || 'Unknown';
  };

  // NEW: Helper function to display grade levels
  const getGradeLevelsDisplay = (subject: Subject): string => {
    if (subject.grade_levels && subject.grade_levels.length > 0) {
      return subject.grade_levels.map(gl => gl.name).join(', ');
    }
    return subject.education_levels_display || 'No levels';
  };

  // NEW: Helper function to get category color
  const getCategoryColor = (subject: Subject): string => {
    // Try to get color from new category object
    if (subject.category_new?.color_code) {
      return `bg-[${subject.category_new.color_code}20] text-[${subject.category_new.color_code}]`;
    }
    // Fall back to old category colors
    return categoryColors[subject.category || ''] || 'bg-gray-100 text-gray-800';
  };

  if (loading || loadingMetadata) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">
            {loadingMetadata ? 'Loading form options...' : 'Loading subjects...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">Subject Management</h1>
            </div>
            <button
              onClick={() => {
                loadData();
                loadMetadata();
              }}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
          <p className="text-gray-600">Manage subjects across all educational levels in your school</p>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BookOpen className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Subjects</p>
                  <p className="text-2xl font-bold text-gray-900">{statistics.total_subjects}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Subjects</p>
                  <p className="text-2xl font-bold text-gray-900">{statistics.active_subjects}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Activity className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Cross-cutting</p>
                  <p className="text-2xl font-bold text-gray-900">{statistics.cross_cutting_subjects}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Beaker className="w-6 h-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">With Practical</p>
                  <p className="text-2xl font-bold text-gray-900">{statistics.subjects_with_practical}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          {/* Action Buttons Row */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowModal(true)}
                className="bg-gray-900 text-white px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Plus className="w-5 h-5" />
                Add Subject
              </button>
              <button
                onClick={() => {
                  setFilters({ 
                    category_new_id: undefined,
                    education_level: '', 
                    is_active: true, 
                    ordering: 'name' 
                  });
                  setSearchTerm('');
                }}
                className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Reset Filters
              </button>
            </div>
            
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                List
              </button>
            </div>
          </div>
          
          {/* Search and Filters Row */}
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search subjects..."
                  className="pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              {/* NEW: Category Filter (FK) */}
              <div className="relative">
                <Tag className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <select
                  className="pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white transition-all duration-200"
                  value={filters.category_new_id || ''}
                  onChange={(e) => {
                    setFilters({
                      ...filters, 
                      category_new_id: e.target.value ? parseInt(e.target.value) : undefined
                    });
                  }}
                >
                  <option value="">All Categories</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* NEW: Subject Type Filter (FK) */}
              {subjectTypes.length > 0 && (
                <div className="relative">
                  <Layers className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <select
                    className="pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white transition-all duration-200"
                    value={filters.subject_type_new_id || ''}
                    onChange={(e) => {
                      setFilters({
                        ...filters,
                        subject_type_new_id: e.target.value ? parseInt(e.target.value) : undefined
                      });
                    }}
                  >
                    <option value="">All Types</option>
                    {subjectTypes.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Education Level Filter (still useful) */}
              <div className="relative">
                <select
                  className="pl-4 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white transition-all duration-200"
                  value={filters.education_level || ''}
                  onChange={(e) => {
                    setFilters({...filters, education_level: e.target.value});
                  }}
                >
                  <option value="">All Levels</option>
                  {educationLevels.map(level => (
                    <option key={level.value} value={level.value}>{level.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="relative">
                <select
                  className="pl-4 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white transition-all duration-200"
                  value={streamFilter}
                  onChange={(e) => setStreamFilter(e.target.value)}
                >
                  <option value="all">All Streams</option>
                  <option value="Science">Science</option>
                  <option value="Arts">Arts</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Technical">Technical</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500 font-medium">
                {filteredSubjects.length} subject{filteredSubjects.length !== 1 ? 's' : ''} found
              </div>
            </div>
          </div>
        </div>

        {/* Subjects Display - Grid View */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentSubjects.map(subject => (
              <div key={subject.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{subject.name}</h3>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(subject)}`}>
                        {getCategoryDisplay(subject)}
                      </span>
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        !subject.is_active 
                          ? 'bg-yellow-100 text-yellow-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {!subject.is_active ? 'Inactive' : 'Active'}
                      </span>
                      {subject.is_cross_cutting && (
                        <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          Cross-cutting
                        </span>
                      )}
                      {subject.is_activity_based && (
                        <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          Activity-based
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{getGradeLevelsDisplay(subject)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(subject)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(subject)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Code:</span>
                    <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{subject.code}</span>
                  </div>
                  {subject.subject_type_new && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Type:</span>
                      <span className="text-sm text-blue-600 font-medium">{subject.subject_type_new.name}</span>
                    </div>
                  )}
                  {subject.compatible_streams && subject.compatible_streams.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Streams:</span>
                      <span className="text-sm text-blue-600 font-medium">{subject.compatible_streams.join(', ')}</span>
                    </div>
                  )}
                  {subject.has_practical && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Practical Hours:</span>
                      <span className="text-sm font-medium">{subject.practical_hours}</span>
                    </div>
                  )}
                  {subject.description && (
                    <div>
                      <span className="text-sm text-gray-500">Description:</span>
                      <p className="text-sm text-gray-700 mt-1">{subject.description}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-4 pt-2 border-t">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <CheckCircle className="w-3 h-3" />
                      {subject.is_compulsory ? 'Compulsory' : 'Elective'}
                    </div>
                    {subject.has_practical && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Beaker className="w-3 h-3" />
                        Practical
                      </div>
                    )}
                    {subject.requires_specialist_teacher && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <UserCheck className="w-3 h-3" />
                        Specialist
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View - similar updates */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Levels</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentSubjects.map(subject => (
                    <tr key={subject.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{subject.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{subject.code}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(subject)}`}>
                          {getCategoryDisplay(subject)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {subject.subject_type_new?.name || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{getGradeLevelsDisplay(subject)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          !subject.is_active 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {!subject.is_active ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(subject)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(subject)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {currentSubjects.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No subjects found</h3>
            <p className="text-gray-500">Try adjusting your search or filter criteria</p>
          </div>
        )}

        {/* Pagination */}
        {filteredSubjects.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-600">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredSubjects.length)} of {filteredSubjects.length} subjects
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 hover:text-gray-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Modal - Updated for FK fields */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingSubject ? 'Edit Subject' : 'Add New Subject'}
                </h2>
                <button
                  onClick={resetForm}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Subject Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject Name *
                    </label>
                    <input
                      type="text"
                      required
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.name ? 'border-red-500' : 'border-gray-300'
                      }`}
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Enter subject name"
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                  </div>

                  {/* Short Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Short Name
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={formData.short_name}
                      onChange={(e) => setFormData({...formData, short_name: e.target.value})}
                      placeholder="Short name (optional)"
                    />
                  </div>

                  {/* Subject Code */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject Code *
                    </label>
                    <input
                      type="text"
                      required
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono ${
                        errors.code ? 'border-red-500' : 'border-gray-300'
                      }`}
                      value={formData.code}
                      onChange={(e) => setFormData({...formData, code: e.target.value})}
                      placeholder="Auto-generated or custom"
                    />
                    {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code}</p>}
                  </div>

                  {/* NEW: Category (FK) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category *
                    </label>
                    <select
                      required
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.category ? 'border-red-500' : 'border-gray-300'
                      }`}
                      value={formData.category_new_id || ''}
                      onChange={(e) => setFormData({
                        ...formData, 
                        category_new_id: e.target.value ? parseInt(e.target.value) : undefined
                      })}
                    >
                      <option value="">Select Category</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category}</p>}
                  </div>

                  {/* NEW: Subject Type (FK) - Optional */}
                  {subjectTypes.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Subject Type
                      </label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={formData.subject_type_new_id || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          subject_type_new_id: e.target.value ? parseInt(e.target.value) : undefined
                        })}
                      >
                        <option value="">Select Type (Optional)</option>
                        {subjectTypes.map(type => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Pass Mark */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pass Mark *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.pass_mark ? 'border-red-500' : 'border-gray-300'
                      }`}
                      value={formData.pass_mark || 50}
                      onChange={(e) => setFormData({...formData, pass_mark: parseInt(e.target.value)})}
                    />
                    {errors.pass_mark && <p className="text-red-500 text-xs mt-1">{errors.pass_mark}</p>}
                  </div>

                  {/* Practical Hours */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Practical Hours
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={formData.practical_hours || 0}
                      onChange={(e) => setFormData({...formData, practical_hours: parseInt(e.target.value) || 0})}
                      placeholder="Hours per week"
                    />
                  </div>

                  {/* Education Levels - Old field for backward compatibility */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Education Levels *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {educationLevels.map(level => (
                        <label key={level.value} className="flex items-center">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={formData.education_levels?.includes(level.value)}
                            onChange={(e) => {
                              const currentLevels = formData.education_levels || [];
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  education_levels: [...currentLevels, level.value]
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  education_levels: currentLevels.filter(l => l !== level.value)
                                });
                              }
                            }}
                          />
                          <span className="ml-2 text-sm text-gray-700">{level.label}</span>
                        </label>
                      ))}
                    </div>
                    {errors.education_levels && <p className="text-red-500 text-xs mt-1">{errors.education_levels}</p>}
                  </div>

                  {/* Description */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Subject description (optional)"
                    />
                  </div>

                  {/* Equipment Notes */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Equipment Notes
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      value={formData.equipment_notes || ''}
                      onChange={(e) => setFormData({...formData, equipment_notes: e.target.value})}
                      placeholder="Notes about required equipment or facilities (optional)"
                    />
                  </div>

                  {/* Stream Compatibility */}
                  {formData.education_levels?.includes('SENIOR_SECONDARY') && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Compatible Streams
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Science', 'Arts', 'Commercial', 'Technical'].map(stream => (
                          <label key={stream} className="flex items-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={formData.compatible_stream_ids?.includes(stream)}
                              onChange={(e) => {
                                const currentStreams = formData.compatible_stream_ids || [];
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    compatible_stream_ids: [...currentStreams, stream]
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    compatible_stream_ids: currentStreams.filter(s => s !== stream)
                                  });
                                }
                              }}
                            />
                            <span className="ml-2 text-sm text-gray-700">{stream}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Checkboxes */}
                  <div className="md:col-span-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.is_compulsory}
                          onChange={(e) => setFormData({...formData, is_compulsory: e.target.checked})}
                        />
                        <span className="ml-2 text-sm text-gray-700">Compulsory</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.is_core}
                          onChange={(e) => setFormData({...formData, is_core: e.target.checked})}
                        />
                        <span className="ml-2 text-sm text-gray-700">Core Subject</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.is_cross_cutting}
                          onChange={(e) => setFormData({...formData, is_cross_cutting: e.target.checked})}
                        />
                        <span className="ml-2 text-sm text-gray-700">Cross-cutting</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.has_practical}
                          onChange={(e) => setFormData({...formData, has_practical: e.target.checked})}
                        />
                        <span className="ml-2 text-sm text-gray-700">Has Practical</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.is_activity_based}
                          onChange={(e) => setFormData({...formData, is_activity_based: e.target.checked})}
                        />
                        <span className="ml-2 text-sm text-gray-700">Activity-based</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.requires_lab}
                          onChange={(e) => setFormData({...formData, requires_lab: e.target.checked})}
                        />
                        <span className="ml-2 text-sm text-gray-700">Requires Lab</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.requires_special_equipment}
                          onChange={(e) => setFormData({...formData, requires_special_equipment: e.target.checked})}
                        />
                        <span className="ml-2 text-sm text-gray-700">Special Equipment</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.requires_specialist_teacher}
                          onChange={(e) => setFormData({...formData, requires_specialist_teacher: e.target.checked})}
                        />
                        <span className="ml-2 text-sm text-gray-700">Requires Specialist</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving}
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {editingSubject ? 'Update Subject' : 'Create Subject'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && subjectToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">Confirm Deletion</h2>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <p className="text-gray-700 mb-6">
                  Are you sure you want to delete the subject "{subjectToDelete.name}"? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={confirmDelete}
                    className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Subject
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubjectManagement;