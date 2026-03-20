import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Filter,
  MoreVertical,
  Edit,
  User,
  AlertCircle,
  Grid3X3,
  List,
  Eye,
  FileText,
  GraduationCap,
  Calendar,
  Mail,
  BookOpen,
  Trash2,
  ChevronDown,
  Users,
} from 'lucide-react';
import StudentService, {
  Student,
  GenderType,
  EducationLevelType,
} from '@/services/StudentService';
import { useNavigate } from 'react-router-dom';
import ResultSheetView from './ResultSheetView';

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

const EDUCATION_LEVEL_CHOICES: { value: EducationLevelType; label: string }[] = [
  { value: 'NURSERY', label: 'Nursery' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'JUNIOR_SECONDARY', label: 'Junior Secondary' },
  { value: 'SENIOR_SECONDARY', label: 'Senior Secondary' },
];

const EDUCATION_LEVEL_LABEL: Record<EducationLevelType, string> = {
  NURSERY: 'Nursery',
  PRIMARY: 'Primary',
  JUNIOR_SECONDARY: 'Junior Secondary',
  SENIOR_SECONDARY: 'Senior Secondary',
};

const GENDER_LABEL: Record<GenderType, string> = { M: 'Male', F: 'Female' };

/**
 * Resolve a display name for student_class.
 * The field can be a DB ID (number), a name string, or null.
 * Prefer the pre-resolved display field from the serializer when available.
 */
const resolveClassDisplay = (
  student: Student,
): string => {
  if (student.student_class_display) return student.student_class_display;
  if (student.student_class_detail) return student.student_class_detail.name;
  if (student.student_class != null) return String(student.student_class);
  return '—';
};

const resolveEducationLevelDisplay = (student: Student): string => {
  if (student.education_level_display) return student.education_level_display;
  if (student.education_level) return EDUCATION_LEVEL_LABEL[student.education_level];
  return '—';
};

// ============================================================================
// COMPONENT
// ============================================================================

const StudentListEnhanced: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The dropdown menu open state: stores the student id whose menu is open
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [educationLevelFilter, setEducationLevelFilter] = useState<EducationLevelType | ''>('');
  // classFilter stores the raw student_class value (string or numeric string)
  const [classFilter, setClassFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderType | ''>('');

  const [showResultSheet, setShowResultSheet] = useState(false);
  const [deleteStudentId, setDeleteStudentId] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mounted, setMounted] = useState(false);

  const navigate = useNavigate();
  const debouncedSearch = useDebounce(searchTerm, 400);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await StudentService.getStudents();
      const studentsArray = Array.isArray(response) ? response : [];
      setStudents(studentsArray);
      setFilteredStudents(studentsArray);
    } catch (err) {
      console.error('Error fetching students:', err);
      setError('Failed to load students. Please try again.');
      setStudents([]);
      setFilteredStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // ---- Filtering ----
  useEffect(() => {
    let filtered = students;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.full_name?.toLowerCase().includes(q) ||
          s.username?.toLowerCase().includes(q) ||
          // email lives under user_details
          s.user_details?.email?.toLowerCase().includes(q) ||
          s.registration_number?.toLowerCase().includes(q),
      );
    }

    if (educationLevelFilter) {
      filtered = filtered.filter((s) => s.education_level === educationLevelFilter);
    }

    if (classFilter) {
      // Match against the raw FK value (could be number or string)
      filtered = filtered.filter(
        (s) => s.student_class != null && String(s.student_class) === classFilter,
      );
    }

    if (genderFilter) {
      filtered = filtered.filter((s) => s.gender === genderFilter);
    }

    setFilteredStudents(filtered);
  }, [students, debouncedSearch, educationLevelFilter, classFilter, genderFilter]);

  /**
   * Build a unique list of classes from the loaded students for the filter
   * dropdown — avoids relying on a hardcoded CLASS_CHOICES list.
   */
  const availableClasses = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of students) {
      if (s.student_class == null) continue;
      // Skip if an education level filter is active and doesn't match
      if (educationLevelFilter && s.education_level !== educationLevelFilter) continue;
      const key = String(s.student_class);
      if (!seen.has(key)) {
        seen.set(key, resolveClassDisplay(s));
      }
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [students, educationLevelFilter]);

  // ---- Delete ----
  const handleDeleteStudent = (studentId: number) => {
    setDeleteStudentId(studentId);
    setShowDeleteModal(true);
  };

  const confirmDeleteStudent = async () => {
    if (!deleteStudentId) return;
    try {
      setDeleting(true);
      await StudentService.deleteStudent(deleteStudentId);
      setStudents((prev) => prev.filter((s) => s.id !== deleteStudentId));
      setFilteredStudents((prev) => prev.filter((s) => s.id !== deleteStudentId));
      setShowDeleteModal(false);
      setDeleteStudentId(null);
    } catch (err) {
      console.error('Error deleting student:', err);
      setError('Failed to delete student. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const activeFiltersCount = [educationLevelFilter, classFilter, genderFilter].filter(Boolean).length;

  const clearFilters = () => {
    setEducationLevelFilter('');
    setClassFilter('');
    setGenderFilter('');
  };

  // ============================================================================
  // LOADING / ERROR STATES
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-4">Loading students…</p>
        </div>
      </div>
    );
  }

  if (error && students.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">Failed to load students</h3>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchStudents}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-6" onClick={() => setOpenMenuId(null)}>
      {/* ---- Header ---- */}
      <div
        className={`transition-all duration-500 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Students</h1>
            <p className="text-sm text-gray-500 mt-1">
              {filteredStudents.length} of {students.length} students
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowResultSheet(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Result Sheet
            </button>
            <button
              onClick={() => navigate('/admin/students/add')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Student
            </button>
          </div>
        </div>
      </div>

      {/* ---- Search & Filters ---- */}
      <div
        className={`bg-white rounded-xl border border-gray-200 transition-all duration-500 delay-100 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, registration number, or email…"
                className="w-full h-10 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-shadow"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Filter Toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowFilters(!showFilters); }}
                className={`flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium transition-colors ${
                  showFilters || activeFiltersCount > 0
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <span className="w-5 h-5 bg-white text-gray-900 rounded-full text-xs flex items-center justify-center font-semibold">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* View Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Education Level */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Education Level
                  </label>
                  <div className="relative">
                    <select
                      value={educationLevelFilter}
                      onChange={(e) => {
                        setEducationLevelFilter(e.target.value as EducationLevelType | '');
                        setClassFilter(''); // reset class when level changes
                      }}
                      className="w-full h-10 px-3 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent appearance-none"
                    >
                      <option value="">All Levels</option>
                      {EDUCATION_LEVEL_CHOICES.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Class — populated dynamically from loaded students */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Class</label>
                  <div className="relative">
                    <select
                      value={classFilter}
                      onChange={(e) => setClassFilter(e.target.value)}
                      className="w-full h-10 px-3 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent appearance-none"
                    >
                      <option value="">All Classes</option>
                      {availableClasses.map((cls) => (
                        <option key={cls.value} value={cls.value}>
                          {cls.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Gender — values match GenderType: 'M' | 'F' */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Gender</label>
                  <div className="relative">
                    <select
                      value={genderFilter}
                      onChange={(e) => setGenderFilter(e.target.value as GenderType | '')}
                      className="w-full h-10 px-3 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent appearance-none"
                    >
                      <option value="">All Genders</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {activeFiltersCount > 0 && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={clearFilters}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- Student Display ---- */}
      <div
        className={`transition-all duration-500 delay-200 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {viewMode === 'list' ? (
          // ==================================================================
          // LIST VIEW
          // ==================================================================
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Student', 'Class', 'Level', 'Gender', 'Status', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                      {/* Student */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {student.profile_picture ? (
                            <img
                              src={student.profile_picture}
                              alt={student.full_name}
                              className="w-9 h-9 rounded-full object-cover bg-gray-100"
                            />
                          ) : (
                            <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-gray-500" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-gray-900">{student.full_name}</p>
                            <p className="text-xs text-gray-500">
                              {student.registration_number ??
                                student.user_details?.email ??
                                student.username ??
                                `#${student.id}`}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Class */}
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">{resolveClassDisplay(student)}</span>
                      </td>

                      {/* Education Level */}
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {resolveEducationLevelDisplay(student)}
                        </span>
                      </td>

                      {/* Gender */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            student.gender === 'M'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-pink-50 text-pink-700'
                          }`}
                        >
                          {GENDER_LABEL[student.gender] ?? student.gender}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            student.is_active
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {student.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/admin/students/${student.id}`)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/admin/students/${student.id}/edit`)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/admin/students/${student.id}/results`)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Results"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(student.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
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
        ) : (
          // ==================================================================
          // GRID VIEW
          // ==================================================================
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredStudents.map((student) => (
              <div
                key={student.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {student.profile_picture ? (
                      <img
                        src={student.profile_picture}
                        alt={student.full_name}
                        className="w-10 h-10 rounded-full object-cover bg-gray-100 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-gray-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {student.full_name}
                      </h3>
                      <p className="text-xs text-gray-500 truncate">
                        {student.registration_number ?? student.username ?? `#${student.id}`}
                      </p>
                    </div>
                  </div>

                  {/* Overflow menu */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === student.id ? null : student.id);
                      }}
                      className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>

                    {openMenuId === student.id && (
                      <div
                        className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[140px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => { navigate(`/admin/students/${student.id}`); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4" /> View
                        </button>
                        <button
                          onClick={() => { navigate(`/admin/students/${student.id}/edit`); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Edit className="w-4 h-4" /> Edit
                        </button>
                        <button
                          onClick={() => { navigate(`/admin/students/${student.id}/results`); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <FileText className="w-4 h-4" /> Results
                        </button>
                        <button
                          onClick={() => { handleDeleteStudent(student.id); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card details */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <GraduationCap className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600 truncate">{resolveClassDisplay(student)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <BookOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600">{resolveEducationLevelDisplay(student)}</span>
                  </div>
                  {student.user_details?.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600 truncate">{student.user_details.email}</span>
                    </div>
                  )}
                  {student.date_of_birth && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600">
                        {new Date(student.date_of_birth).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      student.gender === 'M'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-pink-50 text-pink-700'
                    }`}
                  >
                    {GENDER_LABEL[student.gender] ?? student.gender}
                  </span>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      student.is_active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {student.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Empty State ---- */}
      {filteredStudents.length === 0 && !loading && (
        <div className="text-center py-16">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">No students found</h3>
          <p className="text-sm text-gray-500 mb-4">
            {searchTerm || activeFiltersCount > 0
              ? 'Try adjusting your search or filters.'
              : 'Get started by adding a new student.'}
          </p>
          <button
            onClick={() => navigate('/admin/students/add')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Student
          </button>
        </div>
      )}

      {/* ---- Result Sheet Modal ---- */}
      <ResultSheetView
        isOpen={showResultSheet}
        onClose={() => setShowResultSheet(false)}
        selectedClass={classFilter}
      />

      {/* ---- Delete Confirmation Modal ---- */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Delete Student</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to permanently delete this student and all associated data?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteStudentId(null); }}
                disabled={deleting}
                className="flex-1 h-10 px-4 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteStudent}
                disabled={deleting}
                className="flex-1 h-10 px-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting…
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentListEnhanced;