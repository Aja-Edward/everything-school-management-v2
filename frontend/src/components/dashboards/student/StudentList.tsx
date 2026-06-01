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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import studentService, {
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
  { value: 'PRE_NURSERY',    label: 'Pre-nursery',                   level: 'NURSERY' },
  { value: 'NURSERY_1',      label: 'Nursery 1',                     level: 'NURSERY' },
  { value: 'NURSERY_2',      label: 'Nursery 2',                     level: 'NURSERY' },
  { value: 'PRIMARY_1',      label: 'Primary 1',                     level: 'PRIMARY' },
  { value: 'PRIMARY_2',      label: 'Primary 2',                     level: 'PRIMARY' },
  { value: 'PRIMARY_3',      label: 'Primary 3',                     level: 'PRIMARY' },
  { value: 'PRIMARY_4',      label: 'Primary 4',                     level: 'PRIMARY' },
  { value: 'PRIMARY_5',      label: 'Primary 5',                     level: 'PRIMARY' },
  { value: 'PRIMARY_6',      label: 'Primary 6',                     level: 'PRIMARY' },
  { value: 'JSS_1',          label: 'Junior Secondary 1 (JSS1)',     level: 'JUNIOR_SECONDARY' },
  { value: 'JSS_2',          label: 'Junior Secondary 2 (JSS2)',     level: 'JUNIOR_SECONDARY' },
  { value: 'JSS_3',          label: 'Junior Secondary 3 (JSS3)',     level: 'JUNIOR_SECONDARY' },
  { value: 'SS_1',           label: 'Senior Secondary 1 (SS1)',      level: 'SENIOR_SECONDARY' },
  { value: 'SS_2',           label: 'Senior Secondary 2 (SS2)',      level: 'SENIOR_SECONDARY' },
  { value: 'SS_3',           label: 'Senior Secondary 3 (SS3)',      level: 'SENIOR_SECONDARY' },
];

const TABLE_HEADERS = [
  'Student', 'ID', 'Admission Date', 'Parent Contact',
  'Class', 'Level', 'Stream', 'Status', 'Actions',
];

// ============================================================================
// TYPES
// ============================================================================

interface Stream {
  id: number;
  name: string;
  stream_type: string;
}

interface EditFormState {
  full_name?: string;
  date_of_birth?: string;
  education_level?: string;
  student_class?: string | number;
  stream?: string | number;
  parent_contact?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const getInitials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase();

const resolveImageUrl = (path: string) =>
  path.startsWith('http')
    ? path
    : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${path}`;

function getPageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface AvatarProps {
  student: Student;
  size?: 'sm' | 'lg';
}

const Avatar = ({ student, size = 'sm' }: AvatarProps) => {
  const dim = size === 'sm' ? 'w-10 h-10 text-sm' : 'w-32 h-32 text-4xl';
  return (
    <div className={`${dim} relative flex-shrink-0`}>
      {student.profile_picture && (
        <img
          src={resolveImageUrl(student.profile_picture)}
          alt={student.full_name}
          className={`${dim} rounded-full object-cover border`}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            (e.currentTarget.nextElementSibling as HTMLElement | null)?.classList.remove('hidden');
          }}
        />
      )}
      <div
        className={`${dim} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white ${
          student.profile_picture ? 'hidden' : ''
        }`}
      >
        {getInitials(student.full_name || 'S')}
      </div>
    </div>
  );
};

interface StatusBadgeProps {
  active: boolean;
}

const StatusBadge = ({ active }: StatusBadgeProps) => (
  <span
    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
      active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}
  >
    {active ? 'Active' : 'Inactive'}
  </span>
);

interface SectionLabelProps {
  color: string;
  children: React.ReactNode;
}

const SectionLabel = ({ color, children }: SectionLabelProps) => (
  <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-3">
    <div className={`w-1 h-5 ${color} rounded-full`} />
    {children}
  </h4>
);

interface InfoGridProps {
  fields: { label: string; value: string }[];
}

const InfoGrid = ({ fields }: InfoGridProps) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    {fields.map(({ label, value }) => (
      <div key={label} className="space-y-1">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    ))}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StudentsComponent = () => {
  // --- Data ---
  const [students, setStudents]   = useState<Student[]>([]);
  const [streams, setStreams]     = useState<Stream[]>([]);
  const [count, setCount]         = useState(0);

  // --- UI ---
  const [searchTerm, setSearchTerm]           = useState('');
  const [sortBy, setSortBy]                   = useState('Newest');
  const [page, setPage]                       = useState(1);
  const [pageSize]                            = useState(10);
  const [selectAll, setSelectAll]             = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [actionMenuOpen, setActionMenuOpen]   = useState<number | null>(null);

  // --- Filters ---
  const [showFilters, setShowFilters]               = useState(false);
  const [educationLevelFilter, setEducationLevelFilter] = useState('');
  const [sectionFilter, setSectionFilter]           = useState('');
  const [classFilter, setClassFilter]               = useState('');

  // --- Status ---
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // --- Modals ---
  const [viewStudent, setViewStudent]     = useState<Student | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewError, setViewError]         = useState<string | null>(null);
  const [editStudent, setEditStudent]     = useState<Student | null>(null);
  const [editForm, setEditForm]           = useState<EditFormState>({});
  const [deleteStudentId, setDeleteStudentId] = useState<number | null>(null);

  const navigate = useNavigate();
  const debouncedSearch = useDebounce(searchTerm, 400);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const loadStreams = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/classrooms/streams/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
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
      const params: Record<string, any> = { page, page_size: pageSize };
      if (debouncedSearch)       params.search          = debouncedSearch;
      if (educationLevelFilter)  params.education_level = educationLevelFilter;
      if (classFilter)           params.student_class   = classFilter;

      const res  = await studentService.getStudents(params) as any;
      let data: Student[] = Array.isArray(res) ? res : res.results ?? [];

      setCount(Array.isArray(res) ? res.length : res.count ?? 0);

      if (sectionFilter) {
        data = data.filter((s) => s.classroom?.split(' ').pop() === sectionFilter);
      }
      setStudents(data);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        status === 401 ? 'Session expired. Please log in again.' :
        status === 403 ? 'You do not have permission to view students.' :
        status === 404 ? 'Students endpoint not found.' :
        err?.response?.data?.message ?? err?.message ?? 'Failed to load students.';
      setError(msg);
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

  const toggleStudentSelection = (id: number) =>
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleSelectAll = () => {
    setSelectedStudents(selectAll ? [] : students.map((s) => s.id));
    setSelectAll((v) => !v);
  };

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
        full_name:       res.full_name,
        date_of_birth:   res.date_of_birth,
        education_level: res.education_level ?? '',
        student_class:   res.student_class ? String(res.student_class) : '',
        stream:          res.stream ? String(res.stream) : '',
        parent_contact:  res.parent_contact ?? '',
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
      const res = await studentService.updateStudent(editStudent.id, {
        ...editForm,
        stream: editForm.stream || null,
      });
      setStudents((prev) => prev.map((s) => (s.id === editStudent.id ? { ...s, ...res } : s)));
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

  const handleDeleteStudent   = (id: number) => setDeleteStudentId(id);
  const cancelDeleteStudent   = () => setDeleteStudentId(null);

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
  // DERIVED STATE
  // ============================================================================

  const totalPages         = Math.ceil(count / pageSize);
  const handlePrev         = () => setPage((p) => Math.max(1, p - 1));
  const handleNext         = () => setPage((p) => Math.min(totalPages, p + 1));
  const filteredClasses    = CLASS_CHOICES.filter((c) => c.level === editForm.education_level);
  const activeFilterCount  = [educationLevelFilter, sectionFilter, classFilter].filter(Boolean).length;

  const availableSections = [
    ...new Set(students.map((s) => s.classroom?.split(' ').pop()).filter(Boolean)),
  ] as string[];

  const clearFilters = () => {
    setEducationLevelFilter('');
    setSectionFilter('');
    setClassFilter('');
    setSearchTerm('');
  };

  const statsCards = [
    { label: 'Total Students', value: count,                                          color: 'blue'   },
    { label: 'Active',         value: students.filter((s) => s.is_active).length,     color: 'green'  },
    { label: 'Inactive',       value: students.filter((s) => !s.is_active).length,    color: 'red'    },
    { label: 'With Photos',    value: students.filter((s) => s.profile_picture).length, color: 'purple' },
  ];

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderSpinner = (borderColor = 'border-indigo-600') => (
    <div className="flex items-center justify-center py-16">
      <div className={`animate-spin rounded-full h-10 w-10 border-4 ${borderColor} border-t-transparent`} />
    </div>
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="bg-gray-50 min-h-screen">

      {/* ── Page Header ── */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Students</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage student information and records</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => alert('PDF export is temporarily disabled. Use browser print instead.')}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
            <button
              onClick={() => navigate('/admin/students/add')}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Student
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsCards.map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                <p className={`text-3xl font-bold mt-1 text-${color}-600`}>{value}</p>
              </div>
              <div className={`w-12 h-12 bg-${color}-100 rounded-full flex items-center justify-center`}>
                <User className={`w-5 h-5 text-${color}-600`} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Search & Filters ── */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="bg-white text-indigo-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option>Newest</option>
                <option>Oldest</option>
                <option>Name A-Z</option>
                <option>Name Z-A</option>
              </select>
            </div>
          </div>

          {showFilters && (
            <div className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Education Level</label>
                <select
                  value={educationLevelFilter}
                  onChange={(e) => setEducationLevelFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All Levels</option>
                  {EDUCATION_LEVEL_CHOICES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Class</label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All Classes</option>
                  {CLASS_CHOICES.filter((c) => !educationLevelFilter || c.level === educationLevelFilter).map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Section</label>
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="w-full px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Students Table ── */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            renderSpinner()
          ) : error ? (
            <div className="p-10 text-center text-red-500 text-sm">{error}</div>
          ) : students.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">No students found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="py-3.5 px-4 text-left">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-indigo-600 rounded"
                        checked={selectAll}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    {TABLE_HEADERS.map((h) => (
                      <th key={h} className="py-3.5 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-indigo-600 rounded"
                          checked={selectedStudents.includes(student.id)}
                          onChange={() => toggleStudentSelection(student.id)}
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar student={student} />
                          <span className="font-medium text-gray-900">{student.full_name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-indigo-600 font-medium">{student.id}</td>
                      <td className="py-3.5 px-4 text-gray-600">{student.admission_date}</td>
                      <td className="py-3.5 px-4 text-gray-600">{student.parent_contact ?? '—'}</td>
                      <td className="py-3.5 px-4 text-gray-600">{student.student_class_display}</td>
                      <td className="py-3.5 px-4 text-gray-600">{student.education_level_display}</td>
                      <td className="py-3.5 px-4 text-gray-600">{student.stream_name ?? '—'}</td>
                      <td className="py-3.5 px-4">
                        <StatusBadge active={student.is_active} />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditStudent(student.id)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(student.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => setActionMenuOpen((v) => (v === student.id ? null : student.id))}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {actionMenuOpen === student.id && (
                              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                                {[
                                  { label: 'View',    action: () => { handleViewStudent(student.id); setActionMenuOpen(null); } },
                                  { label: 'Edit',    action: () => { handleEditStudent(student.id); setActionMenuOpen(null); } },
                                  { label: 'Delete',  action: () => { handleDeleteStudent(student.id); setActionMenuOpen(null); } },
                                  {
                                    label: student.is_active ? 'Deactivate' : 'Activate',
                                    action: () => { handleToggleActive(student); setActionMenuOpen(null); },
                                  },
                                ].map(({ label, action }) => (
                                  <button
                                    key={label}
                                    onClick={action}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
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

          {/* ── Pagination ── */}
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-4">
            <p className="text-sm text-gray-500">
              Showing{' '}
              <span className="font-medium text-gray-900">{Math.min((page - 1) * pageSize + 1, count)}</span>
              {' – '}
              <span className="font-medium text-gray-900">{Math.min(page * pageSize, count)}</span>
              {' of '}
              <span className="font-medium text-gray-900">{count}</span>
              {' students'}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePrev}
                disabled={page === 1}
                aria-label="Previous page"
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {getPageRange(page, totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} className="w-9 h-9 flex items-center justify-center text-sm text-gray-400">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    aria-current={page === p ? 'page' : undefined}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                      page === p
                        ? 'bg-indigo-600 text-white border border-indigo-600'
                        : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={handleNext}
                disabled={page === totalPages}
                aria-label="Next page"
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* VIEW MODAL                                                    */}
      {/* ============================================================ */}
      {showViewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">

            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-5 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold">Student Profile</h2>
                <p className="text-indigo-200 text-sm mt-0.5">Detailed information and records</p>
              </div>
              <button
                onClick={() => { setShowViewModal(false); setViewStudent(null); }}
                className="p-2 hover:bg-white/20 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {modalLoading ? renderSpinner() : viewError ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
                  <p className="text-red-500 text-sm">{viewError}</p>
                </div>
              ) : viewStudent ? (
                <div className="flex flex-col lg:flex-row gap-6">

                  {/* Sidebar */}
                  <div className="lg:w-72 flex-shrink-0">
                    <div className="bg-gray-50 rounded-xl p-6 text-center">
                      <div className="flex justify-center mb-4">
                        <Avatar student={viewStudent} size="lg" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{viewStudent.full_name}</h3>
                      <p className="text-indigo-600 text-sm font-medium mb-4">ID: {viewStudent.id}</p>
                      <div className="flex flex-col gap-2 mb-5">
                        <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                          {viewStudent.education_level_display ?? 'Unknown Level'}
                        </span>
                        <StatusBadge active={viewStudent.is_active} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Age',     value: viewStudent.age ?? 'N/A' },
                          { label: 'Parents', value: viewStudent.parents?.length ?? 0 },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-white rounded-lg p-3">
                            <p className="text-xl font-bold text-indigo-600">{value}</p>
                            <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 space-y-5">
                    <div className="border border-gray-100 rounded-xl p-5">
                      <SectionLabel color="bg-indigo-600">Personal Information</SectionLabel>
                      <InfoGrid fields={[
                        { label: 'Username',       value: viewStudent.username ?? 'N/A' },
                        { label: 'Email',          value: viewStudent.email ?? 'N/A' },
                        { label: 'Gender',         value: viewStudent.gender ?? 'Not specified' },
                        { label: 'Date of Birth',  value: viewStudent.date_of_birth ? new Date(viewStudent.date_of_birth).toLocaleDateString() : 'Not specified' },
                        { label: 'Admission Date', value: viewStudent.admission_date ? new Date(viewStudent.admission_date).toLocaleDateString() : 'Not specified' },
                      ]} />
                    </div>

                    <div className="border border-gray-100 rounded-xl p-5">
                      <SectionLabel color="bg-blue-600">Academic Information</SectionLabel>
                      <InfoGrid fields={[
                        { label: 'Class',           value: viewStudent.student_class_display ?? 'Not assigned' },
                        { label: 'Education Level', value: viewStudent.education_level_display ?? 'Not specified' },
                        ...(viewStudent.stream_name ? [{ label: 'Stream', value: `${viewStudent.stream_name} (${viewStudent.stream_type})` }] : []),
                      ]} />
                    </div>

                    <div className="border border-gray-100 rounded-xl p-5">
                      <SectionLabel color="bg-green-600">Contact Information</SectionLabel>
                      <InfoGrid fields={[
                        { label: 'Parent Contact',    value: viewStudent.parent_contact ?? 'Not provided' },
                        { label: 'Emergency Contact', value: viewStudent.emergency_contact ?? 'Not provided' },
                      ]} />
                    </div>

                    {(viewStudent.parents?.length ?? 0) > 0 && (
                      <div className="border border-gray-100 rounded-xl p-5">
                        <SectionLabel color="bg-amber-500">Parent Information</SectionLabel>
                        <div className="space-y-3">
                          {viewStudent.parents!.map((parent: ParentInfo) => (
                            <div key={parent.id} className="bg-gray-50 rounded-lg p-4">
                              <InfoGrid fields={[
                                { label: 'Name',  value: parent.full_name },
                                { label: 'Email', value: parent.email ?? 'Not provided' },
                                { label: 'Phone', value: parent.phone ?? 'Not provided' },
                              ]} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border border-gray-100 rounded-xl p-5">
                      <SectionLabel color="bg-red-500">Medical Information</SectionLabel>
                      <InfoGrid fields={[
                        { label: 'Medical Conditions',  value: viewStudent.medical_conditions ?? 'None' },
                        { label: 'Special Requirements', value: viewStudent.special_requirements ?? 'None' },
                      ]} />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EDIT MODAL                                                    */}
      {/* ============================================================ */}
      {editStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">

            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-5 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold">Edit Student</h2>
                <p className="text-blue-200 text-sm mt-0.5">Update student information</p>
              </div>
              <button
                onClick={() => { setEditStudent(null); setEditForm({}); }}
                className="p-2 hover:bg-white/20 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {modalLoading ? renderSpinner('border-blue-600') : (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleEditSubmit(); }}
                  className="space-y-5"
                >
                  {/* Personal */}
                  <div className="bg-gray-50 rounded-xl p-5">
                    <SectionLabel color="bg-blue-600">Personal Information</SectionLabel>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Full Name</label>
                        <input
                          type="text"
                          value={editForm.full_name ?? ''}
                          disabled
                          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Date of Birth</label>
                        <input
                          type="date"
                          value={editForm.date_of_birth?.slice(0, 10) ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, date_of_birth: e.target.value }))}
                          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Academic */}
                  <div className="bg-gray-50 rounded-xl p-5">
                    <SectionLabel color="bg-green-600">Academic Information</SectionLabel>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Education Level</label>
                        <select
                          value={editForm.education_level ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, education_level: e.target.value, student_class: '' }))}
                          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">Select Level</option>
                          {EDUCATION_LEVEL_CHOICES.map((l) => (
                            <option key={l.value} value={l.value}>{l.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Class</label>
                        <select
                          value={editForm.student_class ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, student_class: e.target.value }))}
                          disabled={!editForm.education_level}
                          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <option value="">Select Class</option>
                          {filteredClasses.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      {editForm.education_level === 'SENIOR_SECONDARY' && (
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Stream (Optional)</label>
                          <select
                            value={editForm.stream ?? ''}
                            onChange={(e) => setEditForm((f) => ({ ...f, stream: e.target.value }))}
                            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          >
                            <option value="">Select Stream</option>
                            {streams.map((s) => (
                              <option key={s.id} value={s.id}>{s.name} ({s.stream_type})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="bg-gray-50 rounded-xl p-5">
                    <SectionLabel color="bg-purple-600">Contact Information</SectionLabel>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Parent Contact</label>
                      <input
                        type="text"
                        value={editForm.parent_contact ?? ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, parent_contact: e.target.value }))}
                        placeholder="Enter parent contact number"
                        className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {error && <p className="text-red-500 text-sm">{error}</p>}

                  <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => { setEditStudent(null); setEditForm({}); }}
                      className="px-5 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
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

      {/* ============================================================ */}
      {/* DELETE MODAL                                                  */}
      {/* ============================================================ */}
      {deleteStudentId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white px-6 py-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Confirm Delete</h2>
                <p className="text-red-100 text-sm">This action cannot be undone</p>
              </div>
            </div>
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">Delete this student?</h3>
              <p className="text-sm text-gray-500 mb-6">
                This will permanently remove the student and all associated data. This cannot be reversed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={cancelDeleteStudent}
                  className="flex-1 px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteStudent}
                  className="flex-1 px-4 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
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