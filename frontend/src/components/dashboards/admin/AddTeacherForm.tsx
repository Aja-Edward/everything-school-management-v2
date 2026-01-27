import React, { useState, useEffect } from 'react';
import { User, X } from 'lucide-react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';

// --- Type Definitions ---
type TeacherFormData = {
  photo: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  bloodGroup: string;
  dateOfBirth: string;
  placeOfBirth: string;
  academicSession: string;
  employeeId: string;
  address: string;
  email: string;
  phoneNumber: string;
  staffType: string;
  level: string;
  subjects: string[];
  hireDate: string;
  qualification: string;
  specialization: string;
  assignments: Array<{
    grade_level_id?: string | number;
    section_id?: string;
    subject_ids?: string[];
    classroom_id?: string | number;
    subject_id?: string;
  }>;
};

type Section = {
  id: string | number;
  name: string;
  grade_level_id: string | number;
};

type GradeLevel = {
  id: string | number;
  name: string;
  education_level: string;
};

type Subject = {
  id: string | number;
  name: string;
  code?: string;
  education_levels?: string[];
};

type Classroom = {
  id: number;
  name: string;
  section: number;
  section_name: string;
  grade_level_name: string;
  education_level: string;
};

type Assignment = {
  id: string;
  grade_level_id?: string | number;
  section_id?: string;
  subject_ids?: string[];
  classroom_id?: string | number;
  subject_id?: string;
  classroom_ids?: string[];
  is_primary_teacher?: boolean;
  periods_per_week?: number;
  sectionOptions?: Section[];
  availableSections?: Section[];
};

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token') || 
                localStorage.getItem('authToken') || 
                localStorage.getItem('token') ||
                localStorage.getItem('jwt_token');
  
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

const createFallbackClassrooms = (level: string): Classroom[] => {
  const classroomMap: Record<string, string[]> = {
    nursery: ['Pre-Nursery Gold', 'Pre-Nursery Silver', 'Nursery 1 Gold', 'Nursery 1 Silver', 'Nursery 2 Gold', 'Nursery 2 Silver'],
    primary: ['Primary 1 Gold', 'Primary 1 Silver', 'Primary 2 Gold', 'Primary 2 Silver', 'Primary 3 Gold', 'Primary 3 Silver'],
    junior_secondary: ['JSS 1 Gold', 'JSS 1 Silver', 'JSS 2 Gold', 'JSS 2 Silver', 'JSS 3 Gold', 'JSS 3 Silver'],
    senior_secondary: ['SS 1 Gold', 'SS 1 Silver', 'SS 2 Gold', 'SS 2 Silver', 'SS 3 Gold', 'SS 3 Silver']
  };

  const classrooms = classroomMap[level] || [];
  return classrooms.map((name, index) => ({
    id: index + 1,
    name: name,
    section: index + 1,
    section_name: name.split(' ').pop() || 'A',
    grade_level_name: name.split(' ').slice(0, -1).join(' '),
    education_level: level.toUpperCase()
  }));
};

const AddTeacherForm: React.FC = () => {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const [formData, setFormData] = useState<TeacherFormData>({
    photo: null,
    firstName: '',
    middleName: '',
    lastName: '',
    gender: '',
    bloodGroup: '',
    dateOfBirth: '',
    placeOfBirth: '',
    academicSession: '',
    employeeId: '',
    address: '',
    email: '',
    phoneNumber: '',
    staffType: 'teaching',
    level: '',
    subjects: [],
    hireDate: '',
    qualification: '',
    specialization: '',
    assignments: [],
  });

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [teacherUsername, setTeacherUsername] = useState<string | null>(null);
  const [teacherPassword, setTeacherPassword] = useState<string | null>(null);

  const [subjectOptions, setSubjectOptions] = useState<Subject[]>([]);
  const [classroomOptions, setClassroomOptions] = useState<Classroom[]>([]);
  const [gradeLevelOptions, setGradeLevelOptions] = useState<GradeLevel[]>([]);
  const [currentAssignments, setCurrentAssignments] = useState<Assignment[]>([]);

  const isPrimaryLevel = formData.level === 'nursery' || formData.level === 'primary';
  const isSecondaryLevel = formData.level === 'junior_secondary' || formData.level === 'senior_secondary';

  useEffect(() => {
    if (isPrimaryLevel && currentAssignments.length === 0) {
      addAssignment();
    }
  }, [isPrimaryLevel]);

  useEffect(() => {
    if (formData.staffType === 'teaching' && formData.level) {
      const levelMap: Record<string, string> = {
        nursery: 'NURSERY',
        primary: 'PRIMARY',
        junior_secondary: 'JUNIOR_SECONDARY',
        senior_secondary: 'SENIOR_SECONDARY'
      };

      const educationLevel = levelMap[formData.level];
      if (!educationLevel) return;

      fetch(`${API_BASE_URL}/subjects/?education_level=${educationLevel}`, {
  headers: getAuthHeaders()
})
  .then(res => {
    if (!res.ok) throw new Error(`Failed to fetch subjects: ${res.status}`);
    return res.json();
  })
  .then(data => {
    const subjects = Array.isArray(data) ? data : (data.results || []);
    setSubjectOptions(subjects.map((s: any) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      education_levels: s.education_levels
    })));
    
    if (isPrimaryLevel) {
      setFormData(prev => ({ ...prev, subjects: subjects.map((s: any) => String(s.id)) }));
    }
  })
  .catch(error => {
    console.error('Error fetching subjects:', error);
    toast.error(`Failed to load subjects: ${error.message}`);
    setSubjectOptions([]);
  });
  
      fetch(`${API_BASE_URL}/classrooms/classrooms/?section__grade_level__education_level=${educationLevel}`, {
  headers: getAuthHeaders()
})
  .then(res => {
    if (!res.ok) throw new Error(`Failed to fetch classrooms: ${res.status}`);
    return res.json();
  })
  .then(data => {
    const classrooms = Array.isArray(data) ? data : (data.results || []);
    
    if (classrooms && classrooms.length > 0) {
      const mappedClassrooms = classrooms.map((c: any) => ({
        id: c.id,
        name: c.name || `${c.grade_level_name} ${c.section_name}`,
        section: c.section,
        section_name: c.section_name,
        grade_level_name: c.grade_level_name,
        education_level: c.education_level
      }));
      setClassroomOptions(mappedClassrooms);
    } else {
      const fallbackClassrooms = createFallbackClassrooms(formData.level);
      setClassroomOptions(fallbackClassrooms);
    }
  })
  .catch(error => {
    console.error('Error fetching classrooms:', error);
    toast.error(`Failed to load classrooms: ${error.message}`);
    const fallbackClassrooms = createFallbackClassrooms(formData.level);
    setClassroomOptions(fallbackClassrooms);
  });
    } else {
      setSubjectOptions([]);
      setClassroomOptions([]);
      setFormData(prev => ({ ...prev, subjects: [] }));
    }
  }, [formData.staffType, formData.level, API_BASE_URL]);

  useEffect(() => {
    if (formData.staffType === 'teaching' && formData.level) {
      const isPrimary = formData.level === 'nursery' || formData.level === 'primary';
      
      if (!isPrimary) {
        setGradeLevelOptions([]);
        return;
      }

      const levelMap: Record<string, string> = {
        nursery: 'NURSERY',
        primary: 'PRIMARY',
        junior_secondary: 'JUNIOR_SECONDARY',
        senior_secondary: 'SENIOR_SECONDARY'
      };

      const educationLevel = levelMap[formData.level];
      if (!educationLevel) return;

      const url = `${API_BASE_URL}/classrooms/grades/?education_level=${educationLevel}`;

fetch(url, {
  headers: getAuthHeaders()
})
  .then(res => {
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    return res.json();
  })
  .then(data => {
    let gradeLevels = Array.isArray(data) ? data : (data.results || data.data || []);
    
    if (gradeLevels && gradeLevels.length > 0) {
      const mappedLevels = gradeLevels.map((gl: any) => ({
        id: gl.id,
        name: gl.name,
        education_level: gl.education_level
      }));
      setGradeLevelOptions(mappedLevels);
    } else {
      setGradeLevelOptions([]);
      toast.error('No grade levels found. Please create grade levels in the system first.');
    }
  })
  .catch(error => {
    console.error('Error fetching grade levels:', error);
    setGradeLevelOptions([]);
    toast.error(`Failed to load grade levels: ${error.message}`);
  });
    } else {
      setGradeLevelOptions([]);
    }
  }, [formData.staffType, formData.level, API_BASE_URL]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try {
        const cloudinaryData = new FormData();
        cloudinaryData.append('file', file);
        cloudinaryData.append('upload_preset', 'profile_upload');

        const res = await axios.post('https://api.cloudinary.com/v1_1/djbz7wunu/image/upload', cloudinaryData);
        const imageUrl = res.data.secure_url;

        setFormData(prev => ({ ...prev, photo: imageUrl }));
        setPhotoPreview(imageUrl);
        toast.success('Photo uploaded successfully');
      } catch (error) {
        console.error('Error uploading to Cloudinary:', error);
        toast.error('Failed to upload image');
      } finally {
        setUploading(false);
      }
    }
  };

  const removePhoto = () => {
    setFormData(prev => ({ ...prev, photo: null }));
    setPhotoPreview(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubjectChange = (subjectId: string | number, checked: boolean) => {
    setFormData(prev => {
      const subjectIdStr = String(subjectId);
      const newSubjects = checked
        ? [...prev.subjects, subjectIdStr]
        : prev.subjects.filter(id => id !== subjectIdStr);
      return { ...prev, subjects: newSubjects };
    });
  };

  const addAssignment = () => {
    const newAssignment: Assignment = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      classroom_id: '',
      subject_id: '',
      is_primary_teacher: false,
      periods_per_week: 1,
      availableSections: []
    };
    setCurrentAssignments(prev => [...prev, newAssignment]);
  };

  const removeAssignment = (assignmentId: string) => {
    setCurrentAssignments(prev => prev.filter(a => a.id !== assignmentId));
  };

  const updateAssignment = (assignmentId: string, field: string, value: any) => {
    setCurrentAssignments(prev =>
      prev.map(assignment => {
        if (assignment.id === assignmentId) {
          const updated: Assignment = { ...assignment, [field]: value };

          if (field === 'classroom_id' && isSecondaryLevel) {
            updated.section_id = '';
            updated.subject_id = '';
            
            const selectedClassroom = classroomOptions.find(c => c.id === Number(value));
            if (selectedClassroom) {
              updated.availableSections = [{
                id: selectedClassroom.section,
                name: selectedClassroom.section_name,
                grade_level_id: selectedClassroom.id
              }];
            }
          }

          if (field === 'grade_level_id' && isPrimaryLevel) {
            updated.section_id = '';
            updated.subject_ids = [];
            loadSectionsForGradeLevel(value, assignmentId);
          }

          return updated;
        }
        return assignment;
      })
    );
  };

  const loadSectionsForGradeLevel = (gradeLevelId: string | number | undefined, assignmentId?: string) => {
  if (!gradeLevelId) {
    if (assignmentId) {
      setCurrentAssignments(prev =>
        prev.map(assignment =>
          assignment.id === assignmentId
            ? { ...assignment, sectionOptions: [] }
            : assignment
        )
      );
    }
    return;
  }

     fetch(`${API_BASE_URL}/classrooms/grades/${gradeLevelId}/sections/`, {
    headers: getAuthHeaders()
  })
    .then(res => {
      if (!res.ok) throw new Error(`Failed to fetch sections: ${res.status}`);
      return res.json();
    })
    .then(data => {
      const sections = Array.isArray(data) ? data : (data.results || []);

      if (sections && sections.length > 0) {
        const mappedSections: Section[] = sections.map((s: any) => ({
          id: s.id,
          name: s.name,
          grade_level_id: typeof s.grade_level === 'object' ? s.grade_level.id : s.grade_level
        }));

        if (assignmentId) {
          setCurrentAssignments(prev =>
            prev.map(assignment =>
              assignment.id === assignmentId
                ? { ...assignment, sectionOptions: mappedSections }
                : assignment
            )
          );
        }
      } else {
        if (assignmentId) {
          setCurrentAssignments(prev =>
            prev.map(assignment =>
              assignment.id === assignmentId
                ? { ...assignment, sectionOptions: [] }
                : assignment
            )
          );
        }
        toast.warning('No sections found for this grade level.');
      }
    })
    .catch(error => {
      console.error('Error fetching sections:', error);
      toast.error(`Failed to load sections: ${error.message}`);
      if (assignmentId) {
        setCurrentAssignments(prev =>
          prev.map(assignment =>
            assignment.id === assignmentId
              ? { ...assignment, sectionOptions: [] }
              : assignment
          )
        );
      }
    });
};
  const handleSave = async () => {
  if (!formData.firstName || !formData.lastName || !formData.email) {
    toast.error('Please fill in all required fields');
    return;
  }

  setLoading(true);

  try {
    let assignments: any[] = [];

    if (isPrimaryLevel) {
      const firstAssignment = currentAssignments[0];
      if (firstAssignment?.grade_level_id && firstAssignment?.section_id) {
        assignments = [{
          grade_level_id: firstAssignment.grade_level_id,
          section_id: firstAssignment.section_id,
          subject_ids: formData.subjects
        }];
      } else {
        toast.error('Please select a classroom for this teacher');
        setLoading(false);
        return;
      }
    } else if (isSecondaryLevel) {
      assignments = currentAssignments
        .filter(a => a.classroom_id && a.subject_id)
        .map(a => ({
          classroom_id: a.classroom_id,
          subject_id: a.subject_id,
          is_primary_teacher: a.is_primary_teacher || false,
          periods_per_week: a.periods_per_week || 1
        }));
    }

    // Build payload with ONLY fields that the Teacher model accepts
    const payload: any = {
      user_email: formData.email,
      user_first_name: formData.firstName,
      user_last_name: formData.lastName,
      employee_id: formData.employeeId,
      address: formData.address,
      phone_number: formData.phoneNumber,
      photo: formData.photo,
      staff_type: formData.staffType,
      level: formData.level,
      subjects: formData.subjects.map(s => Number(s)), // Convert to numbers
      hire_date: formData.hireDate,
      qualification: formData.qualification,
      specialization: formData.specialization,
      assignments: assignments,
      // Remove these fields - they're not part of the Teacher model:
      // gender, blood_group, place_of_birth, academic_session, date_of_birth
    };

    // Only include user_middle_name if it has a value (not blank)
    if (formData.middleName && formData.middleName.trim()) {
      payload.user_middle_name = formData.middleName;
    }

    console.log('📤 Submitting teacher data:', payload);

    // Get auth token from localStorage - try multiple possible key names
    let token = localStorage.getItem('access_token') || 
                localStorage.getItem('authToken') || 
                localStorage.getItem('token') ||
                localStorage.getItem('jwt_token');
    
    console.log('🔑 Token found:', token ? '✓ Yes' : '✗ No');
    console.log('📋 Token used from key:', token ? 'authToken or similar' : 'none');
    
    if (!token) {
      toast.error('Authentication token not found. Please log in again.');
      setLoading(false);
      return;
    }

    const headers: any = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // FIXED: Use correct endpoint URL - /teachers/teachers/
    const endpoint = `${API_BASE_URL}/teachers/teachers/`;
    console.log('📍 API Endpoint:', endpoint);
    console.log('🔐 Headers:', { 'Authorization': `Bearer ${token.substring(0, 20)}...` });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ API Error:', errorData);

      // Handle different error formats from Django REST Framework
      let errorMessage = 'Failed to create teacher';

      if (Array.isArray(errorData)) {
        // Array of error messages
        errorMessage = errorData.map(err =>
          typeof err === 'string' ? err : err.detail || err.message || JSON.stringify(err)
        ).join(', ');
      } else if (errorData.detail) {
        // Single detail message
        errorMessage = errorData.detail;
      } else if (typeof errorData === 'object') {
        // Object with field-specific errors
        const fieldErrors = Object.entries(errorData)
          .map(([field, errors]) => {
            if (Array.isArray(errors)) {
              return `${field}: ${errors.join(', ')}`;
            }
            return `${field}: ${errors}`;
          })
          .join('; ');
        errorMessage = fieldErrors || JSON.stringify(errorData);
      }

      throw new Error(errorMessage);
    }

    const responseData = await response.json();
    console.log('✅ API Response:', responseData);

    toast.success('Teacher added successfully');

    // Use credentials from backend response
    const username = responseData.user_username || responseData.generated_username || responseData.username;
    const password = responseData.user_password || responseData.generated_password || responseData.password;

    setTeacherUsername(username);
    setTeacherPassword(password);
    setShowPasswordModal(true);

    // Reset form after successful submission
    setTimeout(() => {
      setFormData({
        photo: null,
        firstName: '',
        middleName: '',
        lastName: '',
        gender: '',
        bloodGroup: '',
        dateOfBirth: '',
        placeOfBirth: '',
        academicSession: '',
        employeeId: '',
        address: '',
        email: '',
        phoneNumber: '',
        staffType: 'teaching',
        level: '',
        subjects: [],
        hireDate: '',
        qualification: '',
        specialization: '',
        assignments: [],
      });
      setCurrentAssignments([]);
      setPhotoPreview(null);
    }, 1000);
  } catch (err: any) {
    console.error('❌ Error creating teacher:', err);
    toast.error(err.message || 'Failed to create teacher');
  } finally {
    setLoading(false);
  }
};
  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800">Add New Teacher</h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Photo Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Photo</label>
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-3 bg-gray-50">
              {photoPreview ? (
                <div className="relative">
                  <img src={photoPreview} alt="Teacher" className="w-20 h-20 object-cover rounded" />
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <User size={32} className="text-gray-400" />
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
              id="teacher-photo"
              disabled={uploading}
            />
            <label
              htmlFor="teacher-photo"
              className={`px-4 py-2 rounded text-sm cursor-pointer transition-colors ${
                uploading
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {uploading ? 'Uploading...' : 'Choose File'}
            </label>
          </div>
        </div>

        {/* Name Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">First Name*</label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="First name"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Middle Name</label>
            <input
              type="text"
              name="middleName"
              value={formData.middleName}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Middle name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Last Name*</label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Last name"
              required
            />
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email*</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="teacher@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number*</label>
            <input
              type="tel"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="+234 xxx xxx xxxx"
              required
            />
          </div>
        </div>

        {/* Personal Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gender*</label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Select Gender</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Blood Group</label>
            <select
              name="bloodGroup"
              value={formData.bloodGroup}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Blood Group</option>
              {bloodGroups.map(group => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth*</label>
            <input
              type="date"
              name="dateOfBirth"
              value={formData.dateOfBirth}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        {/* Additional Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Place of Birth</label>
            <input
              type="text"
              name="placeOfBirth"
              value={formData.placeOfBirth}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="City, State"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employee ID*</label>
            <input
              type="text"
              name="employeeId"
              value={formData.employeeId}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="EMP001"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hire Date*</label>
            <input
              type="date"
              name="hireDate"
              value={formData.hireDate}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        {/* Academic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Academic Session</label>
            <input
              type="text"
              name="academicSession"
              value={formData.academicSession}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="2024/2025"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Qualification</label>
            <input
              type="text"
              name="qualification"
              value={formData.qualification}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="B.Sc., M.Ed., etc."
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Specialization</label>
          <input
            type="text"
            name="specialization"
            value={formData.specialization}
            onChange={handleInputChange}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Mathematics, Science, etc."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
          <textarea
            name="address"
            value={formData.address}
            onChange={handleInputChange}
            rows={3}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Full address"
          />
        </div>

        {/* Staff Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Staff Type*</label>
          <select
            name="staffType"
            value={formData.staffType}
            onChange={handleInputChange}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="teaching">Teaching</option>
            <option value="non-teaching">Non-Teaching</option>
          </select>
        </div>

        {/* Level (for teaching staff) */}
        {formData.staffType === 'teaching' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Education Level*</label>
            <select
              name="level"
              value={formData.level}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Select Level</option>
              <option value="nursery">Nursery</option>
              <option value="primary">Primary</option>
              <option value="junior_secondary">Junior Secondary</option>
              <option value="senior_secondary">Senior Secondary</option>
            </select>
          </div>
        )}

        {/* Subjects Selection */}
        {formData.staffType === 'teaching' && formData.level && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">Subjects*</label>
              {subjectOptions.length > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allSubjectIds = subjectOptions.map(s => String(s.id));
                      setFormData(prev => ({ ...prev, subjects: allSubjectIds }));
                    }}
                    className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, subjects: [] }))}
                    className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {subjectOptions.length === 0 ? (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-gray-500 text-sm">No subjects available for this level.</p>
              </div>
            ) : (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {subjectOptions.map(subject => (
                    <label
                      key={subject.id}
                      className="flex items-center space-x-3 cursor-pointer hover:bg-white p-3 rounded-lg transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={formData.subjects.includes(String(subject.id))}
                        onChange={(e) => handleSubjectChange(subject.id, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span className="text-sm text-gray-700 font-medium">{subject.name}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    Selected: {formData.subjects.length} of {subjectOptions.length} subjects
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Assignments Section */}
        {formData.staffType === 'teaching' && formData.level && (
          <div className="border-t pt-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {isPrimaryLevel ? 'Classroom Assignment*' : 'Subject Assignments*'}
                </label>
                {isPrimaryLevel && (
                  <p className="text-xs text-gray-500 mt-1">
                    Select the classroom where this teacher will teach all selected subjects
                  </p>
                )}
              </div>
              {isSecondaryLevel && (
                <button
                  type="button"
                  onClick={addAssignment}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <span>+</span>
                  Add Assignment
                </button>
              )}
            </div>

            {isPrimaryLevel ? (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="mb-4">
                  <p className="text-sm text-blue-700 font-medium mb-2">Primary/Nursery Assignment</p>
                  <p className="text-xs text-blue-600">
                    Select a grade level and section. This teacher will teach all selected subjects to this class.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Grade Level*</label>
                    <select
                      value={currentAssignments[0]?.grade_level_id || ''}
                      onChange={(e) => {
                        if (currentAssignments.length === 0) {
                          const newAssignment: Assignment = {
                            id: Date.now().toString(),
                            grade_level_id: e.target.value,
                            section_id: '',
                            subject_ids: formData.subjects,
                            sectionOptions: []
                          };
                          setCurrentAssignments([newAssignment]);
                          loadSectionsForGradeLevel(e.target.value, newAssignment.id);
                        } else {
                          updateAssignment(currentAssignments[0].id, 'grade_level_id', e.target.value);
                        }
                      }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select Grade Level</option>
                      {gradeLevelOptions.length === 0 ? (
                        <option disabled>Loading grade levels...</option>
                      ) : (
                        gradeLevelOptions.map(gl => (
                          <option key={gl.id} value={gl.id}>
                            {gl.name}
                          </option>
                        ))
                      )}
                    </select>
                    {gradeLevelOptions.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">
                        No grade levels found. Please create grade levels first.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Section*</label>
                    <select
                      value={currentAssignments[0]?.section_id || ''}
                      onChange={(e) => {
                        if (currentAssignments.length > 0) {
                          updateAssignment(currentAssignments[0].id, 'section_id', e.target.value);
                        }
                      }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!currentAssignments[0]?.grade_level_id}
                      required
                    >
                      <option value="">Select Section</option>
                      {!currentAssignments[0]?.grade_level_id ? (
                        <option disabled>Select grade level first</option>
                      ) : (currentAssignments[0]?.sectionOptions || []).length === 0 ? (
                        <option disabled>Loading sections...</option>
                      ) : (
                        (currentAssignments[0]?.sectionOptions || []).map(section => (
                          <option key={section.id} value={section.id}>
                            {section.name}
                          </option>
                        ))
                      )}
                    </select>
                    {currentAssignments[0]?.grade_level_id && (currentAssignments[0]?.sectionOptions || []).length === 0 && (
                      <p className="text-xs text-red-500 mt-1">
                        No sections found for this grade level.
                      </p>
                    )}
                  </div>
                </div>

                {currentAssignments[0]?.grade_level_id && currentAssignments[0]?.section_id && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-700">
                      <strong>Assignment Preview:</strong> This teacher will teach{' '}
                      <strong>{formData.subjects.length} subject(s)</strong> in{' '}
                      <strong>
                        {gradeLevelOptions.find(gl => gl.id == currentAssignments[0].grade_level_id)?.name}
                        {' - Section '}
                        {(currentAssignments[0]?.sectionOptions || []).find(s => s.id == currentAssignments[0].section_id)?.name}
                      </strong>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-700 font-medium mb-2">Secondary Teacher Assignments</p>
                  <p className="text-xs text-blue-600">
                    For secondary teachers, assign subjects to specific classrooms. Each assignment represents one subject in one classroom.
                  </p>
                </div>

                {currentAssignments.length === 0 ? (
                  <div className="bg-gray-50 p-8 rounded-lg border border-gray-200 text-center">
                    <p className="text-gray-500 text-sm mb-4">No assignments added yet.</p>
                    <button
                      type="button"
                      onClick={addAssignment}
                      className="px-6 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add First Assignment
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {currentAssignments.map((assignment, index) => {
                      const selectedClassroom = classroomOptions.find(c => c.id === Number(assignment.classroom_id));
                      
                      return (
                        <div key={assignment.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-semibold text-gray-700">
                              Assignment {index + 1}
                              {selectedClassroom && (
                                <span className="ml-2 text-blue-600">
                                  - {selectedClassroom.name}
                                </span>
                              )}
                            </h4>
                            <button
                              type="button"
                              onClick={() => removeAssignment(assignment.id)}
                              className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-2">
                                Classroom* 
                                <span className="text-gray-400 ml-1">(Grade & Section)</span>
                              </label>
                              <select
                                value={assignment.classroom_id || ''}
                                onChange={(e) => updateAssignment(assignment.id, 'classroom_id', e.target.value)}
                                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                required
                              >
                                <option value="">Select Classroom</option>
                                {classroomOptions.map(classroom => (
                                  <option key={classroom.id} value={classroom.id}>
                                    {classroom.name} ({classroom.section_name})
                                  </option>
                                ))}
                              </select>
                              {selectedClassroom && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {selectedClassroom.grade_level_name} - Section {selectedClassroom.section_name}
                                </p>
                              )}
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-2">Subject*</label>
                              <select
                                value={assignment.subject_id || ''}
                                onChange={(e) => updateAssignment(assignment.id, 'subject_id', e.target.value)}
                                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                disabled={!assignment.classroom_id}
                                required
                              >
                                <option value="">Select Subject</option>
                                {subjectOptions.map(subject => (
                                  <option key={subject.id} value={subject.id}>
                                    {subject.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-2">
                                Periods per Week
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={assignment.periods_per_week || 1}
                                onChange={(e) => updateAssignment(assignment.id, 'periods_per_week', parseInt(e.target.value) || 1)}
                                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                              />
                            </div>

                            <div className="flex items-center pt-6">
                              <input
                                type="checkbox"
                                id={`primary-${assignment.id}`}
                                checked={assignment.is_primary_teacher || false}
                                onChange={(e) => updateAssignment(assignment.id, 'is_primary_teacher', e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                              />
                              <label
                                htmlFor={`primary-${assignment.id}`}
                                className="ml-2 text-sm text-gray-700 cursor-pointer"
                              >
                                Primary/Class Teacher
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <p className="text-sm text-green-700 font-medium">
                        Total Assignments: {currentAssignments.length}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        {currentAssignments.filter(a => a.classroom_id && a.subject_id).length} complete assignments
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={() => {
              setFormData({
                photo: null,
                firstName: '',
                middleName: '',
                lastName: '',
                gender: '',
                bloodGroup: '',
                dateOfBirth: '',
                placeOfBirth: '',
                academicSession: '',
                employeeId: '',
                address: '',
                email: '',
                phoneNumber: '',
                staffType: 'teaching',
                level: '',
                subjects: [],
                hireDate: '',
                qualification: '',
                specialization: '',
                assignments: [],
              });
              setCurrentAssignments([]);
              setPhotoPreview(null);
            }}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Reset Form
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              loading
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {loading ? 'Saving...' : 'Save Teacher'}
          </button>
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (teacherUsername || teacherPassword) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4 text-green-700">Teacher Account Created!</h3>
            
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-blue-800 mb-3">Login Credentials</h4>
              
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-600">Username:</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 p-2 bg-white border border-gray-300 rounded text-sm font-mono break-all">
                    {teacherUsername}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(teacherUsername!);
                      toast.success('Username copied!');
                    }}
                    className="px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600">Password:</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 p-2 bg-white border border-gray-300 rounded text-sm font-mono break-all">
                    {teacherPassword}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(teacherPassword!);
                      toast.success('Password copied!');
                    }}
                    className="px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 p-3 rounded border border-yellow-200 mb-4">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Please save these credentials securely and share them with the teacher. 
                They should change their password on first login.
              </p>
            </div>

            <button
              onClick={() => {
                setShowPasswordModal(false);
                setTeacherUsername(null);
                setTeacherPassword(null);
              }}
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddTeacherForm;