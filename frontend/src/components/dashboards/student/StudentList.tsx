import { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Plus,  
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Download,
  User,
  X,
  AlertCircle
} from 'lucide-react';
import StudentService, { StudentService as StudentServiceClass, Student, CreateStudentData, UpdateStudentData, Parent } from '@/services/StudentService';
import { API_BASE_URL } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

// Helper for debounce
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Add constants for education level and class choices
const EDUCATION_LEVEL_CHOICES = [
  { value: 'NURSERY', label: 'Nursery' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'JUNIOR_SECONDARY', label: 'Junior Secondary' },
  { value: 'SENIOR_SECONDARY', label: 'Senior Secondary' },
  { value: 'SECONDARY', label: 'Secondary (Legacy)' },
];
const CLASS_CHOICES = [
  // Nursery
  { value: 'PRE_NURSERY', label: 'Pre-nursery', level: 'NURSERY' },
  { value: 'NURSERY_1', label: 'Nursery 1', level: 'NURSERY' },
  { value: 'NURSERY_2', label: 'Nursery 2', level: 'NURSERY' },
  // Primary
  { value: 'PRIMARY_1', label: 'Primary 1', level: 'PRIMARY' },
  { value: 'PRIMARY_2', label: 'Primary 2', level: 'PRIMARY' },
  { value: 'PRIMARY_3', label: 'Primary 3', level: 'PRIMARY' },
  { value: 'PRIMARY_4', label: 'Primary 4', level: 'PRIMARY' },
  { value: 'PRIMARY_5', label: 'Primary 5', level: 'PRIMARY' },
  { value: 'PRIMARY_6', label: 'Primary 6', level: 'PRIMARY' },
  // Junior Secondary
  { value: 'JSS_1', label: 'Junior Secondary 1 (JSS1)', level: 'JUNIOR_SECONDARY' },
  { value: 'JSS_2', label: 'Junior Secondary 2 (JSS2)', level: 'JUNIOR_SECONDARY' },
  { value: 'JSS_3', label: 'Junior Secondary 3 (JSS3)', level: 'JUNIOR_SECONDARY' },
  // Senior Secondary
  { value: 'SS_1', label: 'Senior Secondary 1 (SS1)', level: 'SENIOR_SECONDARY' },
  { value: 'SS_2', label: 'Senior Secondary 2 (SS2)', level: 'SENIOR_SECONDARY' },
  { value: 'SS_3', label: 'Senior Secondary 3 (SS3)', level: 'SENIOR_SECONDARY' },
];

const StudentsComponent = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('Newest');
  const [selectAll, setSelectAll] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const navigate = useNavigate();
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [modalLoading, setModalLoading] = useState(false);
  const [deleteStudentId, setDeleteStudentId] = useState<number | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [streams, setStreams] = useState<any[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [educationLevelFilter, setEducationLevelFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');

  const debouncedSearch = useDebounce(searchTerm, 400);

  // Debug viewStudent state changes (commented out for production)
  // useEffect(() => {
  //   console.log('🔄 viewStudent state changed:', viewStudent);
  // }, [viewStudent]);
  // PDF Export Function
  const exportToPDF = async () => {
    try {
      // Temporary: Just show a message instead of generating PDF
      alert('PDF export functionality is temporarily disabled. Please use the browser print function instead.');
      return;
      
      // TODO: Implement proper PDF export when jsPDF issues are resolved
      // For now, users can use browser print (Ctrl+P) to save as PDF
    } catch (error) {
      console.log('Error generating PDF:', error);
      setError('Failed to generate PDF. Please use browser print function instead.');
    }
  };

  // Load streams for Senior Secondary students
  const loadStreams = useCallback(async () => {
    try {
      console.log('🔄 Loading streams...');
      const response = await fetch(`${API_BASE_URL}/classrooms/streams/`);
      console.log('📊 Streams response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Streams data:', data);
        setStreams(data.results || data);
        console.log('✅ Streams loaded successfully');
      } else {
        console.error('❌ Streams response not ok:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error loading streams:', error);
    }
  }, []);

  // Enhanced fetch students with profile picture debugging
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('authToken');
      console.log('🔍 Fetching students with token:', token ? 'Present' : 'Missing');
      
      const params: any = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (educationLevelFilter) params.education_level = educationLevelFilter;
      if (classFilter) params.student_class = classFilter;
      params.page = page;
      params.page_size = pageSize;
      
      console.log('🔍 Request params:', params);
      console.log('🔍 API base URL:', import.meta.env.VITE_API_URL || 'http://localhost:8000/api');
      
      const res = await StudentService.getStudents(params);
      
      console.log('✅ Students API Response:', res);
      
      const data = res;
      let studentsData: Student[] = [];
      
      if (Array.isArray(data)) {
        studentsData = data;
        setCount(data.length);
      } else {
        studentsData = data.results || [];
        setCount(data.count || 0);
      }

      // 🔍 Debug profile pictures specifically
      console.log('🖼️ Profile Picture Debug:');
      studentsData.forEach((student, index) => {
        console.log(`Student ${index + 1} (${student.full_name}):`);
        console.log(`  - ID: ${student.id}`);
        console.log(`  - Profile Picture: ${student.profile_picture}`);
        console.log(`  - Profile Picture Type: ${typeof student.profile_picture}`);
        console.log(`  - Full Student Object:`, student);
      });

      // Check if any students have profile pictures
      const studentsWithPictures = studentsData.filter(s => s.profile_picture);
      console.log(`📊 Students with profile pictures: ${studentsWithPictures.length}/${studentsData.length}`);
      
      // Apply client-side section filtering
      let filteredStudents = studentsData;
      if (sectionFilter) {
        filteredStudents = studentsData.filter(student => {
          const studentSection = student.classroom?.split(' ').pop();
          return studentSection === sectionFilter;
        });
      }
      
      setStudents(filteredStudents);
      
    } catch (err: any) {
      console.log('❌ Students fetch error:', err);
      console.log('❌ Error response:', err.response?.data);
      console.log('❌ Error status:', err.response?.status);
      
      if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to access student data.');
      } else if (err.response?.status === 404) {
        setError('Students endpoint not found. Check your API URL.');
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.message) {
        setError(err.message);
      } else {
        setError('Unknown error occurred');
      }
      
      setStudents([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, pageSize]);

  useEffect(() => {
    fetchStudents();
    loadStreams();
    setSelectAll(false);
    setSelectedStudents([]);
  }, [fetchStudents, loadStreams, educationLevelFilter, classFilter, sectionFilter]);

  const toggleStudentSelection = (id: number) => {
    setSelectedStudents(prev => 
      prev.includes(id) 
        ? prev.filter((studentId: number) => studentId !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectAll(!selectAll);
    if (!selectAll) {
      setSelectedStudents(students.map(s => s.id));
    } else {
      setSelectedStudents([]);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase();
  };

  // Enhanced profile picture rendering with debugging
  const renderProfilePicture = (student: Student) => {
    console.log(`🖼️ Rendering profile for ${student.full_name}:`, student.profile_picture);
    
    if (student.profile_picture) {
      // Check if it's a full URL or just a path
      const imageUrl = student.profile_picture.startsWith('http') 
        ? student.profile_picture 
        : `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}${student.profile_picture}`;
      
      console.log(`🖼️ Final image URL for ${student.full_name}:`, imageUrl);
      
      return (
        <img
          src={imageUrl}
          alt={student.full_name}
          className="w-10 h-10 rounded-full object-cover border"
          onError={(e) => {
            console.log(`❌ Failed to load image for ${student.full_name}:`, imageUrl);
            // Hide the broken image and show initials instead
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling?.classList.remove('hidden');
          }}
          onLoad={() => {
            console.log(`✅ Successfully loaded image for ${student.full_name}`);
          }}
        />
      );
    }
    
    return null;
  };

  const renderInitialsAvatar = (student: Student) => {
    return (
      <div className={`w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center ${student.profile_picture ? 'hidden' : ''}`}>
        <span className="text-sm font-medium text-white">
          {getInitials(student.full_name)}
        </span>
      </div>
    );
  };

  // Handler: View student details
  const handleViewStudent = async (studentId: number) => {
    setModalLoading(true);
    setViewError(null);
    setViewStudent(null); // Reset viewStudent to null initially
    
    try {
      const res = await StudentService.getStudent(studentId);
      
      if (res) {
        setViewStudent(res);
        setShowViewModal(true);
      } else {
        setViewError('No data received from server');
      }
    } catch (err: any) {
      console.error(`❌ Error in handleViewStudent for student ${studentId}:`, err);
      setViewError(err.response?.data?.detail || err.message || 'Failed to fetch student details');
      setViewStudent(null);
    } finally {
      setModalLoading(false);
    }
  };

  // Handler: Open edit modal and load student data
  const handleEditStudent = async (studentId: number) => {
    setModalLoading(true);
    try {
      console.log(`🔍 Editing student ${studentId}`);
      const res = await StudentService.getStudent(studentId);
      console.log('✅ Edit student response:', res);
      console.log('🔍 Stream data in response:', {
        stream: res.stream,
        stream_name: res.stream_name,
        stream_type: res.stream_type
      });
      setEditStudent(res);
      setEditForm(res);
    } catch (err: any) {
      console.error('❌ Error fetching student for editing:', err);
      setError(err.message || 'Failed to fetch student for editing');
    } finally {
      setModalLoading(false);
    }
  };

  // Handler: Submit edit
  const handleEditSubmit = async () => {
    if (!editStudent) return;
    setModalLoading(true);
    try {
      const payload = {
        ...editForm,
        education_level: editForm.education_level,
        student_class: editForm.student_class,
        stream: editForm.stream || null,
      };
      console.log('🔍 Edit payload:', payload);
      console.log('🔍 Stream value:', payload.stream);
      const res = await StudentService.updateStudent(editStudent.id, payload);
      setStudents((prev) => prev.map((s) => (s.id === editStudent.id ? { ...s, ...res } : s)));
      setEditStudent(null);
      setEditForm({});
    } catch (err: any) {
      console.error('❌ Edit error:', err);
      console.error('❌ Error response:', err.response?.data);
      setError(err.response?.data?.student_class?.[0] || err.message || 'Failed to update student');
    } finally {
      setModalLoading(false);
    }
  };

  // Handler: Delete student (open modal)
  const handleDeleteStudent = (studentId: number) => {
    setDeleteStudentId(studentId);
  };
  // Handler: Confirm delete
  const confirmDeleteStudent = async () => {
    if (!deleteStudentId) return;
    setLoading(true);
    try {
      const response = await StudentService.deleteStudent(deleteStudentId);
      setStudents((prev) => prev.filter((s) => s.id !== deleteStudentId));
      setSelectedStudents((prev) => prev.filter((id) => id !== deleteStudentId));
      setDeleteStudentId(null);
      
      // Show success message from backend response
      const successMessage = response?.message || 'Student deleted successfully';
      toast.success(successMessage);
    } catch (err: any) {
      setError(err.message || 'Failed to delete student');
    } finally {
      setLoading(false);
    }
  };
  // Handler: Cancel delete
  const cancelDeleteStudent = () => setDeleteStudentId(null);

  // Handler: Toggle student active status
  const handleToggleActive = async (student: Student) => {
    try {
      const res = await StudentServiceClass.toggleStudentStatus(student.id);
      setStudents((prev) => prev.map((s) => (s.id === student.id ? { ...s, is_active: !s.is_active } : s)));
    } catch (err: any) {
      setError(err.message || 'Failed to toggle student status');
    }
  };

  // Pagination controls
  const totalPages = Math.ceil(count / pageSize);
  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));
  const handlePage = (p: number) => setPage(p);

  // Filter class choices by selected level in editForm
  const filteredClassChoices = CLASS_CHOICES.filter(
    (c) => c.level === editForm.education_level
  );

  // Clear all filters
  const clearFilters = () => {
    setEducationLevelFilter('');
    setSectionFilter('');
    setClassFilter('');
    setSearchTerm('');
  };

  // Get available sections from students
  const availableSections = [...new Set(students.map(s => s.classroom?.split(' ').pop()).filter(Boolean))];



  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Students</h1>
              <p className="text-gray-600 mt-1">Manage student information and records</p>
            </div>
            <div className="flex items-center space-x-3">
              <button 
                onClick={exportToPDF}
                className="flex items-center space-x-2 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export PDF</span>
              </button>
              <button
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                onClick={() => navigate('/admin/students/add')}
              >
                <Plus className="w-4 h-4" />
                <span>Add Student</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
            

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Students</p>
                <p className="text-2xl font-bold text-gray-900">{count}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Students</p>
                <p className="text-2xl font-bold text-green-600">{students.filter(s => s.is_active).length}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <div className="w-6 h-6 bg-green-600 rounded-full"></div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Inactive Students</p>
                <p className="text-2xl font-bold text-red-600">{students.filter(s => !s.is_active).length}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <div className="w-6 h-6 bg-red-600 rounded-full"></div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">With Photos</p>
                <p className="text-2xl font-bold text-purple-600">{students.filter(s => s.profile_picture).length}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <div className="w-6 h-6 bg-purple-600 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search students..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-3">
              <button 
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  showFilters || educationLevelFilter || sectionFilter || classFilter
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" />
                <span>Filter</span>
                {(educationLevelFilter || sectionFilter || classFilter) && (
                  <span className="bg-white text-indigo-600 px-2 py-0.5 rounded-full text-xs font-medium">
                    {[educationLevelFilter, sectionFilter, classFilter].filter(Boolean).length}
                  </span>
                )}
              </button>
              <select 
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option>Newest</option>
                <option>Oldest</option>
                <option>Name A-Z</option>
                <option>Name Z-A</option>
              </select>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Education Level Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Education Level</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={educationLevelFilter}
                    onChange={(e) => setEducationLevelFilter(e.target.value)}
                  >
                    <option value="">All Levels</option>
                    <option value="NURSERY">Nursery</option>
                    <option value="PRIMARY">Primary</option>
                    <option value="JUNIOR_SECONDARY">Junior Secondary</option>
                    <option value="SENIOR_SECONDARY">Senior Secondary</option>
                  </select>
                </div>

                {/* Class Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                  >
                    <option value="">All Classes</option>
                    {CLASS_CHOICES.filter(cls => !educationLevelFilter || cls.level === educationLevelFilter).map(cls => (
                      <option key={cls.value} value={cls.value}>{cls.label}</option>
                    ))}
                  </select>
                </div>

                {/* Section Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Section</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                  >
                    <option value="">All Sections</option>
                    {availableSections.map(section => (
                      <option key={section} value={section}>{section}</option>
                    ))}
                  </select>
                </div>

                {/* Clear Filters */}
                <div className="flex items-end">
                  <button
                    onClick={clearFilters}
                    className="w-full px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Students Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading students...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No students found.</div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-4 px-6">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      checked={selectAll}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left py-4 px-6 font-medium text-gray-700">Student</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-700">ID</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-700">Admission Date</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-700">Parent Contact</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-700">Class</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-700">Level</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-700">Stream</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-700">Status</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-200 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        checked={selectedStudents.includes(student.id)}
                        onChange={() => toggleStudentSelection(student.id)}
                      />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 relative">
                          {renderProfilePicture(student)}
                          {renderInitialsAvatar(student)}
                        </div>
                        <div>
                          <p className="font-medium w-3xs text-gray-900">{student.full_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-indigo-600 font-medium">{student.id}</span>
                    </td>
                    <td className="w-3xs py-4 px-6 text-gray-700">{student.admission_date}</td>
                    <td className="py-4 px-6 text-gray-700">{student.parent_contact || '-'}</td>
                    <td className="w-3xs py-4 px-6 text-gray-700">{student.student_class_display}</td>
                    <td className="py-4 px-6 text-gray-700">{student.education_level_display}</td>
                    <td className="py-4 px-6 text-gray-700">{student.stream_name || '-'}</td>
                    <td className="py-4 px-6">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${student.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {student.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-4 px-6 relative">
                      <div className="flex items-center space-x-2">
                        <button className="p-1 text-gray-400 hover:text-indigo-600 transition-colors" onClick={() => handleEditStudent(student.id)}>
                          <Edit className="w-4 h-4" />
                        </button>
                        <button className="p-1 text-gray-400 hover:text-red-600 transition-colors" onClick={() => handleDeleteStudent(student.id)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="relative">
                          <button
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            onClick={() => setActionMenuOpen(actionMenuOpen === student.id ? null : student.id)}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {actionMenuOpen === student.id && (
                            <div className="absolute right-0 mt-2 w-40 bg-gray-500 border border-gray-200 rounded-lg shadow-lg z-10">
                              <button className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100" onClick={() => { handleViewStudent(student.id); setActionMenuOpen(null); }}>View</button>
                              <button className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100" onClick={() => { handleEditStudent(student.id); setActionMenuOpen(null); }}>Edit</button>
                              <button className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100" onClick={() => { handleDeleteStudent(student.id); setActionMenuOpen(null); }}>Delete</button>
                              <button
                                onClick={() => { handleToggleActive(student); setActionMenuOpen(null); }}
                                className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100"
                              >
                                {student.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {/* Pagination */}
          <div className="bg-white px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing <span className="font-medium">{(page - 1) * pageSize + 1}</span> to <span className="font-medium">{Math.min(page * pageSize, count)}</span> of{' '}
                <span className="font-medium">{count}</span> results
              </div>
              <div className="flex space-x-2">
                <button onClick={handlePrev} disabled={page === 1} className="px-3 py-1 text-sm text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors disabled:opacity-50">
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => handlePage(i + 1)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${page === i + 1 ? 'bg-indigo-600 text-white' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button onClick={handleNext} disabled={page === totalPages} className="px-3 py-1 text-sm text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors disabled:opacity-50">
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* View Modal */}
      {showViewModal && viewStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">Student Profile</h2>
                  <p className="text-indigo-100 mt-1">Detailed information and records</p>
                </div>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setViewStudent(null);
                  }}
                  className="p-2 hover:bg-white/20 rounded-full transition-all duration-200 group"
                >
                  <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            </div>

            {modalLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
                  <p className="text-gray-600 font-medium">Loading student details...</p>
                </div>
              </div>
            ) : viewError ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                  <p className="text-red-500 font-medium">{viewError}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-120px)]">
                <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                  {/* Profile Section */}
                  <div className="lg:w-1/3 lg:sticky lg:top-0 lg:self-start">
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-4 sm:p-6 text-center">
                      {/* Profile Picture */}
                      <div className="relative mx-auto mb-6">
                        {viewStudent.profile_picture ? (
                          <img
                            src={viewStudent.profile_picture.startsWith('http') ? viewStudent.profile_picture : `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}${viewStudent.profile_picture}`}
                            alt={viewStudent.full_name}
                            className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg ${viewStudent.profile_picture ? 'hidden' : ''}`}>
                          <span className="text-4xl font-bold text-white">
                            {getInitials(viewStudent.full_name || 'Student')}
                          </span>
                        </div>
                      </div>

                      {/* Student Name */}
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">
                        {viewStudent.full_name}
                      </h3>
                      <p className="text-indigo-600 font-semibold text-lg mb-4">
                        ID: {viewStudent.id}
                      </p>

                      {/* Status Badges */}
                      <div className="flex flex-col gap-3 mb-6">
                        <span className={`inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold shadow-sm ${
                          viewStudent.education_level === 'NURSERY' ? 'bg-pink-100 text-pink-800 border border-pink-200' :
                          viewStudent.education_level === 'PRIMARY' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          'bg-purple-100 text-purple-800 border border-purple-200'
                        }`}>
                          <div className={`w-2 h-2 rounded-full mr-2 ${
                            viewStudent.education_level === 'NURSERY' ? 'bg-pink-500' :
                            viewStudent.education_level === 'PRIMARY' ? 'bg-blue-500' :
                            'bg-purple-500'
                          }`}></div>
                          {viewStudent.education_level_display || 'Unknown Level'}
                        </span>
                        <span className={`inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold shadow-sm ${
                          viewStudent.is_active 
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                        }`}>
                          <div className={`w-2 h-2 rounded-full mr-2 ${viewStudent.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          {viewStudent.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>

                      {/* Quick Stats */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl p-4 shadow-sm">
                          <div className="text-2xl font-bold text-indigo-600">{viewStudent.age || 'N/A'}</div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Age</div>
                        </div>
                        <div className="bg-white rounded-xl p-4 shadow-sm">
                          <div className="text-2xl font-bold text-indigo-600">{viewStudent.parents?.length || 0}</div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Parents</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Details Section */}
                  <div className="lg:w-2/3">
                    <div className="space-y-4 sm:space-y-6 pb-6">
                      {/* Personal Information */}
                      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <div className="w-1 h-6 bg-indigo-600 rounded-full mr-3"></div>
                          Personal Information
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Username</label>
                            <p className="text-gray-900 font-medium">{viewStudent.username || 'No username'}</p>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Email</label>
                            <p className="text-gray-900 font-medium">{viewStudent.email || 'No email'}</p>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Gender</label>
                            <p className="text-gray-900 font-medium">{viewStudent.gender || 'Not specified'}</p>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Date of Birth</label>
                            <p className="text-gray-900 font-medium">{viewStudent.date_of_birth ? new Date(viewStudent.date_of_birth).toLocaleDateString() : 'Not specified'}</p>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Admission Date</label>
                            <p className="text-gray-900 font-medium">{viewStudent.admission_date ? new Date(viewStudent.admission_date).toLocaleDateString() : 'Not specified'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Academic Information */}
                      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <div className="w-1 h-6 bg-blue-600 rounded-full mr-3"></div>
                          Academic Information
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Class</label>
                            <p className="text-gray-900 font-medium">{viewStudent.student_class_display || 'Not assigned'}</p>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Education Level</label>
                            <p className="text-gray-900 font-medium">{viewStudent.education_level_display || 'Not specified'}</p>
                          </div>
                          {viewStudent.stream_name && (
                            <div className="space-y-1">
                              <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Stream</label>
                              <p className="text-gray-900 font-medium">{viewStudent.stream_name} ({viewStudent.stream_type})</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Contact Information */}
                      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <div className="w-1 h-6 bg-green-600 rounded-full mr-3"></div>
                          Contact Information
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Parent Contact</label>
                            <p className="text-gray-900 font-medium">{viewStudent.parent_contact || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Emergency Contact</label>
                            <p className="text-gray-900 font-medium">
                              {viewStudent.emergency_contact || 
                               (viewStudent.emergency_contacts && viewStudent.emergency_contacts.length > 0 
                                ? viewStudent.emergency_contacts[0].number 
                                : 'Not provided')}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Parent Information */}
                      {viewStudent.parents && viewStudent.parents.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <div className="w-1 h-6 bg-yellow-600 rounded-full mr-3"></div>
                            Parent Information
                          </h4>
                          <div className="space-y-4">
                            {viewStudent.parents.map((parent: Parent, index: number) => (
                              <div key={parent.id} className="bg-gray-50 rounded-xl p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Parent Name</label>
                                    <p className="text-gray-900 font-medium">{parent.full_name}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Relationship</label>
                                    <p className="text-gray-900 font-medium">{parent.relationship}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Email</label>
                                    <p className="text-gray-900 font-medium">{parent.email || 'Not provided'}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Phone</label>
                                    <p className="text-gray-900 font-medium">{parent.phone || 'Not provided'}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Primary Contact</label>
                                    <p className="text-gray-900 font-medium">
                                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                        parent.is_primary_contact 
                                          ? 'bg-green-100 text-green-800' 
                                          : 'bg-gray-100 text-gray-800'
                                      }`}>
                                        {parent.is_primary_contact ? 'Yes' : 'No'}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Medical Information */}
                      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <div className="w-1 h-6 bg-red-600 rounded-full mr-3"></div>
                          Medical Information
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Medical Conditions</label>
                            <p className="text-gray-900 font-medium">{viewStudent.medical_conditions || 'None'}</p>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-500 uppercase tracking-wide">Special Requirements</label>
                            <p className="text-gray-900 font-medium">{viewStudent.special_requirements || 'None'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Edit Modal */}
      {editStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">Edit Student</h2>
                  <p className="text-blue-100 mt-1">Update student information</p>
                </div>
                <button
                  onClick={() => {
                    setEditStudent(null);
                    setEditForm({});
                  }}
                  className="p-2 hover:bg-white/20 rounded-full transition-all duration-200 group"
                >
                  <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {modalLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-gray-600 font-medium">Loading student details...</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={e => { e.preventDefault(); handleEditSubmit(); }} className="space-y-4 sm:space-y-6">
                  {/* Personal Information */}
                  <div className="bg-gray-50 rounded-xl p-4 sm:p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <div className="w-1 h-6 bg-blue-600 rounded-full mr-3"></div>
                      Personal Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Full Name</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-100" 
                          value={editForm.full_name || ''} 
                          onChange={e => setEditForm((f: any) => ({ ...f, full_name: e.target.value }))} 
                          disabled 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
                        <input
                          type="date"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                          value={editForm.date_of_birth ? editForm.date_of_birth.slice(0, 10) : ''}
                          onChange={e => setEditForm((f: any) => ({ ...f, date_of_birth: e.target.value }))}
                        />
                        {error && error.toLowerCase().includes('date_of_birth') && (
                          <div className="text-red-500 text-sm mt-1">{error}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Academic Information */}
                  <div className="bg-gray-50 rounded-xl p-4 sm:p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <div className="w-1 h-6 bg-green-600 rounded-full mr-3"></div>
                      Academic Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Education Level</label>
                        <select
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                          value={editForm.education_level || ''}
                          onChange={e => setEditForm((f: any) => ({ ...f, education_level: e.target.value, student_class: '' }))}
                        >
                          <option value="">Select Level</option>
                          {EDUCATION_LEVEL_CHOICES.map((level) => (
                            <option key={level.value} value={level.value}>{level.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Class</label>
                        <select
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 disabled:bg-gray-100"
                          value={editForm.student_class || ''}
                          onChange={e => setEditForm((f: any) => ({ ...f, student_class: e.target.value }))}
                          disabled={!editForm.education_level}
                        >
                          <option value="">Select Class</option>
                          {filteredClassChoices.map((cls) => (
                            <option key={cls.value} value={cls.value}>{cls.label}</option>
                          ))}
                        </select>
                      </div>
                      {editForm.education_level === 'SENIOR_SECONDARY' && (
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">Stream</label>
                          <select
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                            value={editForm.stream || ''}
                            onChange={e => setEditForm((f: any) => ({ ...f, stream: e.target.value }))}
                          >
                            <option value="">Select Stream (Optional)</option>
                            {streams.map((stream) => (
                              <option key={stream.id} value={stream.id}>
                                {stream.name} ({stream.stream_type})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div className="bg-gray-50 rounded-xl p-4 sm:p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <div className="w-1 h-6 bg-purple-600 rounded-full mr-3"></div>
                      Contact Information
                    </h4>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Parent Contact</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200" 
                        value={editForm.parent_contact || ''} 
                        onChange={e => setEditForm((f: any) => ({ ...f, parent_contact: e.target.value }))} 
                        placeholder="Enter parent contact number"
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
                    <button 
                      type="button" 
                      className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium" 
                      onClick={() => {
                        setEditStudent(null);
                        setEditForm({});
                      }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteStudentId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-pink-600 text-white p-6 rounded-t-2xl">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mr-4">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Confirm Delete</h2>
                  <p className="text-red-100 mt-1">This action cannot be undone</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Student</h3>
                <p className="text-gray-600">Are you sure you want to permanently delete this student? This action cannot be undone and will remove all associated data.</p>
              </div>

              <div className="flex gap-4">
                <button 
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium" 
                  onClick={cancelDeleteStudent}
                >
                  Cancel
                </button>
                <button 
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-lg hover:from-red-700 hover:to-pink-700 transition-all duration-200 font-medium shadow-lg hover:shadow-xl" 
                  onClick={confirmDeleteStudent}
                >
                  Delete Student
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsComponent;