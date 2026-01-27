// export default ExamCreationForm;

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import { ExamService, ExamCreateData } from '@/services/ExamService';
import { toast } from 'react-toastify';
import { X, Plus, Trash2, Save, Clock, CheckCircle, AlertCircle, Upload } from 'lucide-react';
import { RichTextEditor } from '@/components/shared/ExamEditor';
import {
  normalizeExamDataForSave,
  normalizeExamDataForEdit
} from '@/utils/examDataNormalizer';
import { ExamDocumentUploader } from '@/components/shared/ExamDocumentUploader';


interface ExamCreationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onExamCreated: () => void;
  editingExam?: any;
  prefill?: Partial<ExamCreateData>;
}

const ExamCreationForm: React.FC<ExamCreationFormProps> = ({
  isOpen,
  onClose,
  onExamCreated,
  editingExam,
  prefill
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'questions' | 'upload'>('basic');
  const [showDocumentUploader, setShowDocumentUploader] = useState(false);
  
  const [formData, setFormData] = useState<ExamCreateData>({
    title: '',
    subject: 0,
    grade_level: 0,
    exam_type: 'test',
    difficulty_level: 'medium',
    exam_date: '',
    start_time: '',
    end_time: '',
    duration_minutes: 45,
    total_marks: 100,
    pass_marks: 50,
    venue: '',
    instructions: '',
    status: 'scheduled',
    is_practical: false,
    requires_computer: false,
    is_online: false,
    objective_questions: [],
    theory_questions: [],
    practical_questions: [],
    custom_sections: [],
    objective_instructions: '',
    theory_instructions: '',
    practical_instructions: ''
  });

  const [objectiveQuestions, setObjectiveQuestions] = useState<any[]>([]);
  const [theoryQuestions, setTheoryQuestions] = useState<any[]>([]);
  const [practicalQuestions, setPracticalQuestions] = useState<any[]>([]);
  const [customSections, setCustomSections] = useState<any[]>([]);
  const [sectionOrder, setSectionOrder] = useState<Array<{ kind: 'objective' | 'theory' | 'practical' | 'custom'; id?: number }>>([]);
  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [objectiveInstructions, setObjectiveInstructions] = useState<string>('');
  const [theoryInstructions, setTheoryInstructions] = useState<string>('');
  const [practicalInstructions, setPracticalInstructions] = useState<string>('');
  const [currentTeacherId, setCurrentTeacherId] = useState<number | null>(null);

  const getQuestionNumber = (questionIndex: number, subQuestionIndex?: number, subSubQuestionIndex?: number) => {
    const baseNumber = questionIndex + 1;
    
    if (subSubQuestionIndex !== undefined) {
      return `${baseNumber}${String.fromCharCode(97 + (subQuestionIndex || 0))}${String.fromCharCode(105 + subSubQuestionIndex)}`;
    } else if (subQuestionIndex !== undefined) {
      const question = theoryQuestions[questionIndex];
      if (question && question.subQuestions && question.subQuestions.length > 0) {
        return `${baseNumber}${String.fromCharCode(98 + subQuestionIndex)}`;
      } else {
        return `${baseNumber}${String.fromCharCode(97 + subQuestionIndex)}`;
      }
    } else {
      const question = theoryQuestions[questionIndex];
      if (question && question.subQuestions && question.subQuestions.length > 0) {
        return `${baseNumber}a`;
      } else {
        return `${baseNumber}.`;
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTeacherData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !editingExam && prefill) {
      setFormData(prev => ({
        ...prev,
        ...prefill,
        subject: prefill.subject ?? prev.subject,
        grade_level: prefill.grade_level ?? prev.grade_level,
      }));
    }
  }, [isOpen, editingExam, prefill]);

  
useEffect(() => {
  if (editingExam) {
    // NORMALIZE DATA FOR EDITING
    const normalized = normalizeExamDataForEdit(editingExam);
    
    setFormData({
      title: normalized.title || '',
      subject: normalized.subject?.id || normalized.subject || 0,
      grade_level: normalized.grade_level?.id || normalized.grade_level || 0,
      exam_type: normalized.exam_type || 'test',
      difficulty_level: normalized.difficulty_level || 'medium',
      exam_date: normalized.exam_date || '',
      start_time: normalized.start_time || '',
      end_time: normalized.end_time || '',
      duration_minutes: normalized.duration_minutes || 45,
      total_marks: normalized.total_marks || 100,
      pass_marks: normalized.pass_marks || 50,
      venue: normalized.venue || '',
      instructions: normalized.instructions || '',
      status: normalized.status || 'scheduled',
      is_practical: normalized.is_practical || false,
      requires_computer: normalized.is_requires_computer || false,
      is_online: normalized.is_online || false,
      objective_questions: normalized.objective_questions || [],
      theory_questions: normalized.theory_questions || [],
      practical_questions: normalized.practical_questions || [],
      custom_sections: normalized.custom_sections || [],
      objective_instructions: normalized.objective_instructions || '',
      theory_instructions: normalized.theory_instructions || '',
      practical_instructions: normalized.practical_instructions || ''
    });

    setObjectiveQuestions(normalized.objective_questions || []);
    setTheoryQuestions(normalized.theory_questions || []);
    setPracticalQuestions(normalized.practical_questions || []);
    const existingCustom = normalized.custom_sections || [];
    setCustomSections(existingCustom);
    setObjectiveInstructions(normalized.objective_instructions || '');
    setTheoryInstructions(normalized.theory_instructions || '');
    setPracticalInstructions(normalized.practical_instructions || '');
    const order: Array<{ kind: 'objective' | 'theory' | 'practical' | 'custom'; id?: number }> = [
      { kind: 'objective' },
      { kind: 'theory' },
      { kind: 'practical' }
    ];
    for (const s of existingCustom) {
      order.push({ kind: 'custom', id: s.id });
    }
    setSectionOrder(order);
  }
}, [editingExam]);
  useEffect(() => {
    if (isOpen && !editingExam) {
      setSectionOrder([
        { kind: 'objective' },
        { kind: 'theory' },
        { kind: 'practical' }
      ]);
    }
  }, [isOpen, editingExam]);

  const loadTeacherData = async () => {
    try {
      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      console.log('🔍 Loaded Teacher ID:', teacherId);
      console.log('🔍 User object:', user);

      if (!teacherId) {
        toast.error('Teacher ID not found. Please ensure you are logged in as a teacher.');
        return;
      }
      setCurrentTeacherId(Number(teacherId));

      const assignments = await TeacherDashboardService.getTeacherClasses(teacherId);
      console.log('🔍 Teacher assignments RAW:', JSON.stringify(assignments, null, 2));
      console.log('🔍 Assignment count:', assignments?.length || 0);

      if (!assignments || assignments.length === 0) {
        toast.warning('You have no class assignments yet. Please contact your administrator to assign classes and subjects to you.');
        setGradeLevels([]);
        setSubjects([]);
        return;
      }

      console.log('🔍 First assignment structure:', assignments[0]);
      console.log('🔍 First assignment has subject_id?', 'subject_id' in assignments[0]);
      console.log('🔍 First assignment subject_id value:', assignments[0]?.subject_id);
      console.log('🔍 First assignment has grade_level_id?', 'grade_level_id' in assignments[0]);
      console.log('🔍 First assignment grade_level_id value:', assignments[0]?.grade_level_id);

      const uniqueGradeLevels = Array.from(
        new Map(
          assignments
            .filter((a: any) => a.grade_level_id && a.grade_level_name)
            .map((a: any) => [a.grade_level_id, { id: a.grade_level_id, name: a.grade_level_name }])
        ).values()
      );
      console.log('🔍 Unique grade levels extracted:', uniqueGradeLevels);

      const uniqueSubjects = Array.from(
        new Map(
          assignments
            .filter((a: any) => a.subject_id && a.subject_name)
            .map((a: any) => [a.subject_id, { id: a.subject_id, name: a.subject_name }])
        ).values()
      );
      console.log('🔍 Unique subjects extracted:', uniqueSubjects);

      setGradeLevels(uniqueGradeLevels);
      setSubjects(uniqueSubjects);

      if (uniqueSubjects.length === 0) {
        toast.warning('No subjects found in your assignments. Please contact your administrator to assign subjects to you.');
      }

      if (uniqueGradeLevels.length === 0) {
        toast.warning('No grade levels found in your assignments. Please contact your administrator.');
      }
    } catch (error) {
      console.error('❌ Error loading teacher data:', error);
      if (error instanceof Error) {
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
      }
      toast.error('Failed to load teacher data. Please try refreshing the page.');
    }
  };

  // const handleInputChange = (field: keyof ExamCreateData, value: any) => {
  //   setFormData(prev => ({ ...prev, [field]: value }));
  // };

const handleInputChange = (field: keyof ExamCreateData, value: any) => {
  const numericFields: (keyof ExamCreateData)[] = ['total_marks', 'pass_marks', 'duration_minutes'];
  const parsedValue = numericFields.includes(field) ? Number(value) : value;

  setFormData(prev => ({ ...prev, [field]: parsedValue }));
}
  const addObjectiveQuestion = () => {
    const newQuestion = {
      id: Date.now(),
      question: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      correctAnswer: '',
      marks: 1,
      imageUrl: '',
      imageAlt: ''
    };
    setObjectiveQuestions(prev => [...prev, newQuestion]);
  };

  const updateObjectiveQuestion = (index: number, field: string, value: string) => {
  setObjectiveQuestions(prev => prev.map((q, i) => 
    i === index ? { ...q, [field]: field === 'marks' ? Number(value) : value } : q
  ));
};

  const removeObjectiveQuestion = (index: number) => {
    setObjectiveQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const addTheoryQuestion = () => {
    const newQuestion = {
      id: Date.now(),
      question: '',
      expectedPoints: '',
      marks: 5,
      wordLimit: '100-150',
      imageUrl: '',
      imageAlt: '',
      subQuestions: [],
      table: null as null | { rows: number; cols: number; data: string[][] }
    };
    setTheoryQuestions(prev => [...prev, newQuestion]);
  };

  const updateTheoryQuestion = (index: number, field: string, value: string | number) => {
    setTheoryQuestions(prev => prev.map((q, i) => 
      i === index ? { ...q, [field]: value } : q
    ));
  };

  const removeTheoryQuestion = (index: number) => {
    setTheoryQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const addPracticalQuestion = () => {
    const newQuestion = {
      id: Date.now(),
      task: '',
      materials: '',
      expectedOutcome: '',
      marks: 10,
      timeLimit: '30 minutes',
      imageUrl: '',
      imageAlt: ''
    };
    setPracticalQuestions(prev => [...prev, newQuestion]);
  };

  const updatePracticalQuestion = (index: number, field: string, value: string | number) => {
    setPracticalQuestions(prev => prev.map((q, i) => 
      i === index ? { ...q, [field]: value } : q
    ));
  };

  const removePracticalQuestion = (index: number) => {
    setPracticalQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const addCustomSection = () => {
    const newSection = {
      id: Date.now(),
      name: '',
      instructions: '',
      questions: [] as Array<{ id: number; question: string; marks: number; imageUrl?: string; imageAlt?: string; table?: { rows: number; cols: number; data: string[][] } }>
    };
    setCustomSections(prev => [...prev, newSection]);
    setSectionOrder(prev => [...prev, { kind: 'custom', id: newSection.id }]);
  };

  const insertCustomSectionAt = (position: number) => {
    const newSection = {
      id: Date.now(),
      name: '',
      instructions: '',
      questions: []
    };
    setCustomSections(prev => [...prev, newSection]);
    setSectionOrder(prev => {
      const copy = [...prev];
      copy.splice(position, 0, { kind: 'custom', id: newSection.id });
      return copy;
    });
  };

  const removeCustomSectionById = (sectionId: number) => {
    setCustomSections(prev => prev.filter(s => s.id !== sectionId));
    setSectionOrder(prev => prev.filter(item => !(item.kind === 'custom' && item.id === sectionId)));
  };

  const getOrderedCustomSections = () => {
    const idToSection = new Map(customSections.map(s => [s.id, s] as const));
    return sectionOrder.filter(s => s.kind === 'custom' && s.id).map(s => idToSection.get(s.id!)).filter(Boolean);
  };

  const calculateTotalMarks = () => {
    const objectiveMarks = objectiveQuestions.reduce((sum: number, q: any) => sum + (Number(q.marks) || 0), 0);
    const theoryMarks = theoryQuestions.reduce((sum: number, q: any) => {
      const base = sum + (Number(q.marks) || 0);
      const subQ = (q.subQuestions || []).reduce((ss: number, sq: any) => {
      const baseSq = ss + (Number(sq.marks) || 0);
        const subSub = (sq.subSubQuestions || []).reduce((sss: number, s2: any) => sss + (Number(s2.marks) || 0), 0);
        return baseSq + subSub;
      }, 0);
      return base + subQ;
    }, 0);
    const practicalMarks = practicalQuestions.reduce((sum: number, q: any) => sum + (Number(q.marks) || 0), 0);
    const customMarks = customSections.reduce((sum: number, s: any) =>
      sum + (s.questions || []).reduce((qSum: number, q: any) => qSum + (Number(q.marks) || 0), 0), 0
    );
    return objectiveMarks + theoryMarks + practicalMarks + customMarks;
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const cloudinaryData = new FormData();
      cloudinaryData.append('file', file);
      cloudinaryData.append('upload_preset', 'profile_upload');
      const res = await axios.post('https://api.cloudinary.com/v1_1/djbz7wunu/image/upload', cloudinaryData);
      return res.data.secure_url as string;
    } catch (err) {
      toast.error('Image upload failed. Please try again.');
      return null;
    }
  };

  const addSubQuestion = (questionIndex: number) => {
    const newSub = { id: Date.now(), question: '', marks: 0, subSubQuestions: [] as Array<{ id: number; question: string; marks: number }> };
    setTheoryQuestions(prev => prev.map((q, i) => i === questionIndex ? { ...q, subQuestions: [ ...(q.subQuestions || []), newSub ] } : q));
  };

  const updateSubQuestion = (questionIndex: number, subIndex: number, field: string, value: any) => {
    setTheoryQuestions(prev => prev.map((q, i) => {
      if (i !== questionIndex) return q;
      const copy = [ ...(q.subQuestions || []) ];
      copy[subIndex] = { ...copy[subIndex], [field]: value };
      return { ...q, subQuestions: copy };
    }));
  };

  const removeSubQuestion = (questionIndex: number, subIndex: number) => {
    setTheoryQuestions(prev => prev.map((q, i) => i === questionIndex ? { ...q, subQuestions: (q.subQuestions || []).filter((_: any, idx: number) => idx !== subIndex) } : q));
  };

  const addSubSubQuestion = (questionIndex: number, subIndex: number) => {
    const newSubSub = { id: Date.now(), question: '', marks: 0 };
    setTheoryQuestions(prev => prev.map((q, i) => {
      if (i !== questionIndex) return q;
      const subs = [ ...(q.subQuestions || []) ];
      const target = subs[subIndex];
      const updated = { ...target, subSubQuestions: [ ...(target.subSubQuestions || []), newSubSub ] };
      subs[subIndex] = updated;
      return { ...q, subQuestions: subs };
    }));
  };

  const updateSubSubQuestion = (questionIndex: number, subIndex: number, subSubIndex: number, field: string, value: any) => {
    setTheoryQuestions(prev => prev.map((q, i) => {
      if (i !== questionIndex) return q;
      const subs = [ ...(q.subQuestions || []) ];
      const target = subs[subIndex];
      const subsubs = [ ...(target.subSubQuestions || []) ];
      subsubs[subSubIndex] = { ...subsubs[subSubIndex], [field]: value };
      subs[subIndex] = { ...target, subSubQuestions: subsubs };
      return { ...q, subQuestions: subs };
    }));
  };

  const removeSubSubQuestion = (questionIndex: number, subIndex: number, subSubIndex: number) => {
    setTheoryQuestions(prev => prev.map((q, i) => {
      if (i !== questionIndex) return q;
      const subs = [ ...(q.subQuestions || []) ];
      const target = subs[subIndex];
      const subsubs = (target.subSubQuestions || []).filter((_: any, idx: number) => idx !== subSubIndex);
      subs[subIndex] = { ...target, subSubQuestions: subsubs };
      return { ...q, subQuestions: subs };
    }));
  };

  const initQuestionTable = (_q: any, rows: number, cols: number) => ({ rows, cols, data: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')) });

  const setTheoryTable = (index: number, rows: number, cols: number) => {
    setTheoryQuestions(prev => prev.map((q, i) => i === index ? { ...q, table: initQuestionTable(q, rows, cols) } : q));
  };

  const updateTheoryTableCell = (qIndex: number, r: number, c: number, value: string) => {
    setTheoryQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex) return q;
      const table = q.table;
      if (!table) return q;
      const data = table.data.map((row: string[], ri: number) => row.map((cell, ci) => (ri === r && ci === c ? value : cell)));
      return { ...q, table: { ...table, data } };
    }));
  };

  const addTheoryTableRow = (qIndex: number) => {
    setTheoryQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex || !q.table) return q;
      const cols = q.table.cols;
      const newRow = Array.from({ length: cols }, () => '');
      return { ...q, table: { ...q.table, rows: q.table.rows + 1, data: [...q.table.data, newRow] } };
    }));
  };

  const addTheoryTableCol = (qIndex: number) => {
    setTheoryQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex || !q.table) return q;
      const newData = q.table.data.map((row: string[]) => [...row, '']);
      return { ...q, table: { ...q.table, cols: q.table.cols + 1, data: newData } };
    }));
  };

  const removeTheoryTableRow = (qIndex: number, rowIndex?: number) => {
    setTheoryQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex || !q.table || q.table.rows <= 1) return q;
      const idx = rowIndex !== undefined ? rowIndex : q.table.rows - 1;
      const newData = q.table.data.filter((_: any, r: number) => r !== idx);
      return { ...q, table: { ...q.table, rows: q.table.rows - 1, data: newData } };
    }));
  };

  const removeTheoryTableCol = (qIndex: number, colIndex?: number) => {
    setTheoryQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex || !q.table || q.table.cols <= 1) return q;
      const idx = colIndex !== undefined ? colIndex : q.table.cols - 1;
      const newData = q.table.data.map((row: string[]) => row.filter((_: any, c: number) => c !== idx));
      return { ...q, table: { ...q.table, cols: q.table.cols - 1, data: newData } };
    }));
  };

  const setCustomTable = (sectionId: number, qIndex: number, rows: number, cols: number) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const qs = [...(s.questions || [])];
      const target = qs[qIndex];
      qs[qIndex] = { ...target, table: initQuestionTable(target, rows, cols) };
      return { ...s, questions: qs };
    }));
  };

  const updateCustomTableCell = (sectionId: number, qIndex: number, r: number, c: number, value: string) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const qs = [...(s.questions || [])];
      const target = qs[qIndex];
      const table = target.table;
      if (!table) return s;
      const data = table.data.map((row: string[], ri: number) => row.map((cell, ci) => (ri === r && ci === c ? value : cell)));
      qs[qIndex] = { ...target, table: { ...table, data } };
      return { ...s, questions: qs };
    }));
  };

  const addCustomTableRow = (sectionId: number, qIndex: number) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const qs = [...(s.questions || [])];
      const q = qs[qIndex];
      if (!q?.table) return s;
      const cols = q.table.cols;
      const newRow = Array.from({ length: cols }, () => '');
      qs[qIndex] = { ...q, table: { ...q.table, rows: q.table.rows + 1, data: [...q.table.data, newRow] } };
      return { ...s, questions: qs };
    }));
  };

  const addCustomTableCol = (sectionId: number, qIndex: number) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const qs = [...(s.questions || [])];
      const q = qs[qIndex];
      if (!q?.table) return s;
      const newData = q.table.data.map((row: string[]) => [...row, '']);
      qs[qIndex] = { ...q, table: { ...q.table, cols: q.table.cols + 1, data: newData } };
      return { ...s, questions: qs };
    }));
  };

  const removeCustomTableRow = (sectionId: number, qIndex: number, rowIndex?: number) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const qs = [...(s.questions || [])];
      const q = qs[qIndex];
      if (!q?.table || q.table.rows <= 1) return s;
      const idx = rowIndex !== undefined ? rowIndex : q.table.rows - 1;
      const newData = q.table.data.filter((_: any, r: number) => r !== idx);
      qs[qIndex] = { ...q, table: { ...q.table, rows: q.table.rows - 1, data: newData } };
      return { ...s, questions: qs };
    }));
  };

  const removeCustomTableCol = (sectionId: number, qIndex: number, colIndex?: number) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const qs = [...(s.questions || [])];
      const q = qs[qIndex];
      if (!q?.table || q.table.cols <= 1) return s;
      const idx = colIndex !== undefined ? colIndex : q.table.cols - 1;
      const newData = q.table.data.map((row: string[]) => row.filter((_: any, c: number) => c !== idx));
      qs[qIndex] = { ...q, table: { ...q.table, cols: q.table.cols - 1, data: newData } };
      return { ...s, questions: qs };
    }));
  };

  const handleDocumentImport = (examData: any) => {
    toast.success('Document imported successfully!');

    // Populate form data with imported exam data
    setFormData(prev => ({
      ...prev,
      title: examData.title || prev.title,
      instructions: examData.instructions || prev.instructions,
      total_marks: examData.total_marks || prev.total_marks,
      duration_minutes: examData.duration_minutes || prev.duration_minutes,
    }));

    // Populate questions from imported data
    if (examData.objective_questions?.length > 0) {
      setObjectiveQuestions(examData.objective_questions);
      setObjectiveInstructions(examData.objective_instructions || '');
    }

    if (examData.theory_questions?.length > 0) {
      setTheoryQuestions(examData.theory_questions);
      setTheoryInstructions(examData.theory_instructions || '');
    }

    if (examData.practical_questions?.length > 0) {
      setPracticalQuestions(examData.practical_questions);
      setPracticalInstructions(examData.practical_instructions || '');
    }

    if (examData.custom_sections?.length > 0) {
      setCustomSections(examData.custom_sections);
    }

    // Switch to questions tab to review imported content
    setActiveTab('questions');
    setShowDocumentUploader(false);
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      toast.error('Please enter exam title');
      return false;
    }
    if (!formData.subject) {
      toast.error('Please select a subject');
      return false;
    }
    if (!formData.grade_level) {
      toast.error('Please select a grade level');
      return false;
    }
    if (!formData.exam_date) {
      toast.error('Please select exam date');
      return false;
    }
    if (!formData.start_time || !formData.end_time) {
      toast.error('Please set start and end times');
      return false;
    }
    if (objectiveQuestions.length === 0 && theoryQuestions.length === 0 &&
        practicalQuestions.length === 0 && customSections.length === 0) {
      toast.error('Please add at least one question');
      return false;
    }

    if (!currentTeacherId || currentTeacherId <= 0) {
      toast.error('Teacher ID not found. Please refresh and try again.');
      return false;
    }

    return true;
  };

const saveAsDraft = async () => {
  if (!validateForm()) return;

  try {
    setSavingDraft(true);
    
    const examData: ExamCreateData = {
      ...formData,
      status: 'scheduled',
      teacher: currentTeacherId!,
      objective_questions: objectiveQuestions,
      theory_questions: theoryQuestions,
      practical_questions: practicalQuestions,
      custom_sections: getOrderedCustomSections(),
      objective_instructions: objectiveInstructions,
      theory_instructions: theoryInstructions,
      practical_instructions: practicalInstructions,
      total_marks: calculateTotalMarks()
    };

    // NORMALIZE DATA FOR COMPATIBILITY
    const normalizedData = normalizeExamDataForSave(examData);

    console.log('📝 CREATING EXAM - Full payload:', normalizedData);
    console.log('📝 Teacher ID being sent:', normalizedData.teacher);
    console.log('📝 Subject ID being sent:', normalizedData.subject);
    console.log('📝 Grade Level ID being sent:', normalizedData.grade_level);

    if (editingExam) {
      const response = await ExamService.updateExam(editingExam.id, normalizedData);
      console.log('✅ EXAM UPDATED - Response:', response);
      toast.success('Exam updated successfully!');
    } else {
      const response = await ExamService.createExam(normalizedData);
      console.log('✅ EXAM CREATED - Response:', response);
      console.log('✅ Created exam ID:', response?.id);
      console.log('✅ Created exam teacher:', response?.teacher);
      toast.success(`Exam saved successfully! ID: ${response?.id || 'N/A'}`);
    }

    onExamCreated();
    onClose();
  } catch (error) {
    console.error('❌ Error saving exam:', error);
    console.error('❌ Error details:', error instanceof Error ? error.message : error);
    toast.error('Failed to save exam. Please try again.');
  } finally {
    setSavingDraft(false);
  }
};

const submitForApproval = async () => {
  if (!validateForm()) return;

  try {
    setLoading(true);
    
    const examData: ExamCreateData = {
      ...formData,
      status: 'scheduled',
      teacher: currentTeacherId!,
      objective_questions: objectiveQuestions,
      theory_questions: theoryQuestions,
      practical_questions: practicalQuestions,
      custom_sections: getOrderedCustomSections(),
      objective_instructions: objectiveInstructions,
      theory_instructions: theoryInstructions,
      practical_instructions: practicalInstructions,
      total_marks: calculateTotalMarks()
    };

    // NORMALIZE DATA FOR COMPATIBILITY
    const normalizedData = normalizeExamDataForSave(examData);

    console.log('🔍 Submitting exam for approval with data:', {
      teacher: normalizedData.teacher,
      title: normalizedData.title,
      subject: normalizedData.subject,
      grade_level: normalizedData.grade_level
    });

    if (editingExam) {
      await ExamService.updateExam(editingExam.id, normalizedData);
      toast.success('Exam submitted for review successfully!');
    } else {
      const response = await ExamService.createExam(normalizedData);
      console.log('🔍 Exam created and submitted successfully:', response);
      toast.success('Exam submitted for review successfully!');
    }

    onExamCreated();
    onClose();
  } catch (error) {
    console.error('❌ Error submitting exam:', error);
    toast.error('Failed to submit exam. Please try again.');
  } finally {
    setLoading(false);
  }
};


  const getStatusBadge = (status: string) => {
    const statusConfig = {
      scheduled: { color: 'bg-blue-100 text-blue-800', icon: Clock, text: 'Scheduled' },
      in_progress: { color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle, text: 'In Progress' },
      completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Completed' },
      cancelled: { color: 'bg-red-100 text-red-800', icon: X, text: 'Cancelled' },
      postponed: { color: 'bg-orange-100 text-orange-800', icon: Clock, text: 'Postponed' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.scheduled;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.text}
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {editingExam ? 'Edit Exam' : 'Create New Exam'}
            </h2>
            {editingExam && getStatusBadge(editingExam.status)}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {currentTeacherId && (
          <div className="px-6 pt-2 text-xs text-slate-500">
            Teacher ID: {currentTeacherId}
          </div>
        )}

        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('basic')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'basic'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Basic Information
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'upload'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Upload className="w-4 h-4" />
              <span>Upload Document</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'questions'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Questions & Instructions
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'upload' ? (
            <ExamDocumentUploader
              onImport={handleDocumentImport}
              onCancel={() => setActiveTab('basic')}
            />
          ) : activeTab === 'basic' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Exam Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="Enter exam title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Exam Type *
                  </label>
                  <select
                    value={formData.exam_type}
                    onChange={(e) => handleInputChange('exam_type', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value="test">Class Test</option>
                    <option value="quiz">Quiz</option>
                    <option value="mid_term">Mid-Term Examination</option>
                    <option value="final_exam">Final Examination</option>
                    <option value="practical">Practical Examination</option>
                    <option value="oral_exam">Oral Examination</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Subject *
                  </label>
                  <select
                    value={formData.subject}
                    onChange={(e) => handleInputChange('subject', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value={0}>Select Subject</option>
                    {subjects.map((subject: any) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Grade Level *
                  </label>
                  <select
                    value={formData.grade_level}
                    onChange={(e) => handleInputChange('grade_level', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value={0}>Select Grade Level</option>
                    {gradeLevels.map((gradeLevel: any) => (
                      <option key={gradeLevel.id} value={gradeLevel.id}>
                        {gradeLevel.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Difficulty Level
                  </label>
                  <select
                    value={formData.difficulty_level}
                    onChange={(e) => handleInputChange('difficulty_level', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) => handleInputChange('duration_minutes', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    min="15"
                    max="300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Exam Date *
                  </label>
                  <input
                    type="date"
                    value={formData.exam_date}
                    onChange={(e) => handleInputChange('exam_date', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => handleInputChange('start_time', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    End Time *
                  </label>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => handleInputChange('end_time', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Venue
                  </label>
                  <input
                    type="text"
                    value={formData.venue}
                    onChange={(e) => handleInputChange('venue', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="e.g., Room 101, Computer Lab"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Instructions
                  </label>
                  <textarea
                    value={formData.instructions}
                    onChange={(e) => handleInputChange('instructions', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    rows={3}
                    placeholder="General instructions for students"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_practical}
                    onChange={(e) => handleInputChange('is_practical', e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Practical Exam</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.requires_computer}
                    onChange={(e) => handleInputChange('requires_computer', e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Requires Computer</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_online}
                    onChange={(e) => handleInputChange('is_online', e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Online Exam</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {sectionOrder.map((section, orderIndex) => (
                <div key={`${section.kind}-${section.id ?? 'builtin'}`} className="border border-slate-200 dark:border-slate-600 rounded-lg">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Section {String.fromCharCode(65 + orderIndex)}:</span>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {section.kind === 'objective' && 'Objective Questions'}
                        {section.kind === 'theory' && 'Theory Questions'}
                        {section.kind === 'practical' && 'Practical Questions'}
                        {section.kind === 'custom' && (customSections.find(s => s.id === section.id)?.name || 'Custom Section')}
                      </h3>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button onClick={() => insertCustomSectionAt(orderIndex)} className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200 dark:hover:bg-slate-600">Add Section Before</button>
                      <button onClick={() => insertCustomSectionAt(orderIndex + 1)} className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200 dark:hover:bg-slate-600">Add Section After</button>
                      {section.kind === 'custom' && (
                        <button onClick={() => section.id && removeCustomSectionById(section.id)} className="px-2 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-slate-700">Remove Section</button>
                      )}
                    </div>
                  </div>

                  <div className="p-4">
                    {section.kind === 'objective' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Section Instructions (Objective)</label>
                          <textarea value={objectiveInstructions} onChange={(e) => setObjectiveInstructions(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" rows={2} placeholder="Enter instructions for this section" />
                        </div>
                        <div className="flex items-center justify-between">
                          <button onClick={addObjectiveQuestion} className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                            <Plus className="w-4 h-4" />
                            <span>Add Question</span>
                          </button>
                        </div>
                        {objectiveQuestions.length > 0 && (
                          <div className="space-y-4">
                            {objectiveQuestions.map((question, index) => (
                              <div key={question.id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Question {index + 1}</span>
                                  <button onClick={() => removeObjectiveQuestion(index)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                                </div>
                                <div className="space-y-3">
                                  <RichTextEditor
                                    value={question.question}
                                    onChange={(html) => updateObjectiveQuestion(index, 'question', html)}
                                    placeholder="Enter question (supports formatting, images, tables)"
                                    minHeight={100}
                                    simplified={true}
                                    enableImageUpload={true}
                                    enableTables={false}
                                  />
                                  <div className="grid grid-cols-2 gap-3">
                                    <input type="text" value={question.optionA} onChange={(e) => updateObjectiveQuestion(index, 'optionA', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Option A" />
                                    <input type="text" value={question.optionB} onChange={(e) => updateObjectiveQuestion(index, 'optionB', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Option B" />
                                    <input type="text" value={question.optionC} onChange={(e) => updateObjectiveQuestion(index, 'optionC', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Option C" />
                                    <input type="text" value={question.optionD} onChange={(e) => updateObjectiveQuestion(index, 'optionD', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Option D" />
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <select value={question.correctAnswer} onChange={(e) => updateObjectiveQuestion(index, 'correctAnswer', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white">
                                      <option value="">Select correct answer</option>
                                      <option value="A">A</option>
                                      <option value="B">B</option>
                                      <option value="C">C</option>
                                      <option value="D">D</option>
                                    </select>
                                    <input type="number" value={question.marks} onChange={(e) => updateObjectiveQuestion(index, 'marks', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Marks" min="1" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {section.kind === 'theory' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Section Instructions (Theory)</label>
                          <textarea value={theoryInstructions} onChange={(e) => setTheoryInstructions(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" rows={2} placeholder="Enter instructions for this section" />
                        </div>
                        <div className="flex items-center justify-between">
                          <button onClick={addTheoryQuestion} className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                            <Plus className="w-4 h-4" />
                            <span>Add Question</span>
                          </button>
                        </div>
                        {theoryQuestions.length > 0 && (
                          <div className="space-y-4">
                            {theoryQuestions.map((question, index) => (
                              <div key={question.id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Question {getQuestionNumber(index)}</span>
                                  <button onClick={() => removeTheoryQuestion(index)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                                </div>
                                <div className="space-y-3">
                                  <RichTextEditor
                                    value={question.question}
                                    onChange={(html) => updateTheoryQuestion(index, 'question', html)}
                                    placeholder="Enter question (supports formatting, images, tables)"
                                    minHeight={120}
                                    simplified={false}
                                    enableImageUpload={true}
                                    enableTables={true}
                                  />

                                  <div className="grid grid-cols-3 gap-3">
                                    <input type="text" value={question.expectedPoints} onChange={(e) => updateTheoryQuestion(index, 'expectedPoints', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Expected points" />
                                    <input type="number" value={question.marks} onChange={(e) => updateTheoryQuestion(index, 'marks', parseInt(e.target.value))} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Marks" min="1" />
                                    <input type="text" value={question.wordLimit} onChange={(e) => updateTheoryQuestion(index, 'wordLimit', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Word limit" />
                                  </div>

                                  <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                      <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => setTheoryTable(index, 2, 2)}>Add 2x2 Table</button>
                                      <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => setTheoryTable(index, 3, 3)}>Add 3x3 Table</button>
                                      {question.table && (
                                        <>
                                          <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => addTheoryTableRow(index)}>+ Row</button>
                                          <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => addTheoryTableCol(index)}>+ Col</button>
                                          <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => removeTheoryTableRow(index)}>- Row</button>
                                          <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => removeTheoryTableCol(index)}>- Col</button>
                                        </>
                                      )}
                                    </div>
                                    {question.table && (
                                      <div className="overflow-auto">
                                        <table className="min-w-[300px] border border-slate-300 dark:border-slate-600">
                                          <tbody>
                                            {question.table.data.map((row: string[], r: number) => (
                                              <tr key={r}>
                                                {row.map((cell: string, c: number) => (
                                                  <td key={c} className="border border-slate-300 dark:border-slate-600 p-1">
                                                    <input type="text" value={cell} onChange={(e) => updateTheoryTableCell(index, r, c, e.target.value)} className="w-full px-2 py-1 bg-transparent focus:outline-none" />
                                                  </td>
                                                ))}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>

                                  <div className="space-y-2">
                                    <div>
                                      <button onClick={() => addSubQuestion(index)} className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded">Add Sub-question</button>
                                    </div>
                                    {(question.subQuestions || []).map((sq: any, sqi: number) => (
                                      <div key={sq.id} className="border border-slate-200 dark:border-slate-600 rounded p-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-sm">{getQuestionNumber(index, sqi)}</span>
                                          <div className="space-x-2">
                                            <button onClick={() => addSubSubQuestion(index, sqi)} className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded">Add Sub-Sub</button>
                                            <button onClick={() => removeSubQuestion(index, sqi)} className="px-2 py-1 text-xs text-red-600 border border-red-300 rounded">Remove</button>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-6 gap-2 mt-2">
                                          <textarea value={sq.question} onChange={(e) => updateSubQuestion(index, sqi, 'question', e.target.value)} className="col-span-5 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded" rows={2} placeholder="Enter sub-question" />
                                          <input type="number" value={sq.marks || 0} onChange={(e) => updateSubQuestion(index, sqi, 'marks', parseInt(e.target.value))} className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded" placeholder="Marks" />
                                        </div>
                                        {(sq.subSubQuestions || []).map((ssq: any, ssqi: number) => (
                                          <div key={ssq.id} className="grid grid-cols-6 gap-2 mt-2">
                                            <span className="text-sm col-span-1">{getQuestionNumber(index, sqi, ssqi)}</span>
                                            <textarea value={ssq.question} onChange={(e) => updateSubSubQuestion(index, sqi, ssqi, 'question', e.target.value)} className="col-span-4 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded" rows={2} placeholder="Enter sub-sub-question" />
                                            <input type="number" value={ssq.marks || 0} onChange={(e) => updateSubSubQuestion(index, sqi, ssqi, 'marks', parseInt(e.target.value))} className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded" placeholder="Marks" />
                                            <button onClick={() => removeSubSubQuestion(index, sqi, ssqi)} className="px-2 py-1 text-xs text-red-600 border border-red-300 rounded">Remove</button>
                                          </div>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {section.kind === 'practical' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Section Instructions (Practical)</label>
                          <textarea value={practicalInstructions} onChange={(e) => setPracticalInstructions(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" rows={2} placeholder="Enter instructions for this section" />
                        </div>
                        <div className="flex items-center justify-between">
                          <button onClick={addPracticalQuestion} className="flex items-center space-x-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                            <Plus className="w-4 h-4" />
                            <span>Add Question</span>
                          </button>
                        </div>
                        {practicalQuestions.length > 0 && (
                          <div className="space-y-4">
                            {practicalQuestions.map((question, index) => (
                              <div key={question.id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Question {index + 1}</span>
                                  <button onClick={() => removePracticalQuestion(index)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                                </div>
                                <div className="space-y-3">
                                  <RichTextEditor
                                    value={question.task}
                                    onChange={(html) => updatePracticalQuestion(index, 'task', html)}
                                    placeholder="Task description (supports formatting and images)"
                                    minHeight={80}
                                    simplified={true}
                                    enableImageUpload={true}
                                    enableTables={false}
                                  />
                                  <div className="grid grid-cols-2 gap-3">
                                    <input type="text" value={question.materials} onChange={(e) => updatePracticalQuestion(index, 'materials', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Required materials" />
                                    <input type="text" value={question.expectedOutcome} onChange={(e) => updatePracticalQuestion(index, 'expectedOutcome', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Expected outcome" />
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <input type="number" value={question.marks} onChange={(e) => updatePracticalQuestion(index, 'marks', parseInt(e.target.value))} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Marks" min="1" />
                                    <input type="text" value={question.timeLimit} onChange={(e) => updatePracticalQuestion(index, 'timeLimit', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Time limit" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {section.kind === 'custom' && (
                      <div className="space-y-4">
                        {(() => {
                          const custom = customSections.find(s => s.id === section.id);
                          if (!custom) return null;
                          const updateCustomField = (field: string, value: any) => {
                            setCustomSections(prev => prev.map(s => s.id === custom.id ? { ...s, [field]: value } : s));
                          };
                          const addQuestionToCustom = () => {
                            const newQ = { id: Date.now(), question: '', marks: 1, imageUrl: '', imageAlt: '' };
                            setCustomSections(prev => prev.map(s => s.id === custom.id ? { ...s, questions: [...(s.questions || []), newQ] } : s));
                          };
                          const updateCustomQuestion = (qIndex: number, field: string, value: any) => {
                            setCustomSections(prev => prev.map(s => {
                              if (s.id !== custom.id) return s;
                              const qs = [...(s.questions || [])];
                              qs[qIndex] = { ...qs[qIndex], [field]: value };
                              return { ...s, questions: qs };
                            }));
                          };
                          const removeCustomQuestion = (qIndex: number) => {
                            setCustomSections(prev => prev.map(s => {
                              if (s.id !== custom.id) return s;
                              return { ...s, questions: (s.questions || []).filter((_: any, i: number) => i !== qIndex) };
                            }));
                          };
                          return (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-3">
                                <input type="text" value={custom.name} onChange={(e) => updateCustomField('name', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Section name (e.g., Comprehension)" />
                                <input type="text" value={custom.instructions} onChange={(e) => updateCustomField('instructions', e.target.value)} className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Section instructions" />
                              </div>
                              <div className="flex items-center justify-between">
                                <button onClick={addQuestionToCustom} className="flex items-center space-x-2 px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors">
                                  <Plus className="w-4 h-4" />
                                  <span>Add Question</span>
                                </button>
                              </div>
                              {(custom.questions || []).length > 0 && (
                                <div className="space-y-3">
                                  {custom.questions.map((q: any, qi: number) => (
                                    <div key={q.id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-slate-600 dark:text-slate-300">Question {qi + 1}</span>
                                        <button onClick={() => removeCustomQuestion(qi)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                                      </div>
                                      <div className="space-y-3">
                                        <RichTextEditor
                                          value={q.question}
                                          onChange={(html) => updateCustomQuestion(qi, 'question', html)}
                                          placeholder="Enter question (supports formatting, images, tables)"
                                          minHeight={100}
                                          simplified={false}
                                          enableImageUpload={true}
                                          enableTables={true}
                                        />
                                        <div className="flex items-center gap-3">
                                          <label className="text-sm text-slate-600 dark:text-slate-300">Marks:</label>
                                          <input type="number" value={q.marks} onChange={(e) => updateCustomQuestion(qi, 'marks', parseInt(e.target.value))} className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white" placeholder="Marks" min="0" />
                                        </div>
                                      </div>
                                      <div className="space-y-2 mt-2">
                                        <div className="flex items-center space-x-2">
                                          <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => setCustomTable(custom.id, qi, 2, 2)}>Add 2x2 Table</button>
                                          <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => setCustomTable(custom.id, qi, 3, 3)}>Add 3x3 Table</button>
                                          {q.table && (
                                            <>
                                              <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => addCustomTableRow(custom.id, qi)}>+ Row</button>
                                              <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => addCustomTableCol(custom.id, qi)}>+ Col</button>
                                              <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => removeCustomTableRow(custom.id, qi)}>- Row</button>
                                              <button className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded" onClick={() => removeCustomTableCol(custom.id, qi)}>- Col</button>
                                            </>
                                          )}
                                        </div>
                                        {q.table && (
                                          <div className="overflow-auto">
                                            <table className="min-w-[300px] border border-slate-300 dark:border-slate-600">
                                              <tbody>
                                                {q.table.data.map((row: string[], r: number) => (
                                                  <tr key={r}>
                                                    {row.map((cell: string, c: number) => (
                                                      <td key={c} className="border border-slate-300 dark:border-slate-600 p-1">
                                                        <input type="text" value={cell} onChange={(e) => updateCustomTableCell(custom.id, qi, r, c, e.target.value)} className="w-full px-2 py-1 bg-transparent focus:outline-none" />
                                                      </td>
                                                    ))}
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div>
                <button onClick={addCustomSection} className="flex items-center space-x-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200 dark:hover:bg-slate-600">
                  <Plus className="w-4 h-4" />
                  <span>Add Section at End</span>
                </button>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-slate-900 dark:text-white">Total Marks: {calculateTotalMarks()}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Pass Marks: {formData.pass_marks || 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>

 <div className="sticky bottom-0 z-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 sm:p-6 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 text-center sm:text-left hidden sm:block">
            {editingExam ? 'Update exam details and save changes' : 'Fill in exam details and add questions to submit for admin review'}
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <button onClick={onClose} className="px-4 py-2.5 sm:py-2 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium">
              Cancel
            </button>
            
            <button onClick={saveAsDraft} disabled={savingDraft || !currentTeacherId} className="flex items-center justify-center space-x-2 px-4 py-2.5 sm:py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
              <Save className="w-4 h-4" />
              <span>{savingDraft ? 'Saving...' : 'Save Exam'}</span>
            </button>
            
            <button onClick={submitForApproval} disabled={loading || !currentTeacherId} className="flex items-center justify-center space-x-2 px-4 py-2.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              <span>{loading ? 'Submitting...' : 'Submit for Review'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamCreationForm;