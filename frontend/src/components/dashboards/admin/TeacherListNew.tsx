import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Filter,
  Edit3,
  Trash2,
  Eye,
  Phone,
  Calendar,
  X,
  AlertCircle,
  BookOpen,
  Grid3X3,
  List,
  ChevronDown,
  Award,
  Plus
} from 'lucide-react';
import TeacherService, { Teacher, UpdateTeacherData } from '@/services/TeacherService';
import { toast } from 'react-toastify';
import EditTeacherForm from './EditTeacherForm';
import { useNavigate } from 'react-router-dom';

const TeacherList = () => {
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [filteredTeachers, setFilteredTeachers] = useState<Teacher[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [teacherToEdit, setTeacherToEdit] = useState<Teacher | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const loadTeachers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await TeacherService.getTeachers();
      const teachersData = Array.isArray(response.results) ? response.results :
        Array.isArray(response) ? response : [];
      setTeachers(teachersData);
      setFilteredTeachers(teachersData);
    } catch (err: any) {
      console.error('Error loading teachers:', err);
      setError(err.response?.data?.message || 'Failed to load teachers');
      setTeachers([]);
      setFilteredTeachers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  useEffect(() => {
    let filtered = Array.isArray(teachers) ? teachers : [];

    if (searchTerm) {
      filtered = filtered.filter(teacher => {
        const teacherName = teacher.full_name || `${teacher.first_name || ''} ${teacher.last_name || ''}`;
        const teacherEmail = teacher.email || '';
        return teacherName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          teacherEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (teacher.qualification || '').toLowerCase().includes(searchTerm.toLowerCase());
      });
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(teacher =>
        statusFilter === 'active' ? teacher.is_active : !teacher.is_active
      );
    }

    if (levelFilter !== 'all') {
      filtered = filtered.filter(teacher => teacher.level === levelFilter);
    }

    setFilteredTeachers(filtered);
  }, [teachers, searchTerm, statusFilter, levelFilter]);

  const handleDelete = (teacher: Teacher) => {
    setTeacherToDelete(teacher);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (teacherToDelete) {
      try {
        setDeleting(true);
        await TeacherService.deleteTeacher(teacherToDelete.id);
        const teachersArray = Array.isArray(teachers) ? teachers : [];
        setTeachers(teachersArray.filter(t => t.id !== teacherToDelete.id));
        setShowDeleteModal(false);
        setTeacherToDelete(null);
        toast.success('Teacher deleted successfully');
      } catch (err: any) {
        const errorMessage = err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to delete teacher';
        toast.error(errorMessage);
      } finally {
        setDeleting(false);
      }
    }
  };

  const handleViewProfile = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setShowProfile(true);
  };

  const handleEdit = (teacher: Teacher) => {
    setTeacherToEdit(teacher);
    setShowEditModal(true);
  };

  const handleUpdateTeacher = async (updatedData: UpdateTeacherData) => {
    if (!teacherToEdit) return;

    try {
      const processedData = {
        ...updatedData,
        level: updatedData.level === null ? undefined : updatedData.level
      };

      await TeacherService.updateTeacher(teacherToEdit.id, processedData);
      await loadTeachers();
      setShowEditModal(false);
      setTeacherToEdit(null);
      toast.success('Teacher updated successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update teacher');
    }
  };

  const getLevelLabel = (level: string | null) => {
    const labels: Record<string, string> = {
      'nursery': 'Nursery',
      'primary': 'Primary',
      'junior_secondary': 'Junior Secondary',
      'senior_secondary': 'Senior Secondary',
      'secondary': 'Secondary'
    };
    return level ? labels[level] || level : 'Not assigned';
  };

  const getInitials = (firstName: string, lastName: string) => {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return `${first}${last}`.toUpperCase();
  };

  const activeFiltersCount = [
    statusFilter !== 'all' ? statusFilter : '',
    levelFilter !== 'all' ? levelFilter : ''
  ].filter(Boolean).length;

  const stats = {
    total: teachers.length,
    active: teachers.filter(t => t?.is_active).length,
    nursery: teachers.filter(t => t?.level === 'nursery' && t?.is_active).length,
    primary: teachers.filter(t => t?.level === 'primary' && t?.is_active).length,
    juniorSecondary: teachers.filter(t => t?.level === 'junior_secondary' && t?.is_active).length,
    seniorSecondary: teachers.filter(t => t?.level === 'senior_secondary' && t?.is_active).length,
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-4">Loading teachers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">Failed to load teachers</h3>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={loadTeachers}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Teachers</h1>
            <p className="text-sm text-gray-500 mt-1">
              {filteredTeachers.length} of {teachers.length} teachers
            </p>
          </div>
          <button
            onClick={() => navigate('/admin/teachers/add')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Teacher
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 transition-all duration-500 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {[
          { label: 'Total', value: stats.total, color: 'gray' },
          { label: 'Active', value: stats.active, color: 'emerald' },
          { label: 'Nursery', value: stats.nursery, color: 'pink' },
          { label: 'Primary', value: stats.primary, color: 'blue' },
          { label: 'Junior Sec', value: stats.juniorSecondary, color: 'violet' },
          { label: 'Senior Sec', value: stats.seniorSecondary, color: 'amber' }
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 mb-1">{stat.label}</p>
            <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className={`bg-white rounded-xl border border-gray-200 transition-all duration-500 delay-150 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, or qualification..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-shadow"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium transition-colors ${showFilters || activeFiltersCount > 0
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

              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'cards' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Level</label>
                  <div className="relative">
                    <select
                      value={levelFilter}
                      onChange={(e) => setLevelFilter(e.target.value)}
                      className="w-full h-10 px-3 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent appearance-none"
                    >
                      <option value="all">All Levels</option>
                      <option value="nursery">Nursery</option>
                      <option value="primary">Primary</option>
                      <option value="junior_secondary">Junior Secondary</option>
                      <option value="senior_secondary">Senior Secondary</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                  <div className="relative">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full h-10 px-3 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent appearance-none"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {activeFiltersCount > 0 && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      setLevelFilter('all');
                      setStatusFilter('all');
                    }}
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

      {/* Teachers Display */}
      <div className={`transition-all duration-500 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Teacher</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Contact</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Level</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Qualification</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTeachers.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center">
                            {teacher.photo ? (
                              <img
                                src={teacher.photo.startsWith('http') ? teacher.photo : `${import.meta.env.VITE_API_URL || ''}${teacher.photo}`}
                                alt={`${teacher.first_name} ${teacher.last_name}`}
                                className="w-9 h-9 rounded-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <span className="text-xs font-medium text-gray-600">
                                {getInitials(teacher.first_name, teacher.last_name)}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{teacher.first_name} {teacher.last_name}</p>
                            <p className="text-xs text-gray-500">{teacher.staff_type === 'teaching' ? 'Teaching Staff' : 'Non-Teaching'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-900">{teacher.phone_number || 'No phone'}</p>
                        <p className="text-xs text-gray-500">{teacher.email || 'No email'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">{getLevelLabel(teacher.level)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">{teacher.qualification || 'Not specified'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${teacher.is_active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-100 text-gray-600'
                          }`}>
                          {teacher.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleViewProfile(teacher)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(teacher)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(teacher)}
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTeachers.map((teacher) => (
              <div
                key={teacher.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                      {teacher.photo ? (
                        <img
                          src={teacher.photo.startsWith('http') ? teacher.photo : `${import.meta.env.VITE_API_URL || ''}${teacher.photo}`}
                          alt={`${teacher.first_name} ${teacher.last_name}`}
                          className="w-10 h-10 rounded-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <span className="text-sm font-medium text-gray-600">
                          {getInitials(teacher.first_name, teacher.last_name)}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{teacher.first_name} {teacher.last_name}</h3>
                      <p className="text-xs text-gray-500">{teacher.staff_type === 'teaching' ? 'Teaching Staff' : 'Non-Teaching'}</p>
                    </div>
                  </div>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${teacher.is_active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-gray-100 text-gray-600'
                    }`}>
                    {teacher.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="space-y-2.5 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <BookOpen className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{getLevelLabel(teacher.level)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{teacher.phone_number || 'No phone'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Award className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{teacher.qualification || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">Hired: {new Date(teacher.hire_date).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleViewProfile(teacher)}
                    className="flex-1 h-9 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleEdit(teacher)}
                    className="flex-1 h-9 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(teacher)}
                    className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredTeachers.length === 0 && !loading && (
        <div className="text-center py-16">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">No teachers found</h3>
          <p className="text-sm text-gray-500 mb-4">
            {searchTerm || activeFiltersCount > 0
              ? 'Try adjusting your search or filters.'
              : 'Get started by adding a new teacher.'}
          </p>
          <button
            onClick={() => navigate('/admin/teachers/add')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Teacher
          </button>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Delete Teacher</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete <span className="font-medium">{teacherToDelete?.first_name} {teacherToDelete?.last_name}</span>?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setTeacherToDelete(null); }}
                disabled={deleting}
                className="flex-1 h-10 px-4 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 h-10 px-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && selectedTeacher && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Teacher Profile</h2>
              <button
                onClick={() => setShowProfile(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                  {selectedTeacher.photo ? (
                    <img
                      src={selectedTeacher.photo.startsWith('http') ? selectedTeacher.photo : `${import.meta.env.VITE_API_URL || ''}${selectedTeacher.photo}`}
                      alt={`${selectedTeacher.first_name} ${selectedTeacher.last_name}`}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-semibold text-gray-600">
                      {getInitials(selectedTeacher.first_name, selectedTeacher.last_name)}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {selectedTeacher.first_name} {selectedTeacher.last_name}
                  </h3>
                  <p className="text-sm text-gray-500">{selectedTeacher.staff_type === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}</p>
                  <div className="flex gap-2 mt-2">
                    {selectedTeacher.level && (
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                        {getLevelLabel(selectedTeacher.level)}
                      </span>
                    )}
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${selectedTeacher.is_active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>
                      {selectedTeacher.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <p className="text-sm text-gray-900">{selectedTeacher.email || 'Not provided'}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                  <p className="text-sm text-gray-900">{selectedTeacher.phone_number || 'Not provided'}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Qualification</label>
                  <p className="text-sm text-gray-900">{selectedTeacher.qualification || 'Not provided'}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Specialization</label>
                  <p className="text-sm text-gray-900">{selectedTeacher.specialization || 'Not provided'}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hire Date</label>
                  <p className="text-sm text-gray-900">{new Date(selectedTeacher.hire_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                  <p className="text-sm text-gray-900">{selectedTeacher.address || 'Not provided'}</p>
                </div>
              </div>

              {selectedTeacher.assigned_subjects && selectedTeacher.assigned_subjects.length > 0 && (
                <div className="mt-6">
                  <label className="block text-xs font-medium text-gray-500 mb-2">Assigned Subjects</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTeacher.assigned_subjects.map((subject: any, idx: number) => (
                      <span key={idx} className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                        {subject.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-gray-100">
                <button
                  onClick={() => {
                    handleEdit(selectedTeacher);
                    setShowProfile(false);
                  }}
                  className="w-full h-10 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Edit Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && teacherToEdit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Edit Teacher</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setTeacherToEdit(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6">
              <EditTeacherForm
                teacher={teacherToEdit}
                onSave={handleUpdateTeacher}
                onCancel={() => {
                  setShowEditModal(false);
                  setTeacherToEdit(null);
                }}
                themeClasses={{
                  textPrimary: 'text-gray-900',
                  textSecondary: 'text-gray-600',
                  inputBg: 'bg-gray-50 border-gray-200',
                  inputFocus: 'focus:ring-gray-900 focus:border-transparent',
                  btnPrimary: 'bg-gray-900 hover:bg-gray-800 text-white',
                  btnSecondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700',
                }}
                isDark={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherList;
