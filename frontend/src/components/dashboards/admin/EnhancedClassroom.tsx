import { useState, useEffect } from 'react';
import {
  School, Plus, Search, Filter, Edit3, Trash2, Eye,
  Users, BookOpen, Calendar, MapPin, X, Check, Baby,
  GraduationCap, Save, UserCheck, Grid3X3, List,
} from 'lucide-react';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import {
  classroomService,
  Classroom,
  ClassroomStats,
  CreateClassroomData,
} from '@/services/ClassroomService';
import { toast } from 'react-toastify';

// ============================================================================
// TYPES
// ============================================================================

/**
 * education_level on Classroom is a serializer-computed string derived from:
 *   classroom.section (FK) → grade_level (FK) → education_level (CharField)
 *
 * The GradeLevel.education_level CharField choices are:
 *   NURSERY | PRIMARY | JUNIOR_SECONDARY | SENIOR_SECONDARY
 *
 * The old EnhancedClassroom used lowercase 'nursery'/'primary'/'secondary' —
 * these never matched the API values. Fixed here.
 */
type EducationLevelType =
  | 'NURSERY'
  | 'PRIMARY'
  | 'JUNIOR_SECONDARY'
  | 'SENIOR_SECONDARY';

const EDUCATION_LEVEL_LABELS: Record<EducationLevelType, string> = {
  NURSERY: 'Nursery',
  PRIMARY: 'Primary',
  JUNIOR_SECONDARY: 'Junior Secondary',
  SENIOR_SECONDARY: 'Senior Secondary',
};

interface DropdownData {
  sections: any[];
  academicYears: any[];
  terms: any[];
  teachers: any[];
}

// ============================================================================
// HELPERS
// ============================================================================

const getLevelIcon = (level: string) => {
  switch (level as EducationLevelType) {
    case 'NURSERY':           return <Baby size={20} />;
    case 'PRIMARY':           return <BookOpen size={20} />;
    case 'JUNIOR_SECONDARY':  return <School size={20} />;
    case 'SENIOR_SECONDARY':  return <GraduationCap size={20} />;
    default:                  return <GraduationCap size={20} />;
  }
};

const getLevelColor = (level: string, isDarkMode: boolean): string => {
  if (isDarkMode) {
    switch (level as EducationLevelType) {
      case 'NURSERY':          return 'bg-pink-900/20 text-pink-300 border-pink-700/50';
      case 'PRIMARY':          return 'bg-blue-900/20 text-blue-300 border-blue-700/50';
      case 'JUNIOR_SECONDARY':
      case 'SENIOR_SECONDARY': return 'bg-purple-900/20 text-purple-300 border-purple-700/50';
      default:                 return 'bg-gray-900/20 text-gray-300 border-gray-700/50';
    }
  } else {
    switch (level as EducationLevelType) {
      case 'NURSERY':          return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'PRIMARY':          return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'JUNIOR_SECONDARY':
      case 'SENIOR_SECONDARY': return 'bg-purple-100 text-purple-800 border-purple-200';
      default:                 return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

const EnhancedClassroom = () => {
  const { isDarkMode } = useGlobalTheme();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [filteredClassrooms, setFilteredClassrooms] = useState<Classroom[]>([]);
  const [stats, setStats] = useState<ClassroomStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  /**
   * levelFilter must match the API values: NURSERY | PRIMARY | JUNIOR_SECONDARY | SENIOR_SECONDARY
   * Old code used 'nursery'/'primary'/'secondary' — those never matched anything.
   */
  const [levelFilter, setLevelFilter] = useState<EducationLevelType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [classroomToDelete, setClassroomToDelete] = useState<Classroom | null>(null);

  const [formData, setFormData] = useState<CreateClassroomData>({
    name: '',
    section: 0,
    academic_session: 0,
    term: 0,
    class_teacher: undefined,
    room_number: '',
    max_capacity: 30,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dropdownData, setDropdownData] = useState<DropdownData>({
    sections: [],
    academicYears: [],
    terms: [],
    teachers: [],
  });

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [classroomsData, statsData] = await Promise.all([
        classroomService.getClassrooms(),
        classroomService.getClassroomStats(),
      ]);
      setClassrooms(classroomsData.results ?? classroomsData);
      setStats(statsData);
      await loadDropdownData();
    } catch (error: any) {
      toast.error('Failed to load classroom data');
      setClassrooms([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const loadDropdownData = async () => {
    try {
      const academicYearsData = await classroomService.getAcademicYears().catch(() => ({ results: [] }));
      const safeAcademicYears = Array.isArray(academicYearsData) ? academicYearsData : academicYearsData.results ?? [];

      const teachersData = await classroomService.getAllTeachers().catch(() => ({ results: [] }));
      const safeTeachers = Array.isArray(teachersData) ? teachersData : teachersData.results ?? [];

      // Load all terms (no academic_session filter — load globally)
      const termsData = await classroomService.getTerms().catch(() => ({ results: [] }));
      const safeTerms = Array.isArray(termsData) ? termsData : termsData.results ?? [];

      // Load sections by iterating all grade levels (section is a FK to GradeLevel)
      let safeSections: any[] = [];
      try {
        const gradeLevelsData = await classroomService.getGradeLevels().catch(() => ({ results: [] }));
        const gradeLevels = Array.isArray(gradeLevelsData) ? gradeLevelsData : gradeLevelsData.results ?? [];

        const allSections = await Promise.all(
          gradeLevels.map((gl: any) =>
            classroomService.getSections(gl.id)
              .then((res: any) => Array.isArray(res) ? res : res.results ?? [])
              .catch(() => []),
          ),
        );
        safeSections = allSections.flat();
      } catch {
        safeSections = [];
      }

      setDropdownData({
        sections: safeSections,
        academicYears: safeAcademicYears,
        terms: safeTerms,
        teachers: safeTeachers,
      });
    } catch (error: any) {
      console.error('Error loading dropdown data:', error);
    }
  };

  // ============================================================================
  // FILTERING
  // ============================================================================

  useEffect(() => {
    let filtered = classrooms;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.section_name?.toLowerCase().includes(q) ||
          // class_teacher_name is serializer-computed from class_teacher FK
          c.class_teacher_name?.toLowerCase().includes(q) ||
          c.room_number?.toLowerCase().includes(q),
      );
    }

    if (levelFilter !== 'all') {
      /**
       * classroom.education_level = section → grade_level → education_level
       * Values: NURSERY | PRIMARY | JUNIOR_SECONDARY | SENIOR_SECONDARY
       */
      filtered = filtered.filter((c) => c.education_level === levelFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((c) => c.is_active === (statusFilter === 'active'));
    }

    setFilteredClassrooms(filtered);
  }, [classrooms, searchTerm, levelFilter, statusFilter]);

  // ============================================================================
  // STATS
  // ============================================================================

  /**
   * The statistics endpoint (views.py) returns by_education_level with keys:
   *   nursery | primary | junior_secondary | senior_secondary
   * (snake_case, lowercase — matching Django annotation variable names)
   * The old code used 'secondary' which doesn't exist as a key.
   */
  const getStats = () => {
    if (!stats) return { total: 0, active: 0, nursery: 0, primary: 0, junior_secondary: 0, senior_secondary: 0, totalEnrollment: 0 };
    return {
      total: stats.total_classrooms,
      active: stats.active_classrooms,
      nursery: stats.by_education_level?.nursery ?? 0,
      primary: stats.by_education_level?.primary ?? 0,
      junior_secondary: stats.by_education_level?.junior_secondary ?? 0,
      senior_secondary: stats.by_education_level?.senior_secondary ?? 0,
      totalEnrollment: stats.total_enrollment,
    };
  };

  const s = getStats();

  // ============================================================================
  // FORM HELPERS
  // ============================================================================

  const resetForm = () => {
    setFormData({ name: '', section: 0, academic_session: 0, term: 0, class_teacher: undefined, room_number: '', max_capacity: 30 });
    setErrors({});
  };

  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!formData.name.trim()) e.name = 'Classroom name is required';
    if (!formData.section) e.section = 'Section is required';
    if (!formData.academic_session) e.academic_session = 'Academic session is required';
    if (!formData.term) e.term = 'Term is required';
    if (!formData.max_capacity || formData.max_capacity <= 0) e.max_capacity = 'Valid capacity is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ============================================================================
  // CRUD
  // ============================================================================

  const handleAddClassroom = async () => {
    if (!validateForm()) return;
    try {
      await classroomService.createClassroom(formData);
      toast.success('Classroom created successfully');
      setShowAddModal(false);
      resetForm();
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create classroom');
    }
  };

  const handleEditClassroom = async () => {
    if (!validateForm() || !selectedClassroom) return;
    try {
      await classroomService.updateClassroom(selectedClassroom.id, formData);
      toast.success('Classroom updated successfully');
      setShowEditModal(false);
      setSelectedClassroom(null);
      resetForm();
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update classroom');
    }
  };

  const handleDeleteClassroom = async () => {
    if (!classroomToDelete) return;
    try {
      const response = await classroomService.deleteClassroom(classroomToDelete.id);
      toast.success(response?.message || 'Classroom deleted successfully');
      setShowDeleteModal(false);
      setClassroomToDelete(null);
      await loadData();
    } catch (error: any) {
      toast.error('Failed to delete classroom');
    }
  };

  const openEditModal = (classroom: Classroom) => {
    setSelectedClassroom(classroom);
    setFormData({
      name: classroom.name,
      section: classroom.section,               // FK id
      academic_session: classroom.academic_session, // FK id
      term: classroom.term,                      // FK id
      class_teacher: classroom.class_teacher ?? undefined, // FK id
      room_number: classroom.room_number ?? '',
      max_capacity: classroom.max_capacity,
    });
    setShowEditModal(true);
  };

  // ============================================================================
  // LOADING
  // ============================================================================

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl p-8 flex flex-col items-center`}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
          <p className={isDarkMode ? 'text-slate-300' : 'text-gray-600'}>Loading classrooms…</p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const cardBg = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100';
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-gray-500';
  const inputCls = `w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
    isDarkMode ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-gray-200 text-gray-900'
  }`;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Classroom Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage classrooms across all educational levels</p>
          </div>
          <button onClick={() => { resetForm(); setShowAddModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
            <Plus size={16} /> Add Classroom
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          {[
            { label: 'Total',            value: s.total,            icon: School,      color: 'blue'   },
            { label: 'Active',           value: s.active,           icon: Check,       color: 'green'  },
            { label: 'Nursery',          value: s.nursery,          icon: Baby,        color: 'pink'   },
            { label: 'Primary',          value: s.primary,          icon: BookOpen,    color: 'blue'   },
            { label: 'Junior Sec.',      value: s.junior_secondary,  icon: School,      color: 'indigo' },
            { label: 'Senior Sec.',      value: s.senior_secondary,  icon: GraduationCap, color: 'purple' },
            { label: 'Total Students',   value: s.totalEnrollment,  icon: Users,       color: 'orange' },
          ].map((stat, i) => (
            <div key={i} className={`${cardBg} rounded-xl p-4 shadow-lg border`}>
              <div className="flex flex-col items-center text-center">
                <div className={`p-2 rounded-full mb-2 bg-${stat.color}-100 text-${stat.color}-600`}>
                  <stat.icon size={20} />
                </div>
                <p className={`text-xs ${textSecondary} mb-1`}>{stat.label}</p>
                <p className={`text-xl font-bold ${textPrimary}`}>{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search, Filter, View Toggle */}
        <div className={`${cardBg} rounded-xl p-6 shadow-lg border mb-8`}>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className={`absolute left-3 top-3 ${textSecondary}`} size={20} />
              <input
                type="text"
                placeholder="Search by name, section, teacher, or room…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${inputCls} pl-10`}
              />
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className="relative">
                <Filter className={`absolute left-3 top-3 ${textSecondary}`} size={16} />
                {/*
                  FIXED: option values now use API values (NURSERY, PRIMARY, etc.)
                  Old code used lowercase 'nursery'/'primary'/'secondary' which never matched
                  classroom.education_level from the API.
                  Also added JUNIOR_SECONDARY and SENIOR_SECONDARY separately —
                  old code combined them as 'secondary' which doesn't exist as an API value.
                */}
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value as EducationLevelType | 'all')}
                  className={`${inputCls} pl-9 w-auto`}
                >
                  <option value="all">All Levels</option>
                  <option value="NURSERY">Nursery</option>
                  <option value="PRIMARY">Primary</option>
                  <option value="JUNIOR_SECONDARY">Junior Secondary</option>
                  <option value="SENIOR_SECONDARY">Senior Secondary</option>
                </select>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className={`${inputCls} w-auto`}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <div className="flex border rounded-lg overflow-hidden">
                {(['grid', 'list'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-3 transition-colors ${
                      viewMode === mode ? 'bg-blue-600 text-white' : isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {mode === 'grid' ? <Grid3X3 size={20} /> : <List size={20} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Grid View */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClassrooms.map((classroom) => (
              <div key={classroom.id} className={`${cardBg} rounded-xl shadow-lg border overflow-hidden hover:shadow-xl transition-all duration-300 hover:scale-105`}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {/* getLevelColor now uses correct EducationLevelType values */}
                      <div className={`p-2 rounded-lg border ${getLevelColor(classroom.education_level, isDarkMode)}`}>
                        {getLevelIcon(classroom.education_level)}
                      </div>
                      <div>
                        <h3 className={`text-lg font-bold ${textPrimary}`}>{classroom.name}</h3>
                        {/* section_name = serializer-computed from section FK */}
                        <p className="text-blue-600 font-medium text-sm">{classroom.section_name}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${classroom.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {classroom.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    {/* class_teacher_name = serializer-computed from class_teacher FK */}
                    <div className={`flex items-center ${textSecondary}`}>
                      <UserCheck size={14} className="mr-2 flex-shrink-0" />
                      <span className="text-sm truncate">{classroom.class_teacher_name || 'No teacher assigned'}</span>
                    </div>
                    <div className={`flex items-center ${textSecondary}`}>
                      <MapPin size={14} className="mr-2 flex-shrink-0" />
                      <span className="text-sm truncate">{classroom.room_number || 'No room assigned'}</span>
                    </div>
                    <div className={`flex items-center ${textSecondary}`}>
                      <Users size={14} className="mr-2 flex-shrink-0" />
                      <span className="text-sm">{classroom.current_enrollment}/{classroom.max_capacity} students</span>
                    </div>
                    <div className={`flex items-center ${textSecondary}`}>
                      <Calendar size={14} className="mr-2 flex-shrink-0" />
                      {/* academic_session_name and term_name = serializer-computed from FKs */}
                      <span className="text-sm truncate">{classroom.academic_session_name} — {classroom.term_name}</span>
                    </div>
                    <div className={`flex items-center ${textSecondary}`}>
                      <BookOpen size={14} className="mr-2 flex-shrink-0" />
                      {/* grade_level_name = serializer-computed from section→grade_level FK */}
                      <span className="text-sm">{classroom.grade_level_name}</span>
                    </div>
                  </div>

                  {/* Enrollment bar */}
                  <div className="mb-4">
                    <div className={`flex justify-between text-xs ${textSecondary} mb-1`}>
                      <span>Enrollment</span>
                      <span>{Math.round(classroom.enrollment_percentage)}%</span>
                    </div>
                    <div className={`w-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'} rounded-full h-2`}>
                      <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${classroom.enrollment_percentage}%` }} />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => { setSelectedClassroom(classroom); setShowViewModal(true); }} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1">
                      <Eye size={14} /> View
                    </button>
                    <button onClick={() => openEditModal(classroom)} className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1">
                      <Edit3 size={14} /> Edit
                    </button>
                    <button onClick={() => { setClassroomToDelete(classroom); setShowDeleteModal(true); }} className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className={`${cardBg} rounded-xl shadow-lg border overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={isDarkMode ? 'bg-slate-700' : 'bg-gray-50'}>
                  <tr>
                    {['Classroom', 'Level', 'Teacher', 'Capacity', 'Status', 'Actions'].map((h) => (
                      <th key={h} className={`px-6 py-3 text-left text-xs font-medium ${textSecondary} uppercase tracking-wider`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700 bg-slate-800' : 'divide-gray-200 bg-white'}`}>
                  {filteredClassrooms.map((classroom) => (
                    <tr key={classroom.id} className={isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-50'}>
                      <td className="px-6 py-4">
                        <div className={`text-sm font-medium ${textPrimary}`}>{classroom.name}</div>
                        {/* grade_level_name = section → grade_level → name (serializer-computed) */}
                        <div className="text-sm text-blue-600">{classroom.grade_level_name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`flex items-center gap-2`}>
                          <div className={`p-1 rounded border ${getLevelColor(classroom.education_level, isDarkMode)}`}>
                            {getLevelIcon(classroom.education_level)}
                          </div>
                          <span className={`text-sm ${textSecondary}`}>
                            {EDUCATION_LEVEL_LABELS[classroom.education_level as EducationLevelType] ?? classroom.education_level}
                          </span>
                        </div>
                      </td>
                      <td className={`px-6 py-4 text-sm ${textSecondary}`}>
                        {/* class_teacher_name = serializer-computed from class_teacher FK */}
                        {classroom.class_teacher_name || 'Not Assigned'}
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-sm ${textSecondary}`}>{classroom.current_enrollment}/{classroom.max_capacity}</div>
                        <div className={`w-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'} rounded-full h-1 mt-1`}>
                          <div className="bg-blue-600 h-1 rounded-full" style={{ width: `${classroom.enrollment_percentage}%` }} />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${classroom.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {classroom.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => { setSelectedClassroom(classroom); setShowViewModal(true); }} className="text-blue-600 hover:text-blue-900"><Eye size={16} /></button>
                          <button onClick={() => openEditModal(classroom)} className="text-green-600 hover:text-green-900"><Edit3 size={16} /></button>
                          <button onClick={() => { setClassroomToDelete(classroom); setShowDeleteModal(true); }} className="text-red-600 hover:text-red-900"><Trash2 size={16} /></button>
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
            <School size={48} className={`mx-auto ${textSecondary} mb-4`} />
            <p className={`text-lg ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>No classrooms found.</p>
            <p className={`text-sm mt-2 ${textSecondary}`}>Try adjusting your search or filters.</p>
          </div>
        )}

        {/* ================================================================
            ADD / EDIT MODAL
        ================================================================ */}
        {(showAddModal || showEditModal) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className={`text-2xl font-bold ${textPrimary}`}>
                  {showAddModal ? 'Add New Classroom' : 'Edit Classroom'}
                </h2>
                <button onClick={() => { setShowAddModal(false); setShowEditModal(false); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={24} className={textSecondary} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${textPrimary}`}>Classroom Name *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={`${inputCls} ${errors.name ? 'border-red-500' : ''}`} placeholder="e.g., Primary 4A, SS2 Science" />
                  {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
                </div>

                {/*
                  Section dropdown — value is section FK id (number).
                  section_name shown as label is the serializer-computed display field.
                  section.grade_level_name is derived from the section's grade_level FK.
                */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${textPrimary}`}>Section *</label>
                  <select value={formData.section} onChange={(e) => setFormData({ ...formData, section: Number(e.target.value) })} className={`${inputCls} ${errors.section ? 'border-red-500' : ''}`}>
                    <option value={0}>Select Section</option>
                    {dropdownData.sections.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.grade_level_name ?? `Grade ${s.grade_level}`})
                      </option>
                    ))}
                  </select>
                  {errors.section && <p className="text-red-500 text-sm mt-1">{errors.section}</p>}
                </div>

                {/* academic_session FK id */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${textPrimary}`}>Academic Session *</label>
                  <select value={formData.academic_session} onChange={(e) => setFormData({ ...formData, academic_session: Number(e.target.value) })} className={`${inputCls} ${errors.academic_session ? 'border-red-500' : ''}`}>
                    <option value={0}>Select Academic Session</option>
                    {dropdownData.academicYears.map((y: any) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                  {errors.academic_session && <p className="text-red-500 text-sm mt-1">{errors.academic_session}</p>}
                </div>

                {/* term FK id */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${textPrimary}`}>Term *</label>
                  <select value={formData.term} onChange={(e) => setFormData({ ...formData, term: Number(e.target.value) })} className={`${inputCls} ${errors.term ? 'border-red-500' : ''}`}>
                    <option value={0}>Select Term</option>
                    {dropdownData.terms.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name_display ?? t.name}</option>
                    ))}
                  </select>
                  {errors.term && <p className="text-red-500 text-sm mt-1">{errors.term}</p>}
                </div>

                {/* class_teacher FK id (optional) */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${textPrimary}`}>Class Teacher</label>
                  <select value={formData.class_teacher ?? ''} onChange={(e) => setFormData({ ...formData, class_teacher: e.target.value ? Number(e.target.value) : undefined })} className={inputCls}>
                    <option value="">Select Teacher (Optional)</option>
                    {dropdownData.teachers.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.full_name || `${t.first_name} ${t.last_name}`}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${textPrimary}`}>Room Number</label>
                  <input type="text" value={formData.room_number} onChange={(e) => setFormData({ ...formData, room_number: e.target.value })} className={inputCls} placeholder="e.g., Room 101" />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${textPrimary}`}>Max Capacity *</label>
                  <input type="number" value={formData.max_capacity} onChange={(e) => setFormData({ ...formData, max_capacity: Number(e.target.value) })} className={`${inputCls} ${errors.max_capacity ? 'border-red-500' : ''}`} min="1" max="100" />
                  {errors.max_capacity && <p className="text-red-500 text-sm mt-1">{errors.max_capacity}</p>}
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <button onClick={() => { setShowAddModal(false); setShowEditModal(false); resetForm(); }} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                <button onClick={showAddModal ? handleAddClassroom : handleEditClassroom} className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800">
                  {showAddModal ? <><Plus size={16} /> Add Classroom</> : <><Save size={16} /> Save Changes</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            DELETE MODAL
        ================================================================ */}
        {showDeleteModal && classroomToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl p-6 max-w-md w-full`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-xl font-bold ${textPrimary}`}>Confirm Deletion</h2>
                <button onClick={() => setShowDeleteModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={24} className={textSecondary} /></button>
              </div>
              <p className={`${isDarkMode ? 'text-slate-300' : 'text-gray-700'} mb-6`}>
                Delete "{classroomToDelete.name}"? This cannot be undone.
              </p>
              <div className="flex justify-end gap-4">
                <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={handleDeleteClassroom} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            VIEW MODAL (simple inline — no student roster here)
        ================================================================ */}
        {showViewModal && selectedClassroom && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className={`text-2xl font-bold ${textPrimary}`}>Classroom Details</h2>
                <button onClick={() => setShowViewModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={24} className={textSecondary} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { label: 'Name',              value: selectedClassroom.name },
                  // section_name = serializer-computed from section FK
                  { label: 'Section',           value: selectedClassroom.section_name },
                  // education_level = section → grade_level → education_level (computed)
                  { label: 'Education Level',   value: EDUCATION_LEVEL_LABELS[selectedClassroom.education_level as EducationLevelType] ?? selectedClassroom.education_level },
                  // grade_level_name = serializer-computed from section → grade_level FK
                  { label: 'Grade',             value: selectedClassroom.grade_level_name },
                  // academic_session_name = serializer-computed from academic_session FK
                  { label: 'Academic Session',  value: selectedClassroom.academic_session_name },
                  // term_name = serializer-computed from term FK
                  { label: 'Term',              value: selectedClassroom.term_name },
                  // class_teacher_name = serializer-computed from class_teacher FK
                  { label: 'Class Teacher',     value: selectedClassroom.class_teacher_name || 'Not Assigned' },
                  { label: 'Room',              value: selectedClassroom.room_number || 'Not Assigned' },
                  { label: 'Max Capacity',      value: String(selectedClassroom.max_capacity) },
                  { label: 'Enrolled',          value: String(selectedClassroom.current_enrollment) },
                  { label: 'Available Spots',   value: String(selectedClassroom.available_spots) },
                  { label: 'Status',            value: selectedClassroom.is_active ? 'ACTIVE' : 'INACTIVE' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className={`text-sm ${textSecondary}`}>{label}:</p>
                    <p className={`text-lg font-semibold ${textPrimary}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default EnhancedClassroom;