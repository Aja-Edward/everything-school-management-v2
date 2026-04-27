import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import { toast } from 'react-toastify';
import {
  Users,
  Search,
  Phone,
  Calendar,
  User,
  GraduationCap,
  BookOpen,
  RefreshCw,
  AlertCircle,
  Grid3X3,
  List
} from 'lucide-react';

interface Student {
  id: number;
  full_name: string;
  registration_number: string;
  profile_picture?: string;
  gender: string;
  age: number;
  education_level?: string | null;
  education_level_display: string;
  student_class: string;
  admission_date: string;
  parent_contact?: string;
  // Assignment context fields
  class_name?: string;
  section_name?: string;
  grade_level_name?: string;
  subject_name?: string;
}

interface TeacherAssignment {
  id: number;
  classroom_id?: number;
  classroom_name?: string;
  class_name?: string;       // fallback field name
  section_name?: string;
  grade_level_name?: string;
  education_level?: string | null;
  subject_name?: string;
  subject_code?: string;
  is_primary_teacher?: boolean;
  periods_per_week?: number;
}

// Safely resolve which field holds the classroom name across API variants
function resolveClassroomName(a: TeacherAssignment): string {
  return (a as any).classroom_name ?? (a as any).name ?? '';
}

const StudentsList: React.FC = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGender, setFilterGender] = useState('all');
  const [filterClass, setFilterClass] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);

  useEffect(() => {
    if (user && !isLoading) {
      loadTeacherData();
    }
  }, [user, isLoading]);

  const loadTeacherData = async () => {
    try {
      setLoading(true);
      setError(null);

      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      if (!teacherId) throw new Error('Teacher ID not found');

      const assignmentsResponse = await TeacherDashboardService.getTeacherClasses(teacherId);
      const assignments: TeacherAssignment[] = assignmentsResponse || [];

      // Build filter options from assignment metadata — no extra API calls needed
      const classSet = new Set<string>();
      const subjectSet = new Set<string>();
      assignments.forEach(a => {
        const name = resolveClassroomName(a);
        if (name) classSet.add(name);
        if (a.subject_name) subjectSet.add(a.subject_name);
      });
      setAvailableClasses([...classSet]);
      setAvailableSubjects([...subjectSet]);

      await loadStudentsByAssignments(teacherId, assignments);
    } catch (err) {
      console.error('Error loading teacher data:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load teacher data';
      setError(msg);
      toast.error('Failed to load teacher data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadStudentsByAssignments = async (
  teacherId: number,
  assignments: TeacherAssignment[]
) => {
  const allStudents: Student[] = [];
  const seenIds = new Set<number>();

  for (const assignment of assignments) {
    
    const classroomId = (assignment as any).classroom_id ?? (assignment as any).id;
    const classroomName = (assignment as any).classroom_name ?? (assignment as any).name ?? '';

    if (!classroomId) {
      console.warn(
        `Assignment ${assignment.id} ("${classroomName}") has no classroom_id — skipping.`
      );
      continue;
    }

    try {
      const raw = await TeacherDashboardService.getStudentsForClass(classroomId);
      const studentsData: any[] = Array.isArray(raw) ? raw : [];

      for (const student of studentsData) {
        if (seenIds.has(student.id)) continue;
        seenIds.add(student.id);
        allStudents.push({
          ...student,
          class_name: classroomName,
          section_name: (assignment as any).section_name ?? '',
          grade_level_name: (assignment as any).grade_level_name ?? '',
          subject_name: assignment.subject_name ?? '',
          education_level: assignment.education_level ?? student.education_level ?? null,
        });
      }
    } catch (err) {
      console.warn(`Failed to load students for classroom ${classroomId}:`, err);
    }
  }

  setStudents(allStudents);

};

  const handleRefresh = async () => {
    await loadTeacherData();
    toast.success('Students list refreshed!');
  };

  const handleViewProfile = (studentId: number) => {
    navigate(`/teacher/student/${studentId}`);
  };

  const handleSendMessage = () => {
    toast.info('Student messaging feature coming soon!');
  };

  // ── helpers ──────────────────────────────────────────────────────────────

  const getGenderColor = (gender?: string | null) => {
    switch ((gender ?? '').toLowerCase()) {
      case 'male': case 'm':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'female': case 'f':
        return 'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const formatGender = (gender?: string | null) => {
    switch ((gender ?? '').toLowerCase()) {
      case 'male': case 'm': return 'Male';
      case 'female': case 'f': return 'Female';
      default: return gender || 'Not specified';
    }
  };

  const getEducationLevelColor = (level?: string | null) => {
    // Guard against null / undefined / non-string before calling toUpperCase
    if (!level || typeof level !== 'string') {
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
    switch (level.toUpperCase()) {
      case 'SENIOR_SECONDARY':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'JUNIOR_SECONDARY':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'PRIMARY':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'NURSERY':
        return 'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const formatEducationLevel = (level?: string | null) =>
    level ? level.replace(/_/g, ' ') : 'Not specified';

  // ── filtered list ─────────────────────────────────────────────────────────

  const filteredStudents = students.filter(student => {
    const matchesSearch =
      student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.registration_number.toLowerCase().includes(searchTerm.toLowerCase());

    const genderLower = (student.gender ?? '').toLowerCase();
    const matchesGender =
      filterGender === 'all' ||
      genderLower === filterGender ||
      (genderLower === 'm' && filterGender === 'male') ||
      (genderLower === 'f' && filterGender === 'female');

    const matchesClass = filterClass === 'all' || student.class_name === filterClass;
    const matchesSubject = filterSubject === 'all' || student.subject_name === filterSubject;

    return matchesSearch && matchesGender && matchesClass && matchesSubject;
  });

  // ── render ────────────────────────────────────────────────────────────────

  if (isLoading || loading) {
    return (
      <TeacherDashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            <p className="text-slate-600 dark:text-slate-400">
              {isLoading ? 'Loading authentication...' : 'Loading students...'}
            </p>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  if (!user) {
    return (
      <TeacherDashboardLayout>
        <div className="p-6 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Authentication Required
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">Please log in to view students.</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Go to Login
          </button>
        </div>
      </TeacherDashboardLayout>
    );
  }

  return (
    <TeacherDashboardLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">My Students</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              View and manage students assigned to your classes and subjects
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </button>
            <button
              onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {viewMode === 'grid'
                ? <List className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                : <Grid3X3 className="w-4 h-4 text-slate-600 dark:text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or registration number..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filterGender}
            onChange={e => setFilterGender(e.target.value)}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>

          {availableClasses.length > 0 && (
            <select
              value={filterClass}
              onChange={e => setFilterClass(e.target.value)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Classes</option>
              {availableClasses.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}

          {availableSubjects.length > 0 && (
            <select
              value={filterSubject}
              onChange={e => setFilterSubject(e.target.value)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Subjects</option>
              {availableSubjects.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Count */}
        <div className="flex items-center justify-between">
          <p className="text-slate-600 dark:text-slate-400">
            Showing {filteredStudents.length} of {students.length} students
          </p>
          {students.length === 0 && !loading && (
            <p className="text-orange-600 dark:text-orange-400 text-sm">
              No students assigned to your classes yet.
            </p>
          )}
        </div>

        {/* Empty state */}
        {filteredStudents.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No students found
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              {searchTerm || filterGender !== 'all' || filterClass !== 'all' || filterSubject !== 'all'
                ? 'Try adjusting your search or filter criteria.'
                : 'No students are currently assigned to your classes.'}
            </p>
          </div>

        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStudents.map(student => (
              <div
                key={student.id}
                className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden">
                    {student.profile_picture
                      ? <img src={student.profile_picture} alt={student.full_name} className="w-full h-full object-cover" />
                      : <User className="w-8 h-8 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                      {student.full_name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{student.registration_number}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                    <Calendar className="w-4 h-4 flex-shrink-0" />
                    <span>Age: {student.age ?? '—'} years</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                    <GraduationCap className="w-4 h-4 flex-shrink-0" />
                    <span>{student.class_name || student.student_class || '—'}</span>
                  </div>
                  {student.subject_name && (
                    <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                      <BookOpen className="w-4 h-4 flex-shrink-0" />
                      <span>{student.subject_name}</span>
                    </div>
                  )}
                  {student.parent_contact && (
                    <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                      <Phone className="w-4 h-4 flex-shrink-0" />
                      <span>{student.parent_contact}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${getGenderColor(student.gender)}`}>
                    {formatGender(student.gender)}
                  </span>
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${getEducationLevelColor(student.education_level)}`}>
                    {formatEducationLevel(student.education_level  || student.education_level_display)}
                  </span>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => handleViewProfile(student.id)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    View Profile
                  </button>
                  <button
                    onClick={handleSendMessage}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Message
                  </button>
                </div>
              </div>
            ))}
          </div>

        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700">
                <tr>
                  {['Student', 'Registration', 'Class / Subject', 'Age / Gender', 'Contact', 'Actions'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredStudents.map(student => (
                  <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {student.profile_picture
                            ? <img src={student.profile_picture} alt={student.full_name} className="w-full h-full object-cover" />
                            : <User className="w-5 h-5 text-white" />}
                        </div>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {student.full_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                      {student.registration_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                      <div className="font-medium">{student.class_name || student.student_class}</div>
                      {student.subject_name && (
                        <div className="text-xs text-slate-500">{student.subject_name}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">{student.age ?? '—'} yrs</span>
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${getGenderColor(student.gender)}`}>
                          {formatGender(student.gender)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                      {student.parent_contact || 'Not provided'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewProfile(student.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                        >
                          View
                        </button>
                        <button
                          onClick={handleSendMessage}
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                        >
                          Message
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TeacherDashboardLayout>
  );
};

export default StudentsList;