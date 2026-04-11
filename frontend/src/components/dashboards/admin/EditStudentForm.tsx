import React, { useState, useEffect } from 'react';
import { User, Upload, Camera, Save, ArrowLeft } from 'lucide-react';
import api from '@/services/api';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import StudentService, { Student } from '@/services/StudentService';

// --- Student Form Types ---
type StudentFormData = {
  photo: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  gender: string;
  bloodGroup: string;
  dateOfBirth: string;
  placeOfBirth: string;
  student_class: string;
  section: string;
  stream: string;
  registration_number: string;
  address: string;
  phoneNumber: string;
  paymentMethod: string;
  medicalConditions: string;
  specialRequirements: string;
  classroom: string;
  section_detail?: {
    id: number;
    class_grade: number;
    class_grade_name: string;
    name: string;
  }
  academicYear: string;
};

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface EditStudentFormProps {
  onStudentUpdated?: (student: Student) => void;
}

const EditStudentForm: React.FC<EditStudentFormProps> = ({ onStudentUpdated }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isSuperAdmin = user?.is_superuser && user?.is_staff;

  const [formData, setFormData] = useState<StudentFormData>({
    photo: null,
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    gender: '',
    bloodGroup: '',
    dateOfBirth: '',
    placeOfBirth: '',
    student_class: '',
    section: '',
    stream: '',
    registration_number: '',
    address: '',
    phoneNumber: '',
    paymentMethod: '',
    medicalConditions: '',
    specialRequirements: '',
    classroom: '',
    academicYear: '',
  });
  const [gradesExpanded, setGradesExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);

  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);

  const [loadingGrades, setLoadingGrades] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);
  const [loadingStreams, setLoadingStreams] = useState(false);

  // ✅ Trigger load on mount
  useEffect(() => {
    if (id) {
      loadStudentData();
    }
  }, [id]);

  // ✅ Fetch sections when grade changes (user-driven change only)
  useEffect(() => {
    if (!formData.student_class) {
      setSections([]);
      return;
    }

    // Skip re-fetch if sections are already seeded for this grade
    if (sections.length > 0 && student?.student_class?.toString() === formData.student_class) {
      return;
    }

    const fetchSections = async () => {
      setLoadingSections(true);
      try {
        const response = await api.get(`/api/classrooms/grades/${formData.student_class}/sections/`);
        const sectionsArray = Array.isArray(response) ? response : response?.results || response?.data || [];
        setSections(sectionsArray);
      } catch (error) {
        console.error('Error fetching sections:', error);
      } finally {
        setLoadingSections(false);
      }
    };

    fetchSections();
  }, [formData.student_class, student?.student_class]);

  // ✅ Fetch classrooms when section changes (user-driven change only)
  useEffect(() => {
    if (!formData.section) {
      setClassrooms([]);
      return;
    }

    // Skip re-fetch if classrooms are already seeded for this section
    if (classrooms.length > 0 && student?.section?.toString() === formData.section) {
      return;
    }

    const fetchClassrooms = async () => {
      setLoadingClassrooms(true);
      try {
        const response = await api.get(`/api/classrooms/classrooms/?section=${formData.section}`);
        const classroomList = Array.isArray(response) ? response : response?.results || response?.data || [];
        setClassrooms(classroomList);
      } catch (error) {
        console.error('Error fetching classrooms:', error);
      } finally {
        setLoadingClassrooms(false);
      }
    };

    fetchClassrooms();
  }, [formData.section, student?.section]);

  const loadStudentData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const studentData = await StudentService.getStudent(parseInt(id));
      console.log('Fetched student data:', studentData);
      setStudent(studentData);

      // Read name fields directly from user object — more reliable than splitting full_name
      const firstName = studentData.first_name || '';
      const middleName = studentData.middle_name || '';
      const lastName = studentData.last_name || '';

      setFormData({
        photo: studentData.profile_picture || null,
        firstName,
        middleName,
        lastName,
        email: studentData.user?.email || studentData.email || '',
        gender: studentData.gender || '',
        bloodGroup: studentData.blood_group || '',
        dateOfBirth: studentData.date_of_birth || '',
        placeOfBirth: studentData.place_of_birth || '',
        student_class: studentData.student_class?.toString() || '',
        section: studentData.section?.toString() || '',
        stream: studentData.stream?.toString() || '',
        registration_number: studentData.registration_number || studentData.username || '',
        address: studentData.address || '',
        phoneNumber: studentData.phone_number || '',
        paymentMethod: studentData.payment_method || '',
        medicalConditions: studentData.medical_conditions || '',
        specialRequirements: studentData.special_requirements || '',
        classroom: studentData.classroom || '',
        academicYear: '',
      });

      // Seed dropdowns immediately with student's current values
      // so the user sees their selections without waiting for background fetch
      if (studentData.student_class_detail) {
        setGradeLevels([studentData.student_class_detail]);
      }
      if (studentData.section_detail) {
        setSections([studentData.section_detail]);
      }
      if (studentData.stream_detail) {
        setStreams([studentData.stream_detail]);
      }
      if (studentData.classroom) {
        setClassrooms([{
          id: studentData.section,
          name: studentData.classroom,
          display_name: studentData.classroom,
        }]);
      }

      // Then expand dropdowns with full lists in background
      fetchFullDropdownLists();

    } catch (error) {
      console.error('Error loading student data:', error);
      setError('Failed to load student data');
      toast.error('Failed to load student data');
    } finally {
      setLoading(false);
    }
  };

  // Fetches full grade and stream lists after student data is loaded.
  // Runs in the background — formData already has correct IDs so dropdowns
  // will auto-select correctly once the full lists arrive.
  const fetchFullDropdownLists = async () => {
  setLoadingStreams(true);
  try {
    const [streamsRes] = await Promise.all([
      api.get('/api/classrooms/streams/'),
    ]);
    const streamsArray = Array.isArray(streamsRes)
      ? streamsRes
      : streamsRes?.results || streamsRes?.data || [];
    setStreams(streamsArray);
  } catch (error) {
    console.error('Error fetching streams:', error);
  } finally {
    setLoadingStreams(false);
  }
};

const handleGradeDropdownOpen = async () => {
  if (gradesExpanded) return; // already loaded full list
  setGradesExpanded(true);
  setLoadingGrades(true);
  try {
    const response = await api.get('/api/classrooms/grades/');
    const gradesArray = Array.isArray(response)
      ? response
      : response?.results || response?.data || [];
    setGradeLevels(gradesArray); // now safe — user explicitly opened dropdown
  } catch (error) {
    console.error('Error fetching grade levels:', error);
    toast.error('Failed to load grade levels');
  } finally {
    setLoadingGrades(false);
  }
};

  const handleInputChange = (field: keyof StudentFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isSuperAdmin) {
      toast.error('Only super administrators can upload profile pictures');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const cloudinaryData = new FormData();
      cloudinaryData.append('file', file);
      cloudinaryData.append('upload_preset', 'profile_upload');

      const response = await fetch('https://api.cloudinary.com/v1_1/djbz7wunu/image/upload', {
        method: 'POST',
        body: cloudinaryData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const result = await response.json();
      handleInputChange('photo', result.secure_url);
      toast.success('Profile picture uploaded successfully');
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    // Validate grade level
    const selectedGrade = gradeLevels.find(g => g.id.toString() === formData.student_class);
    const gradeFromStudent = student?.student_class_detail?.id.toString() === formData.student_class
      ? student.student_class_detail
      : null;

    if (formData.student_class && !selectedGrade && !gradeFromStudent) {
      const msg = `Selected grade level is no longer valid. Please select a different class.`;
      toast.error(msg);
      setError(msg);
      return;
    }

    const gradeToCheck = selectedGrade || gradeFromStudent;

    // Validate section
    if (formData.section) {
      const selectedSection = sections.find(s => s.id.toString() === formData.section);
      if (!selectedSection) {
        const msg = `Selected section is no longer valid. Please select a different section.`;
        toast.error(msg);
        setError(msg);
        return;
      }
      if (gradeToCheck && selectedSection.class_grade) {
        if (selectedSection.class_grade.toString() !== formData.student_class) {
          const msg = `Selected section does not belong to the selected class.`;
          toast.error(msg);
          setError(msg);
          return;
        }
      }
    }

    // Validate stream for Senior Secondary
    if (isSeniorSecondary() && !formData.stream) {
      toast.error('Stream is required for Senior Secondary students');
      setError('Stream is required for Senior Secondary students');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updateData: any = {
        // Send individual name fields — serializer writes to user.first_name etc.
        first_name: formData.firstName.trim(),
        middle_name: formData.middleName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email,
        gender: formData.gender,
        blood_group: formData.bloodGroup,
        date_of_birth: formData.dateOfBirth,
        place_of_birth: formData.placeOfBirth,
        student_class: formData.student_class ? parseInt(formData.student_class) : null,
        section: formData.section ? parseInt(formData.section) : null,
        stream: formData.stream ? parseInt(formData.stream) : null,
        registration_number: formData.registration_number,
        address: formData.address,
        phone_number: formData.phoneNumber,
        payment_method: formData.paymentMethod,
        medical_conditions: formData.medicalConditions,
        special_requirements: formData.specialRequirements,
        ...(formData.photo ? { profile_picture: formData.photo } : {}),
      };

      const response = await StudentService.updateStudent(parseInt(id), updateData);

      setSuccess('Student updated successfully');
      toast.success('Student updated successfully');

      if (onStudentUpdated) {
        onStudentUpdated(response);
      }

      setTimeout(() => {
        navigate('/admin/students');
      }, 1500);

    } catch (error: any) {
      console.error('Error updating student:', error);
      const errorMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        'Failed to update student';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const getSelectedGrade = () => {
    return gradeLevels.find(g => g.id.toString() === formData.student_class);
  };

  const isSeniorSecondary = () => {
    const grade = getSelectedGrade();
    // Handle both flat and nested education_level shape from API
    const levelType = grade?.education_level_detail?.level_type || grade?.education_level;
    if (levelType === 'SENIOR_SECONDARY') return true;
    // Fallback to student's own education_level property
    if (student?.education_level === 'SENIOR_SECONDARY' && formData.student_class) return true;
    return false;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading student data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin/students')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Students
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Edit Student</h1>
              <p className="text-gray-600 mt-1">
                Update student information {isSuperAdmin ? '(Super Admin Access)' : '(Standard Access)'}
              </p>
            </div>
            {student && (
              <div className="text-right">
                <p className="text-sm text-gray-500">Student ID</p>
                <p className="text-lg font-semibold text-gray-900">{student.id}</p>
              </div>
            )}
          </div>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white shadow-lg rounded-lg overflow-hidden">

          {/* Profile Picture — Super Admin only */}
          {isSuperAdmin && (
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Camera className="w-5 h-5 mr-2" />
                Profile Picture
              </h3>
              <div className="flex items-center space-x-6">
                <div className="flex-shrink-0">
                  {formData.photo ? (
                    <img
                      src={formData.photo}
                      alt="Profile"
                      className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center border-4 border-white shadow-md">
                      <User className="w-12 h-12 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                    className="hidden"
                    id="photo-upload"
                  />
                  <label
                    htmlFor="photo-upload"
                    className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    {uploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        {formData.photo ? 'Change Photo' : 'Upload Photo'}
                      </>
                    )}
                  </label>
                  <p className="mt-1 text-xs text-gray-500">JPG, PNG or GIF. Max size 5MB.</p>
                </div>
              </div>
            </div>
          )}

          {/* Student Information */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Student Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Middle Name</label>
                <input
                  type="text"
                  value={formData.middleName}
                  onChange={(e) => handleInputChange('middleName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
                <select
                  value={formData.gender}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select Gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
                <select
                  value={formData.bloodGroup}
                  onChange={(e) => handleInputChange('bloodGroup', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Blood Group</option>
                  {bloodGroups.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Place of Birth</label>
                <input
                  type="text"
                  value={formData.placeOfBirth}
                  onChange={(e) => handleInputChange('placeOfBirth', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Lagos, Nigeria"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., +2348012345678"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Student's home address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={formData.paymentMethod}
                  onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Payment Method</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online Payment">Online Payment</option>
                  <option value="Other">Other</option>
                </select>
              </div>

            </div>
          </div>

          {/* Academic Information */}
<div className="px-6 py-4 border-b border-gray-200">
  <h3 className="text-lg font-medium text-gray-900 mb-4">Academic Information</h3>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

    {/* Grade Level */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Class/Grade Level *
        <span className="text-xs text-gray-500 ml-2">(Step 1)</span>
      </label>
      <select
  value={formData.student_class}
  onFocus={handleGradeDropdownOpen} 
  onChange={(e) => {
    const gradeId = e.target.value;
    handleInputChange('student_class', gradeId);
    handleInputChange('section', '');
    handleInputChange('classroom', '');
    const selectedGrade = gradeLevels.find(g => g.id.toString() === gradeId);
    const levelType =
      selectedGrade?.education_level_detail?.level_type ||
      selectedGrade?.education_level;
    if (levelType !== 'SENIOR_SECONDARY') {
      handleInputChange('stream', '');
    }
  }}
  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
  required
  disabled={loadingGrades}
>
  <option value="">
    {loadingGrades ? 'Loading grades...' : 'Select Grade Level'}
  </option>
  {gradeLevels.map(grade => (
    <option key={grade.id} value={grade.id.toString()}>
      {grade.name || grade.display_name}
    </option>
  ))}
</select>
      {loadingGrades && (
        <p className="mt-1 text-xs text-gray-400">Loading full list...</p>
      )}
    </div>

    {/* Section */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Section *
        <span className="text-xs text-gray-500 ml-2">(Step 2)</span>
      </label>
      <select
        value={formData.section}  
        onChange={(e) => {
          handleInputChange('section', e.target.value);
          handleInputChange('classroom', '');
        }}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        required
        disabled={!formData.student_class || loadingSections}
      >
        <option value="">
          {loadingSections
            ? 'Loading sections...'
            : !formData.student_class
              ? 'Select grade first'
              : 'Select Section'}
        </option>
        {sections.map(section => (
          <option key={section.id} value={section.id.toString()}>
            {section.name}  {/* ✅ Shows "Diamond" */}
          </option>
        ))}
      </select>
      {sections.length > 0 && (
        <p className="mt-1 text-xs text-emerald-600">{sections.length} section(s) available</p>
      )}
    </div>

    {/* Classroom */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Classroom (Optional)
        <span className="text-xs text-gray-500 ml-2">(Step 3)</span>
      </label>
      <select
        value={formData.classroom}  
        onChange={(e) => handleInputChange('classroom', e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        disabled={!formData.section || loadingClassrooms}
      >
        <option value="">
          {loadingClassrooms
            ? 'Loading classrooms...'
            : !formData.section
              ? 'Select section first'
              : classrooms.length === 0
                ? 'No classrooms (can proceed without)'
                : 'Select Classroom (Optional)'}
        </option>
        {classrooms.map(room => (
          <option key={room.id} value={room.name || room.id.toString()}>
            {room.name || room.display_name || `Classroom ${room.id}`}
          </option>
        ))}
      </select>
      {formData.section && !loadingClassrooms && (
        <p className="mt-1 text-xs">
          {classrooms.length > 0
            ? <span className="text-emerald-600">{classrooms.length} classroom(s) available</span>
            : <span className="text-slate-500">No classrooms configured</span>}
        </p>
      )}
    </div>

    {/* Stream — Senior Secondary only */}
    {isSeniorSecondary() && (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Stream *
          <span className="text-xs text-gray-500 ml-1">(Required for SS)</span>
        </label>
        <select
          value={formData.stream}  
          onChange={(e) => handleInputChange('stream', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
          disabled={loadingStreams}
        >
          <option value="">
            {loadingStreams ? 'Loading streams...' : 'Select Stream'}
          </option>
          {streams.map(stream => (
            <option key={stream.id} value={stream.id.toString()}>
              {stream.name} ({stream.stream_type_name || 'Unnamed'})
            </option>
          ))}
        </select>
        {formData.stream && streams.length > 0 && (
          <p className="mt-1 text-xs text-emerald-600">
            ✓ {streams.find(s => s.id.toString() === formData.stream)?.name}
          </p>
        )}
      </div>
    )}

    {/* Registration Number */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Registration Number *
      </label>
      <input
        type="text"
        value={formData.registration_number}
        onChange={(e) => handleInputChange('registration_number', e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        required
      />
    </div>

    {/* Academic Year */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
      <input
        type="text"
        value={formData.academicYear}
        onChange={(e) => handleInputChange('academicYear', e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder="e.g., 2024/2025"
      />
    </div>

  </div>
</div>

          {/* Medical Information */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Medical Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Medical Conditions</label>
                <textarea
                  value={formData.medicalConditions}
                  onChange={(e) => handleInputChange('medicalConditions', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Any known medical conditions..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Special Requirements</label>
                <textarea
                  value={formData.specialRequirements}
                  onChange={(e) => handleInputChange('specialRequirements', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Any special requirements or accommodations..."
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="px-6 py-4 bg-gray-50 flex justify-between items-center">
            <button
              type="button"
              onClick={() => navigate('/admin/students')}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>

        {/* Access notice — only shown to non-super-admins, scoped to photo upload */}
        {!isSuperAdmin && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Note</h3>
                <p className="mt-1 text-sm text-yellow-700">
                  Profile picture uploads are restricted to super administrators.
                  All other student fields can be edited freely.
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default EditStudentForm;