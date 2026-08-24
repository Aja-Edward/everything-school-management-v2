import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import { ExamService, ExamCreateData } from '@/services/ExamService';
import { toast } from 'react-toastify';
import { X, XCircle, Plus, Trash2, Save, Clock, Clock3, CheckCircle, AlertCircle, BookOpen } from 'lucide-react';

interface TestCreationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onTestCreated: () => void;
  editingTest?: any;
}

const TestCreationForm: React.FC<TestCreationFormProps> = ({
  isOpen,
  onClose,
  onTestCreated,
  editingTest
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'questions'>('basic');
  
  const [formData, setFormData] = useState<ExamCreateData>({
    title: '',
    subject: 0,
    grade_level: 0,
    exam_type: 0,          // replaced with a real PK after loadTeacherData
    difficulty_level: 0,   // replaced with a real PK after loadTeacherData
    exam_date: '',
    start_time: '',
    end_time: '',
    duration_minutes: 30,
    total_marks: 50,
    pass_marks: 25,
    venue: '',
    instructions: '',
    status: 0,
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
  const [teacherAssignments, setTeacherAssignments] = useState<any[]>([]);
  // exam_type/difficulty_level/status are foreign keys on the backend
  // (PrimaryKeyRelatedField) - these hold the real, fetched options so
  // the form submits a valid PK instead of a made-up string code.
  const [examTypes,        setExamTypes]        = useState<any[]>([]);
  const [difficultyLevels, setDifficultyLevels] = useState<any[]>([]);
  const [examStatuses,     setExamStatuses]     = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadTeacherData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (editingTest) {
      setFormData({
        title: editingTest.title || '',
        subject: editingTest.subject?.id || editingTest.subject || 0,
        grade_level: editingTest.grade_level?.id || editingTest.grade_level || 0,
        exam_type: typeof editingTest.exam_type === 'number' ? editingTest.exam_type : editingTest.exam_type?.id ?? 0,
        difficulty_level: typeof editingTest.difficulty_level === 'number' ? editingTest.difficulty_level : editingTest.difficulty_level?.id ?? 0,
        exam_date: editingTest.exam_date || '',
        start_time: editingTest.start_time || '',
        end_time: editingTest.end_time || '',
        duration_minutes: editingTest.duration_minutes || 30,
        total_marks: editingTest.total_marks || 50,
        pass_marks: editingTest.pass_marks || 25,
        venue: editingTest.venue || '',
        instructions: editingTest.instructions || '',
        status: typeof editingTest.status === 'number' ? editingTest.status : editingTest.status?.id ?? 0,
        is_practical: editingTest.is_practical || false,
        requires_computer: editingTest.is_requires_computer || false,
        is_online: editingTest.is_online || false,
        objective_questions: editingTest.objective_questions || [],
        theory_questions: editingTest.theory_questions || [],
        practical_questions: editingTest.practical_questions || [],
        custom_sections: editingTest.custom_sections || [],
        objective_instructions: editingTest.objective_instructions || '',
        theory_instructions: editingTest.theory_instructions || '',
        practical_instructions: editingTest.practical_instructions || ''
      });

      setObjectiveQuestions(editingTest.objective_questions || []);
      setTheoryQuestions(editingTest.theory_questions || []);
    }
  }, [editingTest]);

  const loadTeacherData = async () => {
    try {
      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      if (!teacherId) {
        toast.error('Teacher ID not found');
        return;
      }

      const [assignments, rawExamTypes, rawDifficulties, rawStatuses] = await Promise.all([
        TeacherDashboardService.getTeacherClasses(teacherId),
        ExamService.fetchExamTypes(),
        ExamService.fetchDifficultyLevels(),
        ExamService.fetchExamStatuses(),
      ]);
      setTeacherAssignments(assignments);
      setExamTypes(rawExamTypes);
      setDifficultyLevels(rawDifficulties);
      setExamStatuses(rawStatuses);

      // For a new test, default to the school's first option so the form
      // never submits 0 - only when not already set from editingTest.
      if (!editingTest) {
        setFormData(prev => ({
          ...prev,
          exam_type: prev.exam_type || rawExamTypes[0]?.id || 0,
          difficulty_level: prev.difficulty_level || rawDifficulties[0]?.id || 0,
        }));
      }
    } catch (error) {
      console.error('Error loading teacher data:', error);
      toast.error('Failed to load teacher data');
    }
  };

  const handleInputChange = (field: keyof ExamCreateData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addObjectiveQuestion = () => {
    const newQuestion = {
      id: Date.now(),
      question: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      correctAnswer: '',
      marks: 1
    };
    setObjectiveQuestions(prev => [...prev, newQuestion]);
  };

  const updateObjectiveQuestion = (index: number, field: string, value: string) => {
    setObjectiveQuestions(prev => prev.map((q, i) => 
      i === index ? { ...q, [field]: value } : q
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
      wordLimit: '50-100'
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

  const calculateTotalMarks = () => {
    const objectiveMarks = objectiveQuestions.reduce((sum: number, q: any) => sum + (q.marks || 0), 0);
    const theoryMarks = theoryQuestions.reduce((sum: number, q: any) => sum + (q.marks || 0), 0);
    return objectiveMarks + theoryMarks;
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      toast.error('Please enter test title');
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
    if (objectiveQuestions.length === 0 && theoryQuestions.length === 0) {
      toast.error('Please add at least one question');
      return false;
    }
    return true;
  };

  /** Look up a status PK by code; fall back to the initial status or formData.status. */
  const statusPk = (code: string): string | number => {
    const found = examStatuses.find((s: any) => s.code === code);
    if (found) return found.id;
    const initial = examStatuses.find((s: any) => s.is_initial) ?? examStatuses[0];
    return initial?.id ?? formData.status;
  };

  // The test's own current status while editing - saving shouldn't
  // silently drop a scheduled/pending/completed test back to draft.
  const editingStatusCode = editingTest
    ? (typeof editingTest.status === 'string' ? editingTest.status : (editingTest.status as any)?.code)
    : null;
  const editingStatusPk = editingTest
    ? (typeof editingTest.status === 'number' ? editingTest.status : (editingTest.status as any)?.id)
    : null;

  const saveAsDraft = async () => {
    if (!validateForm()) return;

    try {
      setSavingDraft(true);
      
      const testData: ExamCreateData = {
        ...formData,
        // Preserve the test's existing status when editing - a plain save
        // shouldn't demote a scheduled/pending/completed test to draft.
        status: editingStatusPk ?? statusPk('draft'),
        objective_questions: objectiveQuestions,
        theory_questions: theoryQuestions,
        total_marks: calculateTotalMarks()
      };

      if (editingTest) {
        await ExamService.updateExam(editingTest.id, testData);
        toast.success('Test draft updated successfully!');
      } else {
        await ExamService.createExam(testData);
        toast.success('Test draft saved successfully!');
      }

      onTestCreated();
      onClose();
    } catch (error) {
      console.error('Error saving draft:', error);
      toast.error('Failed to save draft. Please try again.');
    } finally {
      setSavingDraft(false);
    }
  };

  const submitForApproval = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);
      
      const testData: ExamCreateData = {
        ...formData,
        status: statusPk('pending_approval'),
        objective_questions: objectiveQuestions,
        theory_questions: theoryQuestions,
        total_marks: calculateTotalMarks()
      };

      if (editingTest) {
        await ExamService.updateExam(editingTest.id, testData);
        toast.success('Test submitted for approval successfully!');
      } else {
        await ExamService.createExam(testData);
        toast.success('Test submitted for approval successfully!');
      }

      onTestCreated();
      onClose();
    } catch (error) {
      console.error('Error submitting test:', error);
      toast.error('Failed to submit test. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: any) => {
    // status arrives as a foreign-key object ({id, code, name}) from the API,
    // and as a plain code string while the form itself is being edited.
    const code = typeof status === 'string' ? status : status?.code ?? 'draft';
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', icon: Save, text: 'Draft' },
      pending_approval: { color: 'bg-yellow-100 text-yellow-800', icon: Clock3, text: 'Pending Approval' },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle, text: 'Rejected' },
      approved: { color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle, text: 'Approved' },
      scheduled: { color: 'bg-blue-100 text-blue-800', icon: Clock, text: 'Scheduled' },
      in_progress: { color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle, text: 'In Progress' },
      completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Completed' },
      cancelled: { color: 'bg-red-100 text-red-800', icon: X, text: 'Cancelled' },
      postponed: { color: 'bg-orange-100 text-orange-800', icon: Clock3, text: 'Postponed' }
    };

    const config = statusConfig[code as keyof typeof statusConfig] || statusConfig.draft;
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
      <div className="bg-white dark:bg-slate-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-3">
            <BookOpen className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {editingTest ? 'Edit Test' : 'Create New Test'}
            </h2>
            {editingTest && getStatusBadge(editingTest.status)}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
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
            onClick={() => setActiveTab('questions')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'questions'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Questions
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'basic' ? (
            <div className="space-y-6">
              {/* Basic Test Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Test Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="Enter test title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Test Type
                  </label>
                  <select
                    value={formData.exam_type}
                    onChange={(e) => handleInputChange('exam_type', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value={0}>Select Test Type</option>
                    {examTypes.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
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
                    {teacherAssignments.map((assignment: any) => (
                      <option key={assignment.subject_id} value={assignment.subject_id}>
                        {assignment.subject_name}
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
                    {teacherAssignments.map((assignment: any) => (
                      <option key={assignment.grade_level_id} value={assignment.grade_level_id}>
                        {assignment.grade_level_name}
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
                    onChange={(e) => handleInputChange('difficulty_level', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value={0}>Select Difficulty</option>
                    {difficultyLevels.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
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
                    max="120"
                  />
                </div>
              </div>

              {/* Additional Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Instructions
                  </label>
                  <textarea
                    value={formData.instructions}
                    onChange={(e) => handleInputChange('instructions', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    rows={3}
                    placeholder="Instructions for students"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Pass Marks
                  </label>
                  <input
                    type="number"
                    value={formData.pass_marks}
                    onChange={(e) => handleInputChange('pass_marks', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    min="1"
                    max={formData.total_marks}
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_online}
                    onChange={(e) => handleInputChange('is_online', e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Online Test</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Question Types */}
              <div className="space-y-6">
                {/* Objective Questions */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Objective Questions
                    </h3>
                    <button
                      onClick={addObjectiveQuestion}
                      className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Question</span>
                    </button>
                  </div>

                  {objectiveQuestions.length > 0 && (
                    <div className="space-y-4">
                      {objectiveQuestions.map((question, index) => (
                        <div key={question.id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              Question {index + 1}.
                            </span>
                            <button
                              onClick={() => removeObjectiveQuestion(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <input
                              type="text"
                              value={question.question}
                              onChange={(e) => updateObjectiveQuestion(index, 'question', e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                              placeholder="Enter question"
                            />

                            <div className="grid grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={question.optionA}
                                onChange={(e) => updateObjectiveQuestion(index, 'optionA', e.target.value)}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                                placeholder="Option A"
                              />
                              <input
                                type="text"
                                value={question.optionB}
                                onChange={(e) => updateObjectiveQuestion(index, 'optionB', e.target.value)}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                                placeholder="Option B"
                              />
                              <input
                                type="text"
                                value={question.optionC}
                                onChange={(e) => updateObjectiveQuestion(index, 'optionC', e.target.value)}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                                placeholder="Option C"
                              />
                              <input
                                type="text"
                                value={question.optionD}
                                onChange={(e) => updateObjectiveQuestion(index, 'optionD', e.target.value)}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                                placeholder="Option D"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <select
                                value={question.correctAnswer}
                                onChange={(e) => updateObjectiveQuestion(index, 'correctAnswer', e.target.value)}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                              >
                                <option value="">Select correct answer</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                              </select>

                              <input
                                type="number"
                                value={question.marks}
                                onChange={(e) => updateObjectiveQuestion(index, 'marks', e.target.value)}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                                placeholder="Marks"
                                min="1"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Theory Questions */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Theory Questions
                    </h3>
                    <button
                      onClick={addTheoryQuestion}
                      className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Question</span>
                    </button>
                  </div>

                  {theoryQuestions.length > 0 && (
                    <div className="space-y-4">
                      {theoryQuestions.map((question, index) => (
                        <div key={question.id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              Question {index + 1}.
                            </span>
                            <button
                              onClick={() => removeTheoryQuestion(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <textarea
                              value={question.question}
                              onChange={(e) => updateTheoryQuestion(index, 'question', e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                              rows={3}
                              placeholder="Enter question"
                            />

                            <div className="grid grid-cols-3 gap-3">
                              <input
                                type="text"
                                value={question.expectedPoints}
                                onChange={(e) => updateTheoryQuestion(index, 'expectedPoints', e.target.value)}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                                placeholder="Expected points"
                              />
                              <input
                                type="number"
                                value={question.marks}
                                onChange={(e) => updateTheoryQuestion(index, 'marks', parseInt(e.target.value))}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                                placeholder="Marks"
                                min="1"
                              />
                              <input
                                type="text"
                                value={question.wordLimit}
                                onChange={(e) => updateTheoryQuestion(index, 'wordLimit', e.target.value)}
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                                placeholder="Word limit"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Total Marks Display */}
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">
                      Total Marks: {calculateTotalMarks()}
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Pass Marks: {formData.pass_marks || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {editingTest ? 'Update test details and save changes' : 'Fill in test details and add questions'}
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            
            <button
              onClick={saveAsDraft}
              disabled={savingDraft}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{savingDraft ? 'Saving...' : editingTest && editingStatusCode && editingStatusCode !== 'draft' ? 'Save Changes' : 'Save as Draft'}</span>
            </button>
            
            {(!editingTest || editingStatusCode === 'draft' || editingStatusCode === 'rejected') && (
              <button
                onClick={submitForApproval}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{loading ? 'Submitting...' : 'Submit for Approval'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestCreationForm;
