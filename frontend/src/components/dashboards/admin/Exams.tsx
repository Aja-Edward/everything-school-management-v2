import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Plus, Edit, Trash2, Printer, Download, X, FileText, Check, XCircle, Upload } from 'lucide-react';
import { ExamService, Exam, ExamCreateData } from '@/services/ExamService';
import { useSettings } from '@/contexts/SettingsContext';
import { toast } from 'react-hot-toast';
import api from '@/services/api';
import { safeExamData } from '@/utils/examDataUtils';
import { ExamDocumentUploader } from '@/components/shared/ExamDocumentUploader';

interface ExamsPageProps {
  searchTerm?: string;
  selectedLevel?: 'all' | 'nursery' | 'primary' | 'secondary';
  selectedClass?: string;
  selectedSubject?: string;
}

// Type definitions for question management
interface ObjectiveQuestion {
  id: number;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  marks: number;
}

interface SubSubQuestion {
  id: number;
  question: string;
  expectedPoints: string;
  marks: number;
  wordLimit: string;
}

interface SubQuestion {
  id: number;
  question: string;
  expectedPoints: string;
  marks: number;
  wordLimit: string;
  subSubQuestions: SubSubQuestion[];
}

interface TheoryQuestion {
  id: number;
  question: string;
  expectedPoints: string;
  marks: number;
  wordLimit: string;
  subQuestions: SubQuestion[];
}

interface PracticalQuestion {
  id: number;
  task: string;
  materials: string;
  expectedOutcome: string;
  marks: number;
  timeLimit: string;
}

interface CustomSection {
  id: number;
  name: string;
  instructions: string;
  questions: Array<{
    id: number;
    question: string;
    marks: number;
  }>;
}



const ExamsPage: React.FC<ExamsPageProps> = ({
  searchTerm = '',
  selectedLevel = 'all',
  selectedClass = 'all',
  selectedSubject = 'all',
}) => {
  const { settings } = useSettings();
  
  // Initialize all arrays with empty arrays to prevent undefined errors
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Backend data states - Initialize with empty arrays
  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [backendDataLoading, setBackendDataLoading] = useState(true);

  const [showExamModal, setShowExamModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [selectedExamForPrint, setSelectedExamForPrint] = useState<Exam | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [examForApproval, setExamForApproval] = useState<Exam | null>(null);

  const [newExam, setNewExam] = useState<ExamCreateData>({
    title: '',
    subject: 0,
    grade_level: 0,
    section: 0,
    stream: undefined,
    teacher: undefined,
    exam_schedule: undefined,
    exam_type: 'final_exam',
    difficulty_level: 'medium',
    exam_date: '',
    start_time: '',
    end_time: '',
    duration_minutes: 45,
    total_marks: 100,
    pass_marks: undefined,
    venue: '',
    max_students: undefined,
    instructions: '',
    materials_allowed: '',
    materials_provided: '',
    status: 'scheduled',
    is_practical: false,
    requires_computer: false,
    is_online: false,
  });

  const modalRef = useRef<HTMLDivElement>(null);

  // Question management states - Initialize with empty arrays
  const [objectiveQuestions, setObjectiveQuestions] = useState<ObjectiveQuestion[]>([]);
  const [theoryQuestions, setTheoryQuestions] = useState<TheoryQuestion[]>([]);
  const [practicalQuestions, setPracticalQuestions] = useState<PracticalQuestion[]>([]);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  
  // Question form states
  const [objectiveInstructions, setObjectiveInstructions] = useState('');
  const [theoryInstructions, setTheoryInstructions] = useState('');
  const [practicalInstructions, setPracticalInstructions] = useState('');


  useEffect(() => {
  console.log('📊 Current Settings:', settings);
  console.log('📊 Current Term:', settings?.currentTerm);
}, [settings]);

  // Helper function to safely extract array from API response
  const safeArrayFromResponse = (data: any): any[] => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    if (data && typeof data === 'object') {
      // Try common array property names
      const arrayProps = ['data', 'items', 'list'];
      for (const prop of arrayProps) {
        if (Array.isArray(data[prop])) return data[prop];
      }
    }
    return [];
  };

  // Question management functions
  const addObjectiveQuestion = () => {
    const newQuestion = {
      id: Date.now(),
      question: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      correctAnswer: '',
      marks: 0
    };
    setObjectiveQuestions(prev => [...prev, newQuestion]);
  };

  const addTheoryQuestion = () => {
    const newQuestion = {
      id: Date.now(),
      question: '',
      expectedPoints: '',
      marks: 0,
      wordLimit: '',
      subQuestions: []
    };
    setTheoryQuestions(prev => [...prev, newQuestion]);
  };

  const addSubQuestion = (questionId: number) => {
    const newSubQuestion = {
      id: Date.now(),
      question: '',
      expectedPoints: '',
      marks: 0,
      wordLimit: '',
      subSubQuestions: []
    };
    setTheoryQuestions(prev => prev.map(q => 
      q.id === questionId 
        ? { ...q, subQuestions: [...(q.subQuestions || []), newSubQuestion] }
        : q
    ));
  };

  const addSubSubQuestion = (questionId: number, subQuestionId?: number) => {
    const newSubSubQuestion = {
      id: Date.now(),
      question: '',
      expectedPoints: '',
      marks: 0,
      wordLimit: ''
    };
    
    setTheoryQuestions(prev => prev.map(q => 
      q.id === questionId 
        ? { 
            ...q, 
            subQuestions: (q.subQuestions || []).map(sq => 
              (!subQuestionId || sq.id === subQuestionId)
                ? { ...sq, subSubQuestions: [...(sq.subSubQuestions || []), newSubSubQuestion] }
                : sq
            )
          }
        : q
    ));
  };

  const addPracticalQuestion = () => {
    const newQuestion = {
      id: Date.now(),
      task: '',
      materials: '',
      expectedOutcome: '',
      marks: 0,
      timeLimit: ''
    };
    setPracticalQuestions(prev => [...prev, newQuestion]);
  };

  const updateObjectiveQuestion = (id: number, field: string, value: any) => {
    setObjectiveQuestions(prev => prev.map(q => 
      q.id === id ? { ...q, [field]: value } : q
    ));
  };

  const updateTheoryQuestion = (id: number, field: string, value: any) => {
    setTheoryQuestions(prev => prev.map(q => 
      q.id === id ? { ...q, [field]: value } : q
    ));
  };

  const updateSubQuestion = (questionId: number, subQuestionId: number, field: string, value: any) => {
    setTheoryQuestions(prev => prev.map(q => 
      q.id === questionId 
        ? { 
            ...q, 
            subQuestions: (q.subQuestions || []).map(sq => 
              sq.id === subQuestionId ? { ...sq, [field]: value } : sq
            )
          }
        : q
    ));
  };

  const updateSubSubQuestion = (questionId: number, subQuestionId: number, subSubQuestionId: number, field: string, value: any) => {
    setTheoryQuestions(prev => prev.map(q => 
      q.id === questionId 
        ? { 
            ...q, 
            subQuestions: (q.subQuestions || []).map(sq => 
              sq.id === subQuestionId 
                ? { 
                    ...sq, 
                    subSubQuestions: (sq.subSubQuestions || []).map(ssq => 
                      ssq.id === subSubQuestionId ? { ...ssq, [field]: value } : ssq
                    )
                  }
                : sq
            )
          }
        : q
    ));
  };

  const updatePracticalQuestion = (id: number, field: string, value: any) => {
    setPracticalQuestions(prev => prev.map(q => 
      q.id === id ? { ...q, [field]: value } : q
    ));
  };

  const removeObjectiveQuestion = (id: number) => {
    setObjectiveQuestions(prev => prev.filter(q => q.id !== id));
  };

  const removeTheoryQuestion = (id: number) => {
    setTheoryQuestions(prev => prev.filter(q => q.id !== id));
  };

  const removeSubQuestion = (questionId: number, subQuestionId: number) => {
    setTheoryQuestions(prev => prev.map(q => 
      q.id === questionId 
        ? { ...q, subQuestions: (q.subQuestions || []).filter(sq => sq.id !== subQuestionId) }
        : q
    ));
  };

  const removeSubSubQuestion = (questionId: number, subQuestionId: number, subSubQuestionId: number) => {
    setTheoryQuestions(prev => prev.map(q => 
      q.id === questionId 
        ? { 
            ...q, 
            subQuestions: (q.subQuestions || []).map(sq => 
              sq.id === subQuestionId 
                ? { ...sq, subSubQuestions: (sq.subSubQuestions || []).filter(ssq => ssq.id !== subSubQuestionId) }
                : sq
            )
          }
        : q
    ));
  };

  const removePracticalQuestion = (id: number) => {
    setPracticalQuestions(prev => prev.filter(q => q.id !== id));
  };

  // Custom section management functions
  const addCustomSection = () => {
    const newSection = {
      id: Date.now(),
      name: '',
      instructions: '',
      questions: []
    };
    setCustomSections(prev => [...prev, newSection]);
  };

  const updateCustomSection = (id: number, field: string, value: any) => {
    setCustomSections(prev => prev.map(section => 
      section.id === id ? { ...section, [field]: value } : section
    ));
  };

  const removeCustomSection = (id: number) => {
    setCustomSections(prev => prev.filter(section => section.id !== id));
  };

  const addQuestionToCustomSection = (sectionId: number) => {
    const newQuestion = {
      id: Date.now(),
      question: '',
      marks: 0
    };
    setCustomSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, questions: [...(section.questions || []), newQuestion] }
        : section
    ));
  };

  const updateCustomSectionQuestion = (sectionId: number, questionId: number, field: string, value: any) => {
    setCustomSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { 
            ...section, 
            questions: (section.questions || []).map(q => 
              q.id === questionId ? { ...q, [field]: value } : q
            )
          }
        : section
    ));
  };

  const removeCustomSectionQuestion = (sectionId: number, questionId: number) => {
    setCustomSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, questions: (section.questions || []).filter(q => q.id !== questionId) }
        : section
    ));
  };

  // Load backend data with improved error handling
  useEffect(() => {
    const loadBackendData = async () => {
      try {
        setBackendDataLoading(true);

        
        // Initialize with empty arrays in case of failures
        let gradeLevels: any[] = [];
        let subjects: any[] = [];
        let teachers: any[] = [];
        let examSchedules: any[] = [];
        let streams: any[] = [];

        // Load each API separately with better error handling
        try {
          const gradeLevelsData = await api.get('/api/classrooms/grades/');
          gradeLevels = safeArrayFromResponse(gradeLevelsData);

        } catch (err) {
          console.error('Failed to load grade levels:', err);
        }

        try {
          const subjectsData = await api.get('subjects/');
          subjects = safeArrayFromResponse(subjectsData);

        } catch (err) {
          console.error('Failed to load subjects:', err);
        }

        try {
          const teachersData = await api.get('teachers/teachers/');
          teachers = safeArrayFromResponse(teachersData);

        } catch (err) {
          console.error('Failed to load teachers:', err);
        }

        try {
          const examSchedulesData = await api.get('exams/schedules/');
          examSchedules = safeArrayFromResponse(examSchedulesData);
        } catch (err) {
          console.error('Failed to load exam schedules:', err);
        }

        try {
          const streamsData = await api.get('classrooms/streams/');
          streams = safeArrayFromResponse(streamsData);

        } catch (err) {
          console.error('Failed to load streams:', err);
        }

        // Always set state with arrays (even if empty)
        setGradeLevels(gradeLevels);
        setSubjects(subjects);
        setTeachers(teachers);
        setExamSchedules(examSchedules);
        setStreams(streams);

        if (gradeLevels.length === 0) {
          console.warn('No grade levels loaded');
        }
      } catch (err) {
        console.error('Error loading backend data:', err);
        toast.error('Failed to load form data');
      } finally {
        setBackendDataLoading(false);
      }
    };

    loadBackendData();
  }, []);

  // Approval handlers
  const handleApproveExam = useCallback(async (exam: Exam) => {
    setExamForApproval(exam);
    setApprovalAction('approve');
    setApprovalNotes('');
    setShowApprovalModal(true);
  }, []);

  const handleRejectExam = useCallback(async (exam: Exam) => {
    setExamForApproval(exam);
    setApprovalAction('reject');
    setApprovalNotes('');
    setShowApprovalModal(true);
  }, []);

  const handleConfirmApproval = useCallback(async () => {
    if (!examForApproval || !approvalAction) return;

    try {
      if (approvalAction === 'approve') {
        await ExamService.approveExam(examForApproval.id, approvalNotes);
        toast.success('Exam approved successfully!');
      } else if (approvalAction === 'reject') {
        await ExamService.rejectExam(examForApproval.id, approvalNotes);
        toast.success('Exam rejected successfully!');
      }

      // Reload exams to reflect the status change
      const updatedExams = await ExamService.getExams();
      setExams(updatedExams);
      
      // Close modal
      setShowApprovalModal(false);
      setExamForApproval(null);
      setApprovalAction(null);
      setApprovalNotes('');
    } catch (error) {
      console.error('Error processing approval:', error);
      toast.error('Failed to process approval. Please try again.');
    }
  }, [examForApproval, approvalAction, approvalNotes]);

  const handleCancelApproval = useCallback(() => {
    setShowApprovalModal(false);
    setExamForApproval(null);
    setApprovalAction(null);
    setApprovalNotes('');
  }, []);

  // Filter subjects based on selected grade level
  useEffect(() => {
    if (newExam.grade_level && subjects.length > 0) {
      const selectedGradeLevel = gradeLevels.find(gl => gl?.id === newExam.grade_level);
      if (selectedGradeLevel) {

        // Filter subjects based on education level
        const filtered = subjects.filter(subject => {
          const subjectEducationLevels = subject?.education_levels || [];
          const gradeEducationLevel = selectedGradeLevel?.education_level;
          

          
          // Check if the subject's education levels array includes the selected grade level
          return subjectEducationLevels.includes(gradeEducationLevel);
        });

        setFilteredSubjects(filtered);
      } else {
        setFilteredSubjects(subjects);
      }
    } else {
      setFilteredSubjects(subjects);
    }
  }, [newExam.grade_level, subjects, gradeLevels]);

  // Load exams from backend with better error handling
  useEffect(() => {
    const loadExams = async () => {
      try {
        setLoading(true);
        setError(null);
        const examsData = await ExamService.getExams();
        
        // Ensure we always set an array
        setExams(Array.isArray(examsData) ? examsData : []);
      } catch (err) {
        console.error('Error loading exams:', err);
        setError(err instanceof Error ? err.message : 'Failed to load exams');
        setExams([]); // Ensure we set an empty array on error
        toast.error('Failed to load exams');
      } finally {
        setLoading(false);
      }
    };

    // Only load exams after backend data is loaded
    if (!backendDataLoading) {
      loadExams();
    }
  }, [backendDataLoading]);

  // Memoized filtered exams with enhanced safety checks
  const filteredExams = useMemo(() => {
    // Ensure all dependencies are arrays before processing
    if (!Array.isArray(exams) || exams.length === 0) {
      return [];
    }
    
    // Don't filter if we're still loading backend data
    if (backendDataLoading) {
      return [];
    }
    
    return exams.filter(exam => {
      // Safety checks for exam properties
      if (!exam || typeof exam !== 'object') return false;
      
      // Use the flat property names from API response
      const gradeLevelName = exam.grade_level_name || '';
      const subjectName = exam.subject_name || '';
      
      // Safe teacher lookup from flat property
      const teacherName = exam.teacher_name || '';
      
      const examTitle = exam.title || '';
      
      const matchesSearch = examTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacherName.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesLevel = selectedLevel === 'all' || 
        (selectedLevel === 'nursery' && gradeLevelName.includes('Nursery')) ||
        (selectedLevel === 'primary' && gradeLevelName.includes('Primary')) ||
        (selectedLevel === 'secondary' && (gradeLevelName.includes('JSS') || gradeLevelName.includes('SS')));
      
      const matchesClass = selectedClass === 'all' || gradeLevelName === selectedClass;
      const matchesSubject = selectedSubject === 'all' || subjectName === selectedSubject;
      
      return matchesSearch && matchesLevel && matchesClass && matchesSubject;
    });
  }, [exams, searchTerm, selectedLevel, selectedClass, selectedSubject, teachers, backendDataLoading]);

  // Handlers
  const handleCreateExam = useCallback(async () => {
    try {
       // ✅ VALIDATION: Check for invalid IDs before sending
    if (!newExam.subject || newExam.subject === 0) {
      toast.error('Please select a subject');
      return;
    }
    
    if (!newExam.grade_level || newExam.grade_level === 0) {
      toast.error('Please select a grade level');
      return;
    }

      
      // Prepare exam data with only the fields that should be sent to backend
      const examData = {
        title: newExam.title,
        description: newExam.description,
        subject: newExam.subject,
        grade_level: newExam.grade_level,
        section: newExam.section === 0 ? null : newExam.section,
        stream: newExam.stream,
        teacher: newExam.teacher,
        exam_schedule: newExam.exam_schedule,
        exam_type: newExam.exam_type,
        difficulty_level: newExam.difficulty_level,
        exam_date: newExam.exam_date,
        start_time: newExam.start_time,
        end_time: newExam.end_time,
        duration_minutes: newExam.duration_minutes,
        total_marks: newExam.total_marks,
        pass_marks: newExam.pass_marks,
        venue: newExam.venue,
        max_students: newExam.max_students,
        instructions: newExam.instructions,
        materials_allowed: newExam.materials_allowed,
        materials_provided: newExam.materials_provided,
        status: newExam.status,
        is_practical: newExam.is_practical,
        requires_computer: newExam.requires_computer,
        is_online: newExam.is_online,
        // Question data
        objective_questions: objectiveQuestions,
        theory_questions: theoryQuestions,
        practical_questions: practicalQuestions,
        custom_sections: customSections,
        objective_instructions: objectiveInstructions,
        theory_instructions: theoryInstructions,
        practical_instructions: practicalInstructions,
      };
      


      if (editingExam) {
        const updatedExam = await ExamService.updateExam(editingExam.id, examData);
        // Reload the entire exam list to get fresh data including questions
        const refreshedExams = await ExamService.getExams();
        setExams(Array.isArray(refreshedExams) ? refreshedExams : []);
        setEditingExam(null);
        toast.success('Exam updated successfully');
      } else {
        const createdExam = await ExamService.createExam(examData);
        setExams(prev => [...prev, createdExam]);
        toast.success('Exam created successfully');
      }
      resetExamForm();
    } catch (err) {
      console.error('Exam creation error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save exam');
    }
  }, [editingExam, newExam, objectiveQuestions, theoryQuestions, practicalQuestions, customSections, objectiveInstructions, theoryInstructions, practicalInstructions]);

  const resetExamForm = useCallback(() => {
    setNewExam({
      title: '',
      subject: 0,
      grade_level: 0,
      section: 0,
      stream: undefined,
      teacher: undefined,
      exam_schedule: undefined,
      exam_type: 'final_exam',
      difficulty_level: 'medium',
      exam_date: '',
      start_time: '',
      end_time: '',
      duration_minutes: 45,
      total_marks: 100,
      pass_marks: undefined,
      venue: '',
      max_students: undefined,
      instructions: '',
      materials_allowed: '',
      materials_provided: '',
      status: 'scheduled',
      is_practical: false,
      requires_computer: false,
      is_online: false,
    });
    
    // Reset question data
    setObjectiveQuestions([]);
    setTheoryQuestions([]);
    setPracticalQuestions([]);
    setCustomSections([]);
    setObjectiveInstructions('');
    setTheoryInstructions('');
    setPracticalInstructions('');
    
    setShowExamModal(false);
  }, []);

  const handleEditExam = useCallback((exam: Exam) => {
  try {
    // Safely process exam data
    const safeExam = safeExamData ? safeExamData(exam) : exam;
    
    // Extract IDs (handle both flat and nested structures)
    // ✅ FIX: Use null instead of 0 as fallback, and ensure we have valid IDs
    const subjectId = safeExam.subject?.id || safeExam.subject || null;
    const gradeLevelId = safeExam.grade_level?.id || safeExam.grade_level || null;
    const sectionId = safeExam.section?.id || safeExam.section || null;
    const teacherId = safeExam.teacher?.id || safeExam.teacher || null;
    const scheduleId = safeExam.exam_schedule?.id || safeExam.exam_schedule || null;
    
    // ✅ VALIDATION: Ensure required fields are not 0
    if (subjectId === 0) {
      console.error('❌ Subject ID is 0, using null instead');
    }
    if (gradeLevelId === 0) {
      console.error('❌ Grade Level ID is 0, using null instead');
    }
    
    setNewExam({
      title: safeExam.title || '',
      subject: subjectId === 0 ? null : subjectId,  // ✅ Convert 0 to null
      grade_level: gradeLevelId === 0 ? null : gradeLevelId,  // ✅ Convert 0 to null
      section: sectionId === 0 ? null : sectionId,
      stream: safeExam.stream,
      teacher: teacherId,
      exam_schedule: scheduleId,
      exam_type: safeExam.exam_type || 'final_exam',
      difficulty_level: safeExam.difficulty_level || 'medium',
      exam_date: safeExam.exam_date || '',
      start_time: safeExam.start_time || '',
      end_time: safeExam.end_time || '',
      duration_minutes: safeExam.duration_minutes || 45,
      total_marks: safeExam.total_marks || 100,
      pass_marks: safeExam.pass_marks,
      venue: safeExam.venue || '',
      max_students: safeExam.max_students,
      instructions: safeExam.instructions || '',
      materials_allowed: safeExam.materials_allowed || '',
      materials_provided: safeExam.materials_provided || '',
      status: safeExam.status || 'scheduled',
      is_practical: safeExam.is_practical || false,
      requires_computer: safeExam.requires_computer || false,
      is_online: safeExam.is_online || false,
    });
    
    // Load question data from exam with proper safety checks
    const safeObjectiveQuestions = safeArrayFromResponse(safeExam.objective_questions);
    const safeTheoryQuestions = safeArrayFromResponse(safeExam.theory_questions);
    const safePracticalQuestions = safeArrayFromResponse(safeExam.practical_questions);
    const safeCustomSectionsData = safeArrayFromResponse(safeExam.custom_sections);

    setObjectiveQuestions(safeObjectiveQuestions);
    setTheoryQuestions(safeTheoryQuestions);
    setPracticalQuestions(safePracticalQuestions);
    setCustomSections(safeCustomSectionsData);
    setObjectiveInstructions(safeExam.objective_instructions || '');
    setTheoryInstructions(safeExam.theory_instructions || '');
    setPracticalInstructions(safeExam.practical_instructions || '');
    
    setEditingExam(safeExam);
    setShowExamModal(true);
  } catch (error) {
    console.error('Error in handleEditExam:', error);
    toast.error('Failed to load exam data for editing');
  }
}, []);

  const handleDeleteExam = useCallback(async (examId: number) => {
    if (window.confirm('Are you sure you want to delete this exam?')) {
      try {
        await ExamService.deleteExam(examId);
        setExams(prev => prev.filter(exam => exam.id !== examId));
        toast.success('Exam deleted successfully');
      } catch (err) {
        console.error('Delete exam error:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to delete exam');
      }
    }
  }, []);

  const handlePrintExam = useCallback(async (exam: Exam) => {
    // Get the latest exam data from the backend to ensure we have the most recent questions
    try {
      const freshExam = await ExamService.getExam(exam.id);
      setSelectedExamForPrint(freshExam);
      setShowPrintPreview(true);
    } catch (err) {
      console.error('Error fetching fresh exam data:', err);
      // Fallback to the exam data we have
      setSelectedExamForPrint(exam);
      setShowPrintPreview(true);
    }
  }, []);

  const handleDownloadExam = useCallback(async (exam: Exam) => {
    // Get the latest exam data from the backend to ensure we have the most recent questions
    let freshExam = exam;
    try {
      freshExam = await ExamService.getExam(exam.id);
    } catch (err) {
      // Fallback to the exam data we have
      console.warn('Could not fetch fresh exam data, using cached data');
    }
    
    const element = document.createElement('a');
    const examContent = generateExamHTML(freshExam, {
      objectiveQuestions: safeArrayFromResponse(freshExam.objective_questions),
      theoryQuestions: safeArrayFromResponse(freshExam.theory_questions),
      practicalQuestions: safeArrayFromResponse(freshExam.practical_questions),
      customSections: safeArrayFromResponse(freshExam.custom_sections),
      objectiveInstructions: freshExam.objective_instructions || '',
      theoryInstructions: freshExam.theory_instructions || '',
      practicalInstructions: freshExam.practical_instructions || ''
    });
    const file = new Blob([examContent], { type: 'text/html' });
    element.href = URL.createObjectURL(file);
    // This is the grade level name
    // Get grade level name for filename (handle both flat and nested structures)
    const gradeLevelName = freshExam.grade_level_name || freshExam.grade_level?.name || 'Class';
    
    element.download = `${freshExam.title}_${gradeLevelName.replace(' ', '_')}_TEACHER_MARKING_PAPER.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }, [gradeLevels]);

  const handleDownloadTeacherPaper = useCallback(async (exam: Exam) => {
    // Get the latest exam data from the backend to ensure we have the most recent questions
    let freshExam = exam;
    try {
      freshExam = await ExamService.getExam(exam.id);
    } catch (err) {
      // Fallback to the exam data we have
      console.warn('Could not fetch fresh exam data, using cached data');
    }
    
    const element = document.createElement('a');
    const teacherPaperContent = generateTeacherMarkingPaper(freshExam, {
      objectiveQuestions: safeArrayFromResponse(freshExam.objective_questions),
      theoryQuestions: safeArrayFromResponse(freshExam.theory_questions),
      practicalQuestions: safeArrayFromResponse(freshExam.practical_questions),
      customSections: safeArrayFromResponse(freshExam.custom_sections),
      objectiveInstructions: freshExam.objective_instructions || '',
      theoryInstructions: freshExam.theory_instructions || '',
      practicalInstructions: freshExam.practical_instructions || ''
    });
    const file = new Blob([teacherPaperContent], { type: 'text/html' });
    element.href = URL.createObjectURL(file);
    
    // Get grade level name for filename (handle both flat and nested structures)
    const gradeLevelName = freshExam.grade_level_name || freshExam.grade_level?.name || 'Class';
    
    element.download = `${freshExam.title}_${gradeLevelName.replace(' ', '_')}_TEACHER_MARKING_PAPER.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }, [gradeLevels]);

  // Helper function to convert numbers to Roman numerals
  const toRomanNumeral = (num: number): string => {
    const romanNumerals = [
      { value: 50, numeral: 'L' },
      { value: 40, numeral: 'XL' },
      { value: 10, numeral: 'X' },
      { value: 9, numeral: 'IX' },
      { value: 5, numeral: 'V' },
      { value: 4, numeral: 'IV' },
      { value: 1, numeral: 'i' }
    ];
    
    let result = '';
    let remaining = num;
    
    for (const { value, numeral } of romanNumerals) {
      while (remaining >= value) {
        result += numeral;
        remaining -= value;
      }
    }
    
    return result;
  };

  const generateExamHTML = (exam: Exam, questionData?: {

    objectiveQuestions: any[];
    theoryQuestions: any[];
    practicalQuestions: any[];
    customSections: any[];
    objectiveInstructions: string;
    theoryInstructions: string;
    practicalInstructions: string;
  }) => {
    // Add debug logging
  console.log('🔍 Settings in generateExamHTML:', {
    currentTerm: settings?.currentTerm,
    academicYear: settings?.academicYear,
    fullSettings: settings
  });
    // Use dynamic school information from settings
    const schoolName = settings?.school_name || 'School Name';
    const schoolAddress = settings?.address || 'School Address';
    const academicSession = settings?.academicYear || 'Academic Year';
    const currentTerm = settings?.currentTerm || 'Current Term';
    
    // Get grade level name (handle both flat and nested structures)
    const gradeLevelName = exam.grade_level_name || exam.grade_level?.name || 'Class';
    
    // Get subject name (handle both flat and nested structures)
    const subjectName = exam.subject_name || exam.subject?.name || 'Subject';
    
    return `<!DOCTYPE html>
<html>
<head>
  <title>${exam.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 15mm; line-height: 1.3; font-size: 14px; position: relative; }
    body::before {
      content: "${schoolName}";
      position: fixed;
      top: 40%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 60px;
      color: #cccccc;
      opacity: 0.12;
      z-index: 0;
      pointer-events: none;
      white-space: pre;
      width: 100vw;
      text-align: center;
      font-weight: bold;
      user-select: none;
    }
    .header, .exam-details-table, .student-info, .section, .section h3, .section-instruction, .question, .options, .sub-questions, .section-c-passage, .section-c-question {
      position: relative;
      z-index: 1;
    }
    .header { text-align: center; margin-bottom: 0; border-bottom: none; padding-bottom: 2px; page-break-after: avoid; }
    .school-name { font-weight: bold; font-size: 20px; margin-bottom: 2px; }
    .school-address { font-size: 12px; margin-bottom: 2px; }
    .exam-title { font-size: 12px; font-weight: bold; margin-bottom: 2px; }
    .exam-details-table { width: 100%; border-collapse: collapse; margin: 1px 0 0 0; font-size: 12px; border-bottom: 1.5px solid #000; page-break-after: avoid; }
    .exam-details-table td { padding: 1px 4px; vertical-align: top; }
    .exam-details-table .label { font-weight: bold; width: 60px; }
    .exam-details-table .value { width: 120px; }
    .student-info { margin: 2px 0 2px 0; padding-bottom: 2px; font-size: 14px; border-bottom: none; }
    .section { margin: 4px 0; page-break-inside: avoid; }
    .section h3 { background-color: #f0f0f0; padding: 4px 8px; margin: 6px 0 4px 0; border-left: 4px solid #333; font-size: 16px; font-weight: bold; }
    .section-instruction { margin: 4px 0 6px 0; font-weight: bold; font-size: 13px; }
    .question { margin: 4px 0; padding-left: 8px; }
    .options { margin-left: 8px; margin-top: 1px; font-size: 12px; display: flex; justify-content: flex-start; gap: 2px; flex-wrap: wrap; }
    .options > div { margin-right: 8px; }
    .sub-questions { margin-left: 16px; margin-top: 2px; }
    .section-c-passage { background: #f9fafb; border-left: 4px solid #6366f1; padding: 8px; margin-bottom: 6px; font-style: italic; white-space: pre-line; font-size: 13px; }
    .section-c-question { margin-bottom: 4px; }
    @media print { body { margin: 10mm; font-size: 14px; } .no-print { display: none; } .section { page-break-inside: avoid; } .question { page-break-inside: avoid; } .header, .exam-details-table { page-break-after: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="school-name">${schoolName}</div>
    <div class="school-address">${schoolAddress}</div>
    <div class="exam-title">${currentTerm} EXAMINATION  ${academicSession} ACADEMIC SESSION</div>
  </div>
  <table class="exam-details-table">
    <tr>
      <td class="label">CLASS:</td>
      <td class="value">${gradeLevelName}</td>
      <td class="label">TIME:</td>
      <td class="value">${exam.duration_minutes} minutes</td>
    </tr>
    <tr>
      <td class="label">SUBJECT:</td>
      <td class="value">${subjectName}</td>
      <td class="label">DATE:</td>
      <td class="value">${exam.exam_date}</td>
    </tr>
  </table>
  <div class="student-info">
    <span class="label">STUDENT NAME:</span> ________________________________________________
  </div>
  ${questionData && Array.isArray(questionData.objectiveQuestions) ? `
    ${Array.isArray(questionData.objectiveQuestions) && questionData.objectiveQuestions.length > 0 ? `
      <div class="section">
        <h3>SECTION A: OBJECTIVE QUESTIONS</h3>
        <div class="section-instruction">${questionData.objectiveInstructions || 'Answer all questions in this section.'}</div>
        ${Array.isArray(questionData.objectiveQuestions) ? questionData.objectiveQuestions.map((q, index) => `
          <div class="question">
            <strong>${index + 1}.</strong> ${q.question}
            ${q.optionA || q.optionB || q.optionC || q.optionD ? `
              <div class="options">
                ${q.optionA ? `<div>A. ${q.optionA}</div>` : ''}
                ${q.optionB ? `<div>B. ${q.optionB}</div>` : ''}
                ${q.optionC ? `<div>C. ${q.optionC}</div>` : ''}
                ${q.optionD ? `<div>D. ${q.optionD}</div>` : ''}
              </div>
            ` : ''}
          </div>
        `).join('') : ''}
      </div>
    ` : ''}
    
    ${Array.isArray(questionData.theoryQuestions) && questionData.theoryQuestions.length > 0 ? `
      <div class="section">
        <h3>SECTION B: THEORY QUESTIONS</h3>
        <div class="section-instruction">${questionData.theoryInstructions || 'Answer all questions in this section.'}</div>
        ${Array.isArray(questionData.theoryQuestions) ? questionData.theoryQuestions.map((q, index) => `
          <div class="question">
            <strong>${index + 1}.</strong> ${q.question}
            ${q.subQuestions && Array.isArray(q.subQuestions) && q.subQuestions.length > 0 ? `
              <div class="sub-questions">
                ${Array.isArray(q.subQuestions) ? q.subQuestions.map((sq: any, sqIndex: number) => `
                  <div class="question">
                    <strong>${index + 1}${String.fromCharCode(97 + sqIndex)}.</strong> ${sq.question}
                    ${sq.subSubQuestions && Array.isArray(sq.subSubQuestions) && sq.subSubQuestions.length > 0 ? `
                      <div class="sub-questions">
                        ${Array.isArray(sq.subSubQuestions) ? sq.subSubQuestions.map((ssq: any, ssqIndex: number) => `
                          <div class="question">
                            <strong>${index + 1}${String.fromCharCode(97 + sqIndex)}${toRomanNumeral(ssqIndex + 1)}.</strong> ${ssq.question}
                          </div>
                        `).join('') : ''}
                      </div>
                    ` : ''}
                  </div>
                `).join('') : ''}
              </div>
            ` : ''}
          </div>
        `).join('') : ''}
      </div>
    ` : ''}
    
    ${Array.isArray(questionData.practicalQuestions) && questionData.practicalQuestions.length > 0 ? `
      <div class="section">
        <h3>SECTION C: PRACTICAL QUESTIONS</h3>
        <div class="section-instruction">${questionData.practicalInstructions || 'Answer all questions in this section.'}</div>
        ${Array.isArray(questionData.practicalQuestions) ? questionData.practicalQuestions.map((q, index) => `
          <div class="question">
            <strong>${index + 1}.</strong> ${q.task}
            ${q.materials ? `<div class="section-instruction"><strong>Materials:</strong> ${q.materials}</div>` : ''}
            ${q.expectedOutcome ? `<div class="section-instruction"><strong>Expected Outcome:</strong> ${q.expectedOutcome}</div>` : ''}
            ${q.timeLimit ? `<div class="section-instruction"><strong>Time Limit:</strong> ${q.timeLimit}</div>` : ''}
          </div>
        `).join('') : ''}
      </div>
    ` : ''}
    
    ${Array.isArray(questionData.customSections) ? questionData.customSections.map((section, sectionIndex) => `
      <div class="section">
        <h3>SECTION ${String.fromCharCode(68 + sectionIndex)}: ${section.name.toUpperCase()}</h3>
        <div class="section-instruction">${section.instructions}</div>
        ${Array.isArray(section.questions) ? section.questions.map((q: any, qIndex: number) => `
          <div class="question">
            <strong>${qIndex + 1}.</strong> ${q.question}
          </div>
        `).join('') : ''}
      </div>
    `).join('') : ''}
  ` : ''}
</body>
</html>`;
  };

  // Generate teacher marking paper with answers and expected points
  const generateTeacherMarkingPaper = (exam: Exam, questionData?: {
    objectiveQuestions: any[];
    theoryQuestions: any[];
    practicalQuestions: any[];
    customSections: any[];
    objectiveInstructions: string;
    theoryInstructions: string;
    practicalInstructions: string;
  }) => {
    // Use dynamic school information from settings
    const schoolName = settings?.school_name || 'School Name';
    const schoolAddress = settings?.address || 'School Address';
    const academicSession = settings?.academicYear || 'Academic Year';
    const currentTerm = settings?.currentTerm || 'Current Term';
    
    // Get grade level name (handle both flat and nested structures)
    const gradeLevelName = exam.grade_level_name || exam.grade_level?.name || 'Class';
    
    // Get subject name (handle both flat and nested structures)
    const subjectName = exam.subject_name || exam.subject?.name || 'Subject';
    
    return `<!DOCTYPE html>
<html>
<head>
  <title>${exam.title} - TEACHER MARKING PAPER</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 15mm; line-height: 1.3; font-size: 14px; position: relative; }
    body::before {
      content: "${schoolName} - TEACHER COPY";
      position: fixed;
      top: 40%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 60px;
      color: #cccccc;
      opacity: 0.12;
      z-index: 0;
      pointer-events: none;
      white-space: pre;
      width: 100vw;
      text-align: center;
      font-weight: bold;
      user-select: none;
    }
    .header, .exam-details-table, .student-info, .section, .section h3, .section-instruction, .question, .options, .sub-questions, .section-c-passage, .section-c-question, .answer, .expected-points {
      position: relative;
      z-index: 1;
    }
    .header { text-align: center; margin-bottom: 0; border-bottom: none; padding-bottom: 2px; page-break-after: avoid; }
    .school-name { font-weight: bold; font-size: 20px; margin-bottom: 2px; }
    .school-address { font-size: 13px; margin-bottom: 2px; }
    .exam-title { font-size: 14px; font-weight: bold; margin-bottom: 2px; color: #d32f2f; }
    .exam-details-table { width: 100%; border-collapse: collapse; margin: 2px 0 0 0; font-size: 14px; border-bottom: 1.5px solid #000; page-break-after: avoid; }
    .exam-details-table td { padding: 1px 4px; vertical-align: top; }
    .exam-details-table .label { font-weight: bold; width: 60px; }
    .exam-details-table .value { width: 120px; }
    .student-info { margin: 2px 0 2px 0; padding-bottom: 2px; font-size: 14px; border-bottom: none; }
    .section { margin: 6px 0; page-break-inside: avoid; }
    .section h3 { background-color: #f0f0f0; padding: 4px 8px; margin: 6px 0 4px 0; border-left: 4px solid #333; font-size: 16px; font-weight: bold; }
    .section-instruction { margin: 4px 0 6px 0; font-weight: bold; font-size: 13px; }
    .question { margin: 4px 0; padding-left: 8px; }
    .options { margin-left: 16px; margin-top: 2px; font-size: 13px; display: flex; justify-content: flex-start; gap: 2px; flex-wrap: wrap; }
    .options > div { margin-right: 8px; }
    .sub-questions { margin-left: 16px; margin-top: 3px; }
    .answer { background-color: #e8f5e8; padding: 4px 8px; margin: 4px 0; border-left: 3px solid #4caf50; font-weight: bold; }
    .expected-points { background-color: #fff3e0; padding: 4px 8px; margin: 4px 0; border-left: 3px solid #ff9800; font-style: italic; }
    .section-c-passage { background: #f9fafb; border-left: 4px solid #6366f1; padding: 8px; margin-bottom: 6px; font-style: italic; white-space: pre-line; font-size: 13px; }
    .section-c-question { margin-bottom: 4px; }
    @media print { body { margin: 10mm; font-size: 14px; } .no-print { display: none; } .section { page-break-inside: avoid; } .question { page-break-inside: avoid; } .header, .exam-details-table { page-break-after: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="school-name">${schoolName}</div>
    <div class="school-address">${schoolAddress}</div>
    <div class="exam-title">${currentTerm} ${academicSession} - TEACHER MARKING PAPER</div>
  </div>
  <table class="exam-details-table">
    <tr>
      <td class="label">CLASS:</td>
      <td class="value">${gradeLevelName}</td>
      <td class="label">TIME:</td>
      <td class="value">${exam.duration_minutes} minutes</td>
    </tr>
    <tr>
      <td class="label">SUBJECT:</td>
      <td class="value">${subjectName}</td>
      <td class="label">DATE:</td>
      <td class="value">${exam.exam_date}</td>
    </tr>
  </table>
  <div class="student-info">
    <span class="label">STUDENT NAME:</span> ________________________________________________
  </div>
  <div class="section">
    <h3>EXAM INSTRUCTIONS</h3>
    <div class="section-instruction">${exam.instructions || 'No specific instructions provided.'}</div>
  </div>
  <div class="section">
    <h3>EXAM DETAILS</h3>
    <div class="section-instruction">
      <strong>Total Marks:</strong> ${exam.total_marks}<br>
      <strong>Duration:</strong> ${exam.duration_minutes} minutes<br>
      <strong>Venue:</strong> ${exam.venue || 'To be announced'}<br>
      <strong>Materials Allowed:</strong> ${exam.materials_allowed || 'None specified'}<br>
      <strong>Materials Provided:</strong> ${exam.materials_provided || 'None specified'}
    </div>
  </div>
  
  ${questionData && Array.isArray(questionData.objectiveQuestions) ? `
    ${Array.isArray(questionData.objectiveQuestions) && questionData.objectiveQuestions.length > 0 ? `
      <div class="section">
        <h3>SECTION A: OBJECTIVE QUESTIONS - ANSWERS</h3>
        <div class="section-instruction">${questionData.objectiveInstructions || 'Answer all questions in this section.'}</div>
        ${Array.isArray(questionData.objectiveQuestions) ? questionData.objectiveQuestions.map((q, index) => `
          <div class="question">
            <strong>${index + 1}.</strong> ${q.question}
            ${q.optionA || q.optionB || q.optionC || q.optionD ? `
              <div class="options">
                ${q.optionA ? `<div>A. ${q.optionA}</div>` : ''}
                ${q.optionB ? `<div>B. ${q.optionB}</div>` : ''}
                ${q.optionC ? `<div>C. ${q.optionC}</div>` : ''}
                ${q.optionD ? `<div>D. ${q.optionD}</div>` : ''}
              </div>
            ` : ''}
            <div class="answer"><strong>Correct Answer:</strong> ${q.correctAnswer}</div>
            <div class="expected-points"><strong>Marks:</strong> ${q.marks}</div>
          </div>
        `).join('') : ''}
      </div>
    ` : ''}
    
    ${Array.isArray(questionData.theoryQuestions) && questionData.theoryQuestions.length > 0 ? `
      <div class="section">
        <h3>SECTION B: THEORY QUESTIONS - MARKING GUIDE</h3>
        <div class="section-instruction">${questionData.theoryInstructions || 'Answer all questions in this section.'}</div>
        ${questionData.theoryQuestions.map((q, index) => `
          <div class="question">
            <strong>${index + 1}.</strong> ${q.question}
            ${q.expectedPoints ? `<div class="expected-points"><strong>Expected Points:</strong> ${q.expectedPoints}</div>` : ''}
            ${q.wordLimit ? `<div class="section-instruction"><strong>Word Limit:</strong> ${q.wordLimit}</div>` : ''}
            <div class="expected-points"><strong>Marks:</strong> ${q.marks}</div>
            ${q.subQuestions && Array.isArray(q.subQuestions) && q.subQuestions.length > 0 ? `
              <div class="sub-questions">
                ${q.subQuestions.map((sq: any, sqIndex: number) => `
                  <div class="question">
                    <strong>${index + 1}${String.fromCharCode(97 + sqIndex)}.</strong> ${sq.question}
                    ${sq.expectedPoints ? `<div class="expected-points"><strong>Expected Points:</strong> ${sq.expectedPoints}</div>` : ''}
                    ${sq.wordLimit ? `<div class="section-instruction"><strong>Word Limit:</strong> ${sq.wordLimit}</div>` : ''}
                    <div class="expected-points"><strong>Marks:</strong> ${sq.marks}</div>
                    ${sq.subSubQuestions && Array.isArray(sq.subSubQuestions) && sq.subSubQuestions.length > 0 ? `
                      <div class="sub-questions">
                        ${sq.subSubQuestions.map((ssq: any, ssqIndex: number) => `
                          <div class="question">
                            <strong>${index + 1}${String.fromCharCode(97 + sqIndex)}${toRomanNumeral(ssqIndex + 1)}.</strong> ${ssq.question}
                            ${ssq.expectedPoints ? `<div class="expected-points"><strong>Expected Points:</strong> ${ssq.expectedPoints}</div>` : ''}
                            ${ssq.wordLimit ? `<div class="section-instruction"><strong>Word Limit:</strong> ${ssq.wordLimit}</div>` : ''}
                            <div class="expected-points"><strong>Marks:</strong> ${ssq.marks}</div>
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}
    
    ${Array.isArray(questionData.practicalQuestions) && questionData.practicalQuestions.length > 0 ? `
      <div class="section">
        <h3>SECTION C: PRACTICAL QUESTIONS - MARKING GUIDE</h3>
        <div class="section-instruction">${questionData.practicalInstructions || 'Answer all questions in this section.'}</div>
        ${Array.isArray(questionData.practicalQuestions) ? questionData.practicalQuestions.map((q, index) => `
          <div class="question">
            <strong>${index + 1}.</strong> ${q.task}
            ${q.materials ? `<div class="section-instruction"><strong>Materials:</strong> ${q.materials}</div>` : ''}
            ${q.expectedOutcome ? `<div class="expected-points"><strong>Expected Outcome:</strong> ${q.expectedOutcome}</div>` : ''}
            ${q.timeLimit ? `<div class="section-instruction"><strong>Time Limit:</strong> ${q.timeLimit}</div>` : ''}
            <div class="expected-points"><strong>Marks:</strong> ${q.marks}</div>
          </div>
        `).join('') : ''}
      </div>
    ` : ''}
    
    ${Array.isArray(questionData.customSections) ? questionData.customSections.map((section, sectionIndex) => `
      <div class="section">
        <h3>SECTION ${String.fromCharCode(68 + sectionIndex)}: ${section.name.toUpperCase()} - MARKING GUIDE</h3>
        <div class="section-instruction">${section.instructions}</div>
        ${Array.isArray(section.questions) ? section.questions.map((q: any, qIndex: number) => `
          <div class="question">
            <strong>${qIndex + 1}.</strong> ${q.question}
            <div class="expected-points"><strong>Marks:</strong> ${q.marks}</div>
          </div>
        `).join('') : ''}
      </div>
    `).join('') : ''}
  ` : ''}
</body>
</html>`;
  };

  // Note: Question management functionality removed as backend Exam model doesn't support questions
  // Questions should be managed through separate question banks or file uploads

  // Grade level change handler
  const handleGradeLevelChange = (gradeLevelId: number) => {
    setNewExam(prev => ({
      ...prev,
      grade_level: gradeLevelId,
      subject: 0, // Reset subject when grade level changes
      section: 0, // Reset section as requested
    }));
  };

  // Question shuffling functionality (for future implementation)
  const handleShuffleQuestions = () => {
    // This would be implemented when question management is added
            toast.success('Question shuffling will be available when question management is implemented');
  };

  // Print preview handler
  const printPreview = useCallback(() => {
    if (!selectedExamForPrint) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(generateExamHTML(selectedExamForPrint, {
        objectiveQuestions: selectedExamForPrint.objective_questions || [],
        theoryQuestions: selectedExamForPrint.theory_questions || [],
        practicalQuestions: selectedExamForPrint.practical_questions || [],
        customSections: selectedExamForPrint.custom_sections || [],
        objectiveInstructions: selectedExamForPrint.objective_instructions || '',
        theoryInstructions: selectedExamForPrint.theory_instructions || '',
        practicalInstructions: selectedExamForPrint.practical_instructions || ''
      }));
      printWindow.document.close();
      printWindow.print();
    }
  }, [selectedExamForPrint]);

  // Modal accessibility: ESC to close, focus trap
  useEffect(() => {
    if (!showExamModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowExamModal(false);
        setEditingExam(null);
        resetExamForm();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    if (modalRef.current) {
      modalRef.current.focus();
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showExamModal, resetExamForm]);

  // Ensure all arrays are properly initialized to prevent undefined errors


  // Show loading state while backend data is being loaded
  if (backendDataLoading) {
    return (
      <div>
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Exam Management</h2>
              <p className="text-sm text-gray-500">Create, edit, and manage exam papers</p>
            </div>
          </div>
        </div>
        <div className="p-8 text-center">
          <div className="text-sm text-gray-400">Loading exam data...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Exam Management</h2>
            <p className="text-sm text-gray-500">Create, edit, and manage exam papers</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowUploadModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center text-sm font-medium"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Exam
            </button>
            <button
              onClick={() => setShowExamModal(true)}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 flex items-center text-sm font-medium"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Exam
            </button>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stream</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teacher</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400 text-lg">
                  Loading exams...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-red-400 text-lg">
                  {error}
                </td>
              </tr>
            ) : filteredExams.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400 text-lg">
                  No exams found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredExams.map((exam) => {
                // Use the flat property names from API response
                const subjectName = exam.subject_name || '';
                const gradeLevelName = exam.grade_level_name || '';
                const teacherName = exam.teacher_name || '';
                // Stream information is available directly from the exam object
                const streamName = exam.stream_name || '';
                const streamType = exam.stream_type || '';
                
                return (
                  <tr key={exam.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{exam.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{subjectName || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{gradeLevelName || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {streamName ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          {streamName} ({streamType})
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {teacherName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{exam.exam_date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 py-1 text-xs rounded-full ${ExamService.getStatusColor(exam.status)}`}>
                        {exam.status_display}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handlePrintExam(exam).catch(err => console.error('Print error:', err))}
                          className="text-green-600 hover:text-green-900"
                          title="Print Exam"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadExam(exam).catch(err => console.error('Download error:', err))}
                          className="text-blue-600 hover:text-blue-900"
                          title="Download Student Exam"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadTeacherPaper(exam).catch(err => console.error('Teacher paper download error:', err))}
                          className="text-purple-600 hover:text-purple-900"
                          title="Download Teacher Marking Paper"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        {exam.status === 'pending_approval' && (
                          <>
                            <button
                              onClick={() => handleApproveExam(exam)}
                              className="text-green-600 hover:text-green-900"
                              title="Approve Exam"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRejectExam(exam)}
                              className="text-red-600 hover:text-red-900"
                              title="Reject Exam"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleEditExam(exam)}
                          className="text-yellow-600 hover:text-yellow-900"
                          title="Edit Exam"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteExam(exam.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Exam"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Loading State */}
      {showExamModal && backendDataLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading form data...</p>
          </div>
        </div>
      )}

      {/* Create/Edit Exam Modal */}
      {showExamModal && !backendDataLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div
            className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto outline-none"
            ref={modalRef}
            tabIndex={-1}
            aria-modal="true"
            role="dialog"
          >
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">{editingExam ? 'Edit Exam' : 'Create New Exam'}</h3>
              <button
                onClick={() => {
                  setShowExamModal(false);
                  setEditingExam(null);
                  resetExamForm();
                }}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close exam modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Exam Title</label>
                  <input
                    type="text"
                    value={newExam.title}
                    onChange={(e) => setNewExam({...newExam, title: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter exam title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Grade Level</label>
                  <select
                    value={newExam.grade_level}
                    onChange={(e) => handleGradeLevelChange(parseInt(e.target.value))}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Grade Level</option>
                    {Array.isArray(gradeLevels) && gradeLevels.map(gradeLevel => (
                      <option key={gradeLevel.id} value={gradeLevel.id}>
                        {gradeLevel.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                  <select
                    value={newExam.subject}
                    onChange={(e) => setNewExam({...newExam, subject: parseInt(e.target.value)})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    disabled={!newExam.grade_level}
                  >
                    <option value="">Select Subject</option>
                    {Array.isArray(filteredSubjects) && filteredSubjects.map(subject => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stream</label>
                  <select
                    value={newExam.stream || ''}
                    onChange={(e) => setNewExam({...newExam, stream: parseInt(e.target.value) || undefined})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Stream (Optional)</option>
                    {Array.isArray(streams) && streams.map(stream => (
                      <option key={stream.id} value={stream.id}>
                        {stream.name} ({stream.stream_type})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Teacher</label>
                  <select
                    value={newExam.teacher || ''}
                    onChange={(e) => setNewExam({...newExam, teacher: parseInt(e.target.value) || undefined})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Teacher (Optional)</option>
                    {Array.isArray(teachers) && teachers.map(teacher => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.user?.first_name} {teacher.user?.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Exam Schedule</label>
                  <select
                    value={newExam.exam_schedule || ''}
                    onChange={(e) => setNewExam({...newExam, exam_schedule: parseInt(e.target.value) || undefined})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Exam Schedule (Optional)</option>
                    {Array.isArray(examSchedules) && examSchedules.map(schedule => (
                      <option key={schedule.id} value={schedule.id}>
                        {schedule.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Exam Type</label>
                  <select
                    value={newExam.exam_type}
                    onChange={(e) => setNewExam({...newExam, exam_type: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="quiz">Quiz</option>
                    <option value="test">Class Test</option>
                    <option value="mid_term">Mid-Term Examination</option>
                    <option value="final_exam">Final Examination</option>
                    <option value="practical">Practical Examination</option>
                    <option value="oral_exam">Oral Examination</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty Level</label>
                  <select
                    value={newExam.difficulty_level}
                    onChange={(e) => setNewExam({...newExam, difficulty_level: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Exam Date</label>
                  <input
                    type="date"
                    value={newExam.exam_date}
                    onChange={(e) => setNewExam({...newExam, exam_date: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
                  <input
                    type="time"
                    value={newExam.start_time}
                    onChange={(e) => setNewExam({...newExam, start_time: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                  <input
                    type="time"
                    value={newExam.end_time}
                    onChange={(e) => setNewExam({...newExam, end_time: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Duration (minutes)</label>
                  <input
                    type="number"
                    value={newExam.duration_minutes}
                    onChange={(e) => setNewExam({...newExam, duration_minutes: parseInt(e.target.value) || 0})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter duration in minutes"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Total Marks</label>
                  <input
                    type="number"
                    value={newExam.total_marks}
                    onChange={(e) => setNewExam({...newExam, total_marks: parseInt(e.target.value) || 0})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter total marks"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Pass Marks</label>
                  <input
                    type="number"
                    value={newExam.pass_marks || ''}
                    onChange={(e) => setNewExam({...newExam, pass_marks: parseInt(e.target.value) || undefined})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter pass marks (optional)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Venue</label>
                  <input
                    type="text"
                    value={newExam.venue}
                    onChange={(e) => setNewExam({...newExam, venue: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter exam venue"
                  />
                </div>
              </div>

              {/* Instructions */}
              {/* <div className="space-y-4">
                <h4 className="text-lg font-medium">Exam Instructions</h4>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">General Instructions</label>
                  <textarea
                    value={newExam.instructions}
                    onChange={(e) => setNewExam({...newExam, instructions: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    rows={4}
                    placeholder="Enter general exam instructions for students"
                  />
                </div>
              </div> */}

              {/* Custom Sections */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-lg font-medium">Exam Sections</h4>
                  <button
                    onClick={addCustomSection}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm flex items-center"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Section
                  </button>
                </div>
                
                {/* Custom Sections List */}
                {Array.isArray(customSections) && customSections.map((section, sectionIndex) => (
                  <div key={section.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h5 className="text-md font-medium text-gray-800">Section {sectionIndex + 1}</h5>
                      <button
                        onClick={() => removeCustomSection(section.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove Section
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      {/* Section Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Section Name</label>
                        <input
                          type="text"
                          value={section.name}
                          onChange={(e) => updateCustomSection(section.id, 'name', e.target.value)}
                          placeholder="e.g., Comprehension, Grammar, Literature, Algebra, Geometry..."
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      
                      {/* Section Instructions */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Section Instructions</label>
                        <textarea
                          value={section.instructions}
                          onChange={(e) => updateCustomSection(section.id, 'instructions', e.target.value)}
                          placeholder="Enter instructions for this section..."
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          rows={3}
                        />
                      </div>
                      
                      {/* Section Questions */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="block text-sm font-medium text-gray-700">Questions</label>
                          <button
                            onClick={() => addQuestionToCustomSection(section.id)}
                            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                          >
                            Add Question
                          </button>
                        </div>
                        
                        {Array.isArray(section.questions) && section.questions.map((question, questionIndex) => (
                          <div key={question.id} className="bg-gray-50 border border-gray-200 rounded-md p-3">
                            <div className="flex justify-between items-center mb-2">
                              <div className="text-sm font-medium text-gray-700">Question {questionIndex + 1}</div>
                              <button
                                onClick={() => removeCustomSectionQuestion(section.id, question.id)}
                                className="text-red-600 hover:text-red-800 text-xs"
                              >
                                Remove
                              </button>
                            </div>
                            
                            <div className="space-y-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Question</label>
                                <textarea
                                  value={question.question}
                                  onChange={(e) => updateCustomSectionQuestion(section.id, question.id, 'question', e.target.value)}
                                  placeholder="Enter the question..."
                                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                  rows={2}
                                />
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Marks</label>
                                <input
                                  type="number"
                                  value={question.marks}
                                  onChange={(e) => updateCustomSectionQuestion(section.id, question.id, 'marks', parseInt(e.target.value) || 0)}
                                  placeholder="Marks"
                                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {(!Array.isArray(section.questions) || section.questions.length === 0) && (
                          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-center">
                            <div className="text-sm text-gray-600">No questions added to this section yet. Click "Add Question" to get started.</div>
                          </div>
                        )}
                        
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Questions:</span> {Array.isArray(section.questions) ? section.questions.length : 0} added
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {(!Array.isArray(customSections) || customSections.length === 0) && (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center">
                    <div className="text-sm text-gray-600">
                      No custom sections added yet. Click "Add Section" to create sections like Comprehension, Grammar, Literature, etc.
                    </div>
                  </div>
                )}
              </div>

              {/* Question Sections */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="text-lg font-medium">Question Sections</h4>
                  <button
                    onClick={handleShuffleQuestions}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Shuffle All Questions
                  </button>
                </div>
                
                {/* Objective Questions Section */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h5 className="text-md font-medium text-gray-800">Objective Questions</h5>
                    <button
                      onClick={addObjectiveQuestion}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                    >
                      Add Question
                    </button>
                  </div>
                  <div className="space-y-4">
                    <textarea
                      value={objectiveInstructions}
                      onChange={(e) => setObjectiveInstructions(e.target.value)}
                      placeholder="Enter instructions for objective questions section..."
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      rows={2}
                    />
                    
                    {/* Existing Questions */}
                    {Array.isArray(objectiveQuestions) && objectiveQuestions.map((question, index) => (
                      <div key={question.id} className="bg-blue-50 border border-blue-200 rounded-md p-4">
                        <div className="flex justify-between items-center mb-3">
                          <div className="text-sm font-medium text-blue-800">Question {index + 1}</div>
                          <button
                            onClick={() => removeObjectiveQuestion(question.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-blue-700 mb-1">Question Text</label>
                            <textarea
                              value={question.question}
                              onChange={(e) => updateObjectiveQuestion(question.id, 'question', e.target.value)}
                              placeholder="Enter the question..."
                              className="w-full p-2 border border-blue-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                              rows={2}
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-1">Option A</label>
                              <input
                                type="text"
                                value={question.optionA}
                                onChange={(e) => updateObjectiveQuestion(question.id, 'optionA', e.target.value)}
                                placeholder="Option A"
                                className="w-full p-2 border border-blue-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-1">Option B</label>
                              <input
                                type="text"
                                value={question.optionB}
                                onChange={(e) => updateObjectiveQuestion(question.id, 'optionB', e.target.value)}
                                placeholder="Option B"
                                className="w-full p-2 border border-blue-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-1">Option C</label>
                              <input
                                type="text"
                                value={question.optionC}
                                onChange={(e) => updateObjectiveQuestion(question.id, 'optionC', e.target.value)}
                                placeholder="Option C"
                                className="w-full p-2 border border-blue-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-1">Option D</label>
                              <input
                                type="text"
                                value={question.optionD}
                                onChange={(e) => updateObjectiveQuestion(question.id, 'optionD', e.target.value)}
                                placeholder="Option D"
                                className="w-full p-2 border border-blue-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-1">Correct Answer</label>
                              <select 
                                value={question.correctAnswer}
                                onChange={(e) => updateObjectiveQuestion(question.id, 'correctAnswer', e.target.value)}
                                className="w-full p-2 border border-blue-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                              >
                                <option value="">Select correct answer</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-1">Marks</label>
                              <input
                                type="number"
                                value={question.marks}
                                onChange={(e) => updateObjectiveQuestion(question.id, 'marks', parseInt(e.target.value) || 0)}
                                placeholder="Marks"
                                className="w-full p-2 border border-blue-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {(!Array.isArray(objectiveQuestions) || objectiveQuestions.length === 0) && (
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-center">
                        <div className="text-sm text-blue-600">No objective questions added yet. Click "Add Question" to get started.</div>
                      </div>
                    )}
                    
                    <div className="text-sm text-gray-600">
                                              <span className="font-medium">Questions:</span> {Array.isArray(objectiveQuestions) ? objectiveQuestions.length : 0} added
                    </div>
                  </div>
                </div>

                {/* Theory Questions Section */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h5 className="text-md font-medium text-gray-800">Theory Questions</h5>
                    <button
                      onClick={addTheoryQuestion}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                    >
                      Add Question
                    </button>
                  </div>
                  <div className="space-y-4">
                    <textarea
                      value={theoryInstructions}
                      onChange={(e) => setTheoryInstructions(e.target.value)}
                      placeholder="Enter instructions for theory questions section..."
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      rows={2}
                    />
                    
                    {/* Existing Questions */}
                    {Array.isArray(theoryQuestions) && theoryQuestions.map((question, index) => (
                      <div key={question.id} className="bg-green-50 border border-green-200 rounded-md p-4">
                                                  <div className="flex justify-between items-center mb-3">
                            <div className="text-sm font-medium text-green-800">Question {index + 1}</div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => addSubQuestion(question.id)}
                                className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                              >
                                Add Sub-Question
                              </button>
                              {Array.isArray(question.subQuestions) && question.subQuestions.length > 0 && (
                                <button
                                  onClick={() => addSubSubQuestion(question.id)}
                                  className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                                >
                                  Add Sub-Sub-Question
                                </button>
                              )}
                              <button
                                onClick={() => removeTheoryQuestion(question.id)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-green-700 mb-1">Question Text</label>
                            <textarea
                              value={question.question}
                              onChange={(e) => updateTheoryQuestion(question.id, 'question', e.target.value)}
                              placeholder="Enter the theory question..."
                              className="w-full p-2 border border-green-300 rounded-md focus:ring-green-500 focus:border-green-500 text-sm"
                              rows={3}
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-green-700 mb-1">Expected Points/Keywords</label>
                            <textarea
                              value={question.expectedPoints}
                              onChange={(e) => updateTheoryQuestion(question.id, 'expectedPoints', e.target.value)}
                              placeholder="List expected points or keywords for grading..."
                              className="w-full p-2 border border-green-300 rounded-md focus:ring-green-500 focus:border-green-500 text-sm"
                              rows={2}
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-green-700 mb-1">Marks</label>
                              <input
                                type="number"
                                value={question.marks}
                                onChange={(e) => updateTheoryQuestion(question.id, 'marks', parseInt(e.target.value) || 0)}
                                placeholder="Marks"
                                className="w-full p-2 border border-green-300 rounded-md focus:ring-green-500 focus:border-green-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-green-700 mb-1">Word Limit</label>
                              <input
                                type="number"
                                value={question.wordLimit}
                                onChange={(e) => updateTheoryQuestion(question.id, 'wordLimit', e.target.value)}
                                placeholder="Word limit (optional)"
                                className="w-full p-2 border border-green-300 rounded-md focus:ring-green-500 focus:border-green-500 text-sm"
                              />
                            </div>
                          </div>

                          {/* Sub-Questions */}
                          {Array.isArray(question.subQuestions) && question.subQuestions.length > 0 && (
                            <div className="mt-4 space-y-3">
                              <div className="text-sm font-medium text-green-700">Sub-Questions:</div>
                              {Array.isArray(question.subQuestions) && question.subQuestions.map((subQuestion, subIndex) => (
                                <div key={subQuestion.id} className="bg-green-100 border border-green-300 rounded-md p-3 ml-4">
                                  <div className="flex justify-between items-center mb-2">
                                    <div className="text-xs font-medium text-green-800">
                                      {index + 1}{String.fromCharCode(97 + subIndex)} {/* 1a, 1b, 1c, etc. */}
                                    </div>
                                    <div className="flex space-x-2">
                                      <button
                                        onClick={() => removeSubQuestion(question.id, subQuestion.id)}
                                        className="text-red-600 hover:text-red-800 text-xs"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <div>
                                      <label className="block text-xs font-medium text-green-600 mb-1">Sub-Question</label>
                                      <textarea
                                        value={subQuestion.question}
                                        onChange={(e) => updateSubQuestion(question.id, subQuestion.id, 'question', e.target.value)}
                                        placeholder="Enter sub-question..."
                                        className="w-full p-2 border border-green-400 rounded-md focus:ring-green-500 focus:border-green-500 text-xs"
                                        rows={2}
                                      />
                                    </div>
                                    
                                    <div>
                                      <label className="block text-xs font-medium text-green-600 mb-1">Expected Points</label>
                                      <textarea
                                        value={subQuestion.expectedPoints}
                                        onChange={(e) => updateSubQuestion(question.id, subQuestion.id, 'expectedPoints', e.target.value)}
                                        placeholder="Expected points for this sub-question..."
                                        className="w-full p-2 border border-green-400 rounded-md focus:ring-green-500 focus:border-green-500 text-xs"
                                        rows={1}
                                      />
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="block text-xs font-medium text-green-600 mb-1">Marks</label>
                                        <input
                                          type="number"
                                          value={subQuestion.marks}
                                          onChange={(e) => updateSubQuestion(question.id, subQuestion.id, 'marks', parseInt(e.target.value) || 0)}
                                          placeholder="Marks"
                                          className="w-full p-2 border border-green-400 rounded-md focus:ring-green-500 focus:border-green-500 text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-green-600 mb-1">Word Limit</label>
                                        <input
                                          type="number"
                                          value={subQuestion.wordLimit}
                                          onChange={(e) => updateSubQuestion(question.id, subQuestion.id, 'wordLimit', e.target.value)}
                                          placeholder="Word limit"
                                          className="w-full p-2 border border-green-400 rounded-md focus:ring-green-500 focus:border-green-500 text-xs"
                                        />
                                      </div>
                                    </div>

                                    {/* Sub-Sub-Questions */}
                                    {Array.isArray(subQuestion.subSubQuestions) && subQuestion.subSubQuestions.length > 0 && (
                                      <div className="mt-3 space-y-2">
                                        <div className="text-xs font-medium text-green-600">Sub-Sub-Questions:</div>
                                        {Array.isArray(subQuestion.subSubQuestions) && subQuestion.subSubQuestions.map((subSubQuestion, subSubIndex) => (
                                          <div key={subSubQuestion.id} className="bg-green-200 border border-green-400 rounded-md p-2 ml-4">
                                            <div className="flex justify-between items-center mb-1">
                                              <div className="text-xs font-medium text-green-700">
                                                {index + 1}{String.fromCharCode(97 + subIndex)}{String.fromCharCode(105 + subSubIndex)} {/* 1ci, 1cii, etc. */}
                                              </div>
                                              <button
                                                onClick={() => removeSubSubQuestion(question.id, subQuestion.id, subSubQuestion.id)}
                                                className="text-red-600 hover:text-red-800 text-xs"
                                              >
                                                Remove
                                              </button>
                                            </div>
                                            
                                            <div className="space-y-1">
                                              <div>
                                                <label className="block text-xs font-medium text-green-500 mb-1">Sub-Sub-Question</label>
                                                <textarea
                                                  value={subSubQuestion.question}
                                                  onChange={(e) => updateSubSubQuestion(question.id, subQuestion.id, subSubQuestion.id, 'question', e.target.value)}
                                                  placeholder="Enter sub-sub-question..."
                                                  className="w-full p-1 border border-green-500 rounded-md focus:ring-green-500 focus:border-green-500 text-xs"
                                                  rows={1}
                                                />
                                              </div>
                                              
                                              <div>
                                                <label className="block text-xs font-medium text-green-500 mb-1">Expected Points</label>
                                                <textarea
                                                  value={subSubQuestion.expectedPoints}
                                                  onChange={(e) => updateSubSubQuestion(question.id, subQuestion.id, subSubQuestion.id, 'expectedPoints', e.target.value)}
                                                  placeholder="Expected points..."
                                                  className="w-full p-1 border border-green-500 rounded-md focus:ring-green-500 focus:border-green-500 text-xs"
                                                  rows={1}
                                                />
                                              </div>
                                              
                                              <div className="grid grid-cols-2 gap-1">
                                                <div>
                                                  <label className="block text-xs font-medium text-green-500 mb-1">Marks</label>
                                                  <input
                                                    type="number"
                                                    value={subSubQuestion.marks}
                                                    onChange={(e) => updateSubSubQuestion(question.id, subQuestion.id, subSubQuestion.id, 'marks', parseInt(e.target.value) || 0)}
                                                    placeholder="Marks"
                                                    className="w-full p-1 border border-green-500 rounded-md focus:ring-green-500 focus:border-green-500 text-xs"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-green-500 mb-1">Word Limit</label>
                                                  <input
                                                    type="number"
                                                    value={subSubQuestion.wordLimit}
                                                    onChange={(e) => updateSubSubQuestion(question.id, subQuestion.id, subSubQuestion.id, 'wordLimit', e.target.value)}
                                                    placeholder="Word limit"
                                                    className="w-full p-1 border border-green-500 rounded-md focus:ring-green-500 focus:border-green-500 text-xs"
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {(!Array.isArray(theoryQuestions) || theoryQuestions.length === 0) && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
                        <div className="text-sm text-green-600">No theory questions added yet. Click "Add Question" to get started.</div>
                      </div>
                    )}
                    
                    <div className="text-sm text-gray-600">
                                              <span className="font-medium">Questions:</span> {Array.isArray(theoryQuestions) ? theoryQuestions.length : 0} added
                    </div>
                  </div>
                </div>

                {/* Practical Questions Section (Optional) */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h5 className="text-md font-medium text-gray-800">Practical Questions</h5>
                    <button
                      onClick={addPracticalQuestion}
                      className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700"
                    >
                      Add Question
                    </button>
                  </div>
                  <div className="space-y-4">
                    <textarea
                      value={practicalInstructions}
                      onChange={(e) => setPracticalInstructions(e.target.value)}
                      placeholder="Enter instructions for practical questions section..."
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      rows={2}
                    />
                    
                    {/* Existing Questions */}
                    {Array.isArray(practicalQuestions) && practicalQuestions.map((question, index) => (
                      <div key={question.id} className="bg-purple-50 border border-purple-200 rounded-md p-4">
                        <div className="flex justify-between items-center mb-3">
                          <div className="text-sm font-medium text-purple-800">Question {index + 1}</div>
                          <button
                            onClick={() => removePracticalQuestion(question.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-purple-700 mb-1">Practical Task</label>
                            <textarea
                              value={question.task}
                              onChange={(e) => updatePracticalQuestion(question.id, 'task', e.target.value)}
                              placeholder="Describe the practical task to be performed..."
                              className="w-full p-2 border border-purple-300 rounded-md focus:ring-purple-500 focus:border-purple-500 text-sm"
                              rows={3}
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-purple-700 mb-1">Required Materials</label>
                            <textarea
                              value={question.materials}
                              onChange={(e) => updatePracticalQuestion(question.id, 'materials', e.target.value)}
                              placeholder="List all required materials and equipment..."
                              className="w-full p-2 border border-purple-300 rounded-md focus:ring-purple-500 focus:border-purple-500 text-sm"
                              rows={2}
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-purple-700 mb-1">Expected Outcome/Criteria</label>
                            <textarea
                              value={question.expectedOutcome}
                              onChange={(e) => updatePracticalQuestion(question.id, 'expectedOutcome', e.target.value)}
                              placeholder="Describe expected results or evaluation criteria..."
                              className="w-full p-2 border border-purple-300 rounded-md focus:ring-purple-500 focus:border-purple-500 text-sm"
                              rows={2}
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-purple-700 mb-1">Marks</label>
                              <input
                                type="number"
                                value={question.marks}
                                onChange={(e) => updatePracticalQuestion(question.id, 'marks', parseInt(e.target.value) || 0)}
                                placeholder="Marks"
                                className="w-full p-2 border border-purple-300 rounded-md focus:ring-purple-500 focus:border-purple-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-purple-700 mb-1">Time Limit (minutes)</label>
                              <input
                                type="number"
                                value={question.timeLimit}
                                onChange={(e) => updatePracticalQuestion(question.id, 'timeLimit', e.target.value)}
                                placeholder="Time limit"
                                className="w-full p-2 border border-purple-300 rounded-md focus:ring-purple-500 focus:border-purple-500 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {(!Array.isArray(practicalQuestions) || practicalQuestions.length === 0) && (
                      <div className="bg-purple-50 border border-purple-200 rounded-md p-4 text-center">
                        <div className="text-sm text-purple-600">No practical questions added yet. Click "Add Question" to get started.</div>
                      </div>
                    )}
                    
                    <div className="text-sm text-gray-600">
                                              <span className="font-medium">Questions:</span> {Array.isArray(practicalQuestions) ? practicalQuestions.length : 0} added
                    </div>
                  </div>
                </div>
              </div>

              {/* Save/Cancel Buttons */}
              <div className="flex justify-end space-x-2">
                <button
                  onClick={resetExamForm}
                  className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateExam}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  {editingExam ? 'Update Exam' : 'Create Exam'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Preview Modal */}
      {showPrintPreview && selectedExamForPrint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto outline-none"
            tabIndex={-1}
            aria-modal="true"
            role="dialog"
          >
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Print Preview: {selectedExamForPrint.title}</h3>
              <button
                onClick={() => setShowPrintPreview(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close print preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
                              <div dangerouslySetInnerHTML={{ __html: generateExamHTML(selectedExamForPrint, {
                  objectiveQuestions: selectedExamForPrint.objective_questions || [],
                  theoryQuestions: selectedExamForPrint.theory_questions || [],
                  practicalQuestions: selectedExamForPrint.practical_questions || [],
                  customSections: selectedExamForPrint.custom_sections || [],
                  objectiveInstructions: selectedExamForPrint.objective_instructions || '',
                  theoryInstructions: selectedExamForPrint.theory_instructions || '',
                  practicalInstructions: selectedExamForPrint.practical_instructions || ''
                }) }} />
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && examForApproval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {approvalAction === 'approve' ? 'Approve Exam' : 'Reject Exam'}
              </h3>
              <button
                onClick={handleCancelApproval}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                <strong>Exam:</strong> {examForApproval.title}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                <strong>Subject:</strong> {examForApproval.subject_name}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {approvalAction === 'approve' ? 'Approval Notes (Optional)' : 'Rejection Reason (Required)'}
              </label>
              <textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder={approvalAction === 'approve' 
                  ? 'Add any notes about the approval...' 
                  : 'Please provide a reason for rejection...'
                }
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                required={approvalAction === 'reject'}
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelApproval}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmApproval}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                  approvalAction === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
                disabled={approvalAction === 'reject' && !approvalNotes.trim()}
              >
                {approvalAction === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Exam Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <ExamDocumentUploader
                onImport={(examData) => {
                  // Populate the exam form with uploaded data
                  setNewExam({
                    ...newExam,
                    ...examData,
                  });
                  setShowUploadModal(false);
                  setShowExamModal(true);
                  toast.success('Exam imported successfully! Please review and save.');
                }}
                onCancel={() => setShowUploadModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamsPage;