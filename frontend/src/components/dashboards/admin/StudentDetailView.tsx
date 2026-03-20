import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  User,
  BookOpen,
  Award,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Heart,
  Shield,
  Edit,
  FileText,
  Eye,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  GraduationCap,
  Users,
  CreditCard,
  Stethoscope,
  Droplets,
  Activity,
  Hash,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import StudentService, { Student, GenderType, EducationLevelType } from '@/services/StudentService';
import { toast } from 'react-toastify';

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = (iso?: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const resolveDisplayName = (
  field: number | string | null | undefined,
  displayField?: string,
): string => {
  if (displayField) return displayField;
  if (field == null) return '—';
  return String(field);
};

const GENDER_LABEL: Record<GenderType, string> = { M: 'Male', F: 'Female' };

const EDUCATION_LEVEL_LABEL: Record<EducationLevelType, string> = {
  NURSERY: 'Nursery',
  PRIMARY: 'Primary',
  JUNIOR_SECONDARY: 'Junior Secondary',
  SENIOR_SECONDARY: 'Senior Secondary',
};

const EDUCATION_LEVEL_COLOR: Record<EducationLevelType, string> = {
  NURSERY: 'bg-amber-100 text-amber-800 ring-amber-200',
  PRIMARY: 'bg-blue-100 text-blue-800 ring-blue-200',
  JUNIOR_SECONDARY: 'bg-violet-100 text-violet-800 ring-violet-200',
  SENIOR_SECONDARY: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

// ============================================================================
// SMALL BADGE COMPONENTS
// ============================================================================

const StatusBadge: React.FC<{ isActive: boolean }> = ({ isActive }) =>
  isActive ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
      <CheckCircle className="w-3 h-3" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 ring-1 ring-red-200">
      <XCircle className="w-3 h-3" />
      Inactive
    </span>
  );

const GenderBadge: React.FC<{ gender: GenderType }> = ({ gender }) => (
  <span
    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${
      gender === 'M'
        ? 'bg-sky-100 text-sky-700 ring-sky-200'
        : 'bg-pink-100 text-pink-700 ring-pink-200'
    }`}
  >
    {GENDER_LABEL[gender] ?? gender}
  </span>
);

const EducationBadge: React.FC<{ level: EducationLevelType | null }> = ({ level }) => {
  if (!level) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${EDUCATION_LEVEL_COLOR[level]}`}
    >
      {EDUCATION_LEVEL_LABEL[level]}
    </span>
  );
};

// ============================================================================
// INFO ROW
// ============================================================================

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
    <span className="mt-0.5 flex-shrink-0 text-gray-400">{icon}</span>
    <div className="min-w-0">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <div className="text-sm font-medium text-gray-900 break-words">
        {value || <span className="text-gray-400 font-normal">Not provided</span>}
      </div>
    </div>
  </div>
);

// ============================================================================
// SECTION CARD
// ============================================================================

interface SectionCardProps {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({ title, icon, iconColor, children }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
      <span className={iconColor}>{icon}</span>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
    </div>
    <div className="px-6 py-2">{children}</div>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StudentDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDarkMode } = useGlobalTheme();

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStudentData = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const data = await StudentService.getStudent(parseInt(id, 10));
      setStudent(data);
    } catch (err) {
      console.error('Error loading student data:', err);
      setError('Failed to load student data. Please try again.');
      toast.error('Failed to load student data');
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    loadStudentData().finally(() => setLoading(false));
  }, [loadStudentData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStudentData();
    setRefreshing(false);
    toast.success('Student data refreshed');
  };

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-14 h-14">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
            <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
          </div>
          <p className="text-sm text-gray-500">Loading student details…</p>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (error || !student) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Could not load student</h2>
          <p className="text-sm text-gray-500">{error ?? 'Student not found'}</p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={() => navigate('/admin/students')}
              className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Back to Students
            </button>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Derived values (all type-safe) ----
  const classDisplay = resolveDisplayName(student.student_class, student.student_class_display);
  const sectionDisplay = resolveDisplayName(student.section, student.section_display);
  const educationLevelDisplay =
    student.education_level_display ??
    (student.education_level ? EDUCATION_LEVEL_LABEL[student.education_level] : '—');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ---- Top Nav Bar ---- */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/admin/students')}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Students
              </button>
              <span className="text-gray-300">/</span>
              <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                {student.full_name}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => navigate(`/admin/students/${student.id}/edit`)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Page Body ---- */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ================================================================
              LEFT / MAIN COLUMN
          ================================================================ */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Hero */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Gradient Banner */}
              <div className="h-24 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600" />

              <div className="px-6 pb-6">
                {/* Avatar */}
                <div className="flex items-end gap-4 -mt-10 mb-4">
                  <div className="flex-shrink-0">
                    {student.profile_picture ? (
                      <img
                        src={student.profile_picture}
                        alt={student.full_name}
                        className="w-20 h-20 rounded-2xl object-cover border-4 border-white shadow-md"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-gray-100 border-4 border-white shadow-md flex items-center justify-center">
                        <User className="w-9 h-9 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="mb-1 min-w-0">
                    <h2 className="text-xl font-bold text-gray-900 truncate">{student.full_name}</h2>
                    <p className="text-sm text-gray-500">
                      {student.user_details?.email ?? '—'}
                    </p>
                  </div>
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap gap-2">
                  <StatusBadge isActive={student.is_active} />
                  <GenderBadge gender={student.gender} />
                  <EducationBadge level={student.education_level} />
                  {student.registration_number && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 ring-1 ring-gray-200">
                      <Hash className="w-3 h-3" />
                      {student.registration_number}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Personal & Academic side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Personal Information */}
              <SectionCard
                title="Personal Information"
                icon={<User className="w-4.5 h-4.5" />}
                iconColor="text-blue-500"
              >
                <InfoRow
                  icon={<Calendar className="w-4 h-4" />}
                  label="Date of Birth"
                  value={formatDate(student.date_of_birth)}
                />
                <InfoRow
                  icon={<Activity className="w-4 h-4" />}
                  label="Age"
                  value={student.age != null ? `${student.age} years` : null}
                />
                <InfoRow
                  icon={<MapPin className="w-4 h-4" />}
                  label="Place of Birth"
                  value={student.place_of_birth}
                />
                <InfoRow
                  icon={<Droplets className="w-4 h-4" />}
                  label="Blood Group"
                  value={student.blood_group}
                />
                <InfoRow
                  icon={<MapPin className="w-4 h-4" />}
                  label="Home Address"
                  value={student.address}
                />
              </SectionCard>

              {/* Academic Information */}
              <SectionCard
                title="Academic Information"
                icon={<GraduationCap className="w-4.5 h-4.5" />}
                iconColor="text-emerald-500"
              >
                <InfoRow
                  icon={<BookOpen className="w-4 h-4" />}
                  label="Education Level"
                  value={
                    student.education_level ? (
                      <EducationBadge level={student.education_level} />
                    ) : (
                      educationLevelDisplay
                    )
                  }
                />
                <InfoRow
                  icon={<Award className="w-4 h-4" />}
                  label="Class"
                  value={classDisplay}
                />
                <InfoRow
                  icon={<Users className="w-4 h-4" />}
                  label="Section"
                  value={sectionDisplay}
                />
                <InfoRow
                  icon={<Users className="w-4 h-4" />}
                  label="Classroom"
                  value={student.classroom || '—'}
                />
                <InfoRow
                  icon={<Calendar className="w-4 h-4" />}
                  label="Admission Date"
                  value={formatDate(student.admission_date)}
                />
              </SectionCard>
            </div>

            {/* Contact Information */}
            <SectionCard
              title="Contact Information"
              icon={<Phone className="w-4.5 h-4.5" />}
              iconColor="text-purple-500"
            >
              <div className="grid grid-cols-1 md:grid-cols-2">
                <InfoRow
                  icon={<Mail className="w-4 h-4" />}
                  label="Email"
                  value={student.user_details?.email}
                />
                <InfoRow
                  icon={<Phone className="w-4 h-4" />}
                  label="Phone Number"
                  value={student.phone_number}
                />
                <InfoRow
                  icon={<Phone className="w-4 h-4" />}
                  label="Parent Contact"
                  value={student.parent_contact}
                />
                <InfoRow
                  icon={<Shield className="w-4 h-4" />}
                  label="Emergency Contact"
                  value={student.emergency_contact}
                />
              </div>
            </SectionCard>

            {/* Medical Information */}
            <SectionCard
              title="Medical Information"
              icon={<Stethoscope className="w-4.5 h-4.5" />}
              iconColor="text-red-500"
            >
              <div className="grid grid-cols-1 md:grid-cols-2">
                <InfoRow
                  icon={<Heart className="w-4 h-4" />}
                  label="Medical Conditions"
                  value={student.medical_conditions}
                />
                <InfoRow
                  icon={<Activity className="w-4 h-4" />}
                  label="Special Requirements"
                  value={student.special_requirements}
                />
              </div>
            </SectionCard>

            {/* Financial Information */}
            <SectionCard
              title="Financial Information"
              icon={<CreditCard className="w-4.5 h-4.5" />}
              iconColor="text-indigo-500"
            >
              <InfoRow
                icon={<CreditCard className="w-4 h-4" />}
                label="Payment Method"
                value={student.payment_method}
              />
            </SectionCard>
          </div>

          {/* ================================================================
              RIGHT / SIDEBAR COLUMN
          ================================================================ */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">Quick Actions</h3>
              </div>
              <div className="p-4 space-y-2">
                <button
                  onClick={() => navigate(`/admin/students/${student.id}/edit`)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-sm font-medium"
                >
                  <Edit className="w-4 h-4" />
                  Edit Student
                </button>
                <button
                  onClick={() => navigate(`/admin/students/${student.id}/results`)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-sm font-medium"
                >
                  <FileText className="w-4 h-4" />
                  View Results
                </button>
                <button
                  onClick={() => navigate(`/admin/students/${student.id}/history`)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors text-sm font-medium"
                >
                  <Eye className="w-4 h-4" />
                  Academic History
                </button>
              </div>
            </div>

            {/* At-a-Glance Stats */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">At a Glance</h3>
              </div>
              <div className="p-4 space-y-3">
                {[
                  { label: 'Status', value: <StatusBadge isActive={student.is_active} /> },
                  { label: 'Gender', value: <GenderBadge gender={student.gender} /> },
                  {
                    label: 'Education Level',
                    value: <EducationBadge level={student.education_level} />,
                  },
                  {
                    label: 'Age',
                    value: student.age != null ? (
                      <span className="text-sm font-semibold text-gray-800">
                        {student.age} years
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    ),
                  },
                  {
                    label: 'Stream',
                    value:
                      student.stream != null ? (
                        <span className="text-sm font-semibold text-gray-800">
                          {String(student.stream)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      ),
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500">{label}</span>
                    {value}
                  </div>
                ))}
              </div>
            </div>

            {/* Parent Information */}
            {student.parents && student.parents.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-500" />
                    Parents / Guardians
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  {student.parents.map((parent) => (
                    <div key={parent.id} className="bg-gray-50 rounded-xl p-3 space-y-1">
                      <p className="text-sm font-semibold text-gray-900">{parent.full_name}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {parent.email || '—'}
                      </p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {parent.phone || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDetailView;