import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  User, 
  Calculator,
  Target,
  Star,
  RefreshCw,
  AlertCircle,
  Heart,
  BookOpen
} from 'lucide-react';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import ResultService from '@/services/ResultService';
import { AcademicSession, ExamSession} from '@/types/types'
import SubjectService, {Subject} from '@/services/SubjectService';
import { toast } from 'react-toastify';
import api from '@/services/api';

interface AddResultFormProps {
  onClose: () => void;
  onSuccess: () => void;
  preSelectedStudent?: any;
}

interface Student {
  id: string | number;
  full_name: string;
  student_class: string;
  education_level: string;
  classroom?: string | null;
  section_id?: number | null;
}

interface GradingSystem {
  id: string;
  name: string;
  grading_type: string;
  min_score: number;
  max_score: number;
  pass_mark: number;
}

interface Stream {
  id: string;
  name: string;
  stream_type: string;
}

const AddResultForm: React.FC<AddResultFormProps> = ({ onClose, onSuccess, preSelectedStudent }) => {
  const { isDarkMode } = useGlobalTheme();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // FIXED: Initialize form data with empty strings instead of 0 for better UX
  const [formData, setFormData] = useState({
    student: preSelectedStudent?.id?.toString() || '',
    subject: '',
    exam_session: '',
    grading_system: '',
    stream: '',
    status: 'DRAFT',
    teacher_remark: '',
    academic_comment: '',
    
    // Senior Secondary fields
    first_test_score: '',
    second_test_score: '',
    third_test_score: '',
    
    // Primary/Junior Secondary fields
    continuous_assessment_score: '',
    take_home_test_score: '',
    appearance_score: '',
    practical_score: '',
    project_score: '',
    note_copying_score: '',
    
    // Common fields
    exam_score: '',
    
    // Calculated fields (can be input manually or auto-calculated)
    ca_total: '',
    total_score: '',
    grade: '',
    position: '',
    class_average: '',
    highest_in_class: '',
    lowest_in_class: '',
    
    // Nursery specific
    max_marks_obtainable: '100',
    mark_obtained: '',
    physical_development: '',
    health: '',
    cleanliness: '',
    general_conduct: '',
    height_beginning: '',
    height_end: 0,
    weight_beginning: 0,
    weight_end: 0
  });

  // Dropdown data
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [gradingSystems, setGradingSystems] = useState<GradingSystem[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(preSelectedStudent || null);
  
  // Filter states for cascading dropdowns
  const [selectedEducationLevel, setSelectedEducationLevel] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedClassSection, setSelectedClassSection] = useState<string>('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [availableClassSections, setAvailableClassSections] = useState<string[]>([]);
  const [nurseryTab, setNurseryTab] = useState<'academic' | 'physical'>('academic');


  const isNurseryStudent = selectedStudent?.education_level === 'NURSERY';

  // Auto-calculation effect
  useEffect(() => {
  if (!selectedStudent) return;

  const calculateFields = () => {
    const newFormData = { ...formData };
    const parseScore = (score: any) => parseFloat(score) || 0;

    switch (selectedStudent.education_level) {
      case 'SENIOR_SECONDARY':
        const test1 = parseFloat(formData.first_test_score) || 0;
        const test2 = parseFloat(formData.second_test_score) || 0;
        const test3 = parseFloat(formData.third_test_score) || 0;
        const exam = parseFloat(formData.exam_score) || 0;
        const totalScore = test1 + test2 + test3 + exam;
        
        if (totalScore > 0) {
          newFormData.total_score = totalScore.toString();
          newFormData.grade = generateGrade(totalScore);
        }
        break;

      case 'PRIMARY':
      case 'JUNIOR_SECONDARY':
        const ca = parseFloat(formData.continuous_assessment_score) || 0;
        const takeHome = parseFloat(formData.take_home_test_score) || 0;
        const appearance = parseFloat(formData.appearance_score) || 0;
        const practical = parseFloat(formData.practical_score) || 0;
        const project = parseFloat(formData.project_score) || 0;
        const noteCopying = parseFloat(formData.note_copying_score) || 0;
        const caTotal = ca + takeHome + appearance + practical + project + noteCopying;
        
        const examScore = parseFloat(formData.exam_score) || 0;
        const totalScore2 = caTotal + examScore;
        
        if (caTotal > 0) {
          newFormData.ca_total = caTotal.toString();
        }
        if (totalScore2 > 0) {
          newFormData.total_score = totalScore2.toString();
          newFormData.grade = generateGrade(totalScore2);
        }
        break;

      case 'NURSERY':
        // FIX: Use exam_score (which is the actual field being input) instead of mark_obtained
        const nurseryScore = parseFloat(formData.exam_score) || 0;
        const maxMarks = parseFloat(formData.max_marks_obtainable) || 100;
        
        if (nurseryScore > 0) {
          newFormData.total_score = nurseryScore.toString();
          // Calculate grade as percentage for nursery
          const percentage = (nurseryScore / maxMarks) * 100;
          newFormData.grade = generateGrade(percentage);
        }
        break;
    }

    if (JSON.stringify(newFormData) !== JSON.stringify(formData)) {
      setFormData(newFormData);
    }
  };

  calculateFields();
}, [
  formData.first_test_score, formData.second_test_score, formData.third_test_score,
  formData.continuous_assessment_score, formData.take_home_test_score, formData.appearance_score,
  formData.practical_score, formData.project_score, formData.note_copying_score,
  formData.exam_score, formData.max_marks_obtainable, // Added max_marks_obtainable to dependencies
  selectedStudent
]);

  const themeClasses = {
    bgPrimary: isDarkMode ? 'bg-gray-900' : 'bg-white',
    bgSecondary: isDarkMode ? 'bg-gray-800' : 'bg-gray-50',
    bgCard: isDarkMode ? 'bg-gray-800' : 'bg-white',
    textPrimary: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    textTertiary: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    borderError: 'border-red-500',
    buttonPrimary: isDarkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonSecondary: isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700',
    buttonSuccess: isDarkMode ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white',
  };

  useEffect(() => {
    loadDropdownData();
  }, []);

  useEffect(() => {
    if (selectedStudent?.education_level) {
      loadSubjectsForEducationLevel(selectedStudent.education_level);
      loadGradingSystemsForEducationLevel(selectedStudent.education_level);
      if (selectedStudent.education_level === 'SENIOR_SECONDARY') {
        loadStreams();
      }
    } else {
      setSubjects([]);
    }
  }, [selectedStudent]);

  // Handle education level change
  useEffect(() => {
    if (selectedEducationLevel) {
      setSelectedClass('');
      setSelectedClassSection('');
      setStudents([]);
      setAvailableClasses([]);
      setAvailableClassSections([]);
      setSubjects([]); // Clear subjects when education level changes
      setFormData(prev => ({ ...prev, subject: '' })); // Clear subject selection
      loadStudentsByFilters(selectedEducationLevel);
      // Load subjects for this education level
      loadSubjectsForEducationLevel(selectedEducationLevel);
    }
  }, [selectedEducationLevel]);

  // Handle class change
  useEffect(() => {
    if (selectedEducationLevel && selectedClass) {
      setSelectedClassSection('');
      setStudents([]);
      setAvailableClassSections([]);
      setFormData(prev => ({ ...prev, subject: '' })); // Clear subject selection
      loadStudentsByFilters(selectedEducationLevel, selectedClass);
      // Reload subjects when class changes (in case there are class-specific subjects)
      loadSubjectsForEducationLevel(selectedEducationLevel);
    }
  }, [selectedClass]);

  // Handle class section change
  useEffect(() => {
    if (selectedEducationLevel && selectedClass && selectedClassSection) {
      
    }
  }, [selectedClassSection]);

  const loadDropdownData = async () => {
    try {
      setLoadingData(true);

      // Only load exam sessions initially, students will be loaded based on filters
      const examSessionsResponse = await ResultService.getExamSessions();
      setExamSessions(examSessionsResponse);
      try {
        const fallbackSubjects = await SubjectService.getSubjects({ is_active: true });
        if (Array.isArray(fallbackSubjects) && fallbackSubjects.length > 0) {
          setSubjects(fallbackSubjects);
        }
      } catch (error) {
        console.warn('🔍 [AddResultForm] Could not load fallback subjects:', error);
      }

      // If preSelectedStudent is provided, load that specific student
      if (preSelectedStudent) {
        try {
          const studentResponse = await api.get(`/api/students/students/${preSelectedStudent.id}/`);
          setSelectedStudent(studentResponse);
          setSelectedEducationLevel(studentResponse.education_level);
          setSelectedClass(studentResponse.student_class);
        } catch (error) {
          console.error('Error loading pre-selected student:', error);
          toast.error('Failed to load student information');
        }
      }

    } catch (error) {
      console.error('Error loading dropdown data:', error);
      // Only show error toast for actual API failures, not for empty data states
      // Empty exam sessions are handled gracefully with UI warnings
      if (error instanceof Error && error.message && !error.message.includes('exam session')) {
        toast.error('Failed to load form data. Please try again.');
      }
    } finally {
      setLoadingData(false);
    }
  };

  const loadSubjectsForEducationLevel = async (educationLevel: string) => {
    try {
      setLoadingSubjects(true);
      console.log('🔍 [AddResultForm] Loading subjects for education level:', educationLevel);
      
      // Try direct API call first with proper error handling
      try {
        const directResponse = await api.get('/api/subjects/', { 
          params: { 
            education_level: educationLevel,
            is_active: true 
          }
        });
        console.log('🔍 [AddResultForm] Direct API response:', directResponse);
        
        if (directResponse && Array.isArray(directResponse)) {
          setSubjects(directResponse);
          return;
        } else if (directResponse && directResponse.results && Array.isArray(directResponse.results)) {
          setSubjects(directResponse.results);
          return;
        } else {
          console.warn('🔍 [AddResultForm] Unexpected direct API response format:', directResponse);
        }
      } catch (directError) {
        console.warn('🔍 [AddResultForm] Direct API call failed:', directError);
      }
      
      // Fallback to SubjectService - use the specific method for education level
      const subjectsResponse = await SubjectService.getSubjectsByEducationLevel(educationLevel);
      
      if (Array.isArray(subjectsResponse)) {
        
        setSubjects(subjectsResponse);
      } else {
        console.warn('🔍 [AddResultForm] Unexpected SubjectService response format:', subjectsResponse);
        setSubjects([]);
      }
    } catch (error) {
      console.error('🔍 [AddResultForm] Error loading subjects for education level:', educationLevel, error);
      toast.error(`Failed to load subjects for ${educationLevel}`);
      // Set empty array to prevent UI crashes
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  };


const loadGradingSystemsForEducationLevel = async (educationLevel: string) => {
    try {
      const gradingSystemsResponse = await api.get('/api/results/grading-systems/', {
        params: { education_level: educationLevel }
      });
      
      // Handle different response formats
      let systemsData = [];
      if (Array.isArray(gradingSystemsResponse)) {
        // Direct array response
        systemsData = gradingSystemsResponse;
      } else if (Array.isArray(gradingSystemsResponse.data)) {
        // Response wrapped in .data
        systemsData = gradingSystemsResponse.data;
      } else if (gradingSystemsResponse.data?.results) {
        // Paginated response
        systemsData = gradingSystemsResponse.data.results;
      } else if (gradingSystemsResponse.results) {
        // Results at root level
        systemsData = gradingSystemsResponse.results;
      }
      
      setGradingSystems(systemsData);
      console.log("This is Grading System", systemsData);
    } catch (error) {
      console.error('Error loading grading systems:', error);
      toast.error('Failed to load grading systems');
      setGradingSystems([]);
    }
  };

  const loadStreams = async () => {
    try {
      const streamsResponse = await ResultService.getAvailableStreams();
      setStreams(streamsResponse?.results || streamsResponse || []);
    } catch (error) {
      console.error('Error loading streams:', error);
    }
  };

  // Load students based on selected filters
  const loadStudentsByFilters = async (educationLevel: string, studentClass?: string) => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      params.append('education_level', educationLevel);
      
      if (studentClass) {
        params.append('student_class', studentClass);
      }
      
      
      const response = await api.get(`/api/students/students/?${params.toString()}`);
      const studentsData = response?.results || response || [];
      
           
      setStudents(studentsData);
      
      // Extract unique classes and sections for dropdowns
      const uniqueClasses = [...new Set(studentsData.map((s: Student) => s.student_class))].filter(Boolean) as string[];
      console.log('🔍 [AddResultForm] Extracted classes:', uniqueClasses);
      setAvailableClasses(uniqueClasses);
      
      // Extract unique class sections (using classroom field as section name)
      const uniqueSections = [...new Set(studentsData.map((s: Student) => s.classroom).filter(Boolean))] as string[];
      console.log('🔍 [AddResultForm] Extracted sections:', uniqueSections);
      setAvailableClassSections(uniqueSections);
      
    } catch (error) {
      console.error('Error loading students:', error);
      toast.error('Failed to load students');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // Generate automatic teacher remark based on score and grade
  const generateTeacherRemark = (totalScore: number, grade: string): string => {
    const score = Number(totalScore) || 0;
    
    // Define remark templates based on grade ranges
    const remarkTemplates = {
      'A': [
        'Excellent.',
        'Exceptional.',
        'Outstanding.',
        'Brilliant.'
      ],
      'B': [
        'Very good.',
        'Nice work.',
        'Amazing.',
        'Awesome.'
      ],
      'C': [
        'Good.',
        'Well done!.',
        'Good effort.',
        'Satisfactory.'
      ],
      'D': [
        'Fair',
        'Average',
        'Working hard.',
        'Improvement.'
      ],
      'E': [
        'Do more.',
        'Focus more.',
        'Work.',
        'Poor.'
      ],
     
      'F': [
        'Failed.',
        'Very poor.',
        'Failed grade.',
        'Critical.'
      ]
    };

    // Get appropriate remarks based on grade
    let gradeRemarks = remarkTemplates[grade as keyof typeof remarkTemplates] || remarkTemplates['F'];
    
    // If no grade provided, determine based on score
    if (!grade && score > 0) {
      if (score >= 70) gradeRemarks = remarkTemplates['A'];
      else if (score >= 60) gradeRemarks = remarkTemplates['B'];
      else if (score >= 50) gradeRemarks = remarkTemplates['C'];
      else if (score >= 45) gradeRemarks = remarkTemplates['D'];
      else if (score >= 39) gradeRemarks = remarkTemplates['E']; // Fair remarks for 40-49
      else gradeRemarks = remarkTemplates['F']; // Poor remarks only below 30
    }

    // Return a random remark from the appropriate category
    return gradeRemarks[Math.floor(Math.random() * gradeRemarks.length)];
  };

  // FIXED: Enhanced handleInputChange function with auto-calculation
  const handleInputChange = (field: string, value: any) => {
    const newFormData = {
      ...formData,
      [field]: value
    };

    // Auto-calculate CA Total, Total Score, and Grade when score fields change
    if (selectedStudent && isScoreField(field)) {
      const caTotal = calculateCATotal(newFormData);
      const totalScore = calculateTotalScore(newFormData, caTotal);
      
      newFormData.ca_total = caTotal.toString();
      newFormData.total_score = totalScore.toString();
      
      // Auto-generate grade based on total score
      if (totalScore > 0) {
        newFormData.grade = generateGrade(totalScore);
      }
      
    }

    setFormData(newFormData);
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }

    // Handle student selection
    if (field === 'student') {
      
      const student = students.find(s => s.id.toString() === value);
      
      setSelectedStudent(student || null);
      // Reset dependent fields when student changes
      setFormData(prev => ({
        ...prev,
        student: value, // Make sure the form data is updated
        subject: '',
        grading_system: '',
        stream: '',
        ca_total: '0',
        total_score: '0',
        grade: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Required fields validation
    if (!formData.student) newErrors.student = 'Student is required';
    if (!formData.subject) newErrors.subject = 'Subject is required';
    if (!formData.exam_session) newErrors.exam_session = 'Exam session is required';
    // Note: grading_system, grade, position, class_average, highest_in_class, lowest_in_class are optional
    // and will be calculated later when all students' results are recorded

    // Education level specific validations
    if (selectedStudent) {
      const { education_level } = selectedStudent;
      
      const parseScore = (score: any) => parseFloat(score) || 0;
      
      switch (education_level) {
        case 'SENIOR_SECONDARY':
          const firstTest = parseScore(formData.first_test_score);
          const secondTest = parseScore(formData.second_test_score);
          const thirdTest = parseScore(formData.third_test_score);
          const examScore = parseScore(formData.exam_score);
          
          if (firstTest < 0 || firstTest > 10) {
            newErrors.first_test_score = 'Test 1 score must be between 0 and 10';
          }
          if (secondTest < 0 || secondTest > 10) {
            newErrors.second_test_score = 'Test 2 score must be between 0 and 10';
          }
          if (thirdTest < 0 || thirdTest > 10) {
            newErrors.third_test_score = 'Test 3 score must be between 0 and 10';
          }
          if (examScore < 0 || examScore > 70) {
            newErrors.exam_score = 'Exam score must be between 0 and 70';
          }
          break;
          
        case 'PRIMARY':
        case 'JUNIOR_SECONDARY':
          const caScore = parseScore(formData.continuous_assessment_score);
          const takeHomeScore = parseScore(formData.take_home_test_score);
          const appearanceScore = parseScore(formData.appearance_score);
          const practicalScore = parseScore(formData.practical_score);
          const projectScore = parseScore(formData.project_score);
          const noteCopyingScore = parseScore(formData.note_copying_score);
          const primaryExamScore = parseScore(formData.exam_score);
          
          if (caScore < 0 || caScore > 15) {
            newErrors.continuous_assessment_score = 'CA score must be between 0 and 15';
          }
          if (takeHomeScore < 0 || takeHomeScore > 5) {
            newErrors.take_home_test_score = 'Take Home Test score must be between 0 and 5';
          }
          if (appearanceScore < 0 || appearanceScore > 5) {
            newErrors.appearance_score = 'Appearance score must be between 0 and 5';
          }
          if (practicalScore < 0 || practicalScore > 5) {
            newErrors.practical_score = 'Practical score must be between 0 and 5';
          }
          if (projectScore < 0 || projectScore > 5) {
            newErrors.project_score = 'Project score must be between 0 and 5';
          }
          if (noteCopyingScore < 0 || noteCopyingScore > 5) {
            newErrors.note_copying_score = 'Note copying score must be between 0 and 5';
          }
          if (primaryExamScore < 0 || primaryExamScore > 60) {
            newErrors.exam_score = 'Exam score must be between 0 and 60';
          }
          break;
          
        case 'NURSERY':
          const maxMarks = parseScore(formData.max_marks_obtainable);
          const nurseryScore = parseScore(formData.exam_score);
          
          if (nurseryScore < 0 || nurseryScore > maxMarks) {
            newErrors.exam_score = `Score must be between 0 and ${maxMarks}`;
          }
          if (maxMarks <= 0) {
            newErrors.max_marks_obtainable = 'Max marks must be greater than 0';
          }
          break;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };


  // Helper function to check if a field is a score field
  const isScoreField = (field: string): boolean => {
    const scoreFields = [
      'first_test_score', 'second_test_score', 'third_test_score', 'exam_score',
      'continuous_assessment_score', 'take_home_test_score', 'appearance_score',
      'practical_score', 'project_score', 'note_copying_score'
    ];
    return scoreFields.includes(field);
  };

  // Calculate CA Total based on education level
  const calculateCATotal = (formData: any): number => {
    if (!selectedStudent) return 0;
    
    const parseScore = (score: any) => parseFloat(score) || 0;

    switch (selectedStudent.education_level) {
      case 'SENIOR_SECONDARY':
        return parseScore(formData.first_test_score) + 
               parseScore(formData.second_test_score) + 
               parseScore(formData.third_test_score);
      case 'PRIMARY':
      case 'JUNIOR_SECONDARY':
        return parseScore(formData.continuous_assessment_score) + 
               parseScore(formData.take_home_test_score) + 
               parseScore(formData.appearance_score) + 
               parseScore(formData.practical_score) + 
               parseScore(formData.project_score) + 
               parseScore(formData.note_copying_score);
      case 'NURSERY':
        return 0; // Nursery doesn't have CA components
      default:
        return 0;
    }
  };

  // Calculate Total Score (CA Total + Exam Score)
  const calculateTotalScore = (formData: any, caTotal?: number): number => {
    if (!selectedStudent) return 0;
    
    const parseScore = (score: any) => parseFloat(score) || 0;
    const caTotalValue = caTotal !== undefined ? caTotal : calculateCATotal(formData);
    const examScore = parseScore(formData.exam_score);

    return caTotalValue + examScore;
  };

  // Generate grade based on total score
  const generateGrade = (totalScore: number): string => {
    // Default grading system (can be enhanced to use actual grading system data)
    if (totalScore >= 70) return 'A';
    if (totalScore >= 60) return 'B';
    if (totalScore >= 50) return 'C';
    if (totalScore >= 45) return 'D';
    if (totalScore >= 39) return 'E';
    return 'F';
  };

  const calculateTotal = () => {
    if (!selectedStudent) return 0;

    const parseScore = (score: any) => parseFloat(score) || 0;

    switch (selectedStudent.education_level) {
      case 'SENIOR_SECONDARY':
        return parseScore(formData.first_test_score) + 
               parseScore(formData.second_test_score) + 
               parseScore(formData.third_test_score) + 
               parseScore(formData.exam_score);
      case 'PRIMARY':
      case 'JUNIOR_SECONDARY':
        return parseScore(formData.continuous_assessment_score) + 
               parseScore(formData.take_home_test_score) + 
               parseScore(formData.appearance_score) + 
               parseScore(formData.practical_score) + 
               parseScore(formData.project_score) + 
               parseScore(formData.note_copying_score) + 
               parseScore(formData.exam_score);
      case 'NURSERY':
      return parseScore(formData.exam_score);
      default:
        return 0;
    }
  };

  const getMaxTotal = () => {
    if (!selectedStudent) return 100;
    
    switch (selectedStudent.education_level) {
      case 'SENIOR_SECONDARY':
        return 100;
      case 'PRIMARY':
      case 'JUNIOR_SECONDARY':
        return 100;
      case 'NURSERY':
        return parseFloat(formData.max_marks_obtainable) || 100;
      default:
        return 100;
    }
  };

  // FIXED: Completely rewritten buildPayload with proper field handling
  const buildPayload = () => {
    if (!selectedStudent) throw new Error('No student selected');

    // Helper function to safely parse and convert values
    const parseNumericValue = (value: any): number => {
      if (value === '' || value === null || value === undefined) return 0;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    };

    // Base payload - ensure all IDs are properly formatted
    const basePayload = {
      student: formData.student,
      subject: formData.subject,
      exam_session: formData.exam_session,
      grading_system: formData.grading_system,
      status: formData.status
    };

    switch (selectedStudent.education_level) {
      case 'SENIOR_SECONDARY':
        return {
          ...basePayload,
          first_test_score: parseNumericValue(formData.first_test_score),
          second_test_score: parseNumericValue(formData.second_test_score),
          third_test_score: parseNumericValue(formData.third_test_score),
          exam_score: parseNumericValue(formData.exam_score),
          total_score: parseNumericValue(formData.total_score),
          grade: formData.grade || null,
          position: formData.position ? parseInt(formData.position) : null,
          class_average: parseNumericValue(formData.class_average) || null,
          highest_in_class: parseNumericValue(formData.highest_in_class) || null,
          lowest_in_class: parseNumericValue(formData.lowest_in_class) || null,
          teacher_remark: formData.teacher_remark || '',
          ...(formData.stream ? { stream: formData.stream } : {})
        };
        
      case 'PRIMARY':
      case 'JUNIOR_SECONDARY':
        return {
          ...basePayload,
          continuous_assessment_score: parseNumericValue(formData.continuous_assessment_score),
          take_home_test_score: parseNumericValue(formData.take_home_test_score),
          appearance_score: parseNumericValue(formData.appearance_score),
          practical_score: parseNumericValue(formData.practical_score),
          project_score: parseNumericValue(formData.project_score),
          note_copying_score: parseNumericValue(formData.note_copying_score),
          exam_score: parseNumericValue(formData.exam_score),
          ca_total: parseNumericValue(formData.ca_total),
          total_score: parseNumericValue(formData.total_score),
          grade: formData.grade || null,
          position: formData.position ? parseInt(formData.position) : null,
          class_average: parseNumericValue(formData.class_average) || null,
          highest_in_class: parseNumericValue(formData.highest_in_class) || null,
          lowest_in_class: parseNumericValue(formData.lowest_in_class) || null,
          teacher_remark: formData.teacher_remark || ''
        };
        
      case 'NURSERY':
  return {
    ...basePayload,
    max_marks_obtainable: parseNumericValue(formData.max_marks_obtainable),
    mark_obtained: parseNumericValue(formData.exam_score), // FIX: Send as mark_obtained to API
    exam_score: parseNumericValue(formData.exam_score), // Also send exam_score for compatibility
    total_score: parseNumericValue(formData.total_score),
    grade: formData.grade || null,
    position: formData.position ? parseInt(formData.position) : null,
    class_average: parseNumericValue(formData.class_average) || null,
    highest_in_class: parseNumericValue(formData.highest_in_class) || null,
    lowest_in_class: parseNumericValue(formData.lowest_in_class) || null,
    academic_comment: formData.academic_comment || formData.teacher_remark || '',
    physical_development: formData.physical_development || '',
    health: formData.health || '',
    cleanliness: formData.cleanliness || '',
    general_conduct: formData.general_conduct || '',
    height_beginning: parseNumericValue(formData.height_beginning) || null,
    height_end: parseNumericValue(formData.height_end) || null,
    weight_beginning: parseNumericValue(formData.weight_beginning) || null,
    weight_end: parseNumericValue(formData.weight_end) || null
  };
        
      default:
        throw new Error(`Invalid education level: ${selectedStudent.education_level}`);
    }
  };

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!validateForm()) {
    toast.error('Please fix the errors in the form');
    return;
  }

  try {
    setLoading(true);
    
    const payload = buildPayload();
    
    console.log('🔍 [AddResultForm] Full payload being submitted:', payload);
    
    // Create the result first
    const response = await ResultService.createStudentResult(payload, selectedStudent!.education_level);
    
    console.log('🔍 [AddResultForm] Result created:', response);
    
    // For nursery students, update the term report with physical development data
    if (selectedStudent?.education_level === 'NURSERY') {
      try {
        // Extract physical development data from form
        const physicalDevData = {
          physical_development: formData.physical_development || '',
          health: formData.health || '',
          cleanliness: formData.cleanliness || '',
          general_conduct: formData.general_conduct || '',
          height_beginning: parseFloat(String(formData.height_beginning)) || null,
          height_end: parseFloat(String(formData.height_end)) || null,
          weight_beginning: parseFloat(String(formData.weight_beginning)) || null,
          weight_end: parseFloat(String(formData.weight_end)) || null
        };
        
        console.log('🔍 [AddResultForm] Updating term report with physical dev data:', physicalDevData);
        
        // Find or create the term report for this student and exam session
        const termReportResponse = await api.get('/api/results/nursery/term-reports/', {
          params: {
            student: formData.student,
            exam_session: formData.exam_session
          }
        });
        
        console.log('🔍 [AddResultForm] Term report lookup:', termReportResponse);
        
        const termReports = termReportResponse?.results || termReportResponse || [];
        
        if (termReports.length > 0) {
          const termReportId = termReports[0].id;
          
          // Update the term report with physical development data
          await api.patch(`/api/results/nursery/term-reports/${termReportId}/`, physicalDevData);
          
          console.log('✅ [AddResultForm] Term report updated with physical development data');
          toast.success('Result and physical development data saved successfully!');
        } else {
          console.warn('⚠️ [AddResultForm] No term report found to update');
          toast.warning('Result created but physical development data could not be saved. Please update it manually.');
        }
      } catch (physicalError) {
        console.error('❌ [AddResultForm] Error saving physical development data:', physicalError);
        toast.warning('Result created but physical development data could not be saved. Please update it manually.');
      }
    } else {
      toast.success('Result created successfully!');
    }
    
    onSuccess();
    onClose();
  } catch (error: any) {
    console.error('Error creating result:', error);
    
    let errorMessage = 'Failed to create result';
    
    if (error.response?.data) {
      const errorData = error.response.data;
      if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (errorData.detail) {
        errorMessage = errorData.detail;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.error) {
        errorMessage = errorData.error;
      } else if (typeof errorData === 'object') {
        const fieldErrors = Object.entries(errorData)
          .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
          .join('; ');
        if (fieldErrors) {
          errorMessage = fieldErrors;
        }
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    toast.error(errorMessage);
  } finally {
    setLoading(false);
  }
};

  // FIXED: Improved InputField component with better value handling
  const InputField = ({ label, field, min = 0, max = 100, placeholder, step = "0.01", helpText, readOnly = false, type = "number" }: {
    label: string;
    field: string;
    min: number;
    max: number;
    placeholder?: string;
    step?: string;
    helpText?: string;
    readOnly?: boolean;
    type?: string;
  }) => {
    const fieldValue = formData[field as keyof typeof formData] as string;
    
    return (
      <div>
        <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
          {label} {type === "number" && `(${min}-${max})`}
          {helpText && <span className="text-xs text-gray-500 ml-2">({helpText})</span>}
          {readOnly && <span className="text-xs text-blue-600 ml-2">(Auto-calculated)</span>}
        </label>
        <input
          type={type}
          min={type === "number" ? min : undefined}
          max={type === "number" ? max : undefined}
          step={type === "number" ? step : undefined}
          value={fieldValue}
          onChange={readOnly ? undefined : (e) => handleInputChange(field, e.target.value)}
          readOnly={readOnly}
          className={`w-full px-3 py-2 rounded-lg border ${
            errors[field] ? themeClasses.borderError : themeClasses.border
          } ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            readOnly ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : ''
          }`}
          placeholder={placeholder || (type === "number" ? `${min}-${max}` : placeholder)}
        />
        {errors[field] && <p className="text-red-500 text-xs mt-1">{errors[field]}</p>}
      </div>
    );
  };

// Nursery Academic Tab Component
  const renderNurseryAcademicFields = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InputField 
        label="Max Marks Obtainable" 
        field="max_marks_obtainable" 
        min={1} 
        max={100}
        helpText="Maximum possible marks"
      />
      <InputField 
        label="Mark Obtained" 
        field="exam_score"  // FIX: Changed from "mark_obtained" to "exam_score"
        min={0} 
        max={parseFloat(formData.max_marks_obtainable) || 100}
        helpText="Actual marks obtained"
      />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <InputField 
        label="Total Score" 
        field="total_score" 
        min={0} 
        max={100}
        helpText="Auto-calculated"
        readOnly={true}
      />
      <div>
        <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
          Grade <span className="text-xs text-blue-600 ml-2">(Auto-generated)</span>
        </label>
        <input
          type="text"
          value={formData.grade}
          readOnly={true}
          className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none bg-gray-100 dark:bg-gray-700 cursor-not-allowed`}
          placeholder="Auto-generated"
        />
      </div>
      <InputField 
        label="Position" 
        field="position" 
        min={1} 
        max={100}
        helpText="Position in class"
      />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <InputField 
        label="Class Average" 
        field="class_average" 
        min={0} 
        max={100}
        helpText="Average score"
      />
      <InputField 
        label="Highest in Class" 
        field="highest_in_class" 
        min={0} 
        max={100}
        helpText="Highest score"
      />
      <InputField 
        label="Lowest in Class" 
        field="lowest_in_class" 
        min={0} 
        max={100}
        helpText="Lowest score"
      />
    </div>

    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={`block text-sm font-medium ${themeClasses.textSecondary}`}>
          Academic Comment
        </label>
        <button
          type="button"
          onClick={() => {
            const newRemark = generateTeacherRemark(
              Number(formData.total_score) || 0,
              formData.grade || ''
            );
            setFormData(prev => ({ ...prev, academic_comment: newRemark }));
          }}
          className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded transition-colors"
          disabled={loading}
        >
          Generate Comment
        </button>
      </div>
      <textarea
        value={formData.academic_comment}
        onChange={(e) => handleInputChange('academic_comment', e.target.value)}
        rows={3}
        className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
        placeholder="Enter academic comment for the student..."
        disabled={loading}
      />
    </div>
  </div>
);

  // Nursery Physical Development Tab Component
  const renderNurseryPhysicalFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
            Physical Development
          </label>
          <select
            value={formData.physical_development}
            onChange={(e) => handleInputChange('physical_development', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <option value="">Select Rating</option>
            <option value="Excellent">Excellent</option>
            <option value="Very Good">Very Good</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Poor">Poor</option>
          </select>
        </div>
        
        <div>
          <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
            Health
          </label>
          <select
            value={formData.health}
            onChange={(e) => handleInputChange('health', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <option value="">Select Rating</option>
            <option value="Excellent">Excellent</option>
            <option value="Very Good">Very Good</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Poor">Poor</option>
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
            Cleanliness
          </label>
          <select
            value={formData.cleanliness}
            onChange={(e) => handleInputChange('cleanliness', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <option value="">Select Rating</option>
            <option value="Excellent">Excellent</option>
            <option value="Very Good">Very Good</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Poor">Poor</option>
          </select>
        </div>
        
        <div>
          <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
            General Conduct
          </label>
          <select
            value={formData.general_conduct}
            onChange={(e) => handleInputChange('general_conduct', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <option value="">Select Rating</option>
            <option value="Excellent">Excellent</option>
            <option value="Very Good">Very Good</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Poor">Poor</option>
          </select>
        </div>
      </div>

      <div>
        <h4 className={`text-md font-medium mb-3 ${themeClasses.textPrimary}`}>
          Physical Measurements
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField
            label="Height (Beginning) - cm"
            field="height_beginning"
            min={0}
            max={200}
            step="0.1"
            helpText="Height at term start"
          />
          <InputField
            label="Height (End) - cm"
            field="height_end"
            min={0}
            max={200}
            step="0.1"
            helpText="Height at term end"
          />
          <InputField
            label="Weight (Beginning) - kg"
            field="weight_beginning"
            min={0}
            max={100}
            step="0.1"
            helpText="Weight at term start"
          />
          <InputField
            label="Weight (End) - kg"
            field="weight_end"
            min={0}
            max={100}
            step="0.1"
            helpText="Weight at term end"
          />
        </div>
      </div>
    </div>
  );

  // Nursery Tabs Component
  const renderNurseryTabs = () => (
    <div>
      <div className="flex mb-4 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          className={`px-6 py-3 font-medium focus:outline-none transition-colors flex items-center gap-2 ${
            nurseryTab === 'academic'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
          onClick={() => setNurseryTab('academic')}
        >
          <BookOpen size={18} />
          Academic Results
        </button>
        <button
          type="button"
          className={`px-6 py-3 font-medium focus:outline-none transition-colors flex items-center gap-2 ${
            nurseryTab === 'physical'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
          onClick={() => setNurseryTab('physical')}
        >
          <Heart size={18} />
          Physical Assessment
        </button>
      </div>
      
      <div className="pt-4">
        {nurseryTab === 'academic' ? renderNurseryAcademicFields() : renderNurseryPhysicalFields()}
      </div>
    </div>
  );

  
  const renderScoreFields = () => {
    if (!selectedStudent) {
      return (
        <div className={`p-8 text-center ${themeClasses.textSecondary}`}>
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p>Please select a student first</p>
        </div>
      );
    }

    switch (selectedStudent.education_level) {
      case 'SENIOR_SECONDARY':
        return (
          <div className="space-y-6">
            {/* Basic Scores */}
            <div>
              <h4 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Assessment Scores</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <InputField label="Test 1 Score" field="first_test_score" min={0} max={10} />
                <InputField label="Test 2 Score" field="second_test_score" min={0} max={10} />
                <InputField label="Test 3 Score" field="third_test_score" min={0} max={10} />
                <InputField label="Exam Score" field="exam_score" min={0} max={70} />
              </div>
            </div>
            
            {/* Calculated Fields */}
            <div>
              <h4 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Calculated Fields</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputField label="Total Score" field="total_score" min={0} max={100} helpText="CA Total + Exam Score" readOnly={true} />
                <InputField label="Grade" field="grade" min={0} max={100} helpText="Auto-generated from total score" type="text" readOnly={true} />
                <InputField label="Position" field="position" min={1} max={100} helpText="Position in class" />
                <InputField label="Class Average" field="class_average" min={0} max={100} helpText="Class average score" />
                <InputField label="Highest in Class" field="highest_in_class" min={0} max={100} helpText="Highest score in class" />
                <InputField label="Lowest in Class" field="lowest_in_class" min={0} max={100} helpText="Lowest score in class" />
              </div>
            </div>
            
            {/* Teacher Remark */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-lg font-medium text-gray-700 dark:text-gray-300">Teacher Remark</h4>
                <button
                  type="button"
                  onClick={() => {
                    const newRemark = generateTeacherRemark(
                      Number(formData.total_score) || 0,
                      formData.grade || ''
                    );
                    setFormData(prev => ({ ...prev, teacher_remark: newRemark }));
                  }}
                  className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded transition-colors"
                  disabled={loading}
                >
                  Generate Remark
                </button>
              </div>
              <textarea
                value={formData.teacher_remark}
                onChange={(e) => handleInputChange('teacher_remark', e.target.value)}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                rows={3}
                placeholder="Enter teacher's remark..."
              />
            </div>
          </div>
        );
       
      case 'PRIMARY':
      case 'JUNIOR_SECONDARY':
        return (
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Continuous Assessment Components</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputField label="Continuous Assessment" field="continuous_assessment_score" min={0} max={15} />
                <InputField label="Take Home Test" field="take_home_test_score" min={0} max={5} />
                <InputField label="Appearance Score" field="appearance_score" min={0} max={5} />
                <InputField label="Practical Score" field="practical_score" min={0} max={5} />
                <InputField label="Project Score" field="project_score" min={0} max={5} />
                <InputField label="Note Copying" field="note_copying_score" min={0} max={5} />
                <InputField label="Exam Score" field="exam_score" min={0} max={60} />
              </div>
            </div>
            
            <div>
              <h4 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Calculated Fields</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputField label="CA Total" field="ca_total" min={0} max={40} helpText="Sum of CA components" readOnly={true} />
                <InputField label="Total Score" field="total_score" min={0} max={100} helpText="CA Total + Exam" readOnly={true} />
                <InputField label="Grade" field="grade" min={0} max={100} helpText="Auto-generated" type="text" readOnly={true} />
                <InputField label="Position" field="position" min={1} max={100} helpText="Position in class" />
                <InputField label="Class Average" field="class_average" min={0} max={100} helpText="Class average" />
                <InputField label="Highest in Class" field="highest_in_class" min={0} max={100} helpText="Highest score" />
                <InputField label="Lowest in Class" field="lowest_in_class" min={0} max={100} helpText="Lowest score" />
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-lg font-medium text-gray-700 dark:text-gray-300">Teacher Remark</h4>
                <button
                  type="button"
                  onClick={() => {
                    const newRemark = generateTeacherRemark(
                      Number(formData.total_score) || 0,
                      formData.grade || ''
                    );
                    setFormData(prev => ({ ...prev, teacher_remark: newRemark }));
                  }}
                  className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded transition-colors"
                  disabled={loading}
                >
                  Generate Remark
                </button>
              </div>
              <textarea
                value={formData.teacher_remark}
                onChange={(e) => handleInputChange('teacher_remark', e.target.value)}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                rows={3}
                placeholder="Enter teacher's remark..."
              />
            </div>
          </div>
        );

      case 'NURSERY':
        return renderNurseryTabs();

      default:
        return <div className="text-red-500">Unsupported education level</div>;
    }
  };

  if (loadingData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className={`${themeClasses.bgCard} rounded-lg p-8 flex items-center space-x-3`}>
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <span className={themeClasses.textPrimary}>Loading form data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bgCard} rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto`}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className={`text-2xl font-bold ${themeClasses.textPrimary}`}>Add New Result</h2>
              <p className={`text-sm ${themeClasses.textSecondary}`}>
                Create a new student result record
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg ${themeClasses.buttonSecondary}`}
              disabled={loading}
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center ${themeClasses.textPrimary}`}>
                <User className="w-5 h-5 mr-2" />
                Basic Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {!preSelectedStudent && (
                  <>
                    {/* Education Level Filter */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                        Education Level *
                      </label>
                      <select
                        value={selectedEducationLevel}
                        onChange={(e) => setSelectedEducationLevel(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        disabled={loading}
                      >
                        <option value="">Select Education Level</option>
                        <option value="NURSERY">Nursery</option>
                        <option value="PRIMARY">Primary</option>
                        <option value="JUNIOR_SECONDARY">Junior Secondary</option>
                        <option value="SENIOR_SECONDARY">Senior Secondary</option>
                      </select>
                    </div>

                    {/* Class Filter */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                        Class
                      </label>
                      <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        disabled={!selectedEducationLevel || loading}
                      >
                        <option value="">Select Class</option>
                        {availableClasses.map(class_name => (
                          <option key={class_name} value={class_name}>
                            {class_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Class Section Filter */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                        Class Section
                      </label>
                      <select
                        value={selectedClassSection}
                        onChange={(e) => setSelectedClassSection(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        disabled={!selectedClass || loading}
                      >
                        <option value="">Select Section</option>
                        {availableClassSections.map(section => (
                          <option key={section} value={section}>
                            {section}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Student Selection */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                        Student *
                      </label>
                      <select
                        value={formData.student}
                        onChange={(e) => handleInputChange('student', e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border ${
                          errors.student ? themeClasses.borderError : themeClasses.border
                        } ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        disabled={!selectedEducationLevel || loading}
                      >
                        <option value="">Select Student</option>
                        {students.map(student => (
                          <option key={student.id} value={student.id.toString()}>
                            {student.full_name} - {student.student_class}
                          </option>
                        ))}
                      </select>
                      {errors.student && <p className="text-red-500 text-xs mt-1">{errors.student}</p>}
                    </div>
                  </>
                )}

                {preSelectedStudent && (
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                      Student
                    </label>
                    <div className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgSecondary} ${themeClasses.textPrimary}`}>
                      {preSelectedStudent.full_name} - {preSelectedStudent.student_class}
                    </div>
                  </div>
                )}

                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                    Subject * 
                    <span className="text-xs text-gray-500 ml-2">
                      {loadingSubjects ? 'Loading...' : `(${subjects.length} subjects loaded)`}
                    </span>
                    {selectedEducationLevel && (
                      <button
                        type="button"
                        onClick={() => loadSubjectsForEducationLevel(selectedEducationLevel)}
                        className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                        disabled={loadingSubjects}
                      >
                        {loadingSubjects ? 'Loading...' : 'Reload'}
                      </button>
                    )}
                  </label>
                  <select
                    value={formData.subject}
                    onChange={(e) => handleInputChange('subject', e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      errors.subject ? themeClasses.borderError : themeClasses.border
                    } ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    disabled={!selectedEducationLevel || loadingSubjects || loading}
                  >
                    <option value="">
                      {!selectedEducationLevel 
                        ? "Select education level first" 
                        : loadingSubjects
                          ? "Loading subjects..."
                          : subjects.length === 0 
                            ? "No subjects available" 
                            : "Select Subject"
                      }
                    </option>
                    {subjects.map(subject => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name} ({subject.code})
                      </option>
                    ))}
                  </select>
                  {errors.subject && <p className="text-red-500 text-xs mt-1">{errors.subject}</p>}
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                    Exam Session *
                  </label>
                    <select
                    value={formData.exam_session}
                    onChange={(e) => handleInputChange('exam_session', e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      errors.exam_session ? themeClasses.borderError : themeClasses.border
                    } ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    disabled={loading}
                  >
                    <option value="">
                      {examSessions.length === 0
                        ? "No exam sessions available - Create one in Settings"
                        : "Select Exam Session"
                      }
                    </option>
                    {examSessions.map(session => (
                      <option key={session.id} value={session.id}>
                        {session.name} - {typeof session.academic_session === 'object' && session.academic_session.name !== null ? (session.academic_session as AcademicSession).name : (session.academic_session ? String(session.academic_session) : 'No Session')}
                      </option>
                    ))}
                  </select>
                  {errors.exam_session && <p className="text-red-500 text-xs mt-1">{errors.exam_session}</p>}
                  {examSessions.length === 0 && (
                    <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-1">
                      ⚠️ No exam sessions found. Please create an exam session in Settings → Academic Calendar first.
                    </p>
                  )}
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                    Grading System *
                  </label>
                  <select
                    value={formData.grading_system}
                    onChange={(e) => handleInputChange('grading_system', e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      errors.grading_system ? themeClasses.borderError : themeClasses.border
                    } ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    disabled={!selectedStudent || loading}
                  >
                    <option value="">Select Grading System</option>
                    {gradingSystems.map(system => (
                      <option key={system.id} value={system.id}>
                        {system.name} ({system.grading_type})
                      </option>
                    ))}
                  </select>
                  {errors.grading_system && <p className="text-red-500 text-xs mt-1">{errors.grading_system}</p>}
                </div>

                {selectedStudent?.education_level === 'SENIOR_SECONDARY' && streams.length > 0 && (
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                      Stream
                    </label>
                    <select
                      value={formData.stream}
                      onChange={(e) => handleInputChange('stream', e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      disabled={loading}
                    >
                      <option value="">Select Stream (Optional)</option>
                      {streams.map(stream => (
                        <option key={stream.id} value={stream.id}>
                          {stream.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.textSecondary}`}>
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    disabled={loading}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="APPROVED">Approved</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                </div>
              </div>

              {/* Display selected student's education level */}
              {selectedStudent && (
                <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className={`text-sm ${themeClasses.textSecondary}`}>
                    <strong>Education Level:</strong> {selectedStudent.education_level.replace('_', ' ')}
                  </p>
                </div>
              )}
            </div>

            {/* Scores Section */}
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center ${themeClasses.textPrimary}`}>
                <Target className="w-5 h-5 mr-2" />
                Assessment Scores
                {selectedStudent && (
                  <span className={`ml-2 text-sm font-normal px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200`}>
                    {selectedStudent.education_level.replace('_', ' ')}
                  </span>
                )}
              </h3>
              {renderScoreFields()}
            </div>

            {/* Total Score Display */}
            {selectedStudent && (
              <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-lg font-medium ${themeClasses.textSecondary} flex items-center`}>
                    <Calculator size={20} className="mr-2" />
                    Total Score:
                  </span>
                  <div className="text-right">
                    <span className={`text-2xl font-bold ${themeClasses.textPrimary}`}>
                      {calculateTotal()}/{getMaxTotal()}
                    </span>
                    <p className={`text-sm ${themeClasses.textSecondary}`}>
                      Percentage: {getMaxTotal() > 0 ? ((calculateTotal() / getMaxTotal()) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Comments Section */}
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold flex items-center ${themeClasses.textPrimary}`}>
                  <Star className="w-5 h-5 mr-2" />
                  {selectedStudent?.education_level === 'NURSERY' ? 'Academic Comment' : 'Teacher Remarks'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    const newRemark = generateTeacherRemark(
                      Number(formData.total_score) || 0, 
                      formData.grade || ''
                    );
                    setFormData(prev => ({ ...prev, teacher_remark: newRemark }));
                  }}
                  className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded transition-colors"
                  disabled={loading}
                >
                  Generate Remark
                </button>
              </div>
              
              <textarea
                value={formData.teacher_remark}
                onChange={(e) => handleInputChange('teacher_remark', e.target.value)}
                rows={4}
                className={`w-full px-3 py-2 rounded-lg border ${themeClasses.border} ${themeClasses.bgCard} ${themeClasses.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder={
                  selectedStudent?.education_level === 'NURSERY' 
                    ? "Enter academic comment for the student or click 'Generate Remark' for automatic suggestion..." 
                    : "Enter teacher remarks about the student's performance or click 'Generate Remark' for automatic suggestion..."
                }
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Tip: Use the "Generate Remark" button to get automatic suggestions based on the student's performance.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className={`px-6 py-2 rounded-lg ${themeClasses.buttonSecondary} transition-colors`}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`px-6 py-2 rounded-lg flex items-center ${themeClasses.buttonSuccess} transition-colors`}
                disabled={loading || !selectedStudent || !formData.student || !formData.subject || !formData.exam_session}
                onClick={() => {
                  console.log('🔍 [AddResultForm] Create Result button clicked');
                  console.log('🔍 [AddResultForm] Button disabled state:', {
                    loading,
                    selectedStudent: !!selectedStudent,
                    student: !!formData.student,
                    subject: !!formData.subject,
                    exam_session: !!formData.exam_session,
                    totalDisabled: loading || !selectedStudent || !formData.student || !formData.subject || !formData.exam_session
                  });
                  console.log('🔍 [AddResultForm] Current formData:', formData);
                }}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Create Result
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddResultForm;