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
  AlertCircle,
} from 'lucide-react';
import studentService, {
  StudentService as StudentServiceClass,
  Student,
  ParentInfo,
} from '@/services/StudentService';
import { API_BASE_URL } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

// ============================================================================
// CONSTANTS
// ============================================================================

const EDUCATION_LEVEL_CHOICES = [
  { value: 'NURSERY', label: 'Nursery' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'JUNIOR_SECONDARY', label: 'Junior Secondary' },
  { value: 'SENIOR_SECONDARY', label: 'Senior Secondary' },
];

const CLASS_CHOICES = [
  { value: 'PRE_NURSERY', label: 'Pre-nursery', level: 'NURSERY' },
  { value: 'NURSERY_1', label: 'Nursery 1', level: 'NURSERY' },
  { value: 'NURSERY_2', label: 'Nursery 2', level: 'NURSERY' },
  { value: 'PRIMARY_1', label: 'Primary 1', level: 'PRIMARY' },
  { value: 'PRIMARY_2', label: 'Primary 2', level: 'PRIMARY' },
  { value: 'PRIMARY_3', label: 'Primary 3', level: 'PRIMARY' },
  { value: 'PRIMARY_4', label: 'Primary 4', level: 'PRIMARY' },
  { value: 'PRIMARY_5', label: 'Primary 5', level: 'PRIMARY' },
  { value: 'PRIMARY_6', label: 'Primary 6', level: 'PRIMARY' },
  { value: 'JSS_1', label: 'Junior Secondary 1 (JSS1)', level: 'JUNIOR_SECONDARY' },
  { value: 'JSS_2', label: 'Junior Secondary 2 (JSS2)', level: 'JUNIOR_SECONDARY' },
  { value: 'JSS_3', label: 'Junior Secondary 3 (JSS3)', level: 'JUNIOR_SECONDARY' },
  { value: 'SS_1', label: 'Senior Secondary 1 (SS1)', level: 'SENIOR_SECONDARY' },
  { value: 'SS_2', label: 'Senior Secondary 2 (SS2)', level: 'SENIOR_SECONDARY' },
  { value: 'SS_3', label: 'Senior Secondary 3 (SS3)', level: 'SENIOR_SECONDARY' },
];

// ============================================================================
// HELPERS
// ============================================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const getInitials = (name: string): string =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

const resolveImageUrl = (path: string): string =>
  path.startsWith('http')
    ? path
    : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${path}`;

// ============================================================================
// STREAM TYPE
// ============================================================================

interface Stream {
  id: number;
  name: string;
  stream_type: string;
}

// ============================================================================
// EDIT FORM TYPE
// ============================================================================

interface EditFormState {
  full_name?: string;
  date_of_birth?: string;
  education_level?: string;
  student_class?: string | number;
  stream?: string | number;
  parent_contact?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const StudentsComponent = () => {
  // --- Data state ---
  const [students, setStudents] = useState<Student[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [count, setCount] = useState(0);

  // --- UI state ---
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('Newest');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [selectAll, setSelectAll] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);

  // --- Filter state ---
  const [showFilters, setShowFilters] = useState(false);
  const [educationLevelFilter, setEducationLevelFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');

  // --- Loading/error state ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Modal state ---
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({});
  const [deleteStudentId, setDeleteStudentId] = useState<number | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const navigate = useNavigate();
  const debouncedSearch = useDebounce(searchTerm, 400);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const loadStreams = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/classrooms/streams/`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setStreams(data.results ?? data);
      }
    } catch (err) {
      console.error('Failed to load streams:', err);
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        page,
        page_size: pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (educationLevelFilter) params.education_level = educationLevelFilter;
      if (classFilter) params.student_class = classFilter;

      const res = await studentService.getStudents(params);
      const data = res as any;

      let studentsData: Student[] = Array.isArray(data)
        ? data
        : data.results ?? [];

      setCount(Array.isArray(data) ? data.length : data.count ?? 0);

      // Client-side section filter
      if (sectionFilter) {
        studentsData = studentsData.filter(
          (s) => s.classroom?.split(' ').pop() === sectionFilter
        );
      }

      setStudents(studentsData);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) setError('Session expired. Please log in again.');
      else if (status === 403) setError('You do not have permission to view students.');
      else if (status === 404) setError('Students endpoint not found.');
      else setError(err?.response?.data?.message ?? err?.message ?? 'Failed to load students.');
      setStudents([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, pageSize, educationLevelFilter, classFilter, sectionFilter]);

  useEffect(() => {
    fetchStudents();
    loadStreams();
    setSelectAll(false);
    setSelectedStudents([]);
  }, [fetchStudents, loadStreams]);

  // ============================================================================
  // SELECTION
  // ============================================================================

  const toggleStudentSelection = (id: number) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map((s) => s.id));
    }
    setSelectAll((v) => !v);
  };

  // ============================================================================
  // PROFILE PICTURE RENDERING
  // ============================================================================

  const renderProfilePicture = (student: Student) => {
    if (!student.profile_picture) return null;
    return (
      <img
        src={resolveImageUrl(student.profile_picture)}
        alt={student.full_name}
        className="w-10 h-10 rounded-full object-cover border"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
          sibling?.classList.remove('hidden');
        }}
      />
    );
  };

  const renderInitialsAvatar = (student: Student) => (
    <div
      className={`w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center ${
        student.profile_picture ? 'hidden' : ''
      }`}
    >
      <span className="text-sm font-medium text-white">
        {getInitials(student.full_name)}
      </span>
    </div>
  );

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleViewStudent = async (studentId: number) => {
    setModalLoading(true);
    setViewError(null);
    setViewStudent(null);
    try {
      const res = await studentService.getStudent(studentId);
      setViewStudent(res);
      setShowViewModal(true);
    } catch (err: any) {
      setViewError(err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch student.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleEditStudent = async (studentId: number) => {
    setModalLoading(true);
    try {
      const res = await studentService.getStudent(studentId);
      setEditStudent(res);
      setEditForm({
        full_name: res.full_name,
        date_of_birth: res.date_of_birth,
        education_level: res.education_level ?? '',
        student_class: res.student_class ? String(res.student_class) : '',
        stream: res.stream ? String(res.stream) : '',
        parent_contact: res.parent_contact ?? '',
      });
    } catch (err: any) {
      setError(err?.message ?? 'Failed to fetch student for editing.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editStudent) return;
    setModalLoading(true);
    try {
      const payload = {
        ...editForm,
        stream: editForm.stream || null,
      };
      const res = await studentService.updateStudent(editStudent.id, payload);
      setStudents((prev) =>
        prev.map((s) => (s.id === editStudent.id ? { ...s, ...res } : s))
      );
      toast.success('Student updated successfully.');
      setEditStudent(null);
      setEditForm({});
    } catch (err: any) {
      setError(
        err?.response?.data?.student_class?.[0] ??
        err?.message ??
        'Failed to update student.'
      );
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteStudent = (studentId: number) => setDeleteStudentId(studentId);
  const cancelDeleteStudent = () => setDeleteStudentId(null);

  const confirmDeleteStudent = async () => {
    if (!deleteStudentId) return;
    setLoading(true);
    try {
      await studentService.deleteStudent(deleteStudentId);
      setStudents((prev) => prev.filter((s) => s.id !== deleteStudentId));
      setSelectedStudents((prev) => prev.filter((id) => id !== deleteStudentId));
      setDeleteStudentId(null);
      toast.success('Student deleted successfully.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete student.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (student: Student) => {
    try {
      await studentService.toggleStudentStatus(student.id);
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, is_active: !s.is_active } : s))
      );
    } catch (err: any) {
      setError(err?.message ?? 'Failed to toggle student status.');
    }
  };

  // ============================================================================
  // PAGINATION
  // ============================================================================

  const totalPages = Math.ceil(count / pageSize);
  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  // ============================================================================
  // DERIVED
  // ============================================================================

  const filteredClassChoices = CLASS_CHOICES.filter(
    (c) => c.level === editForm.education_level
  );

  const availableSections = [
    ...new Set(
      students.map((s) => s.classroom?.split(' ').pop()).filter(Boolean)
    ),
  ] as string[];

  const activeFilterCount = [educationLevelFilter, sectionFilter, classFilter].filter(Boolean).length;

  const clearFilters = () => {
    setEducationLevelFilter('');
    setSectionFilter('');
    setClassFilter('');
    setSearchTerm('');
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Students</h1>
            <p className="text-gray-600 mt-1">Manage student information and records</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() =>
                alert('PDF export is temporarily disabled. Use browser print instead.')
              }
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export PDF</span>
            </button>
            <button
              onClick={() => navigate('/admin/students/add')}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Student</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          {[
            { label: 'Total Students', value: count, color: 'blue', icon: <User className="w-6 h-6 text-blue-600" /> },
            { label: 'Active', value: students.filter((s) => s.is_active).length, color: 'green' },
            { label: 'Inactive', value: students.filter((s) => !s.is_active).length, color: 'red' },
            { label: 'With Photos', value: students.filter((s) => s.profile_picture).length, color: 'purple' },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="bg-white rounded-lg shadow-sm p-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{label}</p>
                <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
              </div>
              <div className={`w-12 h-12 bg-${color}-100 rounded-full flex items-center justify-center`}>
                {icon ?? <div className={`w-6 h-6 bg-${color}-600 rounded-full`} />}
              </div>
            </div>
          ))}
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search students..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span>Filter</span>
                {activeFilterCount > 0 && (
                  <span className="bg-white text-indigo-600 px-2 py-0.5 rounded-full text-xs font-medium">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

          {showFilters && (
            <div className="mt-6 pt-6 border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Education Level</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={educationLevelFilter}
                  onChange={(e) => setEducationLevelFilter(e.target.value)}
                >
                  <option value="">All Levels</option>
                  {EDUCATION_LEVEL_CHOICES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="">All Classes</option>
                  {CLASS_CHOICES.filter(
                    (c) => !educationLevelFilter || c.level === educationLevelFilter
                  ).map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Section</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                >
                  <option value="">All Sections</option>
                  {availableSections.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="w-full px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
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
                        className="w-4 h-4 text-indigo-600 rounded"
                        checked={selectAll}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    {['Student', 'ID', 'Admission Date', 'Parent Contact', 'Class', 'Level', 'Stream', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="text-left py-4 px-6 font-medium text-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {students.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-indigo-600 rounded"
                          checked={selectedStudents.includes(student.id)}
                          onChange={() => toggleStudentSelection(student.id)}
                        />
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 relative">
                            {renderProfilePicture(student)}
                            {renderInitialsAvatar(student)}
                          </div>
                          <p className="font-medium text-gray-900">{student.full_name}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-indigo-600 font-medium">{student.id}</td>
                      <td className="py-4 px-6 text-gray-700">{student.admission_date}</td>
                      <td className="py-4 px-6 text-gray-700">{student.parent_contact ?? '-'}</td>
                      <td className="py-4 px-6 text-gray-700">{student.student_class_display}</td>
                      <td className="py-4 px-6 text-gray-700">{student.education_level_display}</td>
                      <td className="py-4 px-6 text-gray-700">{student.stream_name ?? '-'}</td>
                      <td className="py-4 px-6">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${student.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {student.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-4 px-6 relative">
                        <div className="flex items-center space-x-2">
                          <button
                            className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                            onClick={() => handleEditStudent(student.id)}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            onClick={() => handleDeleteStudent(student.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="relative">
                            <button
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                              onClick={() =>
                                setActionMenuOpen((v) => (v === student.id ? null : student.id))
                              }
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {actionMenuOpen === student.id && (
                              <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                                {[
                                  { label: 'View', action: () => { handleViewStudent(student.id); setActionMenuOpen(null); } },
                                  { label: 'Edit', action: () => { handleEditStudent(student.id); setActionMenuOpen(null); } },
                                  { label: 'Delete', action: () => { handleDeleteStudent(student.id); setActionMenuOpen(null); } },
                                  {
                                    label: student.is_active ? 'Deactivate' : 'Activate',
                                    action: () => { handleToggleActive(student); setActionMenuOpen(null); },
                                  },
                                ].map(({ label, action }) => (
                                  <button
                                    key={label}
                                    onClick={action}
                                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 text-sm"
                                  >
                                    {label}
                                  </button>
                                ))}
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
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-700">
              Showing{' '}
              <span className="font-medium">{Math.min((page - 1) * pageSize + 1, count)}</span>
              {' '}–{' '}
              <span className="font-medium">{Math.min(page * pageSize, count)}</span>
              {' '}of{' '}
              <span className="font-medium">{count}</span>
            </p>
            <div className="flex space-x-2">
              <button onClick={handlePrev} disabled={page === 1} className="px-3 py-1 text-sm text-gray-500 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50">
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1 text-sm rounded ${page === p ? 'bg-indigo-600 text-white' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}
                >
                  {p}
                </button>
              ))}
              <button onClick={handleNext} disabled={page === totalPages} className="px-3 py-1 text-sm text-gray-500 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── View Modal ── */}
      {showViewModal && viewStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Student Profile</h2>
                <p className="text-indigo-100 mt-1">Detailed information and records</p>
              </div>
              <button
                onClick={() => { setShowViewModal(false); setViewStudent(null); }}
                className="p-2 hover:bg-white/20 rounded-full transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {modalLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent" />
              </div>
            ) : viewError ? (
              <div className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
                <p className="text-red-500 font-medium">{viewError}</p>
              </div>
            ) : (
              <div className="p-6 overflow-y-auto max-h-[calc(95vh-120px)]">
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Sidebar */}
                  <div className="lg:w-1/3">
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 text-center">
                      <div className="relative mx-auto mb-6 w-32 h-32">
                        {viewStudent.profile_picture ? (
                          <img
                            src={resolveImageUrl(viewStudent.profile_picture)}
                            alt={viewStudent.full_name}
                            className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
                              sib?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg ${viewStudent.profile_picture ? 'hidden' : ''}`}>
                          <span className="text-4xl font-bold text-white">
                            {getInitials(viewStudent.full_name || 'Student')}
                          </span>
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-1">{viewStudent.full_name}</h3>
                      <p className="text-indigo-600 font-semibold mb-4">ID: {viewStudent.id}</p>
                      <div className="flex flex-col gap-3 mb-6">
                        <span className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                          {viewStudent.education_level_display ?? 'Unknown Level'}
                        </span>
                        <span className={`inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold ${viewStudent.is_active ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                          {viewStudent.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl p-4 shadow-sm">
                          <div className="text-2xl font-bold text-indigo-600">{viewStudent.age ?? 'N/A'}</div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Age</div>
                        </div>
                        <div className="bg-white rounded-xl p-4 shadow-sm">
                          <div className="text-2xl font-bold text-indigo-600">{viewStudent.parents?.length ?? 0}</div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Parents</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="lg:w-2/3 space-y-6">
                    {/* Personal */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <div className="w-1 h-6 bg-indigo-600 rounded-full mr-3" />
                        Personal Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[
                          { label: 'Username', value: viewStudent.username ?? 'N/A' },
                          { label: 'Email', value: viewStudent.email ?? 'N/A' },
                          { label: 'Gender', value: viewStudent.gender ?? 'Not specified' },
                          { label: 'Date of Birth', value: viewStudent.date_of_birth ? new Date(viewStudent.date_of_birth).toLocaleDateString() : 'Not specified' },
                          { label: 'Admission Date', value: viewStudent.admission_date ? new Date(viewStudent.admission_date).toLocaleDateString() : 'Not specified' },
                        ].map(({ label, value }) => (
                          <div key={label} className="space-y-1">
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
                            <p className="text-gray-900 font-medium">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Academic */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <div className="w-1 h-6 bg-blue-600 rounded-full mr-3" />
                        Academic Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Class</label>
                          <p className="text-gray-900 font-medium">{viewStudent.student_class_display ?? 'Not assigned'}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Education Level</label>
                          <p className="text-gray-900 font-medium">{viewStudent.education_level_display ?? 'Not specified'}</p>
                        </div>
                        {viewStudent.stream_name && (
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Stream</label>
                            <p className="text-gray-900 font-medium">{viewStudent.stream_name} ({viewStudent.stream_type})</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <div className="w-1 h-6 bg-green-600 rounded-full mr-3" />
                        Contact Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Parent Contact</label>
                          <p className="text-gray-900 font-medium">{viewStudent.parent_contact ?? 'Not provided'}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Emergency Contact</label>
                          <p className="text-gray-900 font-medium">{viewStudent.emergency_contact ?? 'Not provided'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Parents */}
                    {(viewStudent.parents?.length ?? 0) > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-200 p-6">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <div className="w-1 h-6 bg-yellow-600 rounded-full mr-3" />
                          Parent Information
                        </h4>
                        <div className="space-y-4">
                          {viewStudent.parents!.map((parent: ParentInfo) => (
                            <div key={parent.id} className="bg-gray-50 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                              {[
                                { label: 'Name', value: parent.full_name },
                                { label: 'Email', value: parent.email ?? 'Not provided' },
                                { label: 'Phone', value: parent.phone ?? 'Not provided' },
                              ].map(({ label, value }) => (
                                <div key={label} className="space-y-1">
                                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
                                  <p className="text-gray-900 font-medium">{value}</p>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Medical */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <div className="w-1 h-6 bg-red-600 rounded-full mr-3" />
                        Medical Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Medical Conditions</label>
                          <p className="text-gray-900 font-medium">{viewStudent.medical_conditions ?? 'None'}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Special Requirements</label>
                          <p className="text-gray-900 font-medium">{viewStudent.special_requirements ?? 'None'}</p>
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

      {/* ── Edit Modal ── */}
      {editStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Edit Student</h2>
                <p className="text-blue-100 mt-1">Update student information</p>
              </div>
              <button
                onClick={() => { setEditStudent(null); setEditForm({}); }}
                className="p-2 hover:bg-white/20 rounded-full transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {modalLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
                </div>
              ) : (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleEditSubmit(); }}
                  className="space-y-6"
                >
                  {/* Personal */}
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <div className="w-1 h-6 bg-blue-600 rounded-full mr-3" />
                      Personal Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Full Name</label>
                        <input
                          type="text"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100"
                          value={editForm.full_name ?? ''}
                          disabled
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
                        <input
                          type="date"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          value={editForm.date_of_birth?.slice(0, 10) ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, date_of_birth: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Academic */}
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <div className="w-1 h-6 bg-green-600 rounded-full mr-3" />
                      Academic Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Education Level</label>
                        <select
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          value={editForm.education_level ?? ''}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, education_level: e.target.value, student_class: '' }))
                          }
                        >
                          <option value="">Select Level</option>
                          {EDUCATION_LEVEL_CHOICES.map((l) => (
                            <option key={l.value} value={l.value}>{l.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Class</label>
                        <select
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                          value={editForm.student_class ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, student_class: e.target.value }))}
                          disabled={!editForm.education_level}
                        >
                          <option value="">Select Class</option>
                          {filteredClassChoices.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      {editForm.education_level === 'SENIOR_SECONDARY' && (
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">Stream</label>
                          <select
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                            value={editForm.stream ?? ''}
                            onChange={(e) => setEditForm((f) => ({ ...f, stream: e.target.value }))}
                          >
                            <option value="">Select Stream (Optional)</option>
                            {streams.map((s) => (
                              <option key={s.id} value={s.id}>{s.name} ({s.stream_type})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <div className="w-1 h-6 bg-purple-600 rounded-full mr-3" />
                      Contact Information
                    </h4>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Parent Contact</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        value={editForm.parent_contact ?? ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, parent_contact: e.target.value }))}
                        placeholder="Enter parent contact number"
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="text-red-500 text-sm">{error}</p>
                  )}

                  <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => { setEditStudent(null); setEditForm({}); }}
                      className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 font-medium shadow-lg"
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

      {/* ── Delete Modal ── */}
      {deleteStudentId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-red-600 to-pink-600 text-white p-6 rounded-t-2xl flex items-center">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mr-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Confirm Delete</h2>
                <p className="text-red-100 mt-1">This action cannot be undone</p>
              </div>
            </div>
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Student</h3>
                <p className="text-gray-600">
                  Are you sure? This will permanently remove the student and all associated data.
                </p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={cancelDeleteStudent}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteStudent}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-lg hover:from-red-700 hover:to-pink-700 font-medium shadow-lg"
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