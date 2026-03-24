import React, { useState, useEffect } from 'react';
import { User, X, Calendar, Search, Check } from 'lucide-react';
import api from '@/services/api';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate } from 'react-router-dom';
import { triggerDashboardRefresh } from '@/hooks/useDashboardRefresh';
import {StudentFormData} from '@/types/students'


const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface AddStudentFormProps {
  onStudentAdded?: () => void;
}

const AddStudentForm: React.FC<AddStudentFormProps> = ({ onStudentAdded }) => {
  const [formData, setFormData] = useState<StudentFormData>({
    photo: null, firstName: '', middleName: '', lastName: '', email: '',
    gender: '', bloodGroup: '', dateOfBirth: '', placeOfBirth: '',
    academicYear: '', education_level: '', student_class: '', section: '', stream: '',
    registration_number: '', existing_parent_id: '', parentFirstName: '',
    parentLastName: '', parentEmail: '', parentPhoneNumber: '', parentAddress: '',
    address: '', phoneNumber: '', paymentMethod: '', medicalConditions: '',
    specialRequirements: '', relationship: '', isPrimaryContact: false, classroom: '',
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [studentPassword, setStudentPassword] = useState<string | null>(null);
  const [parentPassword, setParentPassword] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [studentUsername, setStudentUsername] = useState<string | null>(null);
  const [parentUsername, setParentUsername] = useState<string | null>(null);
  const [parentSearch, setParentSearch] = useState('');
  const [parentOptions, setParentOptions] = useState<any[]>([]);
  const [parentSearchLoading, setParentSearchLoading] = useState(false);
  const [selectedParent, setSelectedParent] = useState<any | null>(null);
  const navigate = useNavigate();
  const [parentUsernameSearch, setParentUsernameSearch] = useState('');
  const [parentDetails, setParentDetails] = useState<any | null>(null);
  const [useParentEmail, setUseParentEmail] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [streams, setStreams] = useState<any[]>([]);
  
  // State for cascading dropdowns
  const [gradeLevels, setGradeLevels] = useState<any[]>([]);  // Classes/Grade Levels
  const [sections, setSections] = useState<any[]>([]);        // Sections for selected grade
  const [classrooms, setClassrooms] = useState<any[]>([]);    // Classrooms for selected section
  
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);
  
  // Date picker states
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');

  // Fetch grade levels (Classes) on component mount
  useEffect(() => {
    const fetchGradeLevels = async () => {
      setLoadingGrades(true);
      try {
        const response = await api.get('/api/classrooms/grades/');
        console.log('Grade Levels Response:', response);

        let gradesArray: any[] = [];
        if (Array.isArray(response)) {
          gradesArray = response;
        } else if (response && Array.isArray(response.results)) {
          gradesArray = response.results;
        } else if (response && Array.isArray(response.data)) {
          gradesArray = response.data;
        }

        setGradeLevels(gradesArray);
        console.log('Grade levels loaded:', gradesArray.length, 'items');
      } catch (error) {
        console.error('Error fetching grade levels:', error);
        toast.error('Failed to load grade levels');
        setGradeLevels([]);
      } finally {
        setLoadingGrades(false);
      }
    };

    fetchGradeLevels();
  }, []);

  // Fetch sections when grade level (student_class) is selected
  useEffect(() => {
    const fetchSections = async () => {
      if (!formData.student_class) {
        setSections([]);
        setFormData(prev => ({ ...prev, section: '', classroom: '' }));
        return;
      }

      setLoadingSections(true);
      try {
        // Fetch sections for the selected grade level
        const response = await api.get(`/api/classrooms/grades/${formData.student_class}/sections/`);
        console.log('Sections Response:', response);

        let sectionsArray: any[] = [];
        if (Array.isArray(response)) {
          sectionsArray = response;
        } else if (response && Array.isArray(response.results)) {
          sectionsArray = response.results;
        } else if (response && Array.isArray(response.data)) {
          sectionsArray = response.data;
        }

        setSections(sectionsArray);
        console.log('Sections loaded:', sectionsArray.length, 'items');
      } catch (error) {
        console.error('Error fetching sections:', error);
        toast.error('Failed to load sections');
        setSections([]);
      } finally {
        setLoadingSections(false);
      }
    };

    fetchSections();
  }, [formData.student_class]);

  // Fetch classrooms when section is selected
  useEffect(() => {
    const fetchClassrooms = async () => {
      if (!formData.section) {
        setClassrooms([]);
        setFormData(prev => ({ ...prev, classroom: '' }));
        return;
      }

      setLoadingClassrooms(true);
      try {
        console.log('Fetching classrooms for section ID:', formData.section);

        const response = await api.get(`/api/classrooms/classrooms/?section=${formData.section}`);
        console.log('Classrooms API response:', response);

        let classroomList: any[] = [];
        if (Array.isArray(response)) {
          classroomList = response;
        } else if (response && Array.isArray(response.results)) {
          classroomList = response.results;
        } else if (response && Array.isArray(response.data)) {
          classroomList = response.data;
        }

        console.log('Processed classroom list:', classroomList);
        setClassrooms(classroomList);
        
        if (classroomList.length === 0) {
          const section = sections.find(s => s.id === parseInt(formData.section));
          toast.info(
            `No classrooms found for ${section?.name || 'this section'}. You can proceed without selecting a classroom.`,
            {
              position: "top-right",
              autoClose: 5000
            }
          );
        }
        
      } catch (error: any) {
        console.error('Error fetching classrooms:', error);
        toast.error('Failed to load classrooms');
        setClassrooms([]);
      } finally {
        setLoadingClassrooms(false);
      }
    };
    
    fetchClassrooms();
  }, [formData.section, sections]);
  
  const handleParentUsernameSearch = async () => {
    if (!parentUsernameSearch) return;
    try {
      const res = await api.get(`/api/parents/search/?q=${encodeURIComponent(parentUsernameSearch)}`);
      const parentData = Array.isArray(res) ? res : [];
      const found = parentData.find((p: any) => 
        p.username === parentUsernameSearch || 
        p.username.includes(parentUsernameSearch) ||
        p.username.toLowerCase().includes(parentUsernameSearch.toLowerCase())
      );
      if (found) {
        setParentDetails(found);
        setSelectedParent(found);
        setParentUsernameSearch(found.username);
        toast.success('Parent found and details filled!');
      } else {
        toast.error('Parent not found. Please check the username or add the parent first.');
        setTimeout(() => navigate('/admin/parents/add'), 1500);
      }
    } catch (err) {
      toast.error('Error searching for parent.');
    }
  };

  useEffect(() => {
    if (parentSearch.length < 2) {
      setParentOptions([]);
      return;
    }
    setParentSearchLoading(true);
    api.get(`/api/parents/search/?q=${encodeURIComponent(parentSearch)}`)
      .then(res => setParentOptions(res || []))
      .catch(() => setParentOptions([]))
      .finally(() => setParentSearchLoading(false));
  }, [parentSearch]);

  useEffect(() => {
    if (useParentEmail) {
      const parentEmail = selectedParent?.email || parentDetails?.email || formData.parentEmail || '';
      setFormData(prev => ({ ...prev, email: parentEmail }));
    }
  }, [useParentEmail, selectedParent, parentDetails, formData.parentEmail]);

  useEffect(() => {
    const fetchStreams = async () => {
      try {
        const response = await api.get('/api/classrooms/streams/');
        console.log('Streams response:', response);

        let streamsArray: any[] = [];
        if (Array.isArray(response)) {
          streamsArray = response;
        } else if (response && Array.isArray(response.results)) {
          streamsArray = response.results;
        } else if (response && Array.isArray(response.data)) {
          streamsArray = response.data;
        }

        setStreams(streamsArray);
        console.log('Streams set to:', streamsArray.length, 'items');
      } catch (error) {
        console.error('Error fetching streams:', error);
        setStreams([]);
      }
    };
    fetchStreams();
  }, []);

  // Update dateOfBirth when day/month/year changes
  useEffect(() => {
    if (dobDay && dobMonth && dobYear) {
      const month = dobMonth.padStart(2, '0');
      const day = dobDay.padStart(2, '0');
      setFormData(prev => ({ ...prev, dateOfBirth: `${dobYear}-${month}-${day}` }));
    }
  }, [dobDay, dobMonth, dobYear]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox' && 'checked' in e.target) {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    const cloudinaryData = new FormData();
    cloudinaryData.append('file', file);
    cloudinaryData.append('upload_preset', 'profile_upload');
    try {
      const res = await axios.post('https://api.cloudinary.com/v1_1/djbz7wunu/image/upload', cloudinaryData);
      const imageUrl = res.data.secure_url;
      setFormData(prev => ({ ...prev, photo: imageUrl }));
      setPhotoPreview(imageUrl);
    } catch (err) {
      toast.error('Image upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    setFormData(prev => ({ ...prev, photo: null }));
    setPhotoPreview(null);
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setStudentPassword(null);
    setParentPassword(null);
    setShowPasswordModal(false);
    
    try {
      // ✅ FIXED: Build payload with proper FK IDs
      const payload: any = {
        user_email: formData.email,
        user_first_name: formData.firstName,
        user_middle_name: formData.middleName,
        user_last_name: formData.lastName,
        gender: formData.gender,
        blood_group: formData.bloodGroup,
        date_of_birth: formData.dateOfBirth,
        place_of_birth: formData.placeOfBirth,
        academic_year: formData.academicYear,
        
        // ✅ Send FK IDs, not enum strings
        student_class: formData.student_class ? parseInt(formData.student_class) : null,  // Class/GradeLevel ID
        section: formData.section ? parseInt(formData.section) : null,                    // Section ID
        stream: formData.stream ? parseInt(formData.stream) : null,                       // Stream ID
        
        registration_number: formData.registration_number,
        // classroom field can be removed if backend computes it automatically
        // or keep it optional if backend still accepts it
        address: formData.address,
        phone_number: formData.phoneNumber,
        payment_method: formData.paymentMethod,
        medical_conditions: formData.medicalConditions,
        special_requirements: formData.specialRequirements,
        profile_picture: formData.photo,
        relationship: formData.relationship,
        is_primary_contact: formData.isPrimaryContact,
      };
      
      // Validate Senior Secondary stream requirement
      const selectedGrade = gradeLevels.find(g => g.id === parseInt(formData.student_class));
      const isSeniorSecondary = selectedGrade?.education_level === 'SENIOR_SECONDARY';
      
      if (isSeniorSecondary && !formData.stream) {
        setError('Stream selection is required for Senior Secondary students');
        setLoading(false);
        return;
      }
      
      if (selectedParent) {
        payload.existing_parent_id = selectedParent.id;
      } else {
        payload.parent_first_name = formData.parentFirstName;
        payload.parent_last_name = formData.parentLastName;
        payload.parent_email = formData.parentEmail;
        payload.parent_contact = formData.parentPhoneNumber;
        payload.parent_address = formData.parentAddress;
      }
      
      console.log('Submitting payload:', payload);
      
      const response = await api.post('/api/students/students/', payload);
      setSuccess('Student and Parent created successfully!');
      toast.success('Student and Parent added successfully');
      
      triggerDashboardRefresh();
      
      if (onStudentAdded) {
        onStudentAdded();
      }
      
      if (response) {
        setStudentUsername(response.student_username);
        setStudentPassword(response.student_password);
        setParentUsername(response.parent_username);
        setParentPassword(response.parent_password);
        setShowPasswordModal(true);
      }
      
      setTimeout(() => {
        setLoading(false);
        setFormData({
          photo: null, firstName: '', middleName: '', lastName: '', email: '',
          gender: '', bloodGroup: '', dateOfBirth: '', placeOfBirth: '',
          academicYear: '', education_level: '', student_class: '', section: '', stream: '',
          registration_number: '', existing_parent_id: '', parentFirstName: '',
          parentLastName: '', parentEmail: '', parentPhoneNumber: '', parentAddress: '',
          address: '', phoneNumber: '', paymentMethod: '', medicalConditions: '',
          specialRequirements: '', relationship: '', isPrimaryContact: false, classroom: '',
        });
        setDobDay('');
        setDobMonth('');
        setDobYear('');
      }, 1200);
    } catch (err: any) {
      console.error('Error creating student:', err);
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to create student');
      toast.error('Cannot add student');
      setLoading(false);
    }
  };

  // Generate day, month, year options
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = [
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 p-6 border-b border-slate-200">
        <h2 className="text-2xl font-bold text-slate-900">Add New Student</h2>
        <p className="text-slate-600 text-sm mt-1">Fill in the student details below</p>
      </div>
      
      <div className="p-6 space-y-8">
        {/* Photo Upload */}
        <div className="flex flex-col items-center">
          <label className="block text-sm font-semibold text-slate-700 mb-3">Student Photo</label>
          <div className="relative">
            <div className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-2xl flex items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors">
              {photoPreview ? (
                <div className="relative w-full h-full">
                  <img src={photoPreview} alt="Student" className="w-full h-full object-cover rounded-2xl" />
                  <button
                    onClick={removePhoto}
                    className="absolute -top-2 -right-2 w-7 h-7 bg-rose-500 text-white rounded-full flex items-center justify-center hover:bg-rose-600 transition-colors shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <User className="w-12 h-12 text-slate-400" />
              )}
            </div>
          </div>
          {uploading && <div className="text-sm text-blue-600 mt-2 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            Uploading...
          </div>}
          <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" id="student-photo" />
          <label
            htmlFor="student-photo"
            className="mt-3 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md font-medium text-sm"
          >
            Choose Photo
          </label>
        </div>

        {/* Personal Information */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-200 pb-2">Personal Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">First Name*</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Middle Name</label>
              <input
                type="text"
                name="middleName"
                value={formData.middleName}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Middle name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Last Name*</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Gender*</label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Select Gender</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
          </div>
          {/* Mobile-Friendly Date of Birth */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Date of Birth*
            </label>
            <div className="grid grid-cols-3 gap-3">
              <select
                value={dobDay}
                onChange={(e) => setDobDay(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Day</option>
                {days.map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <select
                value={dobMonth}
                onChange={(e) => setDobMonth(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Month</option>
                {months.map(month => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
              <select
                value={dobYear}
                onChange={(e) => setDobYear(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Year</option>
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            {formData.dateOfBirth && (
              <div className="mt-2 text-sm text-slate-600 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                Selected: {new Date(formData.dateOfBirth).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </div>
            )}
          </div>
        </div>

        {/* Academic Information - FIXED SECTION */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-200 pb-2">Academic Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Academic Year*</label>
              <input
                type="text"
                name="academicYear"
                value={formData.academicYear}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="2024/2025"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Registration Number</label>
              <input
                type="text"
                name="registration_number"
                value={formData.registration_number}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="REG12345"
              />
            </div>
          </div>

          {/* ✅ FIXED: Cascading dropdowns for Class → Section → Classroom */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Class/Grade Level* 
                <span className="text-xs text-slate-500 ml-2">(Step 1)</span>
              </label>
              <select
                name="student_class"
                value={formData.student_class}
                onChange={(e) => {
                  const gradeId = e.target.value;
                  const selectedGrade = gradeLevels.find(g => g.id === parseInt(gradeId));
                  
                  console.log('Selected grade:', selectedGrade);
                  
                  setFormData(prev => ({
                    ...prev,
                    student_class: gradeId,           // Store the Class ID
                    education_level: selectedGrade?.education_level || '',  // Store enum for validation
                    section: '',                       // Reset section
                    stream: '',                        // Reset stream
                    classroom: ''                      // Reset classroom
                  }));
                }}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-slate-900"
                disabled={loadingGrades}
              >
                <option value="" className="text-slate-900">
                  {loadingGrades ? 'Loading grades...' : 'Select Grade Level'}
                </option>
                {gradeLevels.map(grade => (
                  <option
                    key={grade.id}
                    value={grade.id}
                    className="text-slate-900"
                  >
                    {grade.name || grade.display_name}
                  </option>
                ))}
              </select>
              {gradeLevels.length > 0 && (
                <div className="mt-1 text-xs text-emerald-600">
                  {gradeLevels.length} grade(s) loaded
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Section* 
                <span className="text-xs text-slate-500 ml-2">(Step 2)</span>
              </label>
              <select
                name="section"
                value={formData.section}
                onChange={(e) => {
                  const sectionId = e.target.value;
                  setFormData(prev => ({
                    ...prev,
                    section: sectionId,      // Store Section ID
                    classroom: ''            // Reset classroom
                  }));
                }}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-slate-900"
                disabled={!formData.student_class || loadingSections}
              >
                <option value="" className="text-slate-900">
                  {loadingSections ? 'Loading sections...' : !formData.student_class ? 'Select grade first' : 'Select Section'}
                </option>
                {sections.map(section => (
                  <option
                    key={section.id}
                    value={section.id}
                    className="text-slate-900"
                  >
                    {section.name}
                  </option>
                ))}
              </select>
              {sections.length > 0 && (
                <div className="mt-1 text-xs text-emerald-600">
                  {sections.length} section(s) available
                </div>
              )}
            </div>
          </div>

          {/* Stream field - only for Senior Secondary */}
          {formData.education_level === 'SENIOR_SECONDARY' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Stream* <span className="text-xs text-slate-500">(Required for Senior Secondary)</span>
              </label>
              <select
                name="stream"
                value={formData.stream}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Select Stream</option>
                {streams.map((stream) => (
                  <option key={stream.id} value={stream.id}>
                    {stream.name} ({stream.stream_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Classroom field - optional */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Classroom (Optional) 
              <span className="text-xs text-slate-500 ml-2">(Step 3)</span>
            </label>
            <select
              name="classroom"
              value={formData.classroom}
              onChange={handleInputChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-slate-900"
              disabled={!formData.section || loadingClassrooms}
            >
              <option value="" className="text-slate-900">
                {loadingClassrooms 
                  ? 'Loading classrooms...' 
                  : !formData.section 
                    ? 'Select a section first' 
                    : classrooms.length === 0 
                      ? 'No classrooms available (can proceed without)' 
                      : 'Select Classroom (Optional)'}
              </option>
              {classrooms.map(room => (
                <option 
                  key={room.id} 
                  value={room.name || room.id}
                  className="text-slate-900"
                >
                  {room.name || room.display_name || `Classroom ${room.id}`}
                </option>
              ))}
            </select>
            {formData.section && !loadingClassrooms && (
              <div className="mt-1 text-xs">
                {classrooms.length > 0 ? (
                  <span className="text-emerald-600">{classrooms.length} classroom(s) available</span>
                ) : (
                  <span className="text-slate-500">No classrooms configured - you can proceed without selecting one</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Parent Information - Keep existing code */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-200 pb-2">Parent/Guardian Information</h3>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Search Existing Parent</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={parentSearch}
                onChange={(e) => {
                  setParentSearch(e.target.value);
                  setSelectedParent(null);
                }}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Search by name, username, or email..."
              />
            </div>
            {parentSearchLoading && (
              <div className="mt-2 text-sm text-slate-600 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                Searching...
              </div>
            )}
            {parentOptions && parentOptions.length > 0 && (
              <ul className="mt-2 border border-slate-200 rounded-xl bg-white max-h-60 overflow-y-auto shadow-lg">
                {parentOptions.map(parent => (
                  <li
                    key={parent.id}
                    className={`p-4 cursor-pointer transition-all ${
                      selectedParent && selectedParent.id === parent.id 
                        ? 'bg-blue-50 border-l-4 border-blue-500' 
                        : 'hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      setSelectedParent(parent);
                      setParentUsernameSearch(parent.username);
                    }}
                  >
                    <div className="font-semibold text-slate-900">{parent.full_name}</div>
                    <div className="text-sm text-slate-600 mt-1">
                      {parent.username} • {parent.email} • {parent.phone}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {selectedParent && (
              <div className="mt-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-emerald-900">{selectedParent.full_name}</div>
                    <div className="text-sm text-emerald-700">{selectedParent.username}</div>
                  </div>
                </div>
                <button 
                  className="text-sm text-rose-600 hover:text-rose-800 font-medium underline" 
                  onClick={() => setSelectedParent(null)}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Or Search by Username</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={parentUsernameSearch}
                onChange={(e) => setParentUsernameSearch(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="PAR/GTS/AUG/25/003"
              />
              <button
                type="button"
                onClick={handleParentUsernameSearch}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md font-medium"
              >
                Search
              </button>
            </div>
          </div>

          {parentDetails && (
            <div className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl">
              <h4 className="font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                <Check className="w-5 h-5" />
                Parent Found
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="font-medium text-emerald-800">Full Name:</span>
                  <span className="ml-2 text-emerald-700">{parentDetails.full_name}</span>
                </div>
                <div>
                  <span className="font-medium text-emerald-800">Email:</span>
                  <span className="ml-2 text-emerald-700">{parentDetails.email}</span>
                </div>
                <div>
                  <span className="font-medium text-emerald-800">Phone:</span>
                  <span className="ml-2 text-emerald-700">{parentDetails.phone}</span>
                </div>
                <div>
                  <span className="font-medium text-emerald-800">Address:</span>
                  <span className="ml-2 text-emerald-700">{parentDetails.address}</span>
                </div>
              </div>
            </div>
          )}

          {!parentDetails && !selectedParent && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Parent First Name*</label>
                  <input
                    type="text"
                    name="parentFirstName"
                    value={formData.parentFirstName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Parent first name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Parent Last Name*</label>
                  <input
                    type="text"
                    name="parentLastName"
                    value={formData.parentLastName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Parent last name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Parent Phone*</label>
                  <input
                    type="tel"
                    name="parentPhoneNumber"
                    value={formData.parentPhoneNumber}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="+234 123 456 7890"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Parent Email*</label>
                  <input
                    type="email"
                    name="parentEmail"
                    value={formData.parentEmail}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="parent@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Parent Address*</label>
                  <textarea
                    name="parentAddress"
                    value={formData.parentAddress}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                    placeholder="Parent address..."
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Relationship to Student*</label>
              <select
                name="relationship"
                value={formData.relationship}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Select Relationship</option>
                <option value="Father">Father</option>
                <option value="Mother">Mother</option>
                <option value="Guardian">Guardian</option>
                <option value="Sponsor">Sponsor</option>
              </select>
            </div>
            <div className="flex items-center pt-8">
              <input
                type="checkbox"
                name="isPrimaryContact"
                checked={formData.isPrimaryContact}
                onChange={handleInputChange}
                className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                id="is-primary-contact"
              />
              <label htmlFor="is-primary-contact" className="ml-3 text-sm font-medium text-slate-700">
                Set as Primary Contact
              </label>
            </div>
          </div>
        </div>

        {/* Student Contact & Additional Info - Keep existing code */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-200 pb-2">Contact & Additional Information</h3>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Student Email*</label>
            <div className="flex items-center gap-3 mb-2">
              <input
                type="checkbox"
                checked={useParentEmail}
                onChange={(e) => setUseParentEmail(e.target.checked)}
                id="use-parent-email"
                className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                disabled={!selectedParent && !parentDetails && !formData.parentEmail}
              />
              <label htmlFor="use-parent-email" className="text-sm text-slate-600">
                Use parent's email for student
              </label>
            </div>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="student@example.com"
              disabled={useParentEmail && (selectedParent || parentDetails)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Student Phone*</label>
              <input
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="+234 123 456 7890"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method*</label>
              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Select Payment Method</option>
                <option value="cash">Cash</option>
                <option value="debits">Debits</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Student Address*</label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              placeholder="Enter student's residential address..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Medical Conditions</label>
              <textarea
                name="medicalConditions"
                value={formData.medicalConditions}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                placeholder="Any medical conditions or allergies..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Special Requirements</label>
              <textarea
                name="specialRequirements"
                value={formData.specialRequirements}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                placeholder="Any special requirements or accommodations..."
              />
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-3">
            <X className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center gap-3">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="w-full sm:w-auto px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </span>
            ) : (
              'Save Student'
            )}
          </button>
        </div>
      </div>

      {/* Password Modal - Keep existing code */}
      {showPasswordModal && (studentUsername || studentPassword || parentUsername || parentPassword) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full">
            <h3 className="text-2xl font-bold text-slate-900 mb-6 text-center">Account Credentials Created</h3>
            
            {studentUsername && (
              <div className="mb-4 p-5 bg-blue-50 border-2 border-blue-200 rounded-xl">
                <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Student Account
                </h4>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-slate-700">Username:</span>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="flex-1 font-mono text-lg bg-white px-4 py-2 rounded-lg border border-blue-200">
                        {studentUsername}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(studentUsername!);
                          toast.success('Username copied!');
                        }}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-slate-700">Password:</span>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="flex-1 font-mono text-lg bg-white px-4 py-2 rounded-lg border border-blue-200">
                        {studentPassword}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(studentPassword!);
                          toast.success('Password copied!');
                        }}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {parentUsername && (
              <div className="mb-6 p-5 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                <h4 className="font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Parent Account
                </h4>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-slate-700">Username:</span>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="flex-1 font-mono text-lg bg-white px-4 py-2 rounded-lg border border-emerald-200">
                        {parentUsername}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(parentUsername!);
                          toast.success('Username copied!');
                        }}
                        className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-slate-700">Password:</span>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="flex-1 font-mono text-lg bg-white px-4 py-2 rounded-lg border border-emerald-200">
                        {parentPassword}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(parentPassword!);
                          toast.success('Password copied!');
                        }}
                        className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <p className="text-sm text-slate-600 mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              ⚠️ Please copy and securely send these credentials to the respective users. They should change their passwords on first login.
            </p>

            <button
              onClick={() => setShowPasswordModal(false)}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold shadow-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddStudentForm;