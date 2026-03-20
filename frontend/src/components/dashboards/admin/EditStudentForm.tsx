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
  student_class: string;  // Class/GradeLevel ID
  section: string;         // Section ID
  stream: string;          // Stream ID
  registration_number: string;
  address: string;
  phoneNumber: string;
  paymentMethod: string;
  medicalConditions: string;
  specialRequirements: string;
  classroom: string;       // Optional - computed by backend
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
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  
  // ✅ NEW: State for cascading dropdowns
  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);
  const [loadingStreams, setLoadingStreams] = useState(false);

  // ✅ Fetch grade levels on mount
  useEffect(() => {
    const fetchGradeLevels = async () => {
      setLoadingGrades(true);
      try {
        const response = await api.get('/api/classrooms/grades/');
        const gradesArray = Array.isArray(response) ? response : response?.results || response?.data || [];
        setGradeLevels(gradesArray);
      } catch (error) {
        console.error('Error fetching grade levels:', error);
        toast.error('Failed to load grade levels');
      } finally {
        setLoadingGrades(false);
      }
    };

    fetchGradeLevels();
  }, []);

  // ✅ Fetch streams on mount
  useEffect(() => {
    const fetchStreams = async () => {
      setLoadingStreams(true);
      try {
        const response = await api.get('/api/classrooms/streams/');
        const streamsArray = Array.isArray(response) ? response : response?.results || response?.data || [];
        setStreams(streamsArray);
      } catch (error) {
        console.error('Error fetching streams:', error);
        toast.error('Failed to load streams');
      } finally {
        setLoadingStreams(false);
      }
    };

    fetchStreams();
  }, []);

  // ✅ Fetch sections when student_class changes
  useEffect(() => {
    const fetchSections = async () => {
      if (!formData.student_class) {
        setSections([]);
        return;
      }

      setLoadingSections(true);
      try {
        const response = await api.get(`/api/classrooms/grades/${formData.student_class}/sections/`);
        const sectionsArray = Array.isArray(response) ? response : response?.results || response?.data || [];
        setSections(sectionsArray);
      } catch (error) {
        console.error('Error fetching sections:', error);
        setSections([]);
      } finally {
        setLoadingSections(false);
      }
    };

    fetchSections();
  }, [formData.student_class]);

  // ✅ Fetch classrooms when section changes
  useEffect(() => {
    const fetchClassrooms = async () => {
      if (!formData.section) {
        setClassrooms([]);
        return;
      }

      setLoadingClassrooms(true);
      try {
        const response = await api.get(`/api/classrooms/classrooms/?section=${formData.section}`);
        const classroomList = Array.isArray(response) ? response : response?.results || response?.data || [];
        setClassrooms(classroomList);
      } catch (error) {
        console.error('Error fetching classrooms:', error);
        setClassrooms([]);
      } finally {
        setLoadingClassrooms(false);
      }
    };

    fetchClassrooms();
  }, [formData.section]);

  useEffect(() => {
    if (id) {
      loadStudentData();
    }
  }, [id]);

  const loadStudentData = async () => {
    if (!id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const studentData = await StudentService.getStudent(parseInt(id));
      setStudent(studentData);
      
      const mapGenderValue = (backendGender: string) => {
        if (backendGender === 'M') return 'M';
        if (backendGender === 'F') return 'F';
        return backendGender;
      };
      
      // IMPROVED NAME PARSING LOGIC
      const nameParts = (studentData.full_name || '').trim().split(' ').filter(part => part.length > 0);
      let firstName = '';
      let middleName = '';
      let lastName = '';
      
      if (nameParts.length === 1) {
        firstName = nameParts[0];
      } else if (nameParts.length === 2) {
        firstName = nameParts[0];
        lastName = nameParts[1];
      } else if (nameParts.length >= 3) {
        firstName = nameParts[0];
        middleName = nameParts.slice(1, -1).join(' ');
        lastName = nameParts[nameParts.length - 1];
      }
      
          
      // ✅ FIXED: Store FK IDs as strings for form fields
      setFormData({
        photo: studentData.profile_picture || null,
        firstName: firstName,
        middleName: middleName,
        lastName: lastName,
        email: studentData.user_details?.email || '',
        gender: mapGenderValue(studentData.gender || ''),
        bloodGroup: studentData.blood_group || '',
        dateOfBirth: studentData.date_of_birth || '',
        placeOfBirth: studentData.place_of_birth || '',
        
        // ✅ Store FK IDs (backend returns IDs, not enum strings)
        student_class: studentData.student_class?.toString() || '',
        section: studentData.section?.toString() || '',
        stream: studentData.stream?.toString() || '',
        
        registration_number: studentData.username || '',
        address: studentData.address || '',
        phoneNumber: studentData.phone_number || '',
        paymentMethod: studentData.payment_method || '',
        medicalConditions: studentData.medical_conditions || '',
        specialRequirements: studentData.special_requirements || '',
        classroom: studentData.classroom || '',
        academicYear: '',
      });
      
    } catch (error) {
      console.error('Error loading student data:', error);
      setError('Failed to load student data');
      toast.error('Failed to load student data');
    } finally {
      setLoading(false);
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
        body: cloudinaryData
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const result = await response.json();
      const photoUrl = result.secure_url;
      
      handleInputChange('photo', photoUrl);
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
    
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // IMPROVED FULL NAME CONSTRUCTION - Remove empty parts and extra spaces
      const nameParts = [
        formData.firstName.trim(),
        formData.middleName.trim(),
        formData.lastName.trim()
      ].filter(part => part.length > 0);
      
      const fullName = nameParts.join(' ');
      
      // ✅ FIXED: Prepare update data with FK IDs as integers
      const updateData: any = {
        full_name: fullName,
        email: formData.email,
        gender: formData.gender,
        blood_group: formData.bloodGroup,
        date_of_birth: formData.dateOfBirth,
        place_of_birth: formData.placeOfBirth,
        
        // ✅ Send FK IDs as integers, not enum strings
        student_class: formData.student_class ? parseInt(formData.student_class) : null,
        section: formData.section ? parseInt(formData.section) : null,
        stream: formData.stream ? parseInt(formData.stream) : null,
        
        registration_number: formData.registration_number,
        address: formData.address,
        phone_number: formData.phoneNumber,
        payment_method: formData.paymentMethod,
        medical_conditions: formData.medicalConditions,
        special_requirements: formData.specialRequirements,
        
        // classroom is optional - backend can compute it
        ...(formData.photo ? { profile_picture: formData.photo } : {}),
      };
      
      console.log('🔍 DEBUG: Submitting student update');
      console.log('🔍 DEBUG: Full name being sent:', fullName);
      console.log('🔍 DEBUG: Complete update data:', updateData);

      const response = await StudentService.updateStudent(parseInt(id), updateData);
      
      console.log('✅ DEBUG: Update response:', response);
      
      setSuccess('Student updated successfully');
      toast.success('Student updated successfully');
      
      if (onStudentUpdated) {
        onStudentUpdated(response);
      }
      
      setTimeout(() => {
        navigate('/admin/students');
      }, 1500);
      
    } catch (error: any) {
      console.error('❌ ERROR: Failed to update student:', error);
      const errorMessage = error?.response?.data?.detail || error?.response?.data?.error || 'Failed to update student';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // ✅ Get selected grade info for stream requirement check
  const getSelectedGrade = () => {
    return gradeLevels.find(g => g.id === parseInt(formData.student_class));
  };

  const isSeniorSecondary = () => {
    const grade = getSelectedGrade();
    return grade?.education_level === 'SENIOR_SECONDARY';
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
                Update student information {isSuperAdmin ? '(Super Admin Access)' : '(Limited Access)'}
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

        {/* Error/Success Messages */}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Profile Picture Section */}
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
                  <label className="block">
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
                      className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    JPG, PNG or GIF. Max size 5MB.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Student Information */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Student Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Middle Name
                </label>
                <input
                  type="text"
                  value={formData.middleName}
                  onChange={(e) => handleInputChange('middleName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gender *
                </label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Blood Group
                </label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date of Birth *
                </label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Place of Birth
                </label>
                <input
                  type="text"
                  value={formData.placeOfBirth}
                  onChange={(e) => handleInputChange('placeOfBirth', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Lagos, Nigeria"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., +2348012345678"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Student's home address"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
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

          {/* Academic Information - ✅ FIXED SECTION */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Academic Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Class/Grade Level * 
                  <span className="text-xs text-gray-500 ml-2">(Step 1)</span>
                </label>
                <select
                  value={formData.student_class}
                  onChange={(e) => {
                    const gradeId = e.target.value;
                    handleInputChange('student_class', gradeId);
                    // Reset dependent fields
                    handleInputChange('section', '');
                    handleInputChange('classroom', '');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={loadingGrades}
                >
                  <option value="">
                    {loadingGrades ? 'Loading grades...' : 'Select Grade Level'}
                  </option>
                  {gradeLevels.map(grade => (
                    <option key={grade.id} value={grade.id}>
                      {grade.name || grade.display_name}
                    </option>
                  ))}
                </select>
                {gradeLevels.length > 0 && (
                  <p className="mt-1 text-xs text-emerald-600">
                    {gradeLevels.length} grade(s) loaded
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Section * 
                  <span className="text-xs text-gray-500 ml-2">(Step 2)</span>
                </label>
                <select
                  value={formData.section}
                  onChange={(e) => {
                    handleInputChange('section', e.target.value);
                    // Reset classroom
                    handleInputChange('classroom', '');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={!formData.student_class || loadingSections}
                >
                  <option value="">
                    {loadingSections ? 'Loading sections...' : !formData.student_class ? 'Select grade first' : 'Select Section'}
                  </option>
                  {sections.map(section => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
                {sections.length > 0 && (
                  <p className="mt-1 text-xs text-emerald-600">
                    {sections.length} section(s) available
                  </p>
                )}
              </div>
              
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
                    <option key={room.id} value={room.name || room.id}>
                      {room.name || room.display_name || `Classroom ${room.id}`}
                    </option>
                  ))}
                </select>
                {formData.section && !loadingClassrooms && (
                  <p className="mt-1 text-xs">
                    {classrooms.length > 0 ? (
                      <span className="text-emerald-600">{classrooms.length} classroom(s) available</span>
                    ) : (
                      <span className="text-slate-500">No classrooms configured</span>
                    )}
                  </p>
                )}
              </div>
              
              {/* Stream field - only for Senior Secondary */}
              {isSeniorSecondary() && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stream * <span className="text-xs text-gray-500">(Required for SS)</span>
                  </label>
                  <select
                    value={formData.stream}
                    onChange={(e) => handleInputChange('stream', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    disabled={loadingStreams}
                  >
                    <option value="">Select Stream</option>
                    {streams.map(stream => (
                      <option key={stream.id} value={stream.id}>
                        {stream.name} ({stream.stream_type})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
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
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Academic Year
                </label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Medical Conditions
                </label>
                <textarea
                  value={formData.medicalConditions}
                  onChange={(e) => handleInputChange('medicalConditions', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Any known medical conditions..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Special Requirements
                </label>
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

        {/* Access Notice for Non-Super Admins */}
        {!isSuperAdmin && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Limited Access
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>You have limited editing permissions. Only super administrators can upload profile pictures and modify certain sensitive fields.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditStudentForm;