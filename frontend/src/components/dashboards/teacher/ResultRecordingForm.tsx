import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import ResultService from '@/services/ResultService';
import type { AssessmentComponentInfo, BulkComponentScoreEntry } from '@/services/ResultService';
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
  BarChart3,
  Info,
  Lock,
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
          Number(scoringConfig.note_copying_max_score) || 5,
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

// ─── Helper: extract exam score from a result's component_scores array ────────
// Returns the score as a string, or '' if not found.
const extractExamScoreFromComponents = (result: any): string => {
  if (!result?.component_scores?.length) return '';
  const examComp = [...result.component_scores]
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .find((cs: any) => cs.component_type === 'EXAM');
  if (!examComp) return '';
  const val = parseFloat(examComp.score ?? '0');
  return val > 0 ? String(val) : '';
};

// ─── Helper: extract exam score from a result (components first, then flat fields) ─
const extractExamScoreFromResult = (result: any): string => {
  const fromComponents = extractExamScoreFromComponents(result);
  if (fromComponents) return fromComponents;
  // Fallback to flat fields
  const flat = result?.exam_score ?? result?.exam ?? null;
  if (flat === null || flat === undefined) return '';
  const val = parseFloat(String(flat));
  return val > 0 ? String(val) : '';
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
  const [existingResultsByStudentId, setExistingResultsByStudentId] = useState<Record<string, any>>({});
  const [assessmentComponents, setAssessmentComponents] = useState<AssessmentComponentInfo[]>([]);

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
    componentScores: Record<number, string>; // componentId → score string
    remarks?: string;
  }>>([]);

  const [currentTeacherId, setCurrentTeacherId] = useState<number | null>(null);
  const [grades, setGrades] = useState<any[]>([]); // grade ranges from active grading system

  const rowTotal = (componentScores: Record<number, string>): number => {
    if (assessmentComponents.length === 0) return 0;
    return assessmentComponents.reduce((sum, c) => {
      return sum + (parseFloat(componentScores[c.id] || '0') || 0);
    }, 0);
  };

  const recomputeClassStats = () => {
    try {
      const totals: number[] = [];
      bulkResults.forEach((r) => {
        const t = rowTotal(r.componentScores);
        if (!isNaN(t) && t > 0) totals.push(t);
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

    if (!isEditMode) {
      setFilteredStudents([]);
      setBulkResults([]);
    }

    try {
      const studentsData = await TeacherDashboardService.getStudentsForClass(parseInt(classId));
      setFilteredStudents(studentsData);

      if (!isEditMode) {
        setTimeout(recomputeClassStats, 0);
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
        setExistingResultsByStudentId({});
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

  const VALID_LEVELS = new Set(['NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY']);

  const fetchExistingResults = async () => {
    if (editResult || !formData.subject || !formData.exam_session || !selectedEducationLevel) return;
    const level = normalizeEducationLevelForApi(selectedEducationLevel);
    // Guard: skip when the level doesn't map to a known API path
    if (!VALID_LEVELS.has(level)) return;
    try {
      const results = await ResultService.getSubjectResults(level as any, {
        exam_session: formData.exam_session,
        subject:      formData.subject,
        page_size:    200,
      } as any);
      const map: Record<string, any> = {};
      (results as any[]).forEach((r: any) => {
        const sid = String(r.student?.id ?? r.student_id ?? '');
        if (sid) map[sid] = r;
      });
      setExistingResultsByStudentId(map);
    } catch (err) {
      console.error('fetchExistingResults failed:', err);
    }
  };

  useEffect(() => {
    fetchExistingResults();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.exam_session, formData.subject, selectedEducationLevel]);

  // Fetch assessment components for the selected education level.
  useEffect(() => {
    if (!selectedEducationLevel) { setAssessmentComponents([]); return; }
    const level = normalizeEducationLevelForApi(selectedEducationLevel);
    // Never call the API with an invalid level — it will 404 or return empty
    if (!VALID_LEVELS.has(level)) { setAssessmentComponents([]); return; }

    const sortFn = (comps: AssessmentComponentInfo[]) =>
      comps.filter(c => c.is_active).sort((a, b) => a.display_order - b.display_order);

    // Human-readable name variant e.g. 'SENIOR_SECONDARY' → 'Senior Secondary'
    const humanName = level.replace(/_/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    ResultService.getAssessmentComponents({ is_active: true, page_size: 100 })
      .then(all => {
        // Strategy 1: education_level_detail.level_type exact match (uppercase)
        const byType = sortFn(
          all.filter(c => c.education_level_detail?.level_type?.toUpperCase() === level)
        );
        if (byType.length > 0) { setAssessmentComponents(byType); return; }

        // Strategy 2: education_level_detail.name match (e.g. 'Senior Secondary')
        const byName = sortFn(
          all.filter(c =>
            c.education_level_detail?.name?.toLowerCase() === humanName.toLowerCase()
          )
        );
        if (byName.length > 0) { setAssessmentComponents(byName); return; }

        // Strategy 3: backend by_education_level endpoint as last resort
        return ResultService.getAssessmentComponentsByEducationLevel(level)
          .then(comps => setAssessmentComponents(sortFn(comps)));
      })
      .catch(() => setAssessmentComponents([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEducationLevel]);

  // ── FIX 1: When the selected student changes in create mode, seed the exam
  //    score field from their existing component_scores (if any). ──────────────
  useEffect(() => {
    if (editResult || !formData.student) return;

    const existing = existingResultsByStudentId[formData.student];
    if (!existing?.component_scores?.length) return;

    const compScores: any[] = [...existing.component_scores]
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));

    const hasCA   = compScores.some((cs: any) => cs.component_type !== 'EXAM');
    const examComp = compScores.find((cs: any) => cs.component_type === 'EXAM');

    if (!hasCA) return; // no component CA recorded — normal form handles everything

    const structure    = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
    const examField    = (structure.fields.find(f => f === 'exam' || f === 'exam_score') ?? 'exam_score') as keyof AssessmentScores;
    const examScore    = examComp ? String(parseFloat(examComp.score ?? '0') || '') : extractExamScoreFromResult(existing);

    setAssessmentScores(prev => ({
      ...prev,
      // Only seed if not already filled in by the teacher this session
      [examField]: prev[examField] !== undefined && prev[examField] !== '' ? prev[examField] : examScore,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.student, existingResultsByStudentId]);

  // Rebuild / repopulate bulk rows whenever students or existing results change.
  useEffect(() => {
    if (editResult || filteredStudents.length === 0) return;

    setBulkResults(prev => {
      const byStudentId = new Map(prev.map(r => [String(r.student_id), r]));

      return filteredStudents.map((student: Student) => {
        const existing = existingResultsByStudentId[String(student.id)];

        // Build componentScores from existing result's component_scores
        const seeded: Record<number, string> = {};
        if (existing?.component_scores?.length) {
          (existing.component_scores as any[]).forEach((cs: any) => {
            const val = parseFloat(cs.score || '0');
            if (val > 0) seeded[cs.component] = String(val);
          });
        }

        const current = byStudentId.get(String(student.id));
        if (!current) {
          return { student_id: student.id, student_name: student.full_name, componentScores: seeded };
        }

        // Merge — don't overwrite values the teacher has already typed
        const merged: Record<number, string> = { ...current.componentScores };
        Object.entries(seeded).forEach(([id, val]) => {
          if (!merged[Number(id)] && val) merged[Number(id)] = val;
        });
        return { ...current, componentScores: merged };
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredStudents, existingResultsByStudentId]);

  useEffect(() => {
    if (editResult) {
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
      
      // Prefer student.education_level (most reliable); fall back to top-level field.
      // Explicitly exclude 'UNKNOWN' — that's a ResultActionsManager sentinel, not a real level.
      const rawLevel = String(
        editResult.student?.education_level ||
        (editResult.education_level !== 'UNKNOWN' ? editResult.education_level : '') ||
        ''
      );
      let normalizedLevel = rawLevel.replace(/_/g, ' ').toLowerCase().trim();
      if (normalizedLevel && normalizedLevel !== 'unknown') setSelectedEducationLevel(normalizedLevel);

      if (subjectId) {
        const subjectAssignments = teacherAssignments.filter(
          a => String(a.subject_id) === String(subjectId)
        );
        
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
      
      const educationLevel = normalizedLevel.replace(/\s+/g, '_').toUpperCase();

      const extractedRemarks =
        editResult.teacher_remark ||
        editResult.remarks ||
        editResult.comment || 
        editResult.teacher_comment || 
        editResult.remark ||
        '';
      
      console.log('📝 Education level:', educationLevel);
      
      const compScores: any[] = [...((editResult as any).component_scores ?? [])]
        .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
      const nonExamComps = compScores.filter((cs: any) => cs.component_type !== 'EXAM');
      const examComp     = compScores.find((cs: any)  => cs.component_type === 'EXAM');
      const scoreOf = (cs: any): string => String(parseFloat(cs?.score ?? '0') || 0);
      const leg     = (v: any):   string => String(v ?? 0);

      if (educationLevel === 'SENIOR_SECONDARY') {
        setAssessmentScores({
          test1: nonExamComps[0] ? scoreOf(nonExamComps[0]) : leg(editResult.first_test_score  ?? editResult.test1),
          test2: nonExamComps[1] ? scoreOf(nonExamComps[1]) : leg(editResult.second_test_score ?? editResult.test2),
          test3: nonExamComps[2] ? scoreOf(nonExamComps[2]) : leg(editResult.third_test_score  ?? editResult.test3),
          exam:  examComp        ? scoreOf(examComp)        : leg(editResult.exam_score         ?? editResult.exam),
          remarks: extractedRemarks,
        });
      } else if (educationLevel === 'NURSERY') {
        setAssessmentScores({
          max_marks_obtainable: leg(editResult.max_marks_obtainable ?? editResult.max_marks ?? 100),
          mark_obtained:        leg(editResult.mark_obtained ?? editResult.total_score ?? editResult.ca_score),
          remarks:       extractedRemarks,
          teacher_remark: editResult.teacher_remark ?? extractedRemarks,
        });
      } else if (educationLevel === 'PRIMARY' || educationLevel === 'JUNIOR_SECONDARY') {
        const caFields = [
          'ca_score', 'take_home_marks', 'appearance_marks',
          'practical_marks', 'project_marks', 'note_copying_marks',
        ] as const;
        const legacyCA = [
          editResult.continuous_assessment_score ?? editResult.ca_score,
          editResult.take_home_test_score        ?? editResult.take_home_marks,
          editResult.appearance_score            ?? editResult.appearance_marks,
          editResult.practical_score             ?? editResult.practical_marks,
          editResult.project_score               ?? editResult.project_marks,
          editResult.note_copying_score          ?? editResult.note_copying_marks,
        ];
        const caEntries: Record<string, string> = {};
        caFields.forEach((field, i) => {
          caEntries[field] = nonExamComps[i] ? scoreOf(nonExamComps[i]) : leg(legacyCA[i]);
        });
        setAssessmentScores({
          ...caEntries,
          ca_total:   leg(editResult.total_ca_score ?? editResult.ca_total),
          exam_score: examComp ? scoreOf(examComp) : leg(editResult.exam_score ?? editResult.exam),
          remarks:       extractedRemarks,
          teacher_remark: editResult.teacher_remark ?? extractedRemarks,
        });

        if (editResult.physical_development || editResult.height_beginning) {
          setPhysicalDevelopment({
            height_beginning: editResult.physical_development?.height_beginning ?? editResult.height_beginning ?? 0,
            height_end:       editResult.physical_development?.height_end       ?? editResult.height_end       ?? 0,
            weight_beginning: editResult.physical_development?.weight_beginning ?? editResult.weight_beginning ?? 0,
            weight_end:       editResult.physical_development?.weight_end       ?? editResult.weight_end       ?? 0,
            nurse_comment:    editResult.physical_development?.nurse_comment    ?? editResult.nurse_comment    ?? '',
          });
        }
      } else {
        setAssessmentScores({
          ca_score:   nonExamComps[0] ? scoreOf(nonExamComps[0]) : leg(editResult.ca_score ?? editResult.continuous_assessment_score),
          exam_score: examComp        ? scoreOf(examComp)        : leg(editResult.exam_score ?? editResult.exam),
          remarks:       extractedRemarks,
          teacher_remark: editResult.teacher_remark ?? extractedRemarks,
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
      setExamSessions(sessions as any);
      
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
      
      try {
        const gradingSystemsResponse = await GradingService.getAll();
        const gradingSystemsArray = Array.isArray(gradingSystemsResponse) ? gradingSystemsResponse : [];
        setGradingSystems(gradingSystemsArray);

        if (gradingSystemsArray.length > 0) {
          const activeSystem = gradingSystemsArray.find((gs: any) => gs.is_active) || gradingSystemsArray[0];
          if (activeSystem?.id) {
            setGradingSystemId(activeSystem.id);
            // Load grade ranges for this system (nested or separate)
            const nestedGrades = activeSystem.grades;
            if (Array.isArray(nestedGrades) && nestedGrades.length > 0) {
              setGrades(nestedGrades);
            } else {
              try {
                const gradesData = await ResultSettingsService.getGrades({ grading_system: String(activeSystem.id) });
                setGrades(Array.isArray(gradesData) ? gradesData : []);
              } catch { setGrades([]); }
            }
          }
        } else {
          toast.warning('No grading systems configured. Please contact administrator.');
        }
      } catch (e: any) {
        console.error('Failed to load grading systems', e);
        toast.error('Could not load grading systems. Results may not save correctly.');
        setGradingSystems([]);
        setGrades([]);
      }
    } finally {
      setLoading(false);
    }
  };


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
        
        const finalId = safeId;

        if (!finalId) {
          toast.error('Cannot update: missing result ID. Please refresh and try again.');
          throw new Error('Invalid result id for update');
        }
        
        await ResultService.updateSubjectResult(education_level as any, finalId, resultData as any);
        toast.success('Result updated successfully!');
      } else {
        // Check if a result already exists for this student (e.g. recorded via ComponentScoreModal)
        const existingForStudent = existingResultsByStudentId[formData.student];
        if (existingForStudent?.id) {
          await ResultService.updateSubjectResult(education_level as any, String(existingForStudent.id), resultData as any);
          toast.success('Result updated successfully!');
        } else {
          try {
            await ResultService.createSubjectResult(education_level as any, resultData as any);
            toast.success('Result recorded successfully!');
          } catch (error: any) {
            console.error('Error creating result:', error);
            const errMsg = error.response?.data?.non_field_errors?.[0]
              || error.response?.data?.message
              || error.message
              || 'Failed to create result';
            toast.error(errMsg);
            throw error;
          }
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

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateBulkForm()) return;

    try {
      setSaving(true);

      if (assessmentComponents.length === 0) {
        toast.error('Assessment components not loaded yet. Please wait and try again.');
        return;
      }

      const validResults = bulkResults.filter(r =>
        assessmentComponents.some(c => (parseFloat(r.componentScores[c.id] || '0') || 0) > 0)
      );

      if (validResults.length === 0) {
        toast.error('Please enter scores for at least one student');
        return;
      }

      let gsId = gradingSystemId;
      if (gsId == null) {
        try {
          const gs = await GradingService.getAll();
          const active = gs.find(g => g.is_active) || gs[0];
          if (active?.id) { gsId = active.id; setGradingSystemId(active.id); }
        } catch { /* no grading system — backend will use default */ }
      }

      const level = normalizeEducationLevelForApi(selectedEducationLevel);

      const entries: BulkComponentScoreEntry[] = validResults.map(r => {
        const total = rowTotal(r.componentScores);
        return {
          student: String(r.student_id),
          subject: Number(formData.subject),
          exam_session: formData.exam_session,
          grading_system: gsId ?? undefined,
          teacher_remark: getAutomatedRemark(total),
          scores: assessmentComponents
            .map(c => ({ component_id: c.id, score: parseFloat(r.componentScores[c.id] || '0') || 0 }))
            .filter(s => s.score > 0),
        };
      });

      await ResultService.bulkRecordComponentScores(level as any, entries);

      toast.success(`${validResults.length} result(s) recorded successfully!`);
      onResultCreated();
      onClose();
    } catch (error: any) {
      console.error('Error saving bulk results:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to save results');
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
    if (!formData.subject) { toast.error('Please select a subject'); return false; }
    if (!selectedClass)    { toast.error('Please select a class');   return false; }
    if (!formData.exam_session) { toast.error('Please select an exam session'); return false; }

    const valid = bulkResults.filter(r =>
      assessmentComponents.some(c => (parseFloat(r.componentScores[c.id] || '0') || 0) > 0)
    );
    if (valid.length === 0) {
      toast.error('Please enter scores for at least one student');
      return false;
    }

    for (const result of valid) {
      for (const comp of assessmentComponents) {
        const raw = result.componentScores[comp.id];
        if (!raw || raw === '') continue;
        const val = parseFloat(raw);
        const max = parseFloat(comp.max_score);
        if (isNaN(val) || val < 0 || val > max) {
          toast.error(`Invalid ${comp.name} for ${result.student_name}. Must be 0–${max}`);
          return false;
        }
      }
    }
    return true;
  };

  const updateComponentScore = (index: number, componentId: number, value: string) => {
    setBulkResults(prev => {
      const updated = prev.map((row, i) => {
        if (i !== index) return row;
        return { ...row, componentScores: { ...row.componentScores, [componentId]: value } };
      });
      setTimeout(recomputeClassStats, 0);
      return updated;
    });
  };

  const updateAssessmentScore = (field: keyof AssessmentScores, value: string) => {
    setAssessmentScores(prev => {
      const updated = { ...prev, [field]: value };
      
      const structure = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
      if (structure.type === 'primary' || structure.type === 'junior') {
        const caScore    = parseFloat(updated.ca_score?.toString() || '0');
        const takeHome   = parseFloat(updated.take_home_marks?.toString() || '0');
        const appearance = parseFloat(updated.appearance_marks?.toString() || '0');
        const practical  = parseFloat(updated.practical_marks?.toString() || '0');
        const project    = parseFloat(updated.project_marks?.toString() || '0');
        const noteCopying = parseFloat(updated.note_copying_marks?.toString() || '0');
        updated.ca_total = (caScore + takeHome + appearance + practical + project + noteCopying).toString();
      }
      
      return updated;
    });
    setTimeout(recomputeClassStats, 0);
  };

  const updatePhysicalDevelopment = (field: keyof PhysicalDevelopment, value: string | number) => {
    setPhysicalDevelopment(prev => ({ ...prev, [field]: value }));
  };

  // Derive grade letter from the school's configured grading system.
  // Falls back to empty string if grading system is not loaded yet.
  const getGrade = (total: number): string => {
    if (grades.length > 0) {
      const range = grades.find((g: any) =>
        total >= parseFloat(String(g.min_score)) && total <= parseFloat(String(g.max_score))
      );
      return range?.grade || '';
    }
    return '';
  };

  // Grade color using the is_passing flag from the loaded grading system.
  const getGradeColor = (grade: string): string => {
    if (grades.length > 0) {
      const range = grades.find((g: any) => g.grade === grade);
      if (range) {
        return range.is_passing
          ? 'text-green-600 bg-green-100'
          : 'text-red-600 bg-red-100';
      }
    }
    return 'text-gray-600 bg-gray-100';
  };

  // Derive teacher remark from the grade range description in the grading system.
  // Falls back to empty string — the backend will auto-generate if this is blank.
  const getAutomatedRemark = (total: number): string => {
    if (grades.length > 0) {
      const range = grades.find((g: any) =>
        total >= parseFloat(String(g.min_score)) && total <= parseFloat(String(g.max_score))
      );
      return range?.description || range?.remark || '';
    }
    return '';
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

  const _createModeResult = !editResult && formData.student
    ? (existingResultsByStudentId[formData.student] ?? null)
    : null;

  const _sourceResult = editResult ?? _createModeResult;
  const _existingCompScores: any[] = (_sourceResult as any)?.component_scores ?? [];
  const hasCAViaComponents   = !!_sourceResult && _existingCompScores.some((cs: any) => cs.component_type !== 'EXAM');
  const hasExamViaComponents = !!_sourceResult && _existingCompScores.some((cs: any) => cs.component_type === 'EXAM');
  const allScoresViaComponents = hasCAViaComponents && hasExamViaComponents;

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

  const renderComponentScorePanel = () => {
    const compScores: any[] = [...((_sourceResult as any)?.component_scores ?? [])]
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));

    const caComps    = compScores.filter((cs: any) => cs.component_type !== 'EXAM');
    const examComp   = compScores.find((cs: any)  => cs.component_type === 'EXAM');
    const caTotal    = parseFloat(String((_sourceResult as any)?.ca_total    ?? 0)) || 0;
    const totalScore = parseFloat(String((_sourceResult as any)?.total_score ?? 0)) || 0;

    const structure     = getAssessmentStructure(selectedEducationLevel, activeScoringConfig);
    const examFieldName = (structure.fields.find(f => f === 'exam' || f === 'exam_score') ?? 'exam') as keyof AssessmentScores;
    const examIdx       = structure.fields.indexOf(examFieldName as string);
    const examLabel     = examIdx >= 0 ? structure.labels[examIdx]    : 'Exam Score';
    const examMax       = examIdx >= 0 ? structure.maxValues[examIdx] : 100;

    // ── FIX 4: Seed exam input from existing exam component score on first render ──
    // This is a render-time seed: if the field is empty but examComp has a score, show it.
    const examInputValue = assessmentScores[examFieldName] !== undefined && assessmentScores[examFieldName] !== ''
      ? assessmentScores[examFieldName]
      : examComp
        ? (parseFloat(examComp.score ?? '0') > 0 ? String(parseFloat(examComp.score)) : '')
        : extractExamScoreFromResult(_sourceResult);

    return (
      <div className="space-y-5">

        {/* ── Info banner ── */}
        <div className="flex items-start gap-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
              CA scores recorded via Assessment Components
            </p>
            <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">
              Use <span className="font-medium">"Record by Component"</span> to modify individual CA scores.
            </p>
          </div>
        </div>

        {/* ── CA component scores — read-only ── */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-400" />
            CA Assessment Scores (read-only)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {caComps.map((cs: any) => (
              <div key={cs.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{cs.component_name}</p>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                  {parseFloat(cs.score || '0')}
                  <span className="text-xs font-normal text-gray-400 ml-1">/ {cs.max_score}</span>
                </p>
              </div>
            ))}

            {/* CA Total badge */}
            <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
              <p className="text-xs font-medium text-indigo-500 dark:text-indigo-400">CA Total</p>
              <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">{caTotal}</p>
            </div>
          </div>
        </div>

        {/* ── Exam score ── */}
        {!examComp ? (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Exam Score
            </h4>
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {examLabel}
              </label>
              <input
                type="number"
                min="0"
                max={examMax}
                step="0.1"
                value={examInputValue || ''}
                onChange={e => updateAssessmentScore(examFieldName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder={`0–${examMax}`}
              />
            </div>
          </div>
        ) : (
          /* Exam also recorded via component — read-only */
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-400" />
              Exam Score (read-only)
            </h4>
            <div className="inline-block bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{examComp.component_name}</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                {parseFloat(examComp.score || '0')}
                <span className="text-xs font-normal text-gray-400 ml-1">/ {examComp.max_score}</span>
              </p>
            </div>
          </div>
        )}

        {/* ── Total / Grade summary ── */}
        {totalScore > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Total Score</span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalScore}</span>
            </div>
            <div className="mt-2">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getGradeColor(getGrade(totalScore))}`}>
                Grade: {getGrade(totalScore)}
              </span>
            </div>
          </div>
        )}
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
          {[
            { label: 'Class Average (auto)',    value: stats.class_average },
            { label: 'Highest in Class (auto)', value: stats.highest_in_class },
            { label: 'Lowest in Class (auto)',  value: stats.lowest_in_class },
            { label: 'Class Position (auto)',   value: stats.class_position },
          ].map(({ label, value }) => (
            <div key={label}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</label>
              <input
                type="number"
                value={value || ''}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              />
            </div>
          ))}
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
          {[
            { label: 'Height (Beginning) - cm', field: 'height_beginning' as const, step: '1' },
            { label: 'Height (End) - cm',       field: 'height_end'       as const, step: '1' },
            { label: 'Weight (Beginning) - kg', field: 'weight_beginning' as const, step: '0.1' },
            { label: 'Weight (End) - kg',       field: 'weight_end'       as const, step: '0.1' },
          ].map(({ label, field, step }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</label>
              <input
                type="number"
                min="0"
                step={step}
                value={physical[field] || ''}
                onChange={(e) => onUpdate(field, parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nurse's Comment</label>
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
                      {hasCAViaComponents
                        ? renderComponentScorePanel()
                        : renderAssessmentFields(assessmentScores, updateAssessmentScore)
                      }

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

                      <div className="flex justify-end space-x-3">
                        <button
                          type="button"
                          onClick={handleClose}
                          className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900"
                        >
                          {allScoresViaComponents ? 'Close' : 'Cancel'}
                        </button>
                        {!allScoresViaComponents && (
                          <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            {saving ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            ) : (
                              <Save className="w-4 h-4 mr-2" />
                            )}
                            {editResult ? 'Update Result' : 'Record Result'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
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

                  {bulkResults.length > 0 && assessmentComponents.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                        <GraduationCap className="w-5 h-5 mr-2" />
                        Enter Scores ({assessmentComponents.length} component{assessmentComponents.length !== 1 ? 's' : ''})
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-600">
                              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[140px]">
                                Student
                              </th>
                              {assessmentComponents.map(comp => (
                                <th key={comp.id} className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                  {comp.name}
                                  <span className="block text-xs font-normal text-gray-400">/{parseFloat(comp.max_score)}</span>
                                </th>
                              ))}
                              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">Total</th>
                              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">Grade</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkResults.map((result, index) => {
                              const total = rowTotal(result.componentScores);
                              const grade = getGrade(total);
                              return (
                                <tr key={result.student_id} className="border-b border-gray-200 dark:border-gray-600">
                                  <td className="py-2 px-3 text-sm font-medium text-gray-900 dark:text-white">
                                    {result.student_name}
                                  </td>
                                  {assessmentComponents.map(comp => (
                                    <td key={comp.id} className="py-2 px-3">
                                      <input
                                        type="number"
                                        min="0"
                                        max={parseFloat(comp.max_score)}
                                        step="0.1"
                                        value={result.componentScores[comp.id] || ''}
                                        onChange={e => updateComponentScore(index, comp.id, e.target.value)}
                                        className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                                        placeholder="0"
                                      />
                                    </td>
                                  ))}
                                  <td className="py-2 px-3 text-sm font-medium text-gray-900 dark:text-white">
                                    {total > 0 ? total.toFixed(1).replace(/\.0$/, '') : '—'}
                                  </td>
                                  <td className="py-2 px-3">
                                    {total > 0 && (
                                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getGradeColor(grade)}`}>
                                        {grade}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {bulkResults.length > 0 && assessmentComponents.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
                      <Info className="w-4 h-4 shrink-0" />
                      Loading assessment components… please wait.
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
                      disabled={saving || bulkResults.length === 0 || assessmentComponents.length === 0}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Record {bulkResults.filter(r => rowTotal(r.componentScores) > 0).length} Results
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