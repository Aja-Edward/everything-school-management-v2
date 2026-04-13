
import React, { useState, useEffect } from 'react';
import type {Teacher, UpdateTeacherData} from '@/types/teacher'
import api from '@/services/api';

interface EditTeacherFormProps {
  teacher: Teacher | null;
  onSave: (data: UpdateTeacherData) => void;
  onCancel: () => void;
  themeClasses: any;
  isDark: boolean;
}

const EditTeacherForm: React.FC<EditTeacherFormProps> = ({ teacher, onSave, onCancel, themeClasses, isDark }) => {
  
 

  // Helper function to get initial form data
  const getInitialFormData = () => {
    if (!teacher) {
      return {
        first_name: '',
        last_name: '',
        email: '',
        employee_id: '',
        phone_number: '',
        address: '',
        qualification: '',
        specialization: '',
        staff_type: 'teaching' as const,
        level: undefined,
        is_active: true,
        photo: undefined
      };
    }

    // Prioritize user object data if available, fallback to teacher direct properties
    return {
      first_name: teacher.user?.first_name || teacher.first_name || '',
      last_name: teacher.user?.last_name || teacher.last_name || '',
      email: teacher.user?.email || teacher.email || '',
      employee_id: teacher.employee_id || '',
      phone_number: teacher.phone_number || '',
      address: teacher.address || '',
      qualification: teacher.qualification || '',
      specialization: teacher.specialization || '',
      staff_type: teacher.staff_type || 'teaching',
      level: teacher.level || undefined,
      is_active: teacher.is_active ?? true,
      photo: teacher.photo || undefined
    };
  };

  const [formData, setFormData] = useState(getInitialFormData());
  const [photoPreview, setPhotoPreview] = useState<string | null>(teacher?.photo || null);
  const [uploading, setUploading] = useState(false);
  const [subjectOptions, setSubjectOptions] = useState<{id: number, name: string}[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [classroomOptions, setClassroomOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [currentAssignments, setCurrentAssignments] = useState<Array<{
    id: string;
    classroom_id: number | string;
    subject_id: number | string;
    is_primary_teacher: boolean;
    periods_per_week: number;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Update form data when teacher prop changes
useEffect(() => {
  const loadSubjectsAndClassrooms = async () => {
    if (formData.staff_type !== 'teaching' || !formData.level) {
      setSubjectOptions([]);
      setClassroomOptions([]);
      setDataLoaded(true);
      return;
    }

    setLoading(true);
    try {
      const levelMap: Record<string, string> = {
        nursery: 'NURSERY',
        primary: 'PRIMARY',
        junior_secondary: 'JUNIOR_SECONDARY',
        senior_secondary: 'SENIOR_SECONDARY',
        secondary: 'SECONDARY'
      };

      const educationLevel = levelMap[formData.level];
      if (!educationLevel) { setDataLoaded(true); return; }

      try {
        const subjectData = await api.get('/subjects/', { education_level: educationLevel });
        const subjects = Array.isArray(subjectData) ? subjectData : (subjectData.results || []);
        setSubjectOptions(subjects.map((s: any) => ({ id: s.id, name: s.name })));
      } catch (error) {
        console.error('Error fetching subjects:', error);
        setSubjectOptions([]);
      }

      try {
        const classroomData = await api.get('/classrooms/classrooms/', {
          section__grade_level__education_level: educationLevel
        });
        const classrooms = Array.isArray(classroomData) ? classroomData : (classroomData.results || []);
        setClassroomOptions(prev => {
          const merged = [...prev];
          classrooms.forEach((c: any) => {
            if (!merged.find(existing => existing.id === c.id)) {
              merged.push({ id: c.id, name: c.name || `${c.grade_level_name || ''} ${c.section_name || ''}` });
            }
          });
          return merged;
        });
      } catch (error) {
        console.error('Error fetching classrooms:', error);
      }

      setDataLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  loadSubjectsAndClassrooms();
}, [formData.staff_type, formData.level]); // API_BASE_URL removed from deps

// Load teacher's assigned subjects
useEffect(() => {
  if (!teacher || !dataLoaded || subjectOptions.length === 0) return;
  
  console.log('📋 Loading assigned subjects:', teacher.assigned_subjects);
  
  if (teacher.assigned_subjects && Array.isArray(teacher.assigned_subjects) && 
      teacher.assigned_subjects.length > 0) {
    const subjectIds = teacher.assigned_subjects.map((s: any) => String(s.id));
    console.log('✅ Setting selected subjects:', subjectIds);
    setSelectedSubjects(subjectIds);
  } else {
    setSelectedSubjects([]);
  }
}, [teacher, dataLoaded, subjectOptions.length]);

// Load classrooms from teacher.classroom_assignments (NOT from API!)
useEffect(() => {
  if (!teacher) {
    console.log('⚠️ No teacher data');
    return;
  }
  
  console.log('🏫 Loading classroom assignments from teacher data');
  console.log('🏫 Teacher.classroom_assignments:', teacher.classroom_assignments);
  
  // Build classroom options from the teacher's existing assignments
  if (teacher.classroom_assignments && Array.isArray(teacher.classroom_assignments) && 
      teacher.classroom_assignments.length > 0) {
    
    // Extract unique classrooms
    const uniqueClassrooms = new Map();
    teacher.classroom_assignments.forEach((assignment: any) => {
      if (assignment.classroom_id && !uniqueClassrooms.has(assignment.classroom_id)) {
        uniqueClassrooms.set(assignment.classroom_id, {
          id: assignment.classroom_id,
          name: assignment.classroom_name || `${assignment.grade_level_name} ${assignment.section_name}`
        });
      }
    });
    
    const classroomsFromAssignments = Array.from(uniqueClassrooms.values());
    console.log('✅ Built classroom options from assignments:', classroomsFromAssignments);
    setClassroomOptions(classroomsFromAssignments);
    
    // Process the assignments
    const assignments = teacher.classroom_assignments.map((assignment: any, index: number) => ({
      id: `existing-${assignment.id || index}`,
      classroom_id: assignment.classroom_id || '',
      subject_id: assignment.subject_id || '',
      is_primary_teacher: assignment.is_primary_teacher || false,
      periods_per_week: assignment.periods_per_week || 1,
    }));
    
    console.log('✅ Setting current assignments:', assignments);
    setCurrentAssignments(assignments);
  } else {
    console.log('⚠️ No classroom assignments found for this teacher');
    setClassroomOptions([]);
    setCurrentAssignments([]);
  }
}, [teacher]);

  const getInitials = (firstName: string, lastName: string) => {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return `${first}${last}`.toUpperCase();
  };

  // Load subjects and classrooms when level change

  // Load teacher's assigned subjects AFTER subjects are loaded
  useEffect(() => {
    if (!teacher || !dataLoaded || subjectOptions.length === 0) return;
    
    console.log('📋 Loading assigned subjects. Teacher assigned_subjects:', teacher.assigned_subjects);
    console.log('📋 Available subject options:', subjectOptions);
    
    if (teacher.assigned_subjects && Array.isArray(teacher.assigned_subjects) && 
        teacher.assigned_subjects.length > 0) {
      const subjectIds = teacher.assigned_subjects.map(s => String(s.id));
      console.log('✅ Setting selected subjects:', subjectIds);
      setSelectedSubjects(subjectIds);
    } else {
      setSelectedSubjects([]);
    }
  }, [teacher, dataLoaded, subjectOptions.length]);

  // Load teacher's classroom assignments - BUILD classroom options from the assignments themselves!
  useEffect(() => {
    if (!teacher) return;
    
    console.log('🏫 Loading classroom assignments. Teacher data:', teacher);
    console.log('🏫 Teacher classroom_assignments:', teacher.classroom_assignments);
    
    // Extract unique classrooms from the teacher's assignments to populate the dropdown
    if (teacher.classroom_assignments && Array.isArray(teacher.classroom_assignments) && 
        teacher.classroom_assignments.length > 0) {
      
      // Build classroom options from the assignments
      const uniqueClassrooms = new Map();
      teacher.classroom_assignments.forEach((assignment: any) => {
        if (assignment.classroom_id && !uniqueClassrooms.has(assignment.classroom_id)) {
          uniqueClassrooms.set(assignment.classroom_id, {
            id: assignment.classroom_id,
            name: assignment.classroom_name || `${assignment.grade_level_name} ${assignment.section_name}`
          });
        }
      });
      
      const classroomsFromAssignments = Array.from(uniqueClassrooms.values());
      console.log('✅ Built classroom options from assignments:', classroomsFromAssignments);
      
      // Add these to existing classroom options (merge without duplicates)
      setClassroomOptions(prev => {
        const merged = [...prev];
        classroomsFromAssignments.forEach(newClassroom => {
          if (!merged.find(c => c.id === newClassroom.id)) {
            merged.push(newClassroom);
          }
        });
        return merged;
      });
      
      // Now process the assignments
      const assignments = teacher.classroom_assignments.map((assignment: any, index: number) => {
        console.log(`📝 Processing assignment ${index}:`, assignment);
        
        const processedAssignment = {
          id: `existing-${assignment.id || index}`,
          classroom_id: assignment.classroom_id || '',
          subject_id: assignment.subject_id || '',
          is_primary_teacher: assignment.is_primary_teacher || false,
          periods_per_week: assignment.periods_per_week || 1,
        };
        
        console.log(`✅ Processed assignment ${index}:`, processedAssignment);
        return processedAssignment;
      });
      
      console.log('✅ Setting current assignments:', assignments);
      setCurrentAssignments(assignments);
    } else {
      console.log('⚠️ No assignments found');
      setCurrentAssignments([]);
    }
  }, [teacher, dataLoaded, subjectOptions.length]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    console.log(`📝 Input changed: ${name} = ${newValue}`);
    
    // Reset subjects and assignments if level changes
    if (name === 'level') {
      setSelectedSubjects([]);
      setCurrentAssignments([]);
      setDataLoaded(false);
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: newValue
    }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try {
        const cloudinaryData = new FormData();
        cloudinaryData.append('file', file);
        cloudinaryData.append('upload_preset', 'profile_upload');
        
        const res = await fetch('https://api.cloudinary.com/v1_1/djbz7wunu/image/upload', {
          method: 'POST',
          body: cloudinaryData
        });
        
        const data = await res.json();
        const imageUrl = data.secure_url;
        
        console.log('✅ Cloudinary upload successful:', imageUrl);
        
        setFormData(prev => ({ ...prev, photo: imageUrl }));
        setPhotoPreview(imageUrl);
      } catch (error) {
        console.error('❌ Error uploading to Cloudinary:', error);
        alert('Failed to upload image');
      } finally {
        setUploading(false);
      }
    }
  };

  const removePhoto = () => {
    setFormData(prev => ({ ...prev, photo: undefined }));
    setPhotoPreview(null);
  };

  const handleSubjectChange = (subjectId: string | number, checked: boolean) => {
    console.log('📚 Subject change:', subjectId, checked);
    const subjectIdStr = String(subjectId);
    if (checked) {
      setSelectedSubjects(prev => [...prev, subjectIdStr]);
    } else {
      setSelectedSubjects(prev => prev.filter(id => id !== subjectIdStr));
    }
  };

  const addAssignment = () => {
    const newAssignment = {
      id: `new-${Date.now()}`,
      classroom_id: '',
      subject_id: '',
      is_primary_teacher: false,
      periods_per_week: 1,
    };
    console.log('➕ Adding new assignment:', newAssignment);
    setCurrentAssignments(prev => [...prev, newAssignment]);
  };

  const removeAssignment = (assignmentId: string) => {
    console.log('🗑️ Removing assignment:', assignmentId);
    setCurrentAssignments(prev => prev.filter(a => a.id !== assignmentId));
  };

  const updateAssignment = (assignmentId: string, field: string, value: string | boolean | number) => {
    console.log(`📝 Updating assignment ${assignmentId}: ${field} = ${value}`);
    setCurrentAssignments(prev => 
      prev.map(assignment => {
        if (assignment.id === assignmentId) {
          return { ...assignment, [field]: value };
        }
        return assignment;
      })
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('💾 Form submission - formData:', formData);
    console.log('💾 Form submission - selectedSubjects:', selectedSubjects);
    console.log('💾 Form submission - currentAssignments:', currentAssignments);
    
    const updateData: UpdateTeacherData = {
      ...formData,
      subjects: selectedSubjects.map(s => Number(s)),
      user: {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email
      },
      assignments: currentAssignments
        .filter(a => a.classroom_id && a.subject_id)
        .map(assignment => ({
          classroom_id: Number(assignment.classroom_id),
          subject_id: Number(assignment.subject_id),
          is_primary_teacher: assignment.is_primary_teacher,
          periods_per_week: assignment.periods_per_week,
        }))
    };
    
    console.log('✅ Final updateData being sent:', updateData);
    onSave(updateData);
  };

  // Null check
  if (!teacher) {
    return (
      <div className="text-center p-4">
        <p className="text-gray-500">Loading teacher data...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Profile Picture Upload */}
      <div className="mb-6">
        <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>
          Profile Picture
        </label>
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-3 bg-gray-50 relative">
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Teacher" className="w-20 h-20 object-cover rounded" />
                <button 
                  type="button"
                  onClick={removePhoto} 
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-lg font-bold text-white">
                  {getInitials(formData.first_name, formData.last_name)}
                </span>
              </div>
            )}
          </div>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handlePhotoUpload} 
            className="hidden" 
            id="edit-teacher-photo" 
            disabled={uploading} 
          />
          <label 
            htmlFor="edit-teacher-photo" 
            className={`px-4 py-2 rounded text-sm cursor-pointer transition-colors ${
              uploading 
                ? 'bg-gray-400 text-white cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {uploading ? 'Uploading...' : 'Choose New Photo'}
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>First Name *</label>
          <input
            type="text"
            name="first_name"
            value={formData.first_name}
            onChange={handleInputChange}
            required
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`}
          />
        </div>

        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Last Name *</label>
          <input
            type="text"
            name="last_name"
            value={formData.last_name}
            onChange={handleInputChange}
            required
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`}
          />
        </div>

        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Email *</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`}
          />
        </div>

        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Employee ID</label>
          <input
            type="text"
            name="employee_id"
            value={formData.employee_id}
            onChange={handleInputChange}
            placeholder="e.g., EMP001"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`}
          />
        </div>

        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Phone Number</label>
          <input
            type="tel"
            name="phone_number"
            value={formData.phone_number}
            onChange={handleInputChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`}
          />
        </div>

        <div className="md:col-span-2">
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Address</label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleInputChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`}
          />
        </div>

        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Staff Type</label>
          <select
            name="staff_type"
            value={formData.staff_type}
            onChange={handleInputChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`}
          >
            <option value="teaching">Teaching</option>
            <option value="non-teaching">Non-Teaching</option>
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Level</label>
          <select
            name="level"
            value={formData.level || ''}
            onChange={handleInputChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`}
          >
            <option value="">Select Level</option>
            <option value="nursery">Nursery</option>
            <option value="primary">Primary</option>
            <option value="junior_secondary">Junior Secondary</option>
            <option value="senior_secondary">Senior Secondary</option>
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Qualification</label>
          <input
            type="text"
            name="qualification"
            value={formData.qualification}
            onChange={handleInputChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`}
          />
        </div>

        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Specialization</label>
          <input
            type="text"
            name="specialization"
            value={formData.specialization}
            onChange={handleInputChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`}
          />
        </div>

        <div className="md:col-span-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              name="is_active"
              checked={formData.is_active}
              onChange={handleInputChange}
              className="mr-2"
            />
            <span className={`text-sm font-medium ${themeClasses.textSecondary}`}>Active Status</span>
          </label>
        </div>
      </div>

      {/* Subject Selection */}
      {formData.staff_type === 'teaching' && formData.level && (
        <div className="mb-4">
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Assigned Subjects</label>
          
          {selectedSubjects.length > 0 && (
            <div className="mb-3 p-3 bg-blue-50 rounded border">
              <p className="text-sm font-medium mb-2">Currently Selected ({selectedSubjects.length})</p>
              <div className="flex flex-wrap gap-2">
                {selectedSubjects.map(subjectId => {
                  const subject = subjectOptions.find(s => String(s.id) === subjectId);
                  return subject ? (
                    <span key={subjectId} className="inline-flex items-center bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded">
                      {subject.name}
                      <button
                        type="button"
                        onClick={() => handleSubjectChange(subjectId, false)}
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}
          
          {loading ? (
            <div className="text-center p-4 text-gray-500">Loading subjects...</div>
          ) : subjectOptions.length === 0 ? (
            <div className="bg-gray-50 p-3 rounded border text-sm text-gray-500">
              No subjects found for this level.
            </div>
          ) : (
            <div className="bg-gray-50 p-3 rounded border max-h-40 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {subjectOptions.map(subj => (
                  <label key={subj.id} className="flex items-center space-x-2 cursor-pointer hover:bg-white p-2 rounded">
                    <input
                      type="checkbox"
                      checked={selectedSubjects.includes(String(subj.id))}
                      onChange={(e) => handleSubjectChange(subj.id, e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">{subj.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Classroom Assignments */}
      {formData.staff_type === 'teaching' && formData.level && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className={`block text-sm font-medium ${themeClasses.textSecondary}`}>Classroom Assignments</label>
            <button
              type="button"
              onClick={addAssignment}
              className="px-3 py-1 text-sm rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              Add Assignment
            </button>
          </div>

          {currentAssignments.length === 0 ? (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center text-gray-500 text-sm">
              No classroom assignments added yet.
            </div>
          ) : (
            <div className="space-y-4">
              {currentAssignments.map((assignment, index) => (
                <div key={assignment.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-700">Assignment {index + 1}</h4>
                    <button
                      type="button"
                      onClick={() => removeAssignment(assignment.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Classroom</label>
                      <select
                        value={assignment.classroom_id}
                        onChange={(e) => updateAssignment(assignment.id, 'classroom_id', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      >
                        <option value="">Select Classroom</option>
                        {classroomOptions.map(classroom => (
                          <option key={classroom.id} value={classroom.id}>
                            {classroom.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                      <select
                        value={assignment.subject_id}
                        onChange={(e) => updateAssignment(assignment.id, 'subject_id', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      >
                        <option value="">Select Subject</option>
                        {subjectOptions.map(subject => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Periods/Week</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={assignment.periods_per_week}
                        onChange={(e) => updateAssignment(assignment.id, 'periods_per_week', parseInt(e.target.value) || 1)}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>

                    <div className="flex items-center pt-6">
                      <input
                        type="checkbox"
                        id={`primary-${assignment.id}`}
                        checked={assignment.is_primary_teacher}
                        onChange={(e) => updateAssignment(assignment.id, 'is_primary_teacher', e.target.checked)}
                        className="rounded mr-2"
                      />
                      <label htmlFor={`primary-${assignment.id}`} className="text-xs font-medium text-gray-600">
                        Primary Teacher
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border rounded-lg font-medium bg-gray-200 hover:bg-gray-300 text-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white"
        >
          Save Changes
        </button>
      </div>
    </form>
  );
};

export default EditTeacherForm;