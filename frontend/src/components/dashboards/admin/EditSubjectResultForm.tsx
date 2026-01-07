import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Save, AlertCircle, BookOpen, Calculator, Sparkles, Info } from 'lucide-react';
import { toast } from 'react-toastify';
import { useGlobalTheme } from '../../../contexts/GlobalThemeContext';
import api from '../../../services/api';

// Type definitions
interface Student {
  id: string;
  full_name: string;
  username: string;
  student_class: string;
  education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
  profile_picture?: string;
}

interface AcademicSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface Subject {
  name: string;
  code: string;
}

interface SubjectResult {
  id: string;
  subject: Subject;
  total_ca_score: number;
  exam_score: number;
  total_score: number;
  percentage: number;
  grade: string;
  grade_point: number;
  is_passed: boolean;
  status: string;
  max_marks_obtainable?: number;
  mark_obtained?: number;
  academic_comment?: string;
  teacher_remark?: string;
  breakdown?: {
    max_marks_obtainable?: number;
    mark_obtained?: number;
    physical_development?: string;
    health?: string;
    cleanliness?: string;
    general_conduct?: string;
  };
}

interface StudentResult {
  id: string;
  student: Student;
  academic_session: AcademicSession;
  term: string;
  total_subjects: number;
  subjects_passed: number;
  subjects_failed: number;
  total_score: number;
  average_score: number;
  gpa: number;
  class_position: number | null;
  total_students: number;
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED';
  remarks: string;
  next_term_begins?: string;
  subject_results: SubjectResult[];
  created_at: string;
  updated_at: string;
}

interface SubjectFormData {
  first_test_score: number;
  second_test_score: number;
  third_test_score: number;
  continuous_assessment_score: number;
  take_home_test_score: number;
  practical_score: number;
  appearance_score: number;
  project_score: number;
  note_copying_score: number;
  exam_score: number;
  grade: string;
  status: string;
  teacher_remark: string;
  max_marks_obtainable: number;
}

interface EditSubjectResultFormProps {
  result: StudentResult;
  onClose: () => void;
  onSuccess: () => void;
}

const EditSubjectResultForm: React.FC<EditSubjectResultFormProps> = ({
  result,
  onClose,
  onSuccess,
}) => {
  const { isDarkMode } = useGlobalTheme();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<SubjectResult | null>(null);
  const [formData, setFormData] = useState<SubjectFormData>({
    first_test_score: 0,
    second_test_score: 0,
    third_test_score: 0,
    continuous_assessment_score: 0,
    take_home_test_score: 0,
    practical_score: 0,
    appearance_score: 0,
    project_score: 0,
    note_copying_score: 0,
    exam_score: 0,
    grade: '',
    status: 'DRAFT',
    teacher_remark: '',
    max_marks_obtainable: 100,
  });

  const themeClasses = {
    bgCard: isDarkMode ? 'bg-gray-800' : 'bg-white',
    textPrimary: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-300',
    inputBg: isDarkMode ? 'bg-gray-700' : 'bg-white',
    inputText: isDarkMode ? 'text-white' : 'text-gray-900',
    bgPrimary: isDarkMode ? 'bg-gray-900' : 'bg-white',
    bgSecondary: isDarkMode ? 'bg-gray-800' : 'bg-gray-50',
  };

  // Education level configurations
  const educationConfig = useMemo(() => {
    const level = result.student.education_level;
    
    const configs = {
      SENIOR_SECONDARY: {
        name: 'Senior Secondary',
        caFields: [
          { key: 'first_test_score', label: 'Test 1', max: 10 },
          { key: 'second_test_score', label: 'Test 2', max: 10 },
          { key: 'third_test_score', label: 'Test 3', max: 10 },
        ],
        examMax: 70,
        caTotal: 30,
        totalMax: 100,
        useCustomMax: false,
      },
      JUNIOR_SECONDARY: {
        name: 'Junior Secondary',
        caFields: [
          { key: 'continuous_assessment_score', label: 'Continuous Assessment', max: 15 },
          { key: 'take_home_test_score', label: 'Take Home Test', max: 5 },
          { key: 'practical_score', label: 'Practical', max: 5 },
          { key: 'appearance_score', label: 'Appearance', max: 5 },
          { key: 'project_score', label: 'Project', max: 5 },
          { key: 'note_copying_score', label: 'Note Copying', max: 5 },
        ],
        examMax: 60,
        caTotal: 40,
        totalMax: 100,
        useCustomMax: false,
      },
      PRIMARY: {
        name: 'Primary',
        caFields: [
          { key: 'continuous_assessment_score', label: 'Continuous Assessment', max: 15 },
          { key: 'take_home_test_score', label: 'Take Home Test', max: 5 },
          { key: 'practical_score', label: 'Practical', max: 5 },
          { key: 'appearance_score', label: 'Appearance', max: 5 },
          { key: 'project_score', label: 'Project', max: 5 },
          { key: 'note_copying_score', label: 'Note Copying', max: 5 },
        ],
        examMax: 60,
        caTotal: 40,
        totalMax: 100,
        useCustomMax: false,
      },
      NURSERY: {
        name: 'Nursery',
        caFields: [],
        examMax: 100,
        caTotal: 0,
        totalMax: 100,
        useCustomMax: true,
      },
    };

    return configs[level] || configs.NURSERY;
  }, [result.student.education_level]);

  // Calculate CA total
  const caTotal = useMemo(() => {
    return educationConfig.caFields.reduce((sum, field) => {
      const value = formData[field.key as keyof SubjectFormData];
      return sum + (Number(value) || 0);
    }, 0);
  }, [formData, educationConfig.caFields]);

  // Calculate total score
  const totalScore = useMemo(() => {
    const exam = Number(formData.exam_score) || 0;
    return result.student.education_level === 'NURSERY' ? exam : caTotal + exam;
  }, [caTotal, formData.exam_score, result.student.education_level]);

  // Calculate percentage
  const percentage = useMemo(() => {
    if (totalScore === 0) return 0;
    const max = result.student.education_level === 'NURSERY' 
      ? (Number(formData.max_marks_obtainable) || 100)
      : educationConfig.totalMax;
    if (max === 0) return 0;
    return (totalScore / max) * 100;
  }, [totalScore, formData.max_marks_obtainable, educationConfig.totalMax, result.student.education_level]);
  // Determine grade
  const grade = useMemo(() => {
    if (percentage >= 70) return 'A';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C';
    if (percentage >= 45) return 'D';
    if (percentage >= 39) return 'E';
    return 'F';
  }, [percentage]);

  // Update grade when percentage changes
  useEffect(() => {
    setFormData(prev => ({ ...prev, grade }));
  }, [grade]);

  // Format score for display
  const formatScore = (score: any): string => {
    if (score == null) return 'N/A';
    const num = typeof score === 'string' ? parseFloat(score) : score;
    return isNaN(num) ? 'N/A' : `${num.toFixed(1)}%`;
  };

  // Generate teacher remark
  const generateRemark = useCallback(() => {
    const remarks = {
      A: [
        'Excellent.',
        'Distinction.',
        'Outstanding.',
        'Brilliant.'
      ],
      B: [
        'Very good',
        'Excellent work.',
        'Awesome',
        'Interesting.'
      ],
      C: [
        'Good',
        'Well done!.',
        'Good effort.',
        'Satisfactory'
      ],
      D: [
        'Fair. ',
        'Average.',
        'work harder.',
        'Need improvement.'
      ],
      E: [
        'More effo.',
        'Focus more.',
        'Concentrate.',
        'Poor.'
      ],
      F: [
        'Failed.',
        'Very Poor.',
        'Need support.',
        'Seek help.'
      ]
    };

    const gradeRemarks = remarks[grade as keyof typeof remarks] || remarks.F;
    return gradeRemarks[Math.floor(Math.random() * gradeRemarks.length)];
  }, [grade]);

  // Handle subject selection
  const handleSubjectSelect = useCallback(async (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    const subject = result.subject_results.find(s => s.id === subjectId);
    if (!subject) return;
    
    setSelectedSubject(subject);
    setLoading(true);

    try {
      const endpoints = {
        SENIOR_SECONDARY: `/api/results/senior-secondary/results/${subjectId}/`,
        JUNIOR_SECONDARY: `/api/results/junior-secondary/results/${subjectId}/`,
        PRIMARY: `/api/results/primary/results/${subjectId}/`,
        NURSERY: `/api/results/nursery/results/${subjectId}/`,
      };

      const endpoint = endpoints[result.student.education_level];
      if (!endpoint) throw new Error('Invalid education level');

      const fullResultData = await api.get(endpoint);
      console.log('Full result data from API:', fullResultData);
      
      const baseData = {
        exam_score: fullResultData.exam_score || 0,
        grade: fullResultData.grade || '',
        status: fullResultData.status || 'DRAFT',
        teacher_remark: fullResultData.teacher_remark || fullResultData.academic_comment || '',
      };

      let newFormData: SubjectFormData;

      if (result.student.education_level === 'SENIOR_SECONDARY') {
        newFormData = {
          ...baseData,
          first_test_score: fullResultData.first_test_score || 0,
          second_test_score: fullResultData.second_test_score || 0,
          third_test_score: fullResultData.third_test_score || 0,
          continuous_assessment_score: 0,
          take_home_test_score: 0,
          practical_score: 0,
          appearance_score: 0,
          project_score: 0,
          note_copying_score: 0,
          max_marks_obtainable: 100,
        };
      } else if (['PRIMARY', 'JUNIOR_SECONDARY'].includes(result.student.education_level)) {
        newFormData = {
          ...baseData,
          continuous_assessment_score: fullResultData.continuous_assessment_score || 0,
          take_home_test_score: fullResultData.take_home_test_score || 0,
          practical_score: fullResultData.practical_score || 0,
          appearance_score: fullResultData.appearance_score || 0,
          project_score: fullResultData.project_score || 0,
          note_copying_score: fullResultData.note_copying_score || 0,
          first_test_score: 0,
          second_test_score: 0,
          third_test_score: 0,
          max_marks_obtainable: 100,
        };
      } else {
        newFormData = {
          ...baseData,
          exam_score: fullResultData.mark_obtained || 0,
          max_marks_obtainable: fullResultData.max_marks_obtainable || 100,
          first_test_score: 0,
          second_test_score: 0,
          third_test_score: 0,
          continuous_assessment_score: 0,
          take_home_test_score: 0,
          practical_score: 0,
          appearance_score: 0,
          project_score: 0,
          note_copying_score: 0,
        };
      }

      setFormData(newFormData);
    } catch (error: any) {
      console.error('Error fetching result data:', error);
      toast.error('Failed to load complete result data');
      
      // Fallback
      const baseFormData = {
        exam_score: subject.exam_score || 0,
        grade: subject.grade || '',
        status: subject.status || 'DRAFT',
        teacher_remark: subject.teacher_remark || subject.academic_comment || '',
        first_test_score: 0,
        second_test_score: 0,
        third_test_score: 0,
        continuous_assessment_score: 0,
        take_home_test_score: 0,
        practical_score: 0,
        appearance_score: 0,
        project_score: 0,
        note_copying_score: 0,
        max_marks_obtainable: 100,
      };
      setFormData(baseFormData);
    } finally {
      setLoading(false);
    }
  }, [result]);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!selectedSubject) {
      newErrors.subject = 'Please select a subject to edit';
      setErrors(newErrors);
      return false;
    }

    educationConfig.caFields.forEach(field => {
      const value = formData[field.key as keyof SubjectFormData] as number;
      if (value < 0 || value > field.max) {
        newErrors[field.key] = `${field.label} must be between 0 and ${field.max}`;
      }
    });

    const examMax = educationConfig.useCustomMax ? formData.max_marks_obtainable : educationConfig.examMax;
    if (formData.exam_score < 0 || formData.exam_score > examMax) {
      newErrors.exam_score = `Exam score must be between 0 and ${examMax}`;
    }

    if (result.student.education_level === 'NURSERY' && formData.max_marks_obtainable <= 0) {
      newErrors.max_marks_obtainable = 'Max marks obtainable must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, selectedSubject, educationConfig, result.student.education_level]);

  // Handle input change
  const handleInputChange = useCallback((field: keyof SubjectFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !selectedSubject) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setLoading(true);

    try {
      let updateData: any = { status: formData.status };

      if (result.student.education_level === 'SENIOR_SECONDARY') {
        updateData = {
          ...updateData,
          first_test_score: formData.first_test_score,
          second_test_score: formData.second_test_score,
          third_test_score: formData.third_test_score,
          exam_score: formData.exam_score,
          teacher_remark: formData.teacher_remark || '',
        };
      } else if (['PRIMARY', 'JUNIOR_SECONDARY'].includes(result.student.education_level)) {
        updateData = {
          ...updateData,
          continuous_assessment_score: formData.continuous_assessment_score,
          take_home_test_score: formData.take_home_test_score,
          practical_score: formData.practical_score,
          appearance_score: formData.appearance_score,
          project_score: formData.project_score,
          note_copying_score: formData.note_copying_score,
          exam_score: formData.exam_score,
          teacher_remark: formData.teacher_remark || '',
        };
      } else {
        updateData = {
          ...updateData,
          mark_obtained: formData.exam_score,
          max_marks_obtainable: formData.max_marks_obtainable,
          academic_comment: formData.teacher_remark || '',
        };
      }

      const endpoints = {
        SENIOR_SECONDARY: `/api/results/senior-secondary/results/${selectedSubject.id}/`,
        JUNIOR_SECONDARY: `/api/results/junior-secondary/results/${selectedSubject.id}/`,
        PRIMARY: `/api/results/primary/results/${selectedSubject.id}/`,
        NURSERY: `/api/results/nursery/results/${selectedSubject.id}/`,
      };

      const endpoint = endpoints[result.student.education_level];
      
      // Verify result exists
      await api.get(endpoint);
      await api.patch(endpoint, updateData);

      toast.success('Subject result updated successfully!');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating subject result:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to update subject result';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b sticky top-0 bg-white z-10">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Edit Subject Results</h2>
              <p className="text-sm text-gray-600 mt-1">{result.student?.full_name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Term Information */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <Info className="w-4 h-4 mr-2 text-blue-600" />
              Term Information
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-600 mb-1">Term</div>
                <div className="font-semibold text-gray-900">{result.term}</div>
              </div>
              <div>
                <div className="text-gray-600 mb-1">Session</div>
                <div className="font-semibold text-gray-900">{result.academic_session?.name}</div>
              </div>
              <div>
                <div className="text-gray-600 mb-1">Class</div>
                <div className="font-semibold text-gray-900">{result.student?.student_class}</div>
              </div>
              <div>
                <div className="text-gray-600 mb-1">Total Subjects</div>
                <div className="font-semibold text-gray-900">{result.subject_results?.length || 0}</div>
              </div>
            </div>
          </div>

          {/* Subject Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Select Subject to Edit *
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {result.subject_results?.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => handleSubjectSelect(subject.id)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    selectedSubjectId === subject.id
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`p-2 rounded-lg ${
                      selectedSubjectId === subject.id ? 'bg-blue-100' : 'bg-gray-100'
                    }`}>
                      <BookOpen className={`w-5 h-5 ${
                        selectedSubjectId === subject.id ? 'text-blue-600' : 'text-gray-600'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{subject.subject.name}</div>
                      <div className="text-sm text-gray-500">{subject.subject.code}</div>
                      <div className="mt-1 flex items-center space-x-2">
                        <span className="text-xs font-medium text-gray-600">Current:</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          subject.is_passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {formatScore(subject.percentage)} ({subject.grade})
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {errors.subject && (
              <p className="text-red-600 text-sm mt-2 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.subject}
              </p>
            )}
          </div>

          {/* Subject Edit Form */}
          {selectedSubject && (
            <div className="border-2 border-blue-100 rounded-xl p-6 bg-gradient-to-br from-white to-blue-50/30">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center text-lg">
                <Calculator className="w-5 h-5 mr-2 text-blue-600" />
                Edit {selectedSubject.subject.name} Scores
                <span className="ml-auto text-sm font-normal text-gray-600">
                  {educationConfig.name}
                </span>
              </h3>

              <div className="space-y-6">
                {/* CA Scores */}
                {educationConfig.caFields.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3 text-sm uppercase tracking-wide">
                      Continuous Assessment ({educationConfig.caTotal} marks total)
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {educationConfig.caFields.map(field => (
                        <div key={field.key}>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {field.label} (0-{field.max}) *
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={field.max}
                            step="0.1"
                            value={formData[field.key as keyof SubjectFormData]}
                            onChange={(e) => handleInputChange(field.key as keyof SubjectFormData, parseFloat(e.target.value) || 0)}
                            className={`w-full px-4 py-2.5 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              errors[field.key] ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-gray-400'
                            }`}
                            placeholder={`0-${field.max}`}
                          />
                          {errors[field.key] && (
                            <p className="text-red-600 text-xs mt-1">{errors[field.key]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exam Score */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3 text-sm uppercase tracking-wide">
                    Examination
                  </h4>
                  {result.student.education_level === 'NURSERY' && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Max Marks Obtainable *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        value={formData.max_marks_obtainable}
                        onChange={(e) => handleInputChange('max_marks_obtainable', parseFloat(e.target.value) || 100)}
                        className={`w-full px-4 py-2.5 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.max_marks_obtainable ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-gray-400'
                        }`}
                      />
                      {errors.max_marks_obtainable && (
                        <p className="text-red-600 text-xs mt-1">{errors.max_marks_obtainable}</p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {result.student.education_level === 'NURSERY' ? 'Mark Obtained' : 'Exam Score'} 
                      {' '}(0-{educationConfig.useCustomMax ? formData.max_marks_obtainable : educationConfig.examMax}) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={educationConfig.useCustomMax ? formData.max_marks_obtainable : educationConfig.examMax}
                      step="0.1"
                      value={formData.exam_score}
                      onChange={(e) => handleInputChange('exam_score', parseFloat(e.target.value) || 0)}
                      className={`w-full px-4 py-2.5 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.exam_score ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-gray-400'
                      }`}
                    />
                    {errors.exam_score && (
                      <p className="text-red-600 text-xs mt-1">{errors.exam_score}</p>
                    )}
                  </div>
                </div>

                {/* Calculated Results */}
                <div className="bg-gradient-to-br from-blue-100 to-indigo-100 p-5 rounded-xl border-2 border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center">
                    <Calculator className="w-4 h-4 mr-2" />
                    Calculated Results
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {caTotal > 0 && (
                      <div>
                        <div className="text-sm text-blue-700 mb-1">CA Total</div>
                        <div className="text-xl font-bold text-blue-900">
                          {typeof caTotal === 'number' ? caTotal.toFixed(1) : '0.0'}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-blue-700 mb-1">Total Score</div>
                      <div className="text-xl font-bold text-blue-900">
                        {typeof totalScore === 'number' ? totalScore.toFixed(1) : '0.0'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-blue-700 mb-1">Percentage</div>
                      <div className="text-xl font-bold text-blue-900">
                        {typeof percentage === 'number' ? percentage.toFixed(1) : '0.0'}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-blue-700 mb-1">Grade</div>
                      <div className={`text-xl font-bold px-3 py-1 rounded-lg inline-block ${
                        ['A', 'B'].includes(grade) ? 'bg-green-500 text-white' :
                        ['C', 'D'].includes(grade) ? 'bg-yellow-500 text-white' :
                        'bg-red-500 text-white'
                      }`}>{grade || 'N/A'}</div>
                    </div>
                  </div>
                  {/* <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {caTotal > 0 && (
                      <div>
                        <div className="text-sm text-blue-700 mb-1">CA Total</div>
                        <div className="text-xl font-bold text-blue-900">{caTotal.toFixed(1)}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-blue-700 mb-1">Total Score</div>
                      <div className="text-xl font-bold text-blue-900">{totalScore.toFixed(1)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-blue-700 mb-1">Percentage</div>
                      <div className="text-xl font-bold text-blue-900">{percentage.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-sm text-blue-700 mb-1">Grade</div>
                      <div className={`text-xl font-bold px-3 py-1 rounded-lg inline-block ${
                        ['A', 'B'].includes(grade) ? 'bg-green-500 text-white' :
                        ['C', 'D'].includes(grade) ? 'bg-yellow-500 text-white' :
                        'bg-red-500 text-white'
                      }`}>{grade}</div>
                    </div>
                  </div> */}
                </div>

                {/* Teacher Remark */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Teacher Remark
                    </label>
                    <button
                      type="button"
                      onClick={() => handleInputChange('teacher_remark', generateRemark())}
                      className="flex items-center space-x-1 text-xs bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-3 py-1.5 rounded-lg transition-all shadow-sm hover:shadow-md"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Generate Remark</span>
                    </button>
                  </div>
                  <textarea
                    value={formData.teacher_remark}
                    onChange={(e) => handleInputChange('teacher_remark', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                    placeholder="Enter teacher's remark about student's performance..."
                  />
                  <p className="text-xs text-gray-500 mt-1 flex items-center">
                    <Info className="w-3 h-3 mr-1" />
                    Optional: Add a comment about the student's performance. Click "Generate Remark" for suggestions.
                  </p>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status *
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border-2 border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-white"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="APPROVED">Approved</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t-2 sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-all"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedSubject}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all flex items-center space-x-2 ${
                loading || !selectedSubject
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg'
              }`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};



export default EditSubjectResultForm