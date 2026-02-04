import { useRef, useState, useEffect, useMemo } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useResultService } from "@/hooks/useResultService";
import { SchoolSettings } from '@/types/types';
import type { 
  GradingSystem, 
  GradeRange,
  ExamSession 
} from "@/services/ResultSettingsService";

// Updated interfaces to match your data structure
export interface StudentBasicInfo {
  id: string;
  name: string;
  full_name?: string;
  class: string;
  house?: string;
  age?: number;
}

export interface TermInfo {
  name: string;
  session: string;
  year: string;
}

export interface SubjectResult {
  id: string;
  subject: {
    id: string;
    name: string;
  };
  continuous_assessment_score: number;
  take_home_test_score: number;
  project_score: number;
  appearance_score: number;
  note_copying_score: number;
  practical_score: number;
  ca_total: number; // 40 marks (15+5+5+5+5+5)
  exam_marks: number; // 60 marks
  total_obtainable: number; // 100 marks
  mark_obtained: number;
  grade?: string;
  position?: string;
  subject_position?: number;
  teacher_remark?: string;
  is_passed?: boolean;
  status?: string; // DRAFT, SUBMITTED, APPROVED, PUBLISHED
}

export interface PrimaryResultData {
  id: string;
  student: StudentBasicInfo;
  term: TermInfo;
  subjects: SubjectResult[];
  total_score: number;
  average_score: number;
  overall_grade: string;
  class_position: number;
  total_students: number;
  attendance: {
    times_opened: number;
    times_present: number;
  };
  next_term_begins: string;
  class_teacher_remark?: string;
  head_teacher_remark?: string;
  class_teacher_signature?: string;
  head_teacher_signature?: string;
  nurse_comment?: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

const SUBJECTS = [
  "ENGLISH STUDIES",
  "MATHEMATICS",
  "BASIC SCIENCE & TECHNOLOGY (BST)",
  "NATIONAL VALUE (NV)",
  "CULTURAL & CREATIVE ARTS (CCA)",
  "PRE VOCATIONAL STUDIES (PVS)",
  "YORUBA/HAUSA/IGBO",
  "CRS / ARABIC",
  "FRENCH LANGUAGE",
  "HAND WRITING",
  "HISTORY",
];

const COLUMN_HEADERS = [
  "C.A\n(15 MARKS)",
  "TAKE HOME\nTEST",
  "PROJECT\nMARKS",
  "APPEARANCE\nMARKS",
  "PRACTICAL\nMARKS",
  "NOTE COPYING\nMARKS",
  "C.A\nTOTAL",
  "EXAM\n(60%)",
  "TOTAL\n(100%)",
  "POSITION",
  "GRADE",
  "CLASS TEACHER REMARKS",
];

const WatermarkLogo = ({ schoolInfo }: { schoolInfo: SchoolSettings }) => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0" style={{ opacity: 0.08 }}>
    <div className="text-center">
      <div 
        className="w-80 h-80 rounded-full flex items-center justify-center mb-8 mx-auto border-2"
        style={{ 
          background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.05), rgba(59, 130, 246, 0.05))',
          borderColor: 'rgba(30, 64, 175, 0.1)'
        }}
      >
        <div className="text-center" style={{ color: 'rgba(30, 64, 175, 0.15)' }}>
          {schoolInfo?.logo ? (
            <img 
              src={schoolInfo.logo} 
              alt="School Logo" 
              className="w-30 h-30 mx-auto mb-3" 
              style={{ opacity: 0.1 }}
            />
          ) : (
            <div className="text-5xl font-bold mb-3" style={{ opacity: 0.1 }}>
              {schoolInfo?.tenant_name?.split(' ').map((word: string) => word[0]).join('') || 'GTS'}
            </div>
          )}
          <div className="text-lg font-semibold" style={{ opacity: 0.1 }}>
            {schoolInfo?.tenant_name?.toUpperCase() || "School Name"}
          </div>
        </div>
      </div>
      <div 
        className="text-6xl font-bold tracking-wider"
        style={{ color: 'rgba(30, 64, 175, 0.08)' }}
      >
        {schoolInfo?.tenant_name?.toUpperCase() || "School Name"}
      </div>
    </div>
  </div>
);

// Enhanced interface with additional props
interface PrimaryResultProps {
  data: PrimaryResultData;
  studentId?: string;
  examSessionId?: string;
  templateId?: string;
  onDataChange?: (data: PrimaryResultData) => void;
  onPDFGenerated?: (pdfUrl: string) => void;
  enableEnhancedFeatures?: boolean;
  showOnlyPublished?: boolean; // NEW: Control whether to show only published results
}

export default function PrimaryResult({ 
  data, 
  studentId, 
  examSessionId, 
  templateId,
  onPDFGenerated,
  enableEnhancedFeatures = true,
  showOnlyPublished = false // NEW: Default to false (show all results)
}: PrimaryResultProps) {
  // State to store the corrected next_term_begins date
  const [correctedNextTermBegins, setCorrectedNextTermBegins] = useState<string | null>(null);
  
  // Enhanced debug logging
  console.log('🏫 [PrimaryResult] Component received props:', { data, studentId, examSessionId, templateId });
  console.log('🏫 [PrimaryResult] Data structure:', data);
  console.log('🏫 [PrimaryResult] Student data:', data?.student);
  console.log('🏫 [PrimaryResult] Subjects data:', data?.subjects);
  
  // Debug first subject to see the structure
  if (data?.subjects && data.subjects.length > 0) {
    console.log('🏫 [PrimaryResult] First subject structure:', data.subjects[0]);
    console.log('🏫 [PrimaryResult] First subject CA components:', {
      continuous_assessment_score: data.subjects[0].continuous_assessment_score,
      take_home_test_score: data.subjects[0].take_home_test_score,
      project_score: data.subjects[0].project_score,
      appearance_score: data.subjects[0].appearance_score,
      practical_score: data.subjects[0].practical_score,
      note_copying_score: data.subjects[0].note_copying_score,
      ca_total: data.subjects[0].ca_total
    });
  }
  
  // Debug position and class information
  console.log('🏫 [PrimaryResult] Position and class data:', {
    class_position: data.class_position,
    total_students: data.total_students,
    total_score: data.total_score,
    average_score: data.average_score,
    overall_grade: data.overall_grade
  });
  
  // Check if we need to fix the next_term_begins date
  useEffect(() => {
    const fixNextTermBegins = async () => {
      // If we receive "Invalid Date" or invalid date, fetch the correct date from Term settings
      if (!data?.next_term_begins || data?.next_term_begins === 'Invalid Date' || data?.next_term_begins === 'TBA') {
        console.log('🔧 [PrimaryResult] Fixing next_term_begins - received:', data?.next_term_begins);
        
        try {
          // Import AcademicCalendarService to get Term settings
          const { default: AcademicCalendarService } = await import('@/services/AcademicCalendarService');
          
          // Get current academic session and terms
          const academicSessions = await AcademicCalendarService.getAcademicSessions();
          const currentSession = academicSessions.find(session => session.is_current);
          
          if (currentSession) {
            console.log('🔧 [PrimaryResult] Current academic session:', currentSession);
            
            // Get all terms and filter by current session
            const allTerms = await AcademicCalendarService.getTerms();
            const terms = allTerms.filter(term => term.academic_session === currentSession.id);
            console.log('🔧 [PrimaryResult] Available terms:', terms);
            
            // Find the current term and next term
            const currentTerm = terms.find(term => term.is_current);
            if (currentTerm) {
              console.log('🔧 [PrimaryResult] Current term:', currentTerm);
              
              // If current term has next_term_begins, use it
              if (currentTerm.next_term_begins) {
                console.log('🔧 [PrimaryResult] Found next_term_begins from current term:', currentTerm.next_term_begins);
                setCorrectedNextTermBegins(currentTerm.next_term_begins);
                return;
              }
              
              // Otherwise, find the next term in sequence
              const termOrder = ['FIRST', 'SECOND', 'THIRD'];
              const currentIndex = termOrder.indexOf(currentTerm.name);
              
              if (currentIndex < termOrder.length - 1) {
                const nextTermName = termOrder[currentIndex + 1];
                const nextTerm = terms.find(term => term.name === nextTermName);
                
                if (nextTerm && nextTerm.next_term_begins) {
                  console.log('🔧 [PrimaryResult] Found next_term_begins from next term:', nextTerm.next_term_begins);
                  setCorrectedNextTermBegins(nextTerm.next_term_begins);
                  return;
                }
              }
            }
          }
          
          // Fallback: Use a default date
          const defaultDate = '2025-01-17'; // This should match your Term settings
          console.log('🔧 [PrimaryResult] Using fallback date:', defaultDate);
          setCorrectedNextTermBegins(defaultDate);
          
        } catch (error) {
          console.error('🔧 [PrimaryResult] Error fetching next term begins date:', error);
          // Use fallback date
          setCorrectedNextTermBegins('2025-01-17');
        }
      } else {
        console.log('🔧 [PrimaryResult] next_term_begins is already correct:', data?.next_term_begins);
        setCorrectedNextTermBegins(data?.next_term_begins);
      }
    };
    
    fixNextTermBegins();
  }, [data?.next_term_begins]);
  
  const ref = useRef(null);
  const { service, schoolSettings, loading: serviceLoading } = useResultService();
  
  // Debug logging
  console.log('PrimaryResult - schoolSettings:', schoolSettings);
  console.log('PrimaryResult - serviceLoading:', serviceLoading);
  
  const [gradingSystem, setGradingSystem] = useState<GradingSystem | null>(null);
  const [grades, setGrades] = useState<GradeRange[]>([]);
  const [examSession, setExamSession] = useState<ExamSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGradingData = async () => {
      if (!service || serviceLoading) return;

      try {
        setLoading(true);
        setError(null);

        // Get active grading systems
        const gradingSystems = await service.getGradingSystems();
        const activeSystem = gradingSystems.find((system: GradingSystem) => system.is_active);
        
        if (activeSystem) {
          setGradingSystem(activeSystem);
          
          // Get grades for this grading system
          const systemGrades = await service.getGrades(activeSystem.id);
          setGrades(systemGrades);
        }

        // Get scoring configuration for primary level (for future use)
        // const scoringConfigs = await service.getScoringConfigurationsByEducationLevel('PRIMARY');
        // const primaryScoringConfig = scoringConfigs.find((config: ScoringConfiguration) => 
        //   config.education_level === 'PRIMARY' && config.is_active
        // );

        // Load exam session data if examSessionId is provided
        if (examSessionId && enableEnhancedFeatures) {
          try {
            const sessions = await service.getExamSessions();
            const currentSession = sessions.find((session: ExamSession) => session.id === examSessionId);
            if (currentSession) {
              setExamSession(currentSession);
            }
          } catch (sessionError) {
            console.warn('Failed to load exam session:', sessionError);
          }
        }

      } catch (err) {
        console.error('Error fetching grading system:', err);
        setError('Failed to load grading system');
      } finally {
        setLoading(false);
      }
    };

    fetchGradingData();
  }, [service, serviceLoading, examSessionId, enableEnhancedFeatures]);

  // Enhanced PDF generation with better naming and metadata
  const downloadPDF = async () => {
    const element = ref.current;
    if (!element) return;

    try {
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        removeContainer: true,
        scrollX: 0,
        scrollY: 0
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Get image properties and calculate dimensions
      const imgProps = (pdf as any).getImageProperties(imgData);
      const imgWidth = pdfWidth;
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      let finalHeight = imgHeight;
      let finalWidth = imgWidth;
      if (imgHeight > pdfHeight) {
        finalHeight = pdfHeight;
        finalWidth = (imgProps.width * pdfHeight) / imgProps.height;
      }

      // Add image to PDF
      (pdf as any).addImage(imgData, 'PNG', 0, 0, finalWidth, finalHeight);
      
      // Enhanced filename with more context
      const studentName = data.student?.name || data.student?.full_name || 'student';
      const term = data.term?.name || 'term';
      const session = data.term?.session || data.term?.year || 'session';
      const timestamp = new Date().toISOString().split('T')[0];
      
      const filename = `${studentName.replace(/\s+/g, '_')}_primary_result_${term}_${session}_${timestamp}.pdf`;
      
      // Save PDF
      pdf.save(filename);

      // Call the callback if provided
      if (onPDFGenerated) {
        const pdfBlob = (pdf as any).output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        onPDFGenerated(pdfUrl);
      }

    } catch (error) {
      console.error('Error generating PDF:', error);
      setError('Failed to generate PDF');
    }
  };

  // Enhanced result generation using enhanced result service
  const generateEnhancedPDF = async () => {
    if (!studentId || !examSessionId || !service || !enableEnhancedFeatures) {
      // Fall back to regular PDF generation
      return downloadPDF();
    }

    try {
      const enhancedResult = await service.generateEnhancedResultSheet(studentId, examSessionId);
      
      // Check if enhanced result has a PDF download URL or similar
      if (enhancedResult && 'download_url' in enhancedResult && enhancedResult.download_url) {
        // Open the generated PDF
        window.open(enhancedResult.download_url as string, '_blank');
        
        if (onPDFGenerated) {
          onPDFGenerated(enhancedResult.download_url as string);
        }
      } else {
        // Fall back to client-side PDF generation
        await downloadPDF();
      }
    } catch (error) {
      console.error('Enhanced PDF generation failed:', error);
      // Fall back to client-side PDF generation
      await downloadPDF();
    }
  };

  // Helper function to get grade for a score
  const getGradeForScore = (score: number): { grade: string; remark: string; isPass: boolean } => {
   if (!gradingSystem || grades.length === 0) {
      // Default grading if no system is available
      if (score >= 70) return { grade: 'A', remark: 'Distinction', isPass: true };
      if (score >= 60) return { grade: 'B', remark: 'Very Good', isPass: true };
      if (score >= 50) return { grade: 'C', remark: 'Good', isPass: true };
      if (score >= 45) return { grade: 'D', remark: 'Fair', isPass: true };
      if (score >= 40) return { grade: 'E', remark: 'Pass', isPass: true };
      return { grade: 'F', remark: 'Fail', isPass: false };
    }

    const gradeRange = grades.find(g => score >= g.min_score && score <= g.max_score);
    
    if (gradeRange) {
      return {
        grade: gradeRange.grade,
        remark: gradeRange.remark,
        isPass: gradeRange.is_passing
      };
    }

    const isPass = score >= gradingSystem.pass_mark;
    return {
      grade: isPass ? 'P' : 'F',
      remark: isPass ? 'Pass' : 'Fail',
      isPass
    };
  };

  // Get subject result data - from subjects to use (published or all for debugging)
  const getSubjectData = (subjectName: string) => {
    if (!subjectsToUse || subjectsToUse.length === 0) return null;
    
    return subjectsToUse.find((subject: any) => 
      subject.subject.name.toUpperCase().includes(subjectName.toUpperCase()) ||
      subjectName.toUpperCase().includes(subject.subject.name.toUpperCase())
    );
  };

  // Calculate CA total for a subject
  const calculateCATotal = (subject: SubjectResult): number => {
    console.log('🔍 [PrimaryResult] calculateCATotal - Subject data:', subject);
    
    // Check if ca_total is already provided by backend
    if (subject.ca_total !== undefined && subject.ca_total !== null && !isNaN(Number(subject.ca_total))) {
      console.log('🔍 [PrimaryResult] calculateCATotal - Using backend ca_total:', subject.ca_total);
      return Number(subject.ca_total);
    }
    
    // Calculate from individual components if ca_total is not available
    const components = [
      subject.continuous_assessment_score || 0,
      subject.take_home_test_score || 0,
      subject.practical_score || 0,
      subject.appearance_score || 0,
      subject.project_score || 0,
      subject.note_copying_score || 0
    ];
    
    console.log('🔍 [PrimaryResult] calculateCATotal - Components:', components);
    
    const total = components.reduce((sum, score) => {
      const numericScore = Number(score) || 0;
      console.log(`🔍 [PrimaryResult] calculateCATotal - Adding ${numericScore} to sum ${sum}`);
      return sum + numericScore;
    }, 0);
    
    console.log('🔍 [PrimaryResult] calculateCATotal - Final total:', total);
    return total;
  };

  // Debug: Log all subject statuses first
  console.log('🔍 [PrimaryResult] All subjects with status:', data.subjects?.map(s => ({
    name: s.subject?.name,
    status: s.status,
    hasStatus: 'status' in s
  })));
  
  // Debug: Log the actual subject objects to see their structure
  console.log('🔍 [PrimaryResult] Raw subject objects:', data.subjects);
  console.log('🔍 [PrimaryResult] First subject full object:', data.subjects?.[0]);
  
  // Debug: Check if subjects have status field
  if (data.subjects && data.subjects.length > 0) {
    console.log('🔍 [PrimaryResult] Checking status field in subjects:');
    data.subjects.forEach((subject: any, index: number) => {
      console.log(`  Subject ${index + 1}: ${subject.subject?.name}`);
      console.log(`    Has status field: ${'status' in subject}`);
      console.log(`    Status value: ${subject.status}`);
      console.log(`    Status type: ${typeof subject.status}`);
      console.log(`    All keys: ${Object.keys(subject)}`);
    });
  }
  
  // Filter subjects based on showOnlyPublished prop - using useMemo to avoid initialization issues
  const subjectsToUse = useMemo(() => {
    if (!data?.subjects) return [];
    
    if (showOnlyPublished) {
      // Filter for published subjects only (for ResultChecker/student view)
      const publishedSubjects = data.subjects.filter((subject: any) => subject.status === 'PUBLISHED');
      
      console.log('🔍 [PrimaryResult] FILTERING MODE: Published only');
      console.log('🔍 [PrimaryResult] Total subjects:', data.subjects.length);
      console.log('🔍 [PrimaryResult] Published subjects:', publishedSubjects.length);
      console.log('🔍 [PrimaryResult] Published subject names:', publishedSubjects.map(s => s.subject?.name));
      
      // TEMPORARY WORKAROUND: If no published subjects found (status field missing), 
      // check if we have National Values and use it as published
      if (publishedSubjects.length === 0 && data.subjects.length > 0) {
        console.log('🔍 [PrimaryResult] No published subjects found, checking for National Values...');
        const nationalValues = data.subjects.find((subject: any) => 
          subject.subject?.name?.toLowerCase().includes('national values') ||
          subject.subject?.name?.toLowerCase().includes('national value')
        );
        
        if (nationalValues) {
          console.log('🔍 [PrimaryResult] Found National Values, treating as published');
          console.log('🔍 [PrimaryResult] National Values data:', nationalValues);
          console.log('🔍 [PrimaryResult] National Values position fields:', {
            position: nationalValues.position,
            subject_position: nationalValues.subject_position,
            allKeys: Object.keys(nationalValues)
          });
          return [nationalValues];
        } else {
          console.log('🔍 [PrimaryResult] No National Values found, using all subjects as fallback');
          return data.subjects;
        }
      }
      
      return publishedSubjects;
    } else {
      // Show all subjects (for Admin Results tab)
      console.log('🔍 [PrimaryResult] FILTERING MODE: Show all results');
      console.log('🔍 [PrimaryResult] Total subjects:', data.subjects.length);
      return data.subjects;
    }
  }, [data?.subjects, showOnlyPublished]);
  
  // Helper function to get position with ordinal suffix
  const getOrdinalSuffix = (num: number): string => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return "st";
    if (j === 2 && k !== 12) return "nd";
    if (j === 3 && k !== 13) return "rd";
    return "th";
  };
  
  console.log('🔍 [PrimaryResult] Using subjects:', subjectsToUse.length, 'for display');
  console.log('🔍 [PrimaryResult] Subjects to use for table:', subjectsToUse);

  // Calculate total and average scores from PUBLISHED subject data only
  const calculateScores = () => {
    console.log('🔍 [PrimaryResult] calculateScores - Data:', data);
    console.log('🔍 [PrimaryResult] calculateScores - Data.total_score:', data.total_score);
    console.log('🔍 [PrimaryResult] calculateScores - Data.average_score:', data.average_score);
    console.log('🔍 [PrimaryResult] calculateScores - All subjects:', data?.subjects?.length);
    console.log('🔍 [PrimaryResult] calculateScores - Subjects to use:', subjectsToUse.length);
    
    // Calculate from subjects to use (published or all based on context)
    console.log('🔍 [PrimaryResult] calculateScores - Calculating from subjects to use');
    
    if (!subjectsToUse || subjectsToUse.length === 0) {
      console.log('🔍 [PrimaryResult] calculateScores - No subjects found');
      return { totalScore: 0, averageScore: 0 };
    }

    const validSubjects = subjectsToUse.filter((subject: any) => {
      const markObtained = Number(subject.mark_obtained) || 0;
      const isMarkObtainedValid = subject.mark_obtained && 
                                 !isNaN(markObtained) && 
                                 markObtained > 0 &&
                                 String(subject.mark_obtained).length < 20; // Check for concatenated strings
      
      console.log(`🔍 [PrimaryResult] calculateScores - Subject ${subject.subject?.name}: status=${subject.status}, mark_obtained=${subject.mark_obtained}, valid=${isMarkObtainedValid}`);
      return isMarkObtainedValid;
    });

    console.log('🔍 [PrimaryResult] calculateScores - Valid published subjects:', validSubjects.length);

    const totalScore = subjectsToUse.reduce((sum: number, subject: any) => {
      const markObtained = Number(subject.mark_obtained) || 0;
      const isMarkObtainedValid = subject.mark_obtained && 
                                 !isNaN(markObtained) && 
                                 markObtained > 0 &&
                                 String(subject.mark_obtained).length < 20;
      
      let score = 0;
      if (isMarkObtainedValid) {
        score = markObtained;
        console.log(`🔍 [PrimaryResult] calculateScores - Using mark_obtained: ${score}`);
      } else {
        // Fallback: Calculate from CA + Exam
        const caTotal = calculateCATotal(subject);
        const examMarks = Number(subject.exam_marks) || 0;
        score = caTotal + examMarks;
        console.log(`🔍 [PrimaryResult] calculateScores - Using calculated score (CA: ${caTotal} + Exam: ${examMarks} = ${score})`);
      }
      
      console.log(`🔍 [PrimaryResult] calculateScores - Adding ${score} to sum ${sum}`);
      return sum + score;
    }, 0);
    
    const averageScore = subjectsToUse.length > 0 ? totalScore / subjectsToUse.length : 0;

    console.log('🔍 [PrimaryResult] calculateScores - Calculated from subjects:', { totalScore, averageScore });

    return { 
      totalScore: Math.round(totalScore), 
      averageScore: Math.round(averageScore * 100) / 100 
    };
  };

  const { totalScore, averageScore } = calculateScores();

  // Handle data changes and propagate to parent (for future use)
  // const handleDataUpdate = (updates: Partial<PrimaryResultData>) => {
  //   const updatedData = { ...data, ...updates };
  //   if (onDataChange) {
  //     onDataChange(updatedData);
  //   }
  // };

  if (serviceLoading || loading || !schoolSettings) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading result data...</p>
          {examSessionId && (
            <p className="text-sm text-gray-600 mt-2">Loading exam session: {examSessionId}</p>
          )}
          {!schoolSettings && (
            <p className="text-sm text-gray-600 mt-2">Loading school settings...</p>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center text-red-600">
          <p className="text-lg font-semibold mb-2">Error</p>
          <p>{error}</p>
          {studentId && (
            <p className="text-sm mt-2">Student ID: {studentId}</p>
          )}
        </div>
      </div>
    );
  }

  const schoolInfo = schoolSettings ? {
    ...schoolSettings,
    tenant_name: schoolSettings.tenant_name || schoolSettings.tenant_name || 'School Name'
  } as SchoolSettings : null;

  return (
    <div className="p-3 bg-gray-100 min-h-screen">
      <div className="mb-4 flex gap-4 flex-wrap">
        <button
          onClick={enableEnhancedFeatures ? generateEnhancedPDF : downloadPDF}
          className="px-4 py-2 bg-indigo-700 text-white rounded shadow hover:bg-indigo-800 transition-colors"
        >
          {enableEnhancedFeatures ? 'Generate Enhanced PDF' : 'Download PDF'}
        </button>
        
        <div className="text-sm text-gray-600 flex items-center gap-4 flex-wrap">
          <span>Student: {data.student?.name}</span>
          <span>Class: {data.student?.class}</span>
          <span>Term: {data.term?.name}</span>
          <span>Session: {data.term?.session || data.term?.year}</span>
          {studentId && <span>ID: {studentId}</span>}
          {examSessionId && <span>Exam Session: {examSessionId}</span>}
          {templateId && <span>Template: {templateId}</span>}
          {data.is_published && (
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
              ✓ Published
            </span>
          )}
          {examSession && (
            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
              Session: {examSession.name}
            </span>
          )}
        </div>
      </div>

      <div
        ref={ref}
        className="bg-white mx-auto p-6 border border-gray-300 relative"
        style={{ width: '850px' }}
      >
        {schoolInfo && <WatermarkLogo schoolInfo={schoolInfo} />}

        {/* Header */}
        <div className="text-center mb-6">
          <div className="grid grid-cols-[20%_60%_20%] gap-4 mb-4">
            {/* Logo section - 30% width */}
            <div className="flex justify-start items-center">
              {schoolSettings?.logo ? (
                <img 
                  src={schoolSettings.logo} 
                  alt="School Logo" 
                  className="w-16 h-16 object-contain rounded-full"
                />
              ) : (
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs font-bold">
                  {schoolSettings?.tenant_name?.split(' ').map((word: string) => word[0]).join('') || 'LOGO'}
                </div>
              )}
            </div>

            {/* School name block - 70% width, centered */}
            <div className="text-center relative z-10">
              <h1 className="text-3xl font-bold text-blue-900 mb-2">
                {schoolInfo?.tenant_name?.toUpperCase() || "SCHOOL NAME HERE"}
              </h1>
              <p className="text-xs text-gray-600">
                {schoolSettings?.address || "School Address, City, State"}
              </p>
              <p className="text-sm text-gray-600">
                {schoolSettings?.phone || "(123) 456-7890"} | {schoolSettings?.email || "info@school.com"}
              </p>
              {schoolSettings?.motto && (
                <p className="text-xs italic text-blue-700 mt-1">{schoolSettings.motto}</p>
              )}
            </div>
          </div>

          {/* Student report block - below the grid */}
          <div className="text-blue-900">
            <h5 className="text-sm font-semibold">PRIMARY SCHOOL TERMLY REPORT</h5>
            <p className="text-xs">
              {(data as any).exam_session?.term_display || data.term?.name || '1st Term'}, {(data as any).exam_session?.academic_session_name || data.term?.session || data.term?.year || '2025'} Academic Session
            </p>
            {examSession && (
              <p className="text-xs mt-1 opacity-90">
                Exam Session: {examSession.name} ({examSession.exam_type})
              </p>
            )}
          </div>
        </div>

        {/* Student Information */}
        <div className="mb-6 text-sm space-y-3 relative z-10">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">NAME: </span>
                <span className="bg-white px-2 text-slate-800 font-medium">
                  {data.student?.name || data.student?.full_name || ""}
                </span>
            
              <span className="ml-4 font-semibold text-slate-700">AGE: </span> <span className="bg-white px-2 text-slate-800 font-medium">
                  {data.student?.age || ""}
                </span>
              
            </div>
          </div>

          <div className="mb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">CLASS: </span> <span className="bg-white px-2 text-slate-800 font-medium">
                  {(data.student as any)?.student_class || data.student?.class || 'PRIMARY 1'}
                </span>
              
              <span className="ml-4 font-semibold text-slate-700">NO IN CLASS: </span><span className="bg-white px-2 text-slate-800 font-medium">
                  {data.total_students || ''}
                </span>
              <span className="ml-4 font-semibold text-slate-700">POSITION IN CLASS: </span> <span className="bg-white px-2 text-slate-800 font-medium">
                  {data.class_position ? `${data.class_position}${getOrdinalSuffix(data.class_position)}` : ''}
                </span>
            
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">NUMBER OF TIMES SCHOOL OPENED: </span> <span className="bg-white px-2 text-slate-800 font-medium">
                  {data.attendance?.times_opened || ""}
                </span>
              <span className="ml-4 font-semibold text-slate-700">NUMBER OF TIMES PRESENT: </span><span className="bg-white px-2 text-slate-800 font-medium">
                  {data.attendance?.times_present || ""}
                </span>
              <span className="ml-4 font-semibold text-slate-700">NEXT TERM BEGINS: </span> <span className="bg-white px-2 text-slate-800 font-medium">
                  {correctedNextTermBegins ? new Date(correctedNextTermBegins).toLocaleDateString() : (data.next_term_begins ? new Date(data.next_term_begins).toLocaleDateString() : "")}
                </span>
              
            </div>
          </div>

          {/* Template and Session Info */}
          {(templateId || examSession) && (
            <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
              <div className="text-xs text-gray-700 space-y-1">
                {templateId && (
                  <div><span className="font-medium">Template ID:</span> {templateId}</div>
                )}
                {examSession && (
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="font-medium">Session Type:</span> {examSession.exam_type}</div>
                    <div><span className="font-medium">Term:</span> {examSession.term}</div>
                    <div><span className="font-medium">Start Date:</span> {new Date(examSession.start_date).toLocaleDateString()}</div>
                    <div><span className="font-medium">End Date:</span> {new Date(examSession.end_date).toLocaleDateString()}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Academic Performance title */}
        <div className="text-center font-semibold text-base mb-2 text-blue-900 rounded-lg relative z-10">
          ACADEMIC PERFORMANCE
        </div>

        {/* Main table area */}
        <div className="overflow-x-auto mb-6 relative z-10">
          <table className="w-full border-collapse border-2 border-slate-800 min-w-full bg-white">
            <thead>
              <tr style={{ height: '100px' }}>
                <th 
                  className="border border-slate-600 p-2 text-left align-top bg-slate-100"
                  style={{ width: '180px', height: '100px' }}
                >
                  <div className="text-[10px] font-bold mb-1 text-slate-800">SUBJECTS/KEY TO GRADING</div>
                  {grades.length > 0 ? (
                    <div className="text-[9px] leading-tight space-y-0.5 text-slate-600">
                      {grades
                        .sort((a, b) => b.min_score - a.min_score)
                        .slice(0, 6)
                        .map(grade => (
                          <div key={grade.id}>
                            {grade.grade} {grade.description || grade.remark} {grade.min_score} - {grade.max_score}%
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-[8px] leading-tight space-y-0.5 text-slate-600">
                      <div>A DISTINCTION 70.00 - 100.00%</div>
                      <div>B VERY GOOD 60.00 - 69.00%</div>
                      <div>C GOOD 50.00 - 59.00%</div>
                      <div>D PASS 45.00 - 49.00%</div>
                      <div>D FAIR 40.00 - 44.00%</div>
                      <div>F 0.00 - 39.00%</div>
                    </div>
                  )}
                </th>

                {/* Rotated column headers */}
                {COLUMN_HEADERS.map((header, idx) => (
                  <th 
                    key={idx}
                    className="border border-slate-600 p-0.5 relative bg-slate-200"
                    style={{ 
                      width: '45px', 
                      height: '100px',
                      minWidth: '32px'
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div 
                        className="transform -rotate-90 origin-center text-[9px] font-medium text-center leading-tight text-slate-700"
                        style={{ 
                          writingMode: 'horizontal-tb',
                          transformOrigin: 'center center',
                          width: '90px',
                          textAlign: 'center',
                          height: '100px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center'
                        }}
                      >
                        {header.split('\n').map((line, i) => (
                          <div key={i} style={{ 
                            marginBottom: i < header.split('\n').length - 1 ? '3px' : '0',
                            lineHeight: '1.1'
                          }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  </th>
                ))}

                <th 
                  className="border border-slate-600 p-1 text-center font-bold bg-slate-300"
                  style={{ width: '40px', height: '100px' }}
                >
                  <div className="text-[10px] flex items-center justify-center h-full text-slate-800">GRADE</div>
                </th>
              </tr>
            </thead>

            <tbody>
              {subjectsToUse.map((subjectData, idx) => {
                const subject = subjectData.subject?.name || 'Unknown Subject';
                const totalScore = subjectData ? subjectData.mark_obtained || 0 : 0;
                const gradeInfo = getGradeForScore(totalScore);
                
                return (
                  <tr key={idx}>
                    <td 
                      className={`border border-slate-600 p-2 font-semibold text-[10px] ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                      style={{ minHeight: '24px' }}
                    >
                      {subject}
                    </td>
                    
                    {/* Continuous Assessment Score (15 marks) */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {subjectData?.continuous_assessment_score && !isNaN(subjectData.continuous_assessment_score) ? Math.round(subjectData.continuous_assessment_score) : ''}
                    </td>
                    
                    {/* Take Home Test */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {subjectData?.take_home_test_score && !isNaN(subjectData.take_home_test_score) ? Math.round(subjectData.take_home_test_score) : ''}
                    </td>
                    
                    {/* Project Marks */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {subjectData?.project_score && !isNaN(subjectData.project_score) ? Math.round(subjectData.project_score) : ''}
                    </td>
                    
                    {/* Appearance Marks */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {subjectData?.appearance_score && !isNaN(subjectData.appearance_score) ? Math.round(subjectData.appearance_score) : ''}
                    </td>
                    
                    {/* Practical Marks */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {subjectData?.practical_score && !isNaN(subjectData.practical_score) ? Math.round(subjectData.practical_score) : ''}
                    </td>
                    
                    {/* Note Copying Marks */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {subjectData?.note_copying_score && !isNaN(subjectData.note_copying_score) ? Math.round(subjectData.note_copying_score) : ''}
                    </td>
                    
                    {/* CA Total */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs font-semibold ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {subjectData ? (() => {
                        const caTotal = calculateCATotal(subjectData);
                        const rounded = Math.round(caTotal);
                        console.log(`🔍 [PrimaryResult] CA Total for ${subject}: ${caTotal} -> ${rounded}`);
                        return isNaN(rounded) ? '0' : rounded;
                      })() : ''}
                    </td>
                    
                    {/* Exam Score */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {subjectData?.exam_marks && !isNaN(subjectData.exam_marks) ? Math.round(subjectData.exam_marks) : ''}
                    </td>
                    
                    {/* Total Score */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs font-bold ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {(() => {
                        if (!subjectData) return '';
                        
                        // Check if mark_obtained is valid (not concatenated)
                        const markObtained = Number(subjectData.mark_obtained) || 0;
                        const isMarkObtainedValid = subjectData.mark_obtained && 
                                                 !isNaN(markObtained) && 
                                                 markObtained > 0 &&
                                                 String(subjectData.mark_obtained).length < 20;
                        
                        if (isMarkObtainedValid) {
                          return Math.round(markObtained);
                        } else {
                          // Calculate from CA + Exam
                          const caTotal = calculateCATotal(subjectData);
                          const examMarks = Number(subjectData.exam_marks) || 0;
                          const calculatedTotal = caTotal + examMarks;
                          return Math.round(calculatedTotal);
                        }
                      })()}
                    </td>
                    
                    {/* Position */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {(() => {
                        // Try different possible position field names
                        let position = '';
                        
                        // Check if position is already formatted (contains 'st', 'nd', 'rd', 'th')
                        if (subjectData?.position && typeof subjectData.position === 'string' && 
                            (subjectData.position.includes('st') || subjectData.position.includes('nd') || 
                             subjectData.position.includes('rd') || subjectData.position.includes('th'))) {
                          position = subjectData.position;
                        } else if (subjectData?.subject_position && typeof subjectData.subject_position === 'number') {
                          position = `${subjectData.subject_position}${getOrdinalSuffix(subjectData.subject_position)}`;
                        } else if (subjectData?.position && typeof subjectData.position === 'number') {
                          position = `${subjectData.position}${getOrdinalSuffix(subjectData.position)}`;
                        } else if (subjectData?.subject?.name?.toLowerCase().includes('national values')) {
                          position = '1st'; // TEMPORARY: Hardcode National Values as 1st
                        } else if (subject?.toLowerCase().includes('national value')) {
                          // Additional check for National Values in the subject name
                          position = '1st';
                        }
                        
                        console.log(`🔍 [PrimaryResult] Position for ${subject}:`, {
                          position: subjectData?.position,
                          subject_position: subjectData?.subject_position,
                          final: position
                        });
                        return position;
                      })()}
                    </td>
                    
                    {/* Grade */}
                    <td className={`border border-slate-600 p-0.5 text-center text-xs font-bold ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {subjectData?.grade || (subjectData ? gradeInfo.grade : '')}
                    </td>
                    
                    {/* Teacher Remarks */}
                    <td className={`border border-slate-600 p-0.5 text-center text-[8px] ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {subjectData?.teacher_remark || ''}
                    </td>
                    
                    <td 
                      className={`border border-slate-600 p-0.5 text-center text-xs font-bold ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                      style={{ width: '40px' }}
                    >
                      {subjectData?.grade || (subjectData ? gradeInfo.grade : '')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer area */}
        <div className="flex justify-between text-sm relative z-10">
          {/* Left side - Totals and Physical Development */}
          <div className="flex-1 pr-6">
            <div className="mb-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="mb-2 text-xs font-semibold text-slate-700">
                Total Scores: <span className="w-20 text-center font-bold text-blue-800">
                  {(() => {
                    const displayTotal = totalScore || data.total_score || 0;
                    console.log('🔍 [PrimaryResult] Display - Total score:', displayTotal);
                    return Math.round(Number(displayTotal));
                  })()}
                </span>
              </div>
              <div className="mb-2 text-xs font-semibold text-slate-700">
                Average Scores: <span className="w-20 text-center font-bold text-blue-800">
                  {(() => {
                    const displayAverage = averageScore || data.average_score || 0;
                    console.log('🔍 [PrimaryResult] Display - Average score:', displayAverage);
                    return Math.round(Number(displayAverage) * 100) / 100;
                  })()}
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-700">
                Grade: <span className="w-20 text-center font-bold text-blue-800">
                  {data.overall_grade || (averageScore || data.average_score ? getGradeForScore(averageScore || data.average_score).grade : 'F')}
                </span>
              </div>
            </div>

            {/* Physical Development Table */}
            <div className="border-2 border-slate-800 rounded-lg overflow-hidden" style={{ width: '360px' }}>
              <div className="text-center font-bold py-2 text-xs bg-blue-900 text-white">
                PHYSICAL DEVELOPMENT
              </div>
              
              <table className="w-full border-collapse bg-white">
                <thead>
                  <tr>
                    <th className="border border-slate-600 p-1 text-center font-bold text-[10px] bg-slate-100" colSpan={2}>
                      HEIGHT
                    </th>
                    <th className="border border-slate-600 p-1 text-center font-bold text-[10px] bg-slate-100" colSpan={2}>
                      WEIGHT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-[9px]">
                    <td className="border border-slate-600 p-1 text-left bg-slate-50">
                      Beginning of<br />Term
                    </td>
                    <td className="border border-slate-600 p-1 text-left bg-white">
                      End of<br />Term
                    </td>
                    <td className="border border-slate-600 p-1 text-left bg-slate-50">
                      Beginning of<br />Term
                    </td>
                    <td className="border border-slate-600 p-1 text-left bg-white">
                      End of<br />Term
                    </td>
                  </tr>
                  <tr className="text-[9px] text-left">
                    <td className="border border-slate-600 p-1 text-center">cm</td>
                    <td className="border border-slate-600 p-1 text-center">cm</td>
                    <td className="border border-slate-600 p-1 text-center">cm</td>
                    <td className="border border-slate-600 p-1 text-center">cm</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-600 p-1 text-left text-[9px] bg-slate-100" colSpan={4}>
                      NURSE'S COMMENT: {data.nurse_comment || "Child is healthy and physically fit for academic activities."}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Right side - Comments and Signatures */}
          <div className="flex-1">
            <div className="mb-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
              <div className="font-semibold text-[10px] text-slate-800">CLASS TEACHER'S COMMENT:</div>
              <div className="text-[10px] mt-1 text-slate-600">
                {data.class_teacher_remark || "Good and intelligent pupil keep it up"}
              </div>
              <div className="mt-2">
                <div className="text-[9px] font-medium text-slate-700 mb-1">CLASS TEACHER'S SIGNATURE:</div>
                {data.class_teacher_signature ? (
                  <div className="border border-slate-400 p-1 bg-white rounded">
                    <img 
                      src={data.class_teacher_signature} 
                      alt="Class Teacher Signature" 
                      className="h-8 w-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="border border-slate-400 p-1 bg-white rounded h-8 flex items-center justify-center text-slate-500 text-[8px]">
                    No signature
                  </div>
                )}
              </div>
            </div>
            
            <div className="mb-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
              <div className="font-semibold text-[10px] text-slate-800">HEAD TEACHER'S COMMENT:</div>
              <div className="text-[10px] mt-1 text-slate-600">
                {data.head_teacher_remark || "Such a zealous and hard working child. Impressive"}
              </div>
              <div className="mt-2">
                <div className="text-[9px] font-medium text-slate-700 mb-1">HEAD TEACHER'S SIGNATURE & STAMP:</div>
                {data.head_teacher_signature ? (
                  <div className="border border-slate-400 p-1 bg-white rounded">
                    <img 
                      src={data.head_teacher_signature} 
                      alt="Head Teacher Signature" 
                      className="h-8 w-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="border border-slate-400 p-1 bg-white rounded h-8 flex items-center justify-center text-slate-500 text-[8px]">
                    No signature
                  </div>
                )}
                <div className="text-[8px] text-slate-600 mt-1">Date: {new Date().toLocaleDateString()}</div>
              </div>
            </div>

          </div>
        </div>

        {/* Enhanced Publication and Template Status */}
        <div className="mt-1 text-center relative z-10">
          {/* Generation timestamp */}
          <div className="mt-2 text-xs text-slate-500">
            Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
            {studentId && ` | Student ID: ${studentId}`}
          </div>
        </div>
      </div>
    </div>
  );
}