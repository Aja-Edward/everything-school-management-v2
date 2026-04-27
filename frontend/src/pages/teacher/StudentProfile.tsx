import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useParams } from 'react-router-dom';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import ClassroomService from '@/services/ClassroomService';
import type { Parent } from '@/types/types';
import { toast } from 'react-toastify';
import { 
  ArrowLeft, 
  User, 
  Calendar, 
  MapPin, 
  Phone, 
  Mail, 
  GraduationCap, 
  BookOpen,
  Award,
  Users,
  Shield,
  FileText,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface Student {
  id: number;
  full_name: string;
  registration_number: string;
  username?: string;
  profile_picture?: string;
  gender: string;
  age: number;
  education_level: string;
  student_class: string;
  admission_date: string;
  parents?: Parent[];
  parent_contact?: string;
  emergency_contact?: string;
  classroom?: string;
  address?: string;
  email?: string;
  phone_number?: string;
  date_of_birth?: string;
  nationality?: string;
  religion?: string;
  blood_group?: string;
  medical_conditions?: string;
  allergies?: string;
  guardian_name?: string;
  guardian_phone?: string;
  guardian_email?: string;
  guardian_relationship?: string;
  guardian_address?: string;
  guardian_occupation?: string;
}

interface StudentProfileProps {}

const StudentProfile: React.FC<StudentProfileProps> = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { studentId } = useParams();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'academic' | 'personal' | 'guardian' | 'medical'>('overview');

  // Load student data
  useEffect(() => {
    if (studentId && user && !isLoading) {
      loadStudentData();
    }
  }, [studentId, user, isLoading]);

  const loadStudentData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔍 loadStudentData - Starting with studentId:', studentId);

      // Get teacher ID to verify access
      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      if (!teacherId) {
        throw new Error('Teacher ID not found');
      }

      // Get student details
      const studentResponse = await ClassroomService.getStudentDetails(parseInt(studentId!));
      const studentData = studentResponse.data || studentResponse;
      
      if (!studentData) {
        throw new Error('Student not found');
      }

      setStudent(studentData);
      console.log('🔍 Loaded student data:', studentData);
    } catch (error) {
      console.error('Error loading student data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load student data');
      toast.error('Failed to load student data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadStudentData();
    toast.success('Student data refreshed!');
  };

  const handleSendMessage = () => {
    toast.info('Student messaging feature coming soon!');
  };

  const formatGenderDisplay = (gender: string | undefined | null) => {
    if (!gender) return 'Not specified';
    
    switch (gender.toLowerCase()) {
      case 'male':
      case 'm':
        return 'Male';
      case 'female':
      case 'f':
        return 'Female';
      default:
        return gender;
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Not specified';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const calculateAge = (birthDate: string | undefined) => {
    if (!birthDate) return 'Not specified';
    try {
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      return `${age} years`;
    } catch {
      return 'Not specified';
    }
  };

  // Show loading state while auth is loading or data is loading
  if (isLoading || loading) {
    return (
      <TeacherDashboardLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="text-slate-600 dark:text-slate-400">
                {isLoading ? 'Loading authentication...' : 'Loading student profile...'}
              </p>
            </div>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  // Check if user is authenticated
  if (!user) {
    return (
      <TeacherDashboardLayout>
        <div className="p-6 space-y-6">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Authentication Required</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Please log in to view student profiles.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors duration-200"
            >
              Go to Login
            </button>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  if (!student) {
    return (
      <TeacherDashboardLayout>
        <div className="p-6 space-y-6">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Student Not Found</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {error || 'The requested student could not be found.'}
            </p>
            <button
              onClick={() => navigate('/teacher/classes')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors duration-200"
            >
              Back to Classes
            </button>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  return (
    <TeacherDashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/teacher/classes')}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors duration-200"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Student Profile
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                {student.full_name} • {student.registration_number}
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors duration-200"
            >
              <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </button>
            <button
              onClick={handleSendMessage}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors duration-200"
            >
              Send Message
            </button>
          </div>
        </div>

        {/* Student Basic Info Card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-start space-x-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              {student.profile_picture ? (
                <img 
                  src={student.profile_picture} 
                  alt={student.full_name}
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-white" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {student.full_name}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                {student.registration_number}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                  <GraduationCap className="w-4 h-4" />
                  <span>{student.student_class}</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                  <Calendar className="w-4 h-4" />
                  <span>{calculateAge(student.date_of_birth)}</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                  <Users className="w-4 h-4" />
                  <span>{formatGenderDisplay(student.gender)}</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                  <BookOpen className="w-4 h-4" />
                  <span>{student.education_level?.replace('_', ' ') || 'Not specified'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="border-b border-slate-200 dark:border-slate-700">
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'overview', label: 'Overview', icon: User },
                { id: 'academic', label: 'Academic', icon: GraduationCap },
                { id: 'personal', label: 'Personal', icon: User },
                { id: 'guardian', label: 'Guardian', icon: Shield },
                { id: 'medical', label: 'Medical', icon: FileText }
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Basic Information</h3>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-600 dark:text-slate-400">Name:</span>
                        <span className="font-medium text-slate-900 dark:text-white">{student.full_name}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Award className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-600 dark:text-slate-400">Registration:</span>
                        <span className="font-medium text-slate-900 dark:text-white">{student.registration_number ?? student.username}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-600 dark:text-slate-400">Admission Date:</span>
                        <span className="font-medium text-slate-900 dark:text-white">{formatDate(student.admission_date)}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <GraduationCap className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-600 dark:text-slate-400">Class:</span>
                        <span className="font-medium text-slate-900 dark:text-white">{student.classroom}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Contact Information</h3>
                    <div className="space-y-3">
                      {student.email && (
                        <div className="flex items-center space-x-3">
                          <Mail className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-600 dark:text-slate-400">Email:</span>
                          <span className="font-medium text-slate-900 dark:text-white">{student.email}</span>
                        </div>
                      )}
                      {student.phone_number && (
                        <div className="flex items-center space-x-3">
                          <Phone className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-600 dark:text-slate-400">Phone:</span>
                          <span className="font-medium text-slate-900 dark:text-white">{student.phone_number}</span>
                        </div>
                      )}
                      {student.address && (
                        <div className="flex items-center space-x-3">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-600 dark:text-slate-400">Address:</span>
                          <span className="font-medium text-slate-900 dark:text-white">{student.address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'academic' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Academic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                      <h4 className="font-medium text-slate-900 dark:text-white mb-3">Current Status</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Education Level:</span>
                          <span className="font-medium">{student.education_level?.replace('_', ' ') || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Classroom:</span>
                          <span className="font-medium">{student.classroom}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Admission Date:</span>
                          <span className="font-medium">{formatDate(student.admission_date)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                      <h4 className="font-medium text-slate-900 dark:text-white mb-3">Academic Details</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Registration Number:</span>
                          <span className="font-medium">{student.username}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Student ID:</span>
                          <span className="font-medium">{student.id}</span>
                        </div>
                      </div>  
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'personal' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Personal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                      <h4 className="font-medium text-slate-900 dark:text-white mb-3">Personal Details</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Full Name:</span>
                          <span className="font-medium">{student.full_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Gender:</span>
                          <span className="font-medium">{formatGenderDisplay(student.gender)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Date of Birth:</span>
                          <span className="font-medium">{formatDate(student.date_of_birth)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Age:</span>
                          <span className="font-medium">{calculateAge(student.date_of_birth)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                      <h4 className="font-medium text-slate-900 dark:text-white mb-3">Additional Details</h4>
                      <div className="space-y-2">
                        {student.nationality && (
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Nationality:</span>
                            <span className="font-medium">{student.nationality}</span>
                          </div>
                        )}
                        {student.religion && (
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Religion:</span>
                            <span className="font-medium">{student.religion}</span>
                          </div>
                        )}
                        {student.blood_group && (
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Blood Group:</span>
                            <span className="font-medium">{student.blood_group}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'guardian' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Guardian/Parent Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                        <h4 className="font-medium text-slate-900 dark:text-white mb-3">Primary Parent/Guardian</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Name:</span>
                            <span className="font-medium">
                              {student.parents?.[0]?.full_name || 'Not specified'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Relationship:</span>
                            <span className="font-medium">
                              {student.parents?.[0]?.relationship || student.guardian_relationship || 'Not specified'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Phone:</span>
                            <span className="font-medium">
                              {student.parents?.[0]?.phone || student.guardian_phone || 'Not specified'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Email:</span>
                            <span className="font-medium">
                              {student.parents?.[0]?.email || student.guardian_email || 'Not specified'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                        <h4 className="font-medium text-slate-900 dark:text-white mb-3">Guardian Details</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Occupation:</span>
                            <span className="font-medium">
                              {student.parents?.[0]?.occupation || student.guardian_occupation || 'Not specified'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Address:</span>
                            <span className="font-medium">
                              {student.parents?.[0]?.address || student.guardian_address || student.address ||'Not specified'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Show additional parents if more than one */}
                      {(student.parents?.length ?? 0) > 1 && (
                        <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                          <h4 className="font-medium text-slate-900 dark:text-white mb-3">
                           Additional Parents ({(student.parents?.length ?? 0) - 1})
                          </h4>
                          {student.parents?.slice(1).map((parent: any, idx: number) => (
                            <div key={idx} className="text-sm text-slate-600 dark:text-slate-400 py-1">
                              {parent.full_name} — {parent.ermergency_contact || 'No phone'}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            {activeTab === 'medical' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Medical Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                      <h4 className="font-medium text-slate-900 dark:text-white mb-3">Medical Details</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Blood Group:</span>
                          <span className="font-medium">{student.blood_group || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Medical Conditions:</span>
                          <span className="font-medium">{student.medical_conditions || 'None'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                      <h4 className="font-medium text-slate-900 dark:text-white mb-3">Allergies & Notes</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Allergies:</span>
                          <span className="font-medium">{student.allergies || 'None'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </TeacherDashboardLayout>
  );
};

export default StudentProfile;
