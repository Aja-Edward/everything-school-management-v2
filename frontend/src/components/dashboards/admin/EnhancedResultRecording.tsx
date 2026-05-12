import React, { useState, useEffect } from 'react';
import { Plus, Save, X, Users, BookOpen, Calculator, FileText } from 'lucide-react';
import { toast } from 'react-toastify';
import resultSettingsService from '@/services/ResultSettingsService';
import ResultService from '@/services/ResultService';
import type { EducationLevelType } from '@/services/ResultService';
import StudentService from '@/services/StudentService';
import SubjectService from '@/services/SubjectService';

interface Student {
  id: string;
  full_name: string;
  student_class: string;
  education_level: string;
}

interface Subject {
  id: string;
  name: string;
  code: string;
  education_levels: string[];
}

interface ExamSession {
  id: string;
  name: string;
  exam_type: string;
  term: string;
}



interface EnhancedResultRecordingProps {
  onResultAdded?: () => void;
  onClose?: () => void;
}
const EnhancedResultRecording: React.FC<EnhancedResultRecordingProps> = ({
  onResultAdded,
  onClose

}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  // Data states
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<Subject[]>([]);
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  // Assessment components for the selected student's education level
  const [levelComponents, setLevelComponents] = useState<any[]>([]);
  // component_id → entered score string
  const [componentScores, setComponentScores] = useState<Record<number, string>>({});

  // Form state
  const [formData, setFormData] = useState<{
    student: string;
    subject: string;
    exam_session: string;
    education_level: string;
    teacher_remark: string;
    status: string;
    [key: string]: any;
  }>({
    student: '',
    subject: '',
    exam_session: '',
    education_level: '',
    teacher_remark: '',
    status: 'DRAFT'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [studentsData, subjectsData, examSessionsData] = await Promise.all([
        StudentService.getStudents({ page_size: 1000 }),
        SubjectService.getSubjects({ is_active: true }),
        resultSettingsService.getExamSessions(),
      ]);

      // Transform students data to match our interface with proper error handling
      const transformedStudents: Student[] = [];
      if (studentsData && (studentsData.results || Array.isArray(studentsData))) {
        const studentsArray = studentsData.results || studentsData;
        transformedStudents.push(...studentsArray.map((student: any) => ({
          id: student.id?.toString() || '',
          full_name: student.full_name || student.user?.first_name + ' ' + student.user?.last_name || 'Unknown',
          student_class: student.student_class || 'N/A',
          education_level: student.education_level || 'UNKNOWN'
        })));
      }

      // Transform subjects data to match our interface with proper error handling
      const transformedSubjects: Subject[] = [];
      if (subjectsData && (subjectsData.results || Array.isArray(subjectsData))) {
        const subjectsArray = subjectsData.results || subjectsData;
        transformedSubjects.push(...subjectsArray.map((subject: any) => ({
          id: subject.id?.toString() || '',
          name: subject.name || 'Unknown Subject',
          code: subject.code || 'N/A',
          education_levels: subject.education_levels || []
        })));
      }

      const safeExamSessions = Array.isArray(examSessionsData) ? examSessionsData : [];

      setStudents(transformedStudents);
      setSubjects(transformedSubjects);
      setFilteredSubjects(transformedSubjects);
      setExamSessions(safeExamSessions);
      
    } catch (error) {
      console.error('Error loading data:', error);
      
      // Set empty arrays as fallback to prevent undefined errors
      setStudents([]);
      setSubjects([]);
      setExamSessions([]);
      toast.error('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filterSubjectsByEducationLevel = (educationLevel: string): Subject[] =>
    subjects.filter(s => s.education_levels?.includes(educationLevel));

  const handleSubmit = async () => {
    if (!formData.student || !formData.subject || !formData.exam_session) {
      toast.error('Please fill in student, subject, and exam session');
      return;
    }
    if (levelComponents.length === 0) {
      toast.error('No assessment components found for this education level');
      return;
    }

    // Validate each entered score against its component max_score
    for (const comp of levelComponents) {
      const raw = componentScores[comp.id];
      if (raw === undefined || raw === '') continue;
      const n = parseFloat(raw);
      if (isNaN(n) || n < 0) {
        toast.error(`"${comp.name}" score must be a non-negative number`);
        return;
      }
      if (n > parseFloat(comp.max_score)) {
        toast.error(`"${comp.name}" score cannot exceed ${comp.max_score}`);
        return;
      }
    }

    const scores = levelComponents
      .filter(c => componentScores[c.id] !== undefined && componentScores[c.id] !== '')
      .map(c => ({ component_id: c.id, score: parseFloat(componentScores[c.id]) }));

    if (scores.length === 0) {
      toast.error('Enter at least one score');
      return;
    }

    try {
      setSaving(true);
      const level = formData.education_level as EducationLevelType;
      await ResultService.bulkRecordComponentScores(level, [{
        student:      formData.student,
        subject:      Number(formData.subject),
        exam_session: formData.exam_session,
        scores,
      }]);
      toast.success('Result recorded successfully');
      setShowForm(false);
      resetForm();
      onResultAdded?.();
      onClose?.();
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'Failed to save result';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ student: '', subject: '', exam_session: '', education_level: '', teacher_remark: '', status: 'DRAFT' });
    setComponentScores({});
    setLevelComponents([]);
    setFilteredSubjects(subjects);
  };

  const handleStudentSelect = async (student: Student) => {
    setFilteredSubjects(filterSubjectsByEducationLevel(student.education_level));
    setFormData({ student: student.id, education_level: student.education_level, subject: '', exam_session: '', teacher_remark: '', status: 'DRAFT' });
    setComponentScores({});
    // Load components for this education level
    try {
      const all = await ResultService.getAssessmentComponents({ is_active: true, page_size: 50 });
      const filtered = (all as any[]).filter(
        (c: any) => !c.education_level_detail?.level_type ||
                    c.education_level_detail?.level_type === student.education_level
      ).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
      setLevelComponents(filtered);
    } catch {
      setLevelComponents([]);
    }
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-lg text-gray-700 font-medium">Loading Result Recording System...</p>
          <p className="text-sm text-gray-500 mt-2">Fetching students, subjects, and assessment data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-3 rounded-xl">
                <FileText className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Enhanced Result Recording</h1>
                <p className="text-gray-600 mt-1">
                  Record and manage student results across all education levels
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all duration-200 flex items-center space-x-2 font-medium"
            >
              <Plus className="h-5 w-5" />
              <span>Record New Result</span>
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Students</p>
                <p className="text-2xl font-bold text-gray-900">{students.length}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Available Subjects</p>
                <p className="text-2xl font-bold text-gray-900">{subjects.length}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <BookOpen className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Exam Sessions</p>
                <p className="text-2xl font-bold text-gray-900">{examSessions.length}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <Calculator className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Assessment Types</p>
                <p className="text-2xl font-bold text-gray-900">{assessmentTypes.length}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg">
                <FileText className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Students List */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-white/20 p-3 rounded-xl">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Students</h2>
                  <p className="text-green-100 text-sm">Select a student to record results</p>
                </div>
              </div>
              <span className="bg-white/20 text-white text-sm font-medium px-3 py-1 rounded-full">
                {students.length} Students
              </span>
            </div>
          </div>
          
          <div className="p-6">
            {students.length === 0 ? (
              <div className="text-center py-12">
                <div className="bg-gray-100 rounded-full p-6 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <Users className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Found</h3>
                <p className="text-gray-600 mb-6">No students are currently registered in the system</p>
                <button
                  onClick={loadData}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all duration-200 flex items-center space-x-2 mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  <span>Refresh Data</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {students.map((student) => (
                  <div key={student.id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all duration-200">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900">{student.full_name}</h3>
                      <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                        {student.student_class}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex justify-between">
                        <span>Level:</span>
                        <span className="font-medium">{student.education_level.replace('_', ' ')}</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleStudentSelect(student)}
                      className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                    >
                      Record Result
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Result Recording Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-white/20 p-3 rounded-xl">
                    <FileText className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Record Student Result</h3>
                    <p className="text-blue-100 text-sm">Enter detailed result information</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-all duration-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-8">
              <div className="space-y-6">
                {/* Basic Information */}
                <div className="bg-blue-50 rounded-xl p-6">
                  <h4 className="text-lg font-semibold text-blue-900 mb-4">Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                      <select
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select Subject</option>
                        {filteredSubjects.map(subject => (
                          <option key={subject.id} value={subject.id}>{subject.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Exam Session</label>
                      <select
                        value={formData.exam_session}
                        onChange={(e) => setFormData({ ...formData, exam_session: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select Exam Session</option>
                        {examSessions.map(session => (
                          <option key={session.id} value={session.id}>{session.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Score Entry — driven by AssessmentComponent records, fully tenant-agnostic */}
                {formData.education_level && (
                  <div className="bg-green-50 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-green-900 mb-4">
                      Assessment Scores — {formData.education_level.replace(/_/g, ' ')}
                    </h4>

                    {levelComponents.length === 0 ? (
                      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                        No active assessment components found for this education level.
                        Configure them in <strong>Exams &amp; Results → Assessment Components</strong>.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {levelComponents.map((comp: any) => (
                          <div key={comp.id}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {comp.name}
                              <span className="ml-1 text-gray-400 font-normal">(max {comp.max_score})</span>
                              {comp.contributes_to_ca && (
                                <span className="ml-2 text-xs text-indigo-600 font-medium">CA</span>
                              )}
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={parseFloat(comp.max_score)}
                              step="0.5"
                              value={componentScores[comp.id] ?? ''}
                              onChange={e =>
                                setComponentScores(prev => ({ ...prev, [comp.id]: e.target.value }))
                              }
                              placeholder={`0–${comp.max_score}`}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Teacher Remarks */}
                <div className="bg-purple-50 rounded-xl p-6">
                  <h4 className="text-lg font-semibold text-purple-900 mb-4">Teacher Remarks</h4>
                  <textarea
                    value={formData.teacher_remark}
                    onChange={(e) => setFormData({ ...formData, teacher_remark: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter teacher's remarks about the student's performance..."
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                    className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={saving || !formData.student || !formData.subject || !formData.exam_session}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center space-x-2"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Save Result</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedResultRecording;
