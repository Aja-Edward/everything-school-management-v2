import React, { useState } from 'react';
import { 
  School, Plus, Search, Edit3, Trash2, Eye, Grid3X3, List, UserPlus
} from 'lucide-react';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import { Classroom, EducationLevelType,  Subject, ClassroomTeacherAssignment, UpdateClassroomData, CreateClassroomData } from '@/services/ClassroomService';
import { useClassroom } from '@/contexts/ClassroomContext';
import { toast } from 'react-toastify';
import ClassroomViewModal from './ClassroomViewModal';

interface ClassroomManagementProps {}

const ClassroomManagement: React.FC<ClassroomManagementProps> = () => {
  const { theme } = useGlobalTheme();
  const isDark = theme === 'dark';  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showAssignTeacherModal, setShowAssignTeacherModal] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  
  // Form states - Fixed type consistency
  const [formData, setFormData] = useState({
    name: '',
    grade_level: '', // Keep as string for form handling
    section: 0,
    academic_session: 0,
    term: 0,
    class_teacher: undefined as number | undefined,
    room_number: '',
    max_capacity: 30,
  });

  // Additional data for forms

  
  // Assignment form - Complete interface implementation
  const [assignmentData, setAssignmentData] = useState({
    teacher_id: '',
    subject_id: '',
    is_primary_teacher: false,
    periods_per_week: 1
  });

  // Available subjects for selected teacher
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  
  // Multiple subject selection
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([]);
  
 const {
  filteredClassrooms,
  sections,   
  terms,      
  teachers,
  subjects,
  gradeLevels,
  academicSessions,
  loading,
  error,
  searchTerm,
  levelFilter,
  statusFilter,
  setSearchTerm,
  setLevelFilter,
  setStatusFilter,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  createTeacherAssignment,
  deleteTeacherAssignment,
  loadSections,
  loadClassrooms, 
  loadTerms,
} = useClassroom();
  
  
  // View toggle
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  // Load data
  
  // Filter classrooms
  

  // Handle form submission with proper validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      toast.error('Classroom name is required');
      return;
    }
    
    if (!formData.section || !formData.academic_session || !formData.term) {
      toast.error('Please select all required fields');
      return;
    }

    try {
      if (selectedClassroom) {
        // Update existing classroom
        const updateData: UpdateClassroomData = {
          name: formData.name.trim(),
          section: formData.section,
          academic_session: formData.academic_session,
          term: formData.term,
          class_teacher: formData.class_teacher,
          room_number: formData.room_number.trim(),
          max_capacity: formData.max_capacity,
        };
        await updateClassroom(selectedClassroom.id, updateData);
       
      } else {
        // Create new classroom
        const createData: CreateClassroomData = {
          name: formData.name.trim(),
          section: formData.section,
          academic_session: formData.academic_session,
          term: formData.term,
          class_teacher: formData.class_teacher,
          room_number: formData.room_number.trim(),
          max_capacity: formData.max_capacity,
        };
        await createClassroom(createData);
      }
      
      resetForm();
      setShowAddModal(false);
      setShowEditModal(false);
  
    } catch (err: any) {
      toast.error(err.message || 'Operation failed');
    }
  };

  // Handle teacher assignment
  const handleAssignTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassroom) return;
    
    // Validation
    if (!assignmentData.teacher_id) {
      toast.error('Please select a teacher');
      return;
    }
    
    if (selectedSubjects.length === 0) {
      toast.error('Please select at least one subject');
      return;
    }
    
    try {
      const assignmentPromises = selectedSubjects.map(subjectId =>
        createTeacherAssignment({
          classroom_id: selectedClassroom.id,
          teacher_id: parseInt(assignmentData.teacher_id),
          subject_id: subjectId,
          is_primary_teacher: assignmentData.is_primary_teacher,
          periods_per_week: assignmentData.periods_per_week
        })
      );
      
      await Promise.all(assignmentPromises);
      toast.success(`Teacher assigned to ${selectedSubjects.length} subject(s) successfully`);
      
      resetAssignmentForm();
      setShowAssignTeacherModal(false);
     
    } catch (err: any) {
      toast.error(err.message || 'Assignment failed');
    }
  };

  // Handle remove teacher assignment
  const handleRemoveAssignment = async (assignmentId: number) => {
    if (!selectedClassroom) return;
    
    if (!window.confirm('Are you sure you want to remove this teacher assignment?')) {
      return;
    }
    
    try {
      await deleteTeacherAssignment(assignmentId);
      toast.success('Teacher assignment removed successfully');

    } catch (err: any) {
      toast.error(err.message || 'Failed to remove assignment');
    }
  };

  // Handle delete classroom
  const handleDeleteClassroom = async (classroom: Classroom) => {
    if (!window.confirm(`Are you sure you want to delete the classroom "${classroom.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteClassroom(classroom.id);

    } catch (err: any) {
      toast.error(err.message || 'Failed to delete classroom');
    }
  };

  // Load sections for a specific grade level
  const loadSectionsForGradeLevel = async (gradeLevelId: number) => {
  await loadSections(gradeLevelId);
};

  // Load terms for a specific academic year
  const loadTermsForAcademicSession = async (academicSessionId: number) => {
  await loadTerms(academicSessionId);
};

  // Get available subjects for selected teacher
  const getAvailableSubjectsForTeacher = async (teacherId: string) => {
    if (!teacherId) {
      setAvailableSubjects([]);
      setSelectedSubjects([]);
      return;
    }

    try {
      const teacher = teachers.find(t => t.id.toString() === teacherId);
      
      if (teacher?.assigned_subjects) {
        const teacherSubjects = teacher.assigned_subjects.map(assignedSubject => {
          return subjects.find(s => s.id === assignedSubject.id);
        }).filter(Boolean) as Subject[];
        
        setAvailableSubjects(teacherSubjects);
        setSelectedSubjects([]);
      } else {
        setAvailableSubjects([]);
        setSelectedSubjects([]);
      }
    } catch (err: any) {
      console.error('Error getting available subjects:', err);
      setAvailableSubjects([]);
      setSelectedSubjects([]);
    }
  };

  // Helper functions
  const resetForm = () => {
    setFormData({
      name: '',
      grade_level: '',
      section: 0,
      academic_session: 0,
      term: 0,
      class_teacher: undefined,
      room_number: '',
      max_capacity: 30,
    });
    
  };

  const resetAssignmentForm = () => {
    setAssignmentData({ 
      teacher_id: '', 
      subject_id: '', 
      is_primary_teacher: false, 
      periods_per_week: 1 
    });
    setAvailableSubjects([]);
    setSelectedSubjects([]);
  };

  const handleSelectAll = () => {
    if (selectedSubjects.length === availableSubjects.length) {
      setSelectedSubjects([]);
    } else {
      setSelectedSubjects(availableSubjects.map(subject => subject.id));
    }
  };

  const handleSubjectToggle = (subjectId: number) => {
    setSelectedSubjects(prev => 
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const getUniqueTeacherCount = (assignments: ClassroomTeacherAssignment[]) => {
    if (!assignments || assignments.length === 0) return 0;
    return new Set(assignments.map(assignment => assignment.teacher)).size;
  };


  // Theme classes
  const themeClasses = {
    bgPrimary: isDark ? 'bg-gray-900' : 'bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100',
    bgCard: isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100',
    bgSecondary: isDark ? 'bg-gray-700' : 'bg-gray-50',
    textPrimary: isDark ? 'text-gray-100' : 'text-gray-900',
    textSecondary: isDark ? 'text-gray-300' : 'text-gray-600',
    borderPrimary: isDark ? 'border-gray-700' : 'border-gray-200',
  };

  if (loading.classrooms) {
    return (
      <div className={`min-h-screen ${themeClasses.bgPrimary} p-6`}>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className={themeClasses.textSecondary}>Loading classrooms...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${themeClasses.bgPrimary} p-6`}>
        <div className="text-center py-12">
          <div className="text-red-500 mb-4">
            <School size={48} className="mx-auto mb-2" />
            <p className="text-lg font-semibold">Failed to load classroom data</p>
            <p className="text-sm">{error}</p>
          </div>
          <button
            onClick={loadClassrooms}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${themeClasses.bgPrimary} p-6`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className={`text-4xl font-bold ${themeClasses.textPrimary} mb-2`}>
                Classroom Management
              </h1>
              <p className={themeClasses.textSecondary}>
                Manage classrooms and teacher assignments
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                <Plus size={20} />
                Add Classroom
              </button>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-lg mb-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">i</span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">Teacher Assignments</h3>
              <p className="text-sm text-blue-700">
                Use the "Assign Teacher" button on each classroom to assign teachers to specific subjects and classrooms.
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className={`${themeClasses.bgCard} rounded-xl p-6 shadow-lg border mb-8`}>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className={`absolute left-3 top-3 ${themeClasses.textSecondary}`} size={20} />
              <input
                type="text"
                placeholder="Search classrooms..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
              />
            </div>
            <div className="flex gap-4 flex-wrap">
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as EducationLevelType | 'all')}
                className={`px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
              >
                <option value="all">All Levels</option>
                <option value="NURSERY">Nursery</option>
                <option value="PRIMARY">Primary</option>
                <option value="JUNIOR_SECONDARY">Junior Secondary</option>
                <option value="SENIOR_SECONDARY">Senior Secondary</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className={`px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className={`${themeClasses.bgCard} rounded-xl p-4 shadow-lg border mb-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${themeClasses.textSecondary}`}>View Mode:</span>
              <div className={`flex ${themeClasses.bgSecondary} rounded-lg p-1`}>
                <button
                  onClick={() => setViewMode('card')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    viewMode === 'card'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : `${themeClasses.textSecondary} hover:text-gray-800`
                  }`}
                >
                  <Grid3X3 size={16} />
                  Cards
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    viewMode === 'list'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : `${themeClasses.textSecondary} hover:text-gray-800`
                  }`}
                >
                  <List size={16} />
                  List
                </button>
              </div>
            </div>
            <div className={`text-sm ${themeClasses.textSecondary}`}>
              {filteredClassrooms.length} classroom{filteredClassrooms.length !== 1 ? 's' : ''} found
            </div>
          </div>
        </div>

        {/* Classrooms Display */}
        {viewMode === 'card' ? (
          // Card View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClassrooms.map((classroom) => (
              <div key={classroom.id} className={`${themeClasses.bgCard} rounded-xl p-6 shadow-lg border transition-all duration-300 hover:shadow-xl`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-xl font-bold ${themeClasses.textPrimary}`}>
                    {classroom.name}
                  </h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    classroom.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {classroom.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                
                <div className="space-y-2 mb-4">
                  <p className={themeClasses.textSecondary}>
                    <strong>Level:</strong> {classroom.grade_level_name}
                  </p>
                  <p className={themeClasses.textSecondary}>
                    <strong>Section:</strong> {classroom.section_name}
                  </p>
                  <p className={themeClasses.textSecondary}>
                    <strong>Room:</strong> {classroom.room_number || 'Not assigned'}
                  </p>
                  <p className={themeClasses.textSecondary}>
                    <strong>Capacity:</strong> {classroom.current_enrollment}/{classroom.max_capacity}
                  </p>
                  <p className={themeClasses.textSecondary}>
                    <strong>Assigned Teachers:</strong> 
                    {classroom.teacher_assignments && classroom.teacher_assignments.length > 0 ? (
                      <span className="text-green-600 font-medium">
                        {getUniqueTeacherCount(classroom.teacher_assignments)} teacher{getUniqueTeacherCount(classroom.teacher_assignments) !== 1 ? 's' : ''} assigned
                      </span>
                    ) : (
                      <span className="text-red-600 font-medium">Not assigned</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      setSelectedClassroom(classroom);
                      setShowViewModal(true);
                    }}
                    className="p-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-all duration-200 hover:scale-110 group relative"
                    title="View Details"
                  >
                    <Eye size={18} />
                    <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                      View
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedClassroom(classroom);
                      resetAssignmentForm();
                      setShowAssignTeacherModal(true);
                    }}
                    className="p-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-all duration-200 hover:scale-110 group relative"
                    title="Assign Teacher"
                  >
                    <UserPlus size={18} />
                    <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                      Assign
                    </span>
                  </button>
                  <button
                    onClick={async () => {
                      setSelectedClassroom(classroom);
                      
                      // Set initial form data with correct types
                      const initialFormData = {
                        name: classroom.name,
                        grade_level: '', // Will be set after loading sections
                        section: classroom.section,
                        academic_session: classroom.academic_session,
                        term: classroom.term,
                        class_teacher: classroom.class_teacher || undefined,
                        room_number: classroom.room_number,
                        max_capacity: classroom.max_capacity,
                     
                      };
                      
                      setFormData(initialFormData);
                      
                      // Load terms for the academic year
                      if (classroom.academic_session) {
                        await loadTermsForAcademicSession(classroom.academic_session);
                      }
                      
                      // Find the grade level for this section and load sections
                      const section = sections.find(s => s.id === classroom.section);
                      if (section?.grade_level) {
                        initialFormData.grade_level = section.grade_level.toString();
                        await loadSectionsForGradeLevel(section.grade_level);
                        setFormData(initialFormData);
                      }
                      
                      setShowEditModal(true);
                    }}
                    className="p-3 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg transition-all duration-200 hover:scale-110 group relative"
                    title="Edit Classroom"
                  >
                    <Edit3 size={18} />
                    <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                      Edit
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeleteClassroom(classroom)}
                    className="p-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-all duration-200 hover:scale-110 group relative"
                    title="Delete Classroom"
                  >
                    <Trash2 size={18} />
                    <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                      Delete
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // List View
          <div className={`${themeClasses.bgCard} rounded-xl shadow-lg border overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${themeClasses.bgSecondary} border-b ${themeClasses.borderPrimary}`}>
                  <tr>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${themeClasses.textPrimary}`}>Classroom</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${themeClasses.textPrimary}`}>Level</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${themeClasses.textPrimary}`}>Section</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${themeClasses.textPrimary}`}>Stream</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${themeClasses.textPrimary}`}>Room</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${themeClasses.textPrimary}`}>Capacity</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${themeClasses.textPrimary}`}>Teachers</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${themeClasses.textPrimary}`}>Status</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${themeClasses.textPrimary}`}>Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${themeClasses.borderPrimary}`}>
                  {filteredClassrooms.map((classroom) => (
                    <tr key={classroom.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className={`font-medium ${themeClasses.textPrimary}`}>
                          {classroom.name}
                        </div>
                      </td>
                      <td className={`px-6 py-4 text-sm ${themeClasses.textSecondary}`}>
                        {classroom.grade_level_name}
                      </td>
                      <td className={`px-6 py-4 text-sm ${themeClasses.textSecondary}`}>
                        {classroom.section_name}
                      </td>
                      <td className={`px-6 py-4 text-sm ${themeClasses.textSecondary}`}>
                        {classroom.room_number || 'Not assigned'}
                      </td>
                      <td className={`px-6 py-4 text-sm ${themeClasses.textSecondary}`}>
                        {classroom.current_enrollment}/{classroom.max_capacity}
                      </td>
                      <td className={`px-6 py-4 text-sm ${themeClasses.textSecondary}`}>
                        {classroom.teacher_assignments && classroom.teacher_assignments.length > 0 ? (
                          <span className="text-green-600 font-medium">
                            {getUniqueTeacherCount(classroom.teacher_assignments)} assigned
                          </span>
                        ) : (
                          <span className="text-red-600 font-medium">None</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          classroom.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {classroom.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedClassroom(classroom);
                              setShowViewModal(true);
                            }}
                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedClassroom(classroom);
                              resetAssignmentForm();
                              setShowAssignTeacherModal(true);
                            }}
                            className="p-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors"
                            title="Assign Teacher"
                          >
                            <UserPlus size={14} />
                          </button>
                          <button
                            onClick={async () => {
                              setSelectedClassroom(classroom);
                              
                              // Set initial form data
                              const initialFormData = {
                                name: classroom.name,
                                grade_level: '', // Will be set after loading sections
                                section: classroom.section,
                                academic_session: classroom.academic_session,
                                term: classroom.term,
                                class_teacher: classroom.class_teacher || undefined,
                                room_number: classroom.room_number,
                                max_capacity: classroom.max_capacity,
                              };
                              
                              setFormData(initialFormData);
                              
                              // Load terms for the academic year
                              if (classroom.academic_session) {
                                await loadTermsForAcademicSession(classroom.academic_session);
                              }
                              
                              // Find the grade level for this section and load sections
                              const section = sections.find(s => s.id === classroom.section);
                              if (section?.grade_level) {
                                initialFormData.grade_level = section.grade_level.toString();
                                await loadSectionsForGradeLevel(section.grade_level);
                                setFormData(initialFormData);
                              }
                              
                              setShowEditModal(true);
                            }}
                            className="p-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg transition-colors"
                            title="Edit Classroom"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteClassroom(classroom)}
                            className="p-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors"
                            title="Delete Classroom"
                          >
                            <Trash2 size={14} />
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

        {filteredClassrooms.length === 0 && !loading.classrooms && (
          <div className="text-center py-12">
            <School size={48} className={`mx-auto ${themeClasses.textSecondary} mb-4`} />
            <p className={themeClasses.textSecondary}>No classrooms found</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bgCard} rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
            <h2 className={`text-2xl font-bold mb-4 ${themeClasses.textPrimary}`}>
              {showAddModal ? 'Add Classroom' : 'Edit Classroom'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
                    placeholder="e.g., Primary 1A, SS1A"
                    required
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                    Room Number
                  </label>
                  <input
                    type="text"
                    value={formData.room_number}
                    onChange={(e) => setFormData({...formData, room_number: e.target.value})}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
                    placeholder="e.g., 101, Lab 1"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                    Max Capacity *
                  </label>
                  <input
                    type="number"
                    value={formData.max_capacity}
                    onChange={(e) => setFormData({...formData, max_capacity: parseInt(e.target.value) || 30})}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
                    min="1"
                    max="100"
                    required
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                    Academic Year *
                  </label>
                  <select
                    value={formData.academic_session}
                    onChange={(e) => {
                      const academicYearId = parseInt(e.target.value) || 0;
                      setFormData({...formData, academic_session: academicYearId, term: 0});
                      // Load terms for selected academic year
                      if (academicYearId) {
                        loadTermsForAcademicSession(academicYearId);
                      } 
                    }}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
                    required
                  >
                    <option value="">Select Academic Year</option>
                    {academicSessions.map(year => (
                      <option key={year.id} value={year.id}>
                        {year.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                    Term *
                  </label>
                  <select
                    value={formData.term}
                    onChange={(e) => setFormData({...formData, term: parseInt(e.target.value) || 0})}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
                    required
                    disabled={!formData.academic_session || terms.length === 0}
                  >
                    <option value="">Select Term</option>
                    {terms.map(term => (
                      <option key={term.id} value={term.id}>
                        {term.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                    Grade Level *
                  </label>
                  <select
                    value={formData.grade_level || ''}
                    onChange={(e) => {
                      const gradeLevelId = e.target.value;
                      setFormData({...formData, grade_level: gradeLevelId, section: 0});
                      // Load sections for selected grade level
                      if (gradeLevelId) {
                        loadSectionsForGradeLevel(parseInt(gradeLevelId));
                      } 
                    }}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
                    required
                  >
                    <option value="">Select Grade Level</option>
                    {gradeLevels.map(level => (
                      <option key={level.id} value={level.id}>
                        {level.name} ({level.education_level})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                    Section *
                  </label>
                  <select
                    value={formData.section}
                    onChange={(e) => setFormData({...formData, section: parseInt(e.target.value) || 0})}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
                    required
                    disabled={!formData.grade_level || sections.length === 0}
                  >
                    <option value="">Select Section</option>
                    {sections.map(section => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                    Class Teacher
                  </label>
                  <select
                    value={formData.class_teacher || ''}
                    onChange={(e) => setFormData({...formData, class_teacher: e.target.value ? parseInt(e.target.value) : undefined})}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
                  >
                    <option value="">Select Class Teacher (Optional)</option>
                    {teachers.map(teacher => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.full_name || `${teacher.first_name} ${teacher.last_name}`} - {teacher.employee_id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className={`flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors ${themeClasses.borderPrimary} ${themeClasses.textPrimary}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {showAddModal ? 'Create Classroom' : 'Update Classroom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Teacher Modal */}
      {showAssignTeacherModal && selectedClassroom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bgCard} rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto`}>
            <h2 className={`text-2xl font-bold mb-4 ${themeClasses.textPrimary}`}>
              Assign Teacher to {selectedClassroom.name}
            </h2>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-700">
                <strong>Note:</strong> Only subjects assigned to the teacher in the teacher page will be available for selection.
                <span className="block mt-1">
                  <strong>Multiple Selection:</strong> You can select multiple subjects to assign to the teacher at once. Use "Select All" to assign all available subjects.
                </span>
              </p>
            </div>
            <form onSubmit={handleAssignTeacher} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                  Teacher *
                </label>
                <select
                  value={assignmentData.teacher_id}
                  onChange={(e) => {
                    const teacherId = e.target.value;
                    setAssignmentData({...assignmentData, teacher_id: teacherId, subject_id: ''});
                    getAvailableSubjectsForTeacher(teacherId);
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
                  required
                >
                  <option value="">Select Teacher</option>
                  {teachers.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.full_name || `${teacher.first_name} ${teacher.last_name}`} ({teacher.employee_id})
                      {teacher.assigned_subjects && teacher.assigned_subjects.length > 0 && 
                        ` - ${teacher.assigned_subjects.length} subjects`
                      }
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                  Subjects *
                  <span className="text-xs text-gray-500 ml-2">
                    ({selectedSubjects.length} selected)
                  </span>
                </label>
                
                <div className="space-y-2">
                  {availableSubjects.length > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <input
                        type="checkbox"
                        id="select-all"
                        checked={selectedSubjects.length === availableSubjects.length && availableSubjects.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                        Select All ({availableSubjects.length} subjects)
                      </label>
                    </div>
                  )}
                  
                  <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-2">
                    {availableSubjects.map(subject => (
                      <div key={subject.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`subject-${subject.id}`}
                          checked={selectedSubjects.includes(subject.id)}
                          onChange={() => handleSubjectToggle(subject.id)}
                          className="rounded border-gray-300"
                        />
                        <label htmlFor={`subject-${subject.id}`} className="text-sm cursor-pointer flex-1">
                          {subject.name} ({subject.code})
                        </label>
                      </div>
                    ))}
                  </div>
                  
                  {assignmentData.teacher_id && availableSubjects.length === 0 && (
                    <p className="text-sm text-red-600 mt-1">
                      This teacher has no subjects assigned. Please assign subjects in the teacher page first.
                    </p>
                  )}
                </div>
              </div>

              {/* Assignment configuration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.textPrimary}`}>
                    Periods per Week *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={assignmentData.periods_per_week}
                    onChange={(e) => setAssignmentData({
                      ...assignmentData, 
                      periods_per_week: parseInt(e.target.value) || 1
                    })}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${themeClasses.borderPrimary} ${themeClasses.textPrimary} bg-white`}
                    required
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is-primary-teacher"
                    checked={assignmentData.is_primary_teacher}
                    onChange={(e) => setAssignmentData({
                      ...assignmentData, 
                      is_primary_teacher: e.target.checked
                    })}
                    className="rounded border-gray-300 mr-2"
                  />
                  <label htmlFor="is-primary-teacher" className={`text-sm font-medium cursor-pointer ${themeClasses.textPrimary}`}>
                    Primary Teacher
                  </label>
                </div>
              </div>
              
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignTeacherModal(false);
                    resetAssignmentForm();
                  }}
                  className={`flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors ${themeClasses.borderPrimary} ${themeClasses.textPrimary}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  disabled={!assignmentData.teacher_id || selectedSubjects.length === 0}
                >
                  Assign Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Modal */}
      <ClassroomViewModal
        classroom={selectedClassroom}
        isOpen={showViewModal}
        onClose={() => setShowViewModal(false)}
        onRemoveAssignment={handleRemoveAssignment}
      />
    </div>
  );
};

export default ClassroomManagement;