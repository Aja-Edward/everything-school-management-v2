import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import ResultService from '@/services/ResultService';
import ResultSettingsService from '@/services/ResultSettingsService';
import GradingService from '@/services/GradingService'
import { toast } from 'react-toastify';
import { ExamSessionInfo } from '@/types/types';
import { 
  X, 
  Save, 
  User,
  FileText,
  GraduationCap,
  Users,
  TrendingUp,
  BarChart3
} from 'lucide-react';

interface Student {
  id: number;
  full_name: string;
  registration_number: string;
  profile_picture?: string;
  classroom: {
    id: number;
    name: string;
    grade_level: string;
    section: string;
  };
}

interface Subject {
  id: number;
  name: string;
  code: string;
}

interface TeacherAssignment {
  id: number;
  classroom_name: string;
  section_name: string;
  grade_level_name: string;
  education_level: string;
  subject_name: string;
  subject_code: string;
  subject_id: number;
  grade_level_id: number;
  section_id: number;
  student_count: number;
  periods_per_week: number;
}

interface ClassOption {
  id: number;
  name: string;
  section_name: string;
  grade_level_name: string;
  education_level: string;
  student_count: number;
}

interface AssessmentScores {
  test1?: number | string;
  test2?: number | string;
  test3?: number | string;
  exam?: number | string;
  ca_score?: number | string;
  take_home_marks?: number | string;
  take_home_test?: number | string;
  appearance_marks?: number | string;
  practical_marks?: number | string;
  project_marks?: number | string;
  note_copying_marks?: number | string;
  ca_total?: number | string;
  exam_score?: number | string;
  max_marks?: number | string;
  max_marks_obtainable?: number | string;
  mark_obtained?: number | string;
  total?: number | string;
  position?: number | string;
  grade?: string;
  remarks?: string;
  teacher_remark?: string;
  academic_comment?: string;
}

interface ClassStatistics {
  class_average?: number;
  highest_in_class?: number;
  lowest_in_class?: number;
  class_position?: number;
  total_students?: number;
}

interface PhysicalDevelopment {
  height_beginning?: number;
  height_end?: number;
  weight_beginning?: number;
  weight_end?: number;
  nurse_comment?: string;
}

interface ResultRecordingFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => Promise<void>;
  onResultCreated: () => void;
  editResult?: any;
  mode?: 'create' | 'edit';
}

const getAssessmentStructure = (educationLevel: string, scoringConfig?: any) => {
  const level = (educationLevel || '')
    .toString()
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();

  if (scoringConfig) {
    const upperLevel = (educationLevel || '')
      .toString()
      .replace(/\s+/g, '_')
      .toUpperCase();

    if (upperLevel === 'SENIOR_SECONDARY') {
      return {
        type: 'senior',
        fields: ['test1', 'test2', 'test3', 'exam'],
        labels: [
          `1st Test (${Number(scoringConfig.first_test_max_score) || 10})`,
          `2nd Test (${Number(scoringConfig.second_test_max_score) || 10})`,
          `3rd Test (${Number(scoringConfig.third_test_max_score) || 10})`,
          `Exam (${Number(scoringConfig.exam_max_score) || 70})`
        ],
        maxValues: [
          Number(scoringConfig.first_test_max_score) || 10,
          Number(scoringConfig.second_test_max_score) || 10,
          Number(scoringConfig.third_test_max_score) || 10,
          Number(scoringConfig.exam_max_score) || 70
        ],
        showPhysicalDevelopment: false,
        showClassStatistics: true
      };
    }

    if (upperLevel === 'PRIMARY' || upperLevel === 'JUNIOR_SECONDARY') {
      return {
        type: upperLevel === 'PRIMARY' ? 'primary' : 'junior',
        fields: [
          'ca_score',
          'take_home_marks',
          'appearance_marks',
          'practical_marks',
          'project_marks',
          'note_copying_marks',
          'ca_total',
          'exam_score'
        ],
        labels: [
          `C.A (${Number(scoringConfig.continuous_assessment_max_score) || 15})`,
          `Take Home Test (${Number(scoringConfig.take_home_test_max_score) || 5})`,
          `Appearance (${Number(scoringConfig.appearance_max_score) || 5})`,
          `Practical (${Number(scoringConfig.practical_max_score) || 5})`,
          `Project (${Number(scoringConfig.project_max_score) || 5})`,
          `Note Copying (${Number(scoringConfig.note_copying_max_score) || 5})`,
          `C.A Total (${Number(scoringConfig.total_ca_max_score) || 40})`,
          `Exam (${Number(scoringConfig.exam_max_score) || 60})`
        ],
        maxValues: [
          Number(scoringConfig.continuous_assessment_max_score) || 15,
          Number(scoringConfig.take_home_test_max_score) || 5,
          Number(scoringConfig.appearance_max_score) || 5,
          Number(scoringConfig.practical_max_score) || 5,
          Number(scoringConfig.project_max_score) || 5,
          Number(scoringConfig.note_copying_max_score) || 5,
          Number(scoringConfig.total_ca_max_score) || 40,
          Number(scoringConfig.exam_max_score) || 60
        ],
        showPhysicalDevelopment: true,
        showClassStatistics: true
      };
    }

    if (upperLevel === 'NURSERY') {
  const totalMax = Number(scoringConfig.total_max_score) || 100;
  return {
    type: 'nursery',
    fields: ['max_marks_obtainable', 'mark_obtained'],
    labels: [`Max Marks Obtainable (${totalMax})`, 'Mark Obtained'],
    maxValues: [totalMax, totalMax],
    showPhysicalDevelopment: true,
    showClassStatistics: false
  };
}
  }

  switch (level) {
    case 'nursery':
  return {
    type: 'nursery',
    fields: ['max_marks_obtainable', 'mark_obtained'],
    labels: ['Max Marks Obtainable (100)', 'Mark Obtained'],
    maxValues: [100, 100],
    showPhysicalDevelopment: true,
    showClassStatistics: false
  };
    case 'primary':
      return {
        type: 'primary',
        fields: ['ca_score', 'take_home_marks', 'appearance_marks', 'practical_marks', 'project_marks', 'note_copying_marks', 'ca_total', 'exam_score'],
        labels: ['C.A (15)', 'Take Home Test (5)', 'Appearance (5)', 'Practical (5)', 'Project (5)', 'Note Copying (5)', 'C.A Total (40)', 'Exam (60)'],
        maxValues: [15, 5, 5, 5, 5, 5, 40, 60],
        showPhysicalDevelopment: true,
        showClassStatistics: true
      };
    case 'junior secondary':
      return {
        type: 'junior',
        fields: ['ca_score', 'take_home_marks', 'appearance_marks', 'practical_marks', 'project_marks', 'note_copying_marks', 'ca_total', 'exam_score'],
        labels: ['C.A (15)', 'Take Home Test (5)', 'Appearance (5)', 'Practical (5)', 'Project (5)', 'Note Copying (5)', 'C.A Total (40)', 'Exam (60)'],
        maxValues: [15, 5, 5, 5, 5, 5, 40, 60],
        showPhysicalDevelopment: true,
        showClassStatistics: true
      };
    case 'senior secondary':
      return {
        type: 'senior',
        fields: ['test1', 'test2', 'test3', 'exam'],
        labels: ['1st Test (10)', '2nd Test (10)', '3rd Test (10)', 'Exam (70)'],
        maxValues: [10, 10, 10, 70],
        showPhysicalDevelopment: false,
        showClassStatistics: true
      };
    default:
      return {
        type: 'default',
        fields: ['ca_score', 'exam_score'],
        labels: ['CA Score (30)', 'Exam Score (70)'],
        maxValues: [30, 70],
        showPhysicalDevelopment: false,
        showClassStatistics: false
      };
  }
};

const calculateTotalScore = (scores: AssessmentScores, educationLevel: string) => {
  const structure = getAssessmentStructure(educationLevel);
  
  switch (structure.type) {
    case 'nursery':
      return parseFloat(scores.mark_obtained?.toString() || '0');
    case 'primary':
    case 'junior':
      const caTotal = parseFloat(scores.ca_total?.toString() || '0');
      const exam = parseFloat(scores.exam_score?.toString() || '0');
      return caTotal + exam;
    case 'senior':
      const test1 = parseFloat(scores.test1?.toString() || '0');
      const test2 = parseFloat(scores.test2?.toString() || '0');
      const test3 = parseFloat(scores.test3?.toString() || '0');
      const seniorExam = parseFloat(scores.exam?.toString() || '0');
      return test1 + test2 + test3 + seniorExam;
    default:
      const ca = parseFloat(scores.ca_score?.toString() || '0');
      const defaultExam = parseFloat(scores.exam_score?.toString() || '0');
      return ca + defaultExam;
  }
};

const ResultRecordingForm = ({
  isOpen,
  onClose,
  onResultCreated,
  editResult
}: ResultRecordingFormProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [selectedEducationLevel, setSelectedEducationLevel] = useState<string>('');
  const [gradingSystems, setGradingSystems] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examSessions, setExamSessions] = useState<ExamSessionInfo[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [gradingSystemId, setGradingSystemId] = useState<number | null>(null);
  const [scoringConfigs, setScoringConfigs] = useState<any[]>([]);
  const [activeScoringConfig, setActiveScoringConfig] = useState<any | null>(null);

  const normalizeEducationLevelForApi = (level: string) =>
    (level || '')
      .toString()
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase();
  
  const [formData, setFormData] = useState({
    student: '',
    subject: '',
    exam_session: '',
    status: 'DRAFT'
  });

  const [assessmentScores, setAssessmentScores] = useState<AssessmentScores>({});
  const [classStatistics, setClassStatistics] = useState<ClassStatistics>({});
  const [physicalDevelopment, setPhysicalDevelopment] = useState<PhysicalDevelopment>({});

  const [bulkResults, setBulkResults] = useState<Array<{
    student_id: number;
    student_name: string;
    assessment_scores: AssessmentScores;
    class_statistics?: ClassStatistics;
    physical_development?: PhysicalDevelopment;
  }>>([]);

  const [currentTeacherId, setCurrentTeacherId] = useState<number | null>(null);

  const recomputeClassStats = () => {
    try {
      const totals: number[] = [];
      bulkResults.forEach((r) => {
        const t = calculateTotalScore(r.assessment_scores, selectedEducationLevel);
        if (!isNaN(t) && t >= 0) totals.push(t);
      });
      
      const singleSelected = formData.student && formData.student !== '';
      const singleTotal = calculateTotalScore(assessmentScores, selectedEducationLevel);
      if (singleSelected && singleTotal >= 0) totals.push(singleTotal);
      
      if (totals.length === 0) {
        setClassStatistics({});
        return;
      }
      
      const sum = totals.reduce((a, b) => a + b, 0);
      const avg = parseFloat((sum / totals.length).toFixed(2));
      const high = Math.max(...totals);
      const low = Math.min(...totals);
      
      let position: number | undefined = undefined;
      if (singleSelected) {
        const sorted = [...totals].sort((a, b) => b - a);
        position = sorted.indexOf(singleTotal) + 1;
      }
      
      setClassStatistics((prev) => ({
        ...prev,
        class_average: avg,
        highest_in_class: high,
        lowest_in_class: low,
        class_position: position,
        total_students: totals.length,
      }));
    } catch (e) {
      console.error('Error computing class stats:', e);
    }
  };

  useEffect(() => {
    if (editResult) {
      console.log('🔍 EDIT MODE ACTIVATED');
      console.log('   editResult:', editResult);
    }
  }, [editResult]);

  const handleClassChange = async (classId: string, isEditMode = false) => {
    if (!classId || !currentTeacherId) return;

    try {
      const studentsData = await TeacherDashboardService.getStudentsForClass(parseInt(classId));
      setFilteredStudents(studentsData);
      
      if (!isEditMode) {
        setTimeout(recomputeClassStats, 0);

        const initialBulkResults = studentsData.map((student: Student) => ({
          student_id: student.id,
          student_name: student.full_name,
          assessment_scores: {},
          class_statistics: {},
          physical_development: {}
        }));
        setBulkResults(initialBulkResults);

        setAssessmentScores({});
        setClassStatistics({});
        setPhysicalDevelopment({});
      }
    } catch (error) {
      console.error('Error loading students:', error);
      toast.error('Failed to load students');
    }
  };

  const handleSubjectChange = async (subjectId: string, isEditMode = false) => {
    if (!subjectId || !currentTeacherId) return;

    try {
      const subjectAssignments = teacherAssignments.filter(a => a.subject_id === parseInt(subjectId));
      
      if (subjectAssignments.length === 0) return;

      const normalizedLevel = (subjectAssignments[0].education_level || '')
        .toString()
        .replace(/_/g, ' ')
        .toLowerCase()
        .trim();
      setSelectedEducationLevel(normalizedLevel);

      const upperLevel = (subjectAssignments[0].education_level || '')
        .toString()
        .replace(/\s+/g, '_')
        .toUpperCase();
      const configForLevel = scoringConfigs.find((c: any) => c.education_level === upperLevel && (c.is_default || c.is_active));
      setActiveScoringConfig(configForLevel || null);

      const classOptions: ClassOption[] = subjectAssignments.map(assignment => ({
        id: assignment.section_id,
        name: assignment.classroom_name,
        section_name: assignment.section_name,
        grade_level_name: assignment.grade_level_name,
        education_level: normalizedLevel,
        student_count: assignment.student_count
      }));

      setAvailableClasses(classOptions);
      
      if (!isEditMode) {
        setSelectedClass('');
        setFilteredStudents([]);
        setBulkResults([]);
        setAssessmentScores({});
        setClassStatistics({});
        setPhysicalDevelopment({});
      }
    } catch (error) {
      console.error('Error loading subject data:', error);
      toast.error('Failed to load subject data');
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTeacherData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (editResult && teacherAssignments.length > 0 && currentTeacherId) {
      setupEditResult();
    }
  }, [editResult, teacherAssignments, currentTeacherId]);

  const setupEditResult = async () => {
    try {
      console.log('📝 Edit Result Data:', editResult);
      
      const studentId = (editResult.student?.id ?? editResult.student_id ?? editResult.student)?.toString();
      const subjectId = (editResult.subject?.id ?? editResult.subject_id ?? editResult.subject)?.toString();
      const examSessionId = (editResult.exam_session?.id ?? editResult.exam_session_id ?? editResult.exam_session)?.toString();
      

      setFormData({
        student: studentId,
        subject: subjectId,
        exam_session: examSessionId,
        status: editResult.status || 'DRAFT'
      });
      
      let normalizedLevel = '';
      if (subjectId) {
        const subjectAssignments = teacherAssignments.filter(a => a.subject_id === parseInt(subjectId));
        
        if (subjectAssignments.length > 0) {
          normalizedLevel = (subjectAssignments[0].education_level || '')
            .toString()
            .replace(/_/g, ' ')
            .toLowerCase()
            .trim();
          setSelectedEducationLevel(normalizedLevel);
          
          const upperLevel = (subjectAssignments[0].education_level || '')
            .toString()
            .replace(/\s+/g, '_')
            .toUpperCase();
          const configForLevel = scoringConfigs.find((c: any) => c.education_level === upperLevel && (c.is_default || c.is_active));
          setActiveScoringConfig(configForLevel || null);
          
          const classOptions = subjectAssignments.map(assignment => ({
            id: assignment.section_id,
            name: assignment.classroom_name,
            section_name: assignment.section_name,
            grade_level_name: assignment.grade_level_name,
            education_level: normalizedLevel,
            student_count: assignment.student_count
          }));
          
          setAvailableClasses(classOptions);
          
          if (studentId) {
            try {
              const studentClassPromises = classOptions.map(async (classOption) => {
                try {
                  const classStudents = await TeacherDashboardService.getStudentsForClass(classOption.id);
                  const studentExists = classStudents.find((s: Student) => s.id.toString() === studentId);
                  return studentExists ? classOption : null;
                } catch {
                  return null;
                }
              });
              
              const results = await Promise.all(studentClassPromises);
              const studentClass = results.find(result => result !== null);
              
              if (studentClass) {
                const classId = studentClass.id.toString();
                setSelectedClass(classId);
                
                const studentsData = await TeacherDashboardService.getStudentsForClass(studentClass.id);
                setFilteredStudents(studentsData);
              }
            } catch (error) {
              console.error('Error finding student class:', error);
            }
          }
        }
      }
      
      const educationLevel = String(normalizedLevel || '').toUpperCase();
      
      const extractedRemarks = 
        editResult.teacher_remark || 
        editResult.remarks || 
        editResult.comment || 
        editResult.teacher_comment || 
        editResult.remark ||
        '';
      
      console.log('📝 Education level:', educationLevel);
      
      if (educationLevel.includes('SENIOR')) {
        setAssessmentScores({
          test1: (editResult.first_test_score ?? editResult.test1 ?? 0).toString(),
          test2: (editResult.second_test_score ?? editResult.test2 ?? 0).toString(), 
          test3: (editResult.third_test_score ?? editResult.test3 ?? 0).toString(),
          exam: (editResult.exam_score ?? editResult.exam ?? 0).toString(),
          remarks: extractedRemarks
        });
      } else if (educationLevel.includes('NURSERY')) {
  setAssessmentScores({
    max_marks_obtainable: (editResult.max_marks_obtainable ?? editResult.max_marks ?? 100).toString(),
    mark_obtained: (editResult.mark_obtained ?? editResult.total_score ?? editResult.ca_score ?? 0).toString(),
    remarks: extractedRemarks,
    teacher_remark: editResult.teacher_remark ?? extractedRemarks
  });
      } else if (educationLevel.includes('PRIMARY') || educationLevel.includes('JUNIOR')) {
        setAssessmentScores({
          ca_score: (editResult.continuous_assessment_score ?? editResult.ca_score ?? 0).toString(),
          take_home_marks: (editResult.take_home_test_score ?? editResult.take_home_marks ?? 0).toString(),
          appearance_marks: (editResult.appearance_score ?? editResult.appearance_marks ?? 0).toString(),
          practical_marks: (editResult.practical_score ?? editResult.practical_marks ?? 0).toString(),
          project_marks: (editResult.project_score ?? editResult.project_marks ?? 0).toString(),
          note_copying_marks: (editResult.note_copying_score ?? editResult.note_copying_marks ?? 0).toString(),
          ca_total: (editResult.total_ca_score ?? editResult.ca_total ?? 0).toString(),
          exam_score: (editResult.exam_score ?? editResult.exam ?? 0).toString(),
          remarks: extractedRemarks,
          teacher_remark: editResult.teacher_remark ?? extractedRemarks
        });
        
        if (editResult.physical_development || editResult.height_beginning) {
          setPhysicalDevelopment({
            height_beginning: editResult.physical_development?.height_beginning ?? editResult.height_beginning ?? 0,
            height_end: editResult.physical_development?.height_end ?? editResult.height_end ?? 0,
            weight_beginning: editResult.physical_development?.weight_beginning ?? editResult.weight_beginning ?? 0,
            weight_end: editResult.physical_development?.weight_end ?? editResult.weight_end ?? 0,
            nurse_comment: editResult.physical_development?.nurse_comment ?? editResult.nurse_comment ?? ''
          });
        }
      } else {
        setAssessmentScores({
          ca_score: (editResult.ca_score ?? editResult.continuous_assessment_score ?? 0).toString(),
          exam_score: (editResult.exam_score ?? editResult.exam ?? 0).toString(),
          remarks: extractedRemarks,
          teacher_remark: editResult.teacher_remark ?? extractedRemarks
        });
      }
      
      if (editResult.class_statistics || editResult.class_average) {
        setClassStatistics({
          class_average: editResult.class_statistics?.class_average ?? editResult.class_average ?? 0,
          highest_in_class: editResult.class_statistics?.highest_in_class ?? editResult.highest_in_class ?? 0,
          lowest_in_class: editResult.class_statistics?.lowest_in_class ?? editResult.lowest_in_class ?? 0,
          class_position: editResult.class_statistics?.class_position ?? editResult.class_position ?? editResult.position ?? 0,
          total_students: editResult.class_statistics?.total_students ?? editResult.total_students ?? 0
        });
      }
    } catch (error) {
      console.error('Error setting up edit result:', error);
      toast.error('Failed to load edit data');
    }
  };

  useEffect(() => {
    if (formData.subject && availableClasses.length === 1 && !selectedClass && !editResult) {
      const onlyClass = availableClasses[0];
      setSelectedClass(String(onlyClass.id));
      setTimeout(() => handleClassChange(String(onlyClass.id)), 0);
    }
  }, [availableClasses, formData.subject, selectedClass, editResult]);

  const loadTeacherData = async () => {
    try {
      setLoading(true);
      
      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      if (!teacherId) {
        throw new Error('Teacher ID not found');
      }
      setCurrentTeacherId(teacherId);

      const subjects = await TeacherDashboardService.getTeacherSubjects(teacherId);
      
      const assignments: any[] = [];
      const uniqueSubjects: Subject[] = [];
      
      subjects.forEach(subject => {
        const existingSubject = uniqueSubjects.find(s => s.id === subject.id);
        if (!existingSubject) {
          uniqueSubjects.push({
            id: subject.id,
            name: subject.name,
            code: subject.code
          });
        }
        
        if (subject.assignments && Array.isArray(subject.assignments)) {
          subject.assignments.forEach((assignment: any) => {
            assignments.push({
              id: assignment.id,
              classroom_name: assignment.classroom_name || 'Unknown',
              section_name: assignment.section || 'Unknown',
              grade_level_name: assignment.grade_level || 'Unknown',
              education_level: assignment.education_level || 'Unknown',
              subject_name: subject.name,
              subject_code: subject.code,
              subject_id: subject.id,
              grade_level_id: assignment.grade_level_id,
              section_id: assignment.classroom_id,
              student_count: assignment.student_count || 0,
              periods_per_week: assignment.periods_per_week || 0
            });
          });
        }
      });
      
      setTeacherAssignments(assignments);
      setSubjects(uniqueSubjects);

      const sessionsResponse = await ResultService.getExamSessions();
      const sessions = Array.isArray(sessionsResponse) ? sessionsResponse : [];
      setExamSessions(sessions);
      
      try {
        const configsResponse = await ResultSettingsService.getScoringConfigurations();
        const configsArray = Array.isArray(configsResponse)
          ? configsResponse
          : ((configsResponse as any)?.results || (configsResponse as any)?.data || []);
        setScoringConfigs(configsArray || []);
      } catch (e) {
        console.warn('Could not load scoring configurations.', e);
        setScoringConfigs([]);
      }
      
     // FIXED CODE - Handle empty or undefined grading systems with detailed logging
try {
  console.log('🔍 Fetching grading systems from API...');
  const gradingSystemsResponse = await GradingService.getAll();
  console.log('📦 Raw API Response:', gradingSystemsResponse);
  console.log('📦 Response Type:', typeof gradingSystemsResponse);
  console.log('📦 Is Array?:', Array.isArray(gradingSystemsResponse));
  
  const gradingSystemsArray = Array.isArray(gradingSystemsResponse) ? gradingSystemsResponse : [];
  
  console.log('📊 Parsed Array:', gradingSystemsArray);
  console.log('📊 Array Length:', gradingSystemsArray.length);
  
  setGradingSystems(gradingSystemsArray);
  
  if (gradingSystemsArray.length > 0) {
    console.log('goodFound', gradingSystemsArray.length, 'grading system(s)');
    gradingSystemsArray.forEach((gs, index) => {
      console.log(`   ${index + 1}. ${gs.name} (ID: ${gs.id}, Active: ${gs.is_active})`);
    });
    
    // Find active grading system or use first one
    const activeSystem = gradingSystemsArray.find(gs => gs.is_active) || gradingSystemsArray[0];
    if (activeSystem?.id) {
      setGradingSystemId(activeSystem.id);
      console.log('goodUsing grading system:', activeSystem.name, 'ID:', activeSystem.id);
    }
  } else {
    console.warn('⚠️ API returned empty array - No grading systems found');
    console.warn('⚠️ Check: 1) API endpoint 2) Permissions 3) Database');
    toast.warning('No grading systems configured. Please contact administrator.');
  }
} catch (e: any) {
  console.error('❌ Failed to load grading systems');
  console.error('❌ Error details:', e);
  console.error('❌ Error message:', e.message);
  console.error('❌ Error response:', e.response?.data);
  console.error('❌ Error status:', e.response?.status);
  toast.error('Could not load grading systems. Results may not save correctly.');
  setGradingSystems([]);
}
    } finally {
      setLoading(false);
    }
  };

//   const handleSingleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
    
//     if (!validateSingleForm()) return;
    
//     try {
//       setSaving(true);
      
//       let gsId = gradingSystemId;
//       if (gsId == null) {
//         try {
//           const gradingSystems = await GradingService.getAll();
//           const activeSystem = gradingSystems.find(gs => gs.is_active) || gradingSystems[0];
//           if (activeSystem?.id) {
//       gsId = activeSystem.id;
//       setGradingSystemId(activeSystem.id);
//       console.log('goodUsing grading system:', activeSystem.name);
//     }
//        } catch (e) {
//     console.error('❌ Failed to fetch grading system on submit:', e);
//   }
// }
      
//       const totalScore = calculateTotalScore(assessmentScores, selectedEducationLevel);
//       const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
//       const education_level = normalizeEducationLevelForApi(selectedEducationLevel);
      
//       let resultData: any;
      
//       if (structure.type === 'senior') {
//         resultData = {
//           first_test_score: parseFloat(assessmentScores.test1?.toString() || '0'),
//           second_test_score: parseFloat(assessmentScores.test2?.toString() || '0'),
//           third_test_score: parseFloat(assessmentScores.test3?.toString() || '0'),
//           exam_score: parseFloat(assessmentScores.exam?.toString() || '0'),
//           teacher_remark: getAutomatedRemark(totalScore),
//           status: formData.status,
//           education_level,
//         };
        
//         if (!editResult) {
//           resultData.student = formData.student;
//           resultData.subject = formData.subject;
//           resultData.exam_session = formData.exam_session;
//           resultData.grading_system = gsId ?? undefined;
//         } else {
//           if (gsId) resultData.grading_system = gsId;
//         }
//       } else if (structure.type === 'nursery') {
//     resultData = {
//       max_marks_obtainable: parseFloat(assessmentScores.max_marks_obtainable?.toString() || '100'),
//       mark_obtained: parseFloat(assessmentScores.mark_obtained?.toString() || '0'),
//       academic_comment: getAutomatedRemark(totalScore),
//       status: formData.status,
//       education_level,
//     };
        
//         if (!editResult) {
//     resultData.student = formData.student;
//     resultData.subject = formData.subject;
//     resultData.exam_session = formData.exam_session;
//     resultData.grading_system = gsId ?? undefined;
//   } else {
//     if (gsId) resultData.grading_system = gsId;
//   }
// } else if (structure.type === 'primary' || structure.type === 'junior') {
//         // CRITICAL FIX: Include ALL individual CA fields
//         const caScore = parseFloat(assessmentScores.ca_score?.toString() || '0');
//         const takeHomeMarks = parseFloat(assessmentScores.take_home_marks?.toString() || '0');
//         const appearanceMarks = parseFloat(assessmentScores.appearance_marks?.toString() || '0');
//         const practicalMarks = parseFloat(assessmentScores.practical_marks?.toString() || '0');
//         const projectMarks = parseFloat(assessmentScores.project_marks?.toString() || '0');
//         const noteCopyingMarks = parseFloat(assessmentScores.note_copying_marks?.toString() || '0');
//         const caTotal = parseFloat(assessmentScores.ca_total?.toString() || '0');
//         const examScore = parseFloat(assessmentScores.exam_score?.toString() || '0');
        
//         resultData = {
//           // Individual CA components
//           continuous_assessment_score: caScore,
//           take_home_test_score: takeHomeMarks,
//           appearance_score: appearanceMarks,
//           practical_score: practicalMarks,
//           project_score: projectMarks,
//           note_copying_score: noteCopyingMarks,
//           // Totals
//           total_ca_score: caTotal,
//           ca_score: caTotal,
//           exam_score: examScore,
//           total_score: totalScore,
//           grade: getGrade(totalScore),
//           remarks: getAutomatedRemark(totalScore),
//           teacher_remark: getAutomatedRemark(totalScore),
//           status: formData.status,
//           education_level,
//           class_statistics: classStatistics,
//           physical_development: physicalDevelopment
//         };
        
//         if (!editResult) {
//           resultData.student = formData.student;
//           resultData.subject = formData.subject;
//           resultData.exam_session = formData.exam_session;
//           resultData.grading_system = gsId ?? undefined;
//         } else {
//           if (gsId) resultData.grading_system = gsId;
//         }
//       } else {
//         // Default structure
//         const caScore = parseFloat(assessmentScores.ca_score?.toString() || '0');
//         const examScore = parseFloat(assessmentScores.exam_score?.toString() || '0');
        
//         resultData = {
//           ca_score: caScore,
//           exam_score: examScore,
//           total_score: totalScore,
//           grade: getGrade(totalScore),
//           remarks: getAutomatedRemark(totalScore),
//           teacher_remark: getAutomatedRemark(totalScore),
//           status: formData.status,
//           education_level,
//         };
        
//         if (!editResult) {
//           resultData.student = formData.student;
//           resultData.subject = formData.subject;
//           resultData.exam_session = formData.exam_session;
//           resultData.grading_system = gsId ?? undefined;
//         } else {
//           if (gsId) resultData.grading_system = gsId;
//         }
//       }
      
//       console.log('💾 Submitting result data:', resultData);
      
//       if (editResult) {
//         const candidates = [
//           editResult?.id,
//           editResult?.pk,
//           editResult?.result_id,
//           editResult?.student_result_id,
//           editResult?.studentResultId,
//           editResult?.result?.id
//         ];
        
//         const numeric = candidates
//           .map((v) => (v !== null && v !== undefined ? Number(v) : NaN))
//           .find((n) => Number.isFinite(n) && n > 0);
//         const safeId = numeric ? String(numeric) : '';
        
//         let finalId = safeId;

//         if (!finalId) {
//           try {
//             const resolvedId = await ResultService.findResultIdByComposite({
//               student: formData.student,
//               subject: formData.subject,
//               exam_session: formData.exam_session,
//               education_level: education_level,
//             });
//             if (resolvedId) {
//               finalId = resolvedId;
//             }
//           } catch (e) {
//             console.warn('Composite id lookup failed', e);
//           }
//         }
        
//         if (!finalId) {
//           toast.error('Cannot update: missing result ID. Please refresh and try again.');
//           throw new Error('Invalid result id for update');
//         }
        
//         await ResultService.updateStudentResult(finalId, resultData, education_level);
//         toast.success('Result updated successfully!');
//       } else {
//         try {
//           await ResultService.createStudentResult(resultData, education_level);
//           toast.success('Result recorded successfully!');
//         } catch (error: any) {
//           console.error('Error creating result:', error);
          
//           if (error.response?.status === 400 && error.response?.data?.non_field_errors) {
//             const errorMessage = error.response.data.non_field_errors[0];
//             if (errorMessage.includes('unique')) {
//               toast.error('A result already exists for this student, subject, and exam session. Please edit the existing result instead.');
//               return;
//             }
//           }
          
//           const errorMessage = error.response?.data?.message || error.message || 'Failed to create result';
//           toast.error(errorMessage);
//           throw error;
//         }
//       }
      
//       onResultCreated();
//       onClose();
//     } catch (error) {
//       console.error('Error saving result:', error);
//     } finally {
//       setSaving(false);
//     }
//   };

const handleSingleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!validateSingleForm()) return;
  
  try {
    setSaving(true);
    
    let gsId = gradingSystemId;
    if (gsId == null) {
      try {
        const gradingSystems = await GradingService.getAll();
        const activeSystem = gradingSystems.find(gs => gs.is_active) || gradingSystems[0];
        if (activeSystem?.id) {
          gsId = activeSystem.id;
          setGradingSystemId(activeSystem.id);
          console.log('goodUsing grading system:', activeSystem.name);
        }
      } catch (e) {
        console.error('❌ Failed to fetch grading system on submit:', e);
      }
    }
    
    const totalScore = calculateTotalScore(assessmentScores, selectedEducationLevel);
    const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
    const education_level = normalizeEducationLevelForApi(selectedEducationLevel);
    
    let resultData: any;
    
    if (structure.type === 'senior') {
      resultData = {
        first_test_score: parseFloat(assessmentScores.test1?.toString() || '0'),
        second_test_score: parseFloat(assessmentScores.test2?.toString() || '0'),
        third_test_score: parseFloat(assessmentScores.test3?.toString() || '0'),
        exam_score: parseFloat(assessmentScores.exam?.toString() || '0'),
        teacher_remark: getAutomatedRemark(totalScore),
        status: formData.status,
        education_level,
        // goodFLAT class statistics fields
        class_average: classStatistics.class_average || 0,
        highest_in_class: classStatistics.highest_in_class || 0,
        lowest_in_class: classStatistics.lowest_in_class || 0,
        class_position: classStatistics.class_position || 0,
        total_students: classStatistics.total_students || 0,
      };
      
      if (!editResult) {
        resultData.student = formData.student;
        resultData.subject = formData.subject;
        resultData.exam_session = formData.exam_session;
        resultData.grading_system = gsId ?? undefined;
      } else {
        if (gsId) resultData.grading_system = gsId;
      }
    } else if (structure.type === 'nursery') {
      // goodCRITICAL: Nursery has NO total_score field - use mark_obtained only
      resultData = {
        max_marks_obtainable: parseFloat(assessmentScores.max_marks_obtainable?.toString() || '100'),
        mark_obtained: parseFloat(assessmentScores.mark_obtained?.toString() || '0'),
        academic_comment: assessmentScores.remarks || assessmentScores.teacher_remark || getAutomatedRemark(totalScore),
        status: formData.status,
        education_level,
      };
      
      if (!editResult) {
        resultData.student = formData.student;
        resultData.subject = formData.subject;
        resultData.exam_session = formData.exam_session;
        resultData.grading_system = gsId ?? undefined;
      } else {
        if (gsId) resultData.grading_system = gsId;
      }
    } else if (structure.type === 'primary' || structure.type === 'junior') {
      const caScore = parseFloat(assessmentScores.ca_score?.toString() || '0');
      const takeHomeMarks = parseFloat(assessmentScores.take_home_marks?.toString() || '0');
      const appearanceMarks = parseFloat(assessmentScores.appearance_marks?.toString() || '0');
      const practicalMarks = parseFloat(assessmentScores.practical_marks?.toString() || '0');
      const projectMarks = parseFloat(assessmentScores.project_marks?.toString() || '0');
      const noteCopyingMarks = parseFloat(assessmentScores.note_copying_marks?.toString() || '0');
      const caTotal = parseFloat(assessmentScores.ca_total?.toString() || '0');
      const examScore = parseFloat(assessmentScores.exam_score?.toString() || '0');
      
      resultData = {
        continuous_assessment_score: caScore,
        take_home_test_score: takeHomeMarks,
        appearance_score: appearanceMarks,
        practical_score: practicalMarks,
        project_score: projectMarks,
        note_copying_score: noteCopyingMarks,
        total_ca_score: caTotal,
        ca_score: caTotal,
        exam_score: examScore,
        total_score: totalScore,
        grade: getGrade(totalScore),
        remarks: getAutomatedRemark(totalScore),
        teacher_remark: getAutomatedRemark(totalScore),
        status: formData.status,
        education_level,
        // goodFLAT class statistics fields (NOT nested object)
        class_average: classStatistics.class_average || 0,
        highest_in_class: classStatistics.highest_in_class || 0,
        lowest_in_class: classStatistics.lowest_in_class || 0,
        class_position: classStatistics.class_position || 0,
        total_students: classStatistics.total_students || 0,
        physical_development: physicalDevelopment
      };
      
      if (!editResult) {
        resultData.student = formData.student;
        resultData.subject = formData.subject;
        resultData.exam_session = formData.exam_session;
        resultData.grading_system = gsId ?? undefined;
      } else {
        if (gsId) resultData.grading_system = gsId;
      }
    } else {
      const caScore = parseFloat(assessmentScores.ca_score?.toString() || '0');
      const examScore = parseFloat(assessmentScores.exam_score?.toString() || '0');
      
      resultData = {
        ca_score: caScore,
        exam_score: examScore,
        total_score: totalScore,
        grade: getGrade(totalScore),
        remarks: getAutomatedRemark(totalScore),
        teacher_remark: getAutomatedRemark(totalScore),
        status: formData.status,
        education_level,
        // goodFLAT class statistics fields
        class_average: classStatistics.class_average || 0,
        highest_in_class: classStatistics.highest_in_class || 0,
        lowest_in_class: classStatistics.lowest_in_class || 0,
        class_position: classStatistics.class_position || 0,
        total_students: classStatistics.total_students || 0,
      };
      
      if (!editResult) {
        resultData.student = formData.student;
        resultData.subject = formData.subject;
        resultData.exam_session = formData.exam_session;
        resultData.grading_system = gsId ?? undefined;
      } else {
        if (gsId) resultData.grading_system = gsId;
      }
    }
    
    console.log('💾 Submitting result data:', resultData);
    
    if (editResult) {
      const candidates = [
        editResult?.id,
        editResult?.pk,
        editResult?.result_id,
        editResult?.student_result_id,
        editResult?.studentResultId,
        editResult?.result?.id
      ];
      
      const numeric = candidates
        .map((v) => (v !== null && v !== undefined ? Number(v) : NaN))
        .find((n) => Number.isFinite(n) && n > 0);
      const safeId = numeric ? String(numeric) : '';
      
      let finalId = safeId;

      if (!finalId) {
        try {
          const resolvedId = await ResultService.findResultIdByComposite({
            student: formData.student,
            subject: formData.subject,
            exam_session: formData.exam_session,
            education_level: education_level,
          });
          if (resolvedId) {
            finalId = resolvedId;
          }
        } catch (e) {
          console.warn('Composite id lookup failed', e);
        }
      }
      
      if (!finalId) {
        toast.error('Cannot update: missing result ID. Please refresh and try again.');
        throw new Error('Invalid result id for update');
      }
      
      await ResultService.updateStudentResult(finalId, resultData, education_level);
      toast.success('Result updated successfully!');
    } else {
      try {
        await ResultService.createStudentResult(resultData, education_level);
        toast.success('Result recorded successfully!');
      } catch (error: any) {
        console.error('Error creating result:', error);
        
        if (error.response?.status === 400 && error.response?.data?.non_field_errors) {
          const errorMessage = error.response.data.non_field_errors[0];
          if (errorMessage.includes('unique')) {
            toast.error('A result already exists for this student, subject, and exam session. Please edit the existing result instead.');
            return;
          }
        }
        
        const errorMessage = error.response?.data?.message || error.message || 'Failed to create result';
        toast.error(errorMessage);
        throw error;
      }
    }
    
    onResultCreated();
    onClose();
  } catch (error) {
    console.error('Error saving result:', error);
  } finally {
    setSaving(false);
  }
};

 // FIXED: handleBulkSubmit with proper class_average handling

const handleBulkSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!validateBulkForm()) return;

  try {
    setSaving(true);
    
    const validResults = bulkResults.filter(result => {
      const total = calculateTotalScore(result.assessment_scores, selectedEducationLevel);
      return total > 0;
    });

    // goodCRITICAL: Ensure we have valid results before proceeding
    if (validResults.length === 0) {
      toast.error('Please enter scores for at least one student');
      return;
    }

    let gsId = gradingSystemId;
    if (gsId == null) {
      try {
        const gradingSystems = await GradingService.getAll();
        const activeSystem = gradingSystems.find(gs => gs.is_active) || gradingSystems[0];
        if (activeSystem?.id) {
          gsId = activeSystem.id;
          setGradingSystemId(activeSystem.id);
          console.log('goodUsing grading system:', activeSystem.name);
        }
      } catch (e) {
        console.error('❌ Failed to fetch grading system on submit:', e);
      }
    }

    // goodCalculate class statistics ONCE for all students with SAFE defaults
    const allTotals = validResults.map(r => 
      calculateTotalScore(r.assessment_scores, selectedEducationLevel)
    ).filter(t => !isNaN(t) && t >= 0); // Filter out invalid totals

    console.log('🔢 All totals calculated:', allTotals);
    console.log('🔢 Number of valid totals:', allTotals.length);

    // goodCRITICAL: Provide default values of 0 if calculations fail
    const sum = allTotals.length > 0 ? allTotals.reduce((a, b) => a + b, 0) : 0;
    let classAverage = allTotals.length > 0 ? parseFloat((sum / allTotals.length).toFixed(2)) : 0;
    let highestInClass = allTotals.length > 0 ? Math.max(...allTotals) : 0;
    let lowestInClass = allTotals.length > 0 ? Math.min(...allTotals) : 0;
    const sortedTotals = allTotals.length > 0 ? [...allTotals].sort((a, b) => b - a) : [0];

    // goodTRIPLE CHECK - ensure no NaN values
    classAverage = Number.isFinite(classAverage) ? classAverage : 0;
    highestInClass = Number.isFinite(highestInClass) ? highestInClass : 0;
    lowestInClass = Number.isFinite(lowestInClass) ? lowestInClass : 0;

    console.log('📊 Computed class statistics:', {
      classAverage,
      highestInClass,
      lowestInClass,
      totalStudents: allTotals.length,
      validResults: validResults.length
    });

    for (let i = 0; i < validResults.length; i++) {
      const result = validResults[i];
      const totalScore = calculateTotalScore(result.assessment_scores, selectedEducationLevel);
      const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
      const education_level = normalizeEducationLevelForApi(selectedEducationLevel);
      
      // goodCalculate position safely
      const position = sortedTotals.length > 0 ? sortedTotals.indexOf(totalScore) + 1 : 1;

      let resultData: any;
      
      if (structure.type === 'senior') {
        resultData = {
          student: result.student_id.toString(),
          subject: formData.subject,
          exam_session: formData.exam_session,
          grading_system: gsId ?? undefined,
          first_test_score: parseFloat(result.assessment_scores.test1?.toString() || '0'),
          second_test_score: parseFloat(result.assessment_scores.test2?.toString() || '0'),
          third_test_score: parseFloat(result.assessment_scores.test3?.toString() || '0'),
          exam_score: parseFloat(result.assessment_scores.exam?.toString() || '0'),
          teacher_remark: getAutomatedRemark(totalScore),
          status: 'DRAFT',
          education_level,
          // goodUse direct values (already validated as non-null/NaN above)
          class_average: classAverage,
          highest_in_class: highestInClass,
          lowest_in_class: lowestInClass,
          class_position: position,
          total_students: allTotals.length
        };
        
      } else if (structure.type === 'nursery') {
        resultData = {
          student: result.student_id.toString(),
          subject: formData.subject,
          exam_session: formData.exam_session,
          grading_system: gsId ?? undefined,
          max_marks_obtainable: parseFloat(result.assessment_scores.max_marks_obtainable?.toString() || '100'),
          mark_obtained: parseFloat(result.assessment_scores.mark_obtained?.toString() || '0'),
          academic_comment: getAutomatedRemark(totalScore),
          status: 'DRAFT',
          education_level,
        };
        
      } else if (structure.type === 'primary' || structure.type === 'junior') {
        const caScore = parseFloat(result.assessment_scores.ca_score?.toString() || '0');
        const takeHomeMarks = parseFloat(result.assessment_scores.take_home_marks?.toString() || '0');
        const appearanceMarks = parseFloat(result.assessment_scores.appearance_marks?.toString() || '0');
        const practicalMarks = parseFloat(result.assessment_scores.practical_marks?.toString() || '0');
        const projectMarks = parseFloat(result.assessment_scores.project_marks?.toString() || '0');
        const noteCopyingMarks = parseFloat(result.assessment_scores.note_copying_marks?.toString() || '0');
        const caTotal = parseFloat(result.assessment_scores.ca_total?.toString() || '0');
        const examScore = parseFloat(result.assessment_scores.exam_score?.toString() || '0');
        
        resultData = {
          student: result.student_id.toString(),
          subject: formData.subject,
          exam_session: formData.exam_session,
          grading_system: gsId ?? undefined,
          continuous_assessment_score: caScore,
          take_home_test_score: takeHomeMarks,
          appearance_score: appearanceMarks,
          practical_score: practicalMarks,
          project_score: projectMarks,
          note_copying_score: noteCopyingMarks,
          total_ca_score: caTotal,
          ca_score: caTotal,
          exam_score: examScore,
          total_score: totalScore,
          grade: getGrade(totalScore),
          remarks: getAutomatedRemark(totalScore),
          teacher_remark: getAutomatedRemark(totalScore),
          status: 'DRAFT',
          education_level,
          // goodUse direct values (already validated as non-null/NaN above)
          class_average: classAverage,
          highest_in_class: highestInClass,
          lowest_in_class: lowestInClass,
          class_position: position,
          total_students: allTotals.length,
          physical_development: result.physical_development || {}
        };
        
      } else {
        const caScore = parseFloat(result.assessment_scores.ca_score?.toString() || '0');
        const examScore = parseFloat(result.assessment_scores.exam_score?.toString() || '0');
        
        resultData = {
          student: result.student_id.toString(),
          subject: formData.subject,
          exam_session: formData.exam_session,
          grading_system: gsId ?? undefined,
          ca_score: caScore,
          exam_score: examScore,
          total_score: totalScore,
          grade: getGrade(totalScore),
          remarks: getAutomatedRemark(totalScore),
          teacher_remark: getAutomatedRemark(totalScore),
          status: 'DRAFT',
          education_level,
          // goodUse direct values (already validated as non-null/NaN above)
          class_average: classAverage,
          highest_in_class: highestInClass,
          lowest_in_class: lowestInClass,
          class_position: position,
          total_students: allTotals.length
        };
      }

      // goodCRITICAL DEBUG: Log EVERYTHING before sending
      console.log(`💾 Submitting result ${i + 1}/${validResults.length}`);
      console.log('📦 Complete resultData object:', JSON.stringify(resultData, null, 2));
      console.log('🔍 Class stats verification:', {
        class_average: resultData.class_average,
        class_average_type: typeof resultData.class_average,
        class_average_isNull: resultData.class_average === null,
        class_average_isUndefined: resultData.class_average === undefined,
        highest_in_class: resultData.highest_in_class,
        lowest_in_class: resultData.lowest_in_class,
        class_position: resultData.class_position,
        total_students: resultData.total_students
      });
      
      // goodFORCE check - if any are still null/undefined, use 0
      if (resultData.class_average === null || resultData.class_average === undefined || isNaN(resultData.class_average)) {
        console.error('⚠️ class_average is null/undefined/NaN! Forcing to 0');
        resultData.class_average = 0;
      }
      if (resultData.highest_in_class === null || resultData.highest_in_class === undefined || isNaN(resultData.highest_in_class)) {
        console.error('⚠️ highest_in_class is null/undefined/NaN! Forcing to 0');
        resultData.highest_in_class = 0;
      }
      if (resultData.lowest_in_class === null || resultData.lowest_in_class === undefined || isNaN(resultData.lowest_in_class)) {
        console.error('⚠️ lowest_in_class is null/undefined/NaN! Forcing to 0');
        resultData.lowest_in_class = 0;
      }
      
      console.log('📦 Final resultData after null check:', JSON.stringify(resultData, null, 2));
      
      await ResultService.createStudentResult(resultData, education_level);
    }

    toast.success(`${validResults.length} results recorded successfully!`);
    onResultCreated();
    onClose();
  } catch (error: any) {
    console.error('Error saving bulk results:', error);
    const errorDetails = error.response?.data?.error || error.message || 'Unknown error';
    console.error('❌ Detailed error:', errorDetails);
    toast.error(`Failed to save results: ${errorDetails}`);
  } finally {
    setSaving(false);
  }
};

  const validateSingleForm = () => {
    if (!formData.student) {
      toast.error('Please select a student');
      return false;
    }
    if (!formData.subject) {
      toast.error('Please select a subject');
      return false;
    }
    if (!selectedClass) {
      toast.error('Please select a class');
      return false;
    }
    if (!formData.exam_session) {
      toast.error('Please select an exam session');
      return false;
    }

    const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
    const totalScore = calculateTotalScore(assessmentScores, selectedEducationLevel);
    
    if (totalScore <= 0) {
      toast.error('Please enter at least one valid score');
      return false;
    }

    for (let i = 0; i < structure.fields.length; i++) {
      const field = structure.fields[i];
      const value = assessmentScores[field as keyof AssessmentScores];
      const maxValue = structure.maxValues[i];
      
      if (value && value !== '') {
        const numValue = parseFloat(value.toString());
        if (isNaN(numValue) || numValue < 0 || numValue > maxValue) {
          toast.error(`${structure.labels[i]} must be between 0 and ${maxValue}`);
          return false;
        }
      }
    }

    return true;
  };

  const validateBulkForm = () => {
    if (!formData.subject) {
      toast.error('Please select a subject');
      return false;
    }
    if (!selectedClass) {
      toast.error('Please select a class');
      return false;
    }
    if (!formData.exam_session) {
      toast.error('Please select an exam session');
      return false;
    }

    const validResults = bulkResults.filter(result => {
      const total = calculateTotalScore(result.assessment_scores, selectedEducationLevel);
      return total > 0;
    });

    if (validResults.length === 0) {
      toast.error('Please enter scores for at least one student');
      return false;
    }

    const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
    for (const result of validResults) {
      for (let i = 0; i < structure.fields.length; i++) {
        const field = structure.fields[i];
        const value = result.assessment_scores[field as keyof AssessmentScores];
        const maxValue = structure.maxValues[i];
        
        if (value && value !== '') {
          const numValue = parseFloat(value.toString());
          if (isNaN(numValue) || numValue < 0 || numValue > maxValue) {
            toast.error(`Invalid ${structure.labels[i]} for ${result.student_name}. Must be 0-${maxValue}`);
            return false;
          }
        }
      }
    }

    return true;
  };

  const updateBulkResult = (index: number, field: string, value: string) => {
    setBulkResults(prev => {
      const updated = prev.map((result, i) => {
        if (i === index) {
          const updatedScores = { ...result.assessment_scores, [field]: value };
          
          // Auto-calculate CA total for bulk entry
          const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
          if (structure.type === 'primary' || structure.type === 'junior') {
            const caScore = parseFloat(updatedScores.ca_score?.toString() || '0');
            const takeHome = parseFloat(updatedScores.take_home_marks?.toString() || '0');
            const appearance = parseFloat(updatedScores.appearance_marks?.toString() || '0');
            const practical = parseFloat(updatedScores.practical_marks?.toString() || '0');
            const project = parseFloat(updatedScores.project_marks?.toString() || '0');
            const noteCopying = parseFloat(updatedScores.note_copying_marks?.toString() || '0');
            
            updatedScores.ca_total = (caScore + takeHome + appearance + practical + project + noteCopying).toString();
          }
          
          return { ...result, assessment_scores: updatedScores };
        }
        return result;
      });
      
      setTimeout(recomputeClassStats, 0);
      return updated;
    });
  };

  const updateAssessmentScore = (field: keyof AssessmentScores, value: string) => {
    setAssessmentScores(prev => {
      const updated = { ...prev, [field]: value };
      
      // CRITICAL FIX: Auto-calculate CA total for PRIMARY and JUNIOR SECONDARY
      const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
      if (structure.type === 'primary' || structure.type === 'junior') {
        const caScore = parseFloat(updated.ca_score?.toString() || '0');
        const takeHome = parseFloat(updated.take_home_marks?.toString() || '0');
        const appearance = parseFloat(updated.appearance_marks?.toString() || '0');
        const practical = parseFloat(updated.practical_marks?.toString() || '0');
        const project = parseFloat(updated.project_marks?.toString() || '0');
        const noteCopying = parseFloat(updated.note_copying_marks?.toString() || '0');
        
        // Auto-calculate CA total
        const calculatedTotal = caScore + takeHome + appearance + practical + project + noteCopying;
        updated.ca_total = calculatedTotal.toString();
      }
      
      return updated;
    });
    setTimeout(recomputeClassStats, 0);
  };

  const updatePhysicalDevelopment = (field: keyof PhysicalDevelopment, value: string | number) => {
    setPhysicalDevelopment(prev => ({ ...prev, [field]: value }));
  };

  const getGrade = (total: number) => {
    if (total >= 70) return 'A';
    if (total >= 60) return 'B';
    if (total >= 50) return 'C';
    if (total >= 45) return 'D';
    if (total >= 39) return 'E';
    return 'F';
  };

  const getGradeColor = (grade: string) => {
    const gradeConfig = {
      'A': 'text-green-600 bg-green-100',
      'B': 'text-blue-600 bg-blue-100',
      'C': 'text-yellow-600 bg-yellow-100',
      'D': 'text-orange-600 bg-orange-100',
      'E': 'text-purple-600 bg-purple-100',
      'F': 'text-red-600 bg-red-100'
    };
    return gradeConfig[grade as keyof typeof gradeConfig] || 'text-gray-600 bg-gray-100';
  };

  const getAutomatedRemark = (total: number): string => {
  if (total >= 80) return 'Distinction';
  if (total >= 70) return 'Excellent';
  if (total >= 60) return 'Very Good';
  if (total >= 50) return 'Good';
  if (total >= 45) return 'Fair';
  if (total >= 39) return 'Poor';
  return 'Very Poor';
};

  const resetForm = () => {
    setFormData({
      student: '',
      subject: '',
      exam_session: '',
      status: 'DRAFT'
    });
    setAssessmentScores({});
    setClassStatistics({});
    setPhysicalDevelopment({});
    setBulkResults([]);
    setFilteredStudents([]);
    setSelectedEducationLevel('');
    setAvailableClasses([]);
    setSelectedClass('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const renderAssessmentFields = (scores: AssessmentScores, onUpdate: (field: keyof AssessmentScores, value: string) => void) => {
    const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
    
    return (
      <div className="space-y-4">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
          <BarChart3 className="w-5 h-5 mr-2" />
          Assessment Scores ({structure.type.toUpperCase()})
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {structure.fields.map((field, index) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {structure.labels[index]}
                {field === 'ca_total' && ' 🔄 Auto'}
              </label>
              <input
                type="number"
                min="0"
                max={structure.maxValues[index]}
                step="0.1"
                value={scores[field as keyof AssessmentScores] || ''}
                onChange={(e) => onUpdate(field as keyof AssessmentScores, e.target.value)}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white ${
                  field === 'ca_total' ? 'bg-gray-100 dark:bg-gray-600 cursor-not-allowed font-semibold' : ''
                }`}
                placeholder={field === 'ca_total' ? 'Auto-calculated' : `0-${structure.maxValues[index]}`}
                readOnly={field === 'ca_total'}
              />
            </div>
          ))}
        </div>
        
        {(() => {
          const total = calculateTotalScore(scores, selectedEducationLevel);
          return total > 0 ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Total Score:</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{total}</span>
              </div>
              <div className="mt-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getGradeColor(getGrade(total))}`}>
                  Grade: {getGrade(total)}
                </span>
              </div>
            </div>
          ) : null;
        })()}
      </div>
    );
  };

  const renderClassStatistics = (stats: ClassStatistics) => {
    const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
    if (!structure.showClassStatistics) return null;

    return (
      <div className="space-y-4">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
          <TrendingUp className="w-5 h-5 mr-2" />
          Class Statistics
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Class Average (auto)
            </label>
            <input
              type="number"
              value={stats.class_average || ''}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Highest in Class (auto)
            </label>
            <input
              type="number"
              value={stats.highest_in_class || ''}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Lowest in Class (auto)
            </label>
            <input
              type="number"
              value={stats.lowest_in_class || ''}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Class Position (auto)
            </label>
            <input
              type="number"
              value={stats.class_position || ''}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderPhysicalDevelopment = (physical: PhysicalDevelopment, onUpdate: (field: keyof PhysicalDevelopment, value: string | number) => void) => {
    const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
    if (!structure.showPhysicalDevelopment) return null;

    return (
      <div className="space-y-4">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
          <Users className="w-5 h-5 mr-2" />
          Physical Development
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Height (Beginning) - cm
            </label>
            <input
              type="number"
              min="0"
              value={physical.height_beginning || ''}
              onChange={(e) => onUpdate('height_beginning', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Height (End) - cm
            </label>
            <input
              type="number"
              min="0"
              value={physical.height_end || ''}
              onChange={(e) => onUpdate('height_end', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Weight (Beginning) - kg
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={physical.weight_beginning || ''}
              onChange={(e) => onUpdate('weight_beginning', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Weight (End) - kg
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={physical.weight_end || ''}
              onChange={(e) => onUpdate('weight_end', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nurse's Comment
            </label>
            <textarea
              value={physical.nurse_comment || ''}
              onChange={(e) => onUpdate('nurse_comment', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {editResult ? 'Edit Result' : 'Record Student Result'}
            </h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('single')}
                disabled={!!editResult}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'single'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                } ${editResult ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <User className="w-4 h-4 inline mr-2" />
                Single Result
              </button>
              <button
                onClick={() => setActiveTab('bulk')}
                disabled={!!editResult}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'bulk'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                } ${editResult ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <FileText className="w-4 h-4 inline mr-2" />
                Bulk Results
              </button>
            </nav>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {activeTab === 'single' && (
                <form onSubmit={handleSingleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Subject *
                      </label>
                      <select
                        value={formData.subject}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, subject: e.target.value, student: '' }));
                          handleSubjectChange(e.target.value, !!editResult);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        required
                        disabled={!!editResult}
                      >
                        <option value="">Select Subject</option>
                        {subjects.map(subject => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name} ({subject.code})
                          </option>
                        ))}
                      </select>
                      {editResult && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Cannot change subject for existing result
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Class *
                      </label>
                      <select
                        value={selectedClass}
                        onChange={(e) => {
                          setSelectedClass(e.target.value);
                          setFormData(prev => ({ ...prev, student: '' }));
                          handleClassChange(e.target.value);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        required
                        disabled={!!editResult || !formData.subject || availableClasses.length === 0}
                      >
                        <option value="">Select Class</option>
                        {availableClasses.map(classOption => (
                          <option key={classOption.id} value={classOption.id}>
                            {classOption.grade_level_name} {classOption.section_name} ({classOption.student_count} students)
                          </option>
                        ))}
                      </select>
                      {editResult && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Cannot change class for existing result
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Exam Session *
                      </label>
                      <select
                        value={formData.exam_session}
                        onChange={(e) => setFormData(prev => ({ ...prev, exam_session: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        required
                        disabled={!!editResult}
                      >
                        <option value="">Select Exam Session</option>
                        {examSessions.map(session => (
                          <option key={session.id} value={session.id}>
                            {session.academic_session?.name} - {session.term}
                          </option>
                        ))}
                      </select>
                      {editResult && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Cannot change exam session for existing result
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Student *
                      </label>
                      <select
                        value={formData.student}
                        onChange={(e) => setFormData(prev => ({ ...prev, student: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        required
                        disabled={!!editResult || !selectedClass || filteredStudents.length === 0}
                      >
                        <option value="">Select Student</option>
                        {filteredStudents.map(student => (
                          <option key={student.id} value={student.id}>
                            {student.full_name}
                          </option>
                        ))}
                      </select>
                      {editResult && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Cannot change student for existing result
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="PUBLISHED">Published</option>
                        <option value="APPROVED">Approved</option>
                      </select>
                      </div>
                
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Grading System *
                      </label>
                      <select
                          value={gradingSystemId || ''}
                          onChange={(e) => setGradingSystemId(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                          required
                        >
                        <option value="">Select Grading System</option>
                          {gradingSystems.map(gs => (
                          <option key={gs.id} value={gs.id}>
                          {gs.name} {gs.is_active && '(Active)'}
                        </option>
                      ))}
                      </select>
                    </div>
                  </div>

                  {selectedEducationLevel && (
                    <>
                      {renderAssessmentFields(assessmentScores, updateAssessmentScore)}
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Teacher's Remarks
                        </label>
                        <textarea
                          value={assessmentScores.remarks || ''}
                          onChange={(e) => updateAssessmentScore('remarks', e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                          placeholder="Enter remarks..."
                        />
                      </div>

                      {renderClassStatistics(classStatistics)}
                      {renderPhysicalDevelopment(physicalDevelopment, updatePhysicalDevelopment)}
                    </>
                  )}

                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {editResult ? 'Update Result' : 'Record Result'}
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'bulk' && (
                <form onSubmit={handleBulkSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Subject *
                      </label>
                      <select
                        value={formData.subject}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, subject: e.target.value }));
                          handleSubjectChange(e.target.value);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        required
                      >
                        <option value="">Select Subject</option>
                        {subjects.map(subject => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name} ({subject.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Class *
                      </label>
                      <select
                        value={selectedClass}
                        onChange={(e) => {
                          setSelectedClass(e.target.value);
                          handleClassChange(e.target.value);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        required
                        disabled={!formData.subject || availableClasses.length === 0}
                      >
                        <option value="">Select Class</option>
                        {availableClasses.map(classOption => (
                          <option key={classOption.id} value={classOption.id}>
                            {classOption.grade_level_name} {classOption.section_name} ({classOption.student_count} students)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Exam Session *
                      </label>
                      <select
                        value={formData.exam_session}
                        onChange={(e) => setFormData(prev => ({ ...prev, exam_session: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        required
                      >
                        <option value="">Select Exam Session</option>
                        {examSessions.map(session => (
                          <option key={session.id} value={session.id}>
                            {session.academic_session?.name} - {session.term}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Grading System *
                      </label>
                      <select
                          value={gradingSystemId || ''}
                          onChange={(e) => setGradingSystemId(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                          required
                        >
                        <option value="">Select Grading System</option>
                          {gradingSystems.map(gs => (
                          <option key={gs.id} value={gs.id}>
                          {gs.name} {gs.is_active && '(Active)'}
                        </option>
                      ))}
                      </select>
                    </div>
                  </div>

                  {bulkResults.length > 0 && selectedEducationLevel && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                        <GraduationCap className="w-5 h-5 mr-2" />
                        Enter Scores for Students ({getAssessmentStructure(selectedEducationLevel, activeScoringConfig).type.toUpperCase()})
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-600">
                              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Student
                              </th>
                              {getAssessmentStructure(selectedEducationLevel, activeScoringConfig).fields.map((field, index) => (
                                <th key={field} className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                  {getAssessmentStructure(selectedEducationLevel, activeScoringConfig).labels[index]}
                                </th>
                              ))}
                              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Total
                              </th>
                              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Grade
                              </th>
                              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Remarks
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkResults.map((result, index) => {
                              const total = calculateTotalScore(result.assessment_scores, selectedEducationLevel);
                              const grade = getGrade(total);
                              return (
                                <tr key={result.student_id} className="border-b border-gray-200 dark:border-gray-600">
                                  <td className="py-2 px-3 text-sm text-gray-900 dark:text-white">
                                    {result.student_name}
                                  </td>
                                  {getAssessmentStructure(selectedEducationLevel, activeScoringConfig).fields.map((field, fieldIndex) => (
                                    <td key={field} className="py-2 px-3">
                                      <input
                                        type="number"
                                        min="0"
                                        max={getAssessmentStructure(selectedEducationLevel, activeScoringConfig).maxValues[fieldIndex]}
                                        step="0.1"
                                        value={result.assessment_scores[field as keyof AssessmentScores] || ''}
                                        onChange={(e) => updateBulkResult(index, field, e.target.value)}
                                        className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                        placeholder="0"
                                      />
                                    </td>
                                  ))}
                                  <td className="py-2 px-3 text-sm font-medium text-gray-900 dark:text-white">
                                    {total > 0 ? total : '-'}
                                  </td>
                                  <td className="py-2 px-3">
                                    {total > 0 && (
                                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getGradeColor(grade)}`}>
                                        {grade}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3">
                                    <input
                                      type="text"
                                      value={result.assessment_scores.remarks || ''}
                                      onChange={(e) => updateBulkResult(index, 'remarks', e.target.value)}
                                      className="w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                      placeholder="Remarks"
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving || bulkResults.length === 0}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Record {bulkResults.filter(r => calculateTotalScore(r.assessment_scores, selectedEducationLevel) > 0).length} Results
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultRecordingForm;