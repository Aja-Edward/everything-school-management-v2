import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useResultService } from "@/hooks/useResultService";
import { SeniorSecondaryTermlyResultData } from '@/services/ResultCheckerService'
import type { 
  GradingSystem, 
  // EnhancedResultSheet, 
  ScoringConfiguration,
  // ExamSession 
} from "@/services/ResultSettingsService";

const SUBJECTS = [
  "MATHEMATICS",
  "ENGLISH LANGUAGE",
  "LITERATURE IN ENGLISH",
  "BIOLOGY",
  "PHYSICS",
  "CHEMISTRY",
  "GEOGRAPHY",
  "ANIMAL HUSBANDRY",
  "GOVERNMENT",
  "HISTORY",
  "ECONOMICS",
  "CIVIC EDUCATION",
  "COMMERCE",
  "CRK",
  "YORUBA/HAUSA/IGBO",
  "FOOD & NUTRITION",
  "ACCOUNTING",
  "F.MATHEMATICS",
  "COMPUTER SCIENCE",
];

interface SubjectScore {
  subject: string;
  t1: number | string;
  t2: number | string;
  t3: number | string;
  exam: number | string;
  total: number | string;
  classAverage: number | string;
  highest: number | string;
  lowest: number | string;
  position: number | string;
  grade: string;
  teacherRemark: string;
}

interface SeniorSecondaryResultProps {
  studentId: string;
  examSessionId: string;
  templateId?: string;
  data?: SeniorSecondaryTermlyResultData;
  showOnlyPublished?: boolean; // NEW: Control whether to show only published results
}

export default function SeniorSecondaryTermlyResult({ 
  studentId, 
  examSessionId, 
  // templateId,
  data,
  showOnlyPublished = false // NEW: Default to false (show all results)
}: SeniorSecondaryResultProps) {
  
  // State to store the corrected next_term_begins date
  const [correctedNextTermBegins, setCorrectedNextTermBegins] = useState<string | null>(null);
  
  console.log('🔍 [SeniorSecondaryTermlyResult] Component props received:');
  console.log('🔍 [SeniorSecondaryTermlyResult] studentId:', studentId);
  console.log('🔍 [SeniorSecondaryTermlyResult] examSessionId:', examSessionId);
  console.log('🔍 [SeniorSecondaryTermlyResult] data:', data);
  console.log('🔍 [SeniorSecondaryTermlyResult] data.next_term_begins:', data?.next_term_begins);
  console.log('🔍 [SeniorSecondaryTermlyResult] data.next_term_begins type:', typeof data?.next_term_begins);
  
  // Check if we need to fix the next_term_begins date
  useEffect(() => {
    const fixNextTermBegins = async () => {
      // If we receive "TBA" or invalid date, fetch the correct date from Term settings
      if (data?.next_term_begins === 'TBA' || !data?.next_term_begins || data?.next_term_begins === 'Invalid Date') {
        console.log('🔧 [SeniorSecondaryTermlyResult] Fixing next_term_begins - received:', data?.next_term_begins);
        
        try {
          // Import AcademicCalendarService to get Term settings
          const { default: AcademicCalendarService } = await import('@/services/AcademicCalendarService');
          
          // Get current academic session and terms
          const academicSessions = await AcademicCalendarService.getAcademicSessions();
          const currentSession = academicSessions.find(session => session.is_current);
          
          if (currentSession) {
            console.log('🔧 [SeniorSecondaryTermlyResult] Current academic session:', currentSession);
            
            // Get all terms and filter by current session
            const allTerms = await AcademicCalendarService.getTerms();
            const terms = allTerms.filter(term => term.academic_session === currentSession.id);
            console.log('🔧 [SeniorSecondaryTermlyResult] Available terms:', terms);
            
            // Find the current term and next term
            const currentTerm = terms.find(term => term.is_current);
            if (currentTerm) {
              console.log('🔧 [SeniorSecondaryTermlyResult] Current term:', currentTerm);
              
              // If current term has next_term_begins, use it
              if (currentTerm.next_term_begins) {
                console.log('🔧 [SeniorSecondaryTermlyResult] Found next_term_begins from current term:', currentTerm.next_term_begins);
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
                  console.log('🔧 [SeniorSecondaryTermlyResult] Found next_term_begins from next term:', nextTerm.next_term_begins);
                  setCorrectedNextTermBegins(nextTerm.next_term_begins);
                  return;
                }
              }
            }
          }
          
          // Fallback: Use a default date (you can set this to your school's next term date)
          const defaultDate = '2025-01-17'; // This should match your Term settings
          console.log('🔧 [SeniorSecondaryTermlyResult] Using fallback date:', defaultDate);
          setCorrectedNextTermBegins(defaultDate);
          
        } catch (error) {
          console.error('🔧 [SeniorSecondaryTermlyResult] Error fetching next term begins date:', error);
          // Use fallback date
          setCorrectedNextTermBegins('2025-01-17');
        }
      } else {
        console.log('🔧 [SeniorSecondaryTermlyResult] next_term_begins is already correct:', data?.next_term_begins);
        setCorrectedNextTermBegins(data?.next_term_begins);
      }
    };
    
    fixNextTermBegins();
  }, [data?.next_term_begins]);
  
  // Check if data is coming from props or if component will fetch its own data
  console.log('🔍 [SeniorSecondaryTermlyResult] Data source check:');
  console.log('🔍 [SeniorSecondaryTermlyResult] Has data prop:', !!data);
  console.log('🔍 [SeniorSecondaryTermlyResult] Will fetch own data:', !data && studentId);
  
  // Enhanced debug logging
  console.log('🎓 [SeniorSecondaryTermlyResult] Component received props:', { studentId, examSessionId, data });
  console.log('🎓 [SeniorSecondaryTermlyResult] Data structure:', data);
  console.log('🎓 [SeniorSecondaryTermlyResult] Student data:', data?.student);
  console.log('🎓 [SeniorSecondaryTermlyResult] Subjects data:', data?.subjects);
  console.log('🔧 [SeniorSecondaryTermlyResult] Corrected next_term_begins:', correctedNextTermBegins);
  
  const ref = useRef<HTMLDivElement>(null);
  const { service, schoolSettings, loading: serviceLoading, isReady } = useResultService();
  
  // Debug school settings
  console.log('School Settings:', schoolSettings);
  
  const [resultData, setResultData] = useState<SeniorSecondaryTermlyResultData | null>(data || null);
  const [gradingSystem, setGradingSystem] = useState<GradingSystem | null>(null);
  const [scoringConfig, setScoringConfig] = useState<ScoringConfiguration | null>(null);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // Filter subjects based on showOnlyPublished prop - using useMemo to avoid initialization issues
  const subjectsToUse = useMemo(() => {
    if (!resultData?.subjects) return [];
    
    if (showOnlyPublished) {
      // Filter for published subjects only (for ResultChecker/student view)
      const publishedSubjects = resultData.subjects.filter((subject: any) => subject.status === 'PUBLISHED');
      
      console.log('🔍 [SeniorSecondaryTermlyResult] FILTERING MODE: Published only');
      console.log('🔍 [SeniorSecondaryTermlyResult] Total subjects:', resultData.subjects.length);
      console.log('🔍 [SeniorSecondaryTermlyResult] Published subjects:', publishedSubjects.length);
      console.log('🔍 [SeniorSecondaryTermlyResult] Published subject names:', publishedSubjects.map(s => s.subject?.name));
      
      return publishedSubjects;
    } else {
      // Show all subjects (for Admin Results tab)
      console.log('🔍 [SeniorSecondaryTermlyResult] FILTERING MODE: Show all results');
      console.log('🔍 [SeniorSecondaryTermlyResult] Total subjects:', resultData.subjects.length);
      return resultData.subjects;
    }
  }, [resultData?.subjects, showOnlyPublished]);


  useEffect(() => {
  const fetchData = async () => {
    if (!isReady || !studentId || !examSessionId) return;

    try {
      setLoading(true);
      setError(null);

      // If data is provided, just fetch grading systems and scoring configs
      if (data) {
        const [gradingSystems, scoringConfigs] = await Promise.all([
          service.getGradingSystems(),
          service.getScoringConfigurationsByEducationLevel('SENIOR_SECONDARY')
        ]);
        
        // Set active grading system and scoring config
        const activeGradingSystem = gradingSystems.find((system: any) => system.is_active);
        if (activeGradingSystem) {
          setGradingSystem(activeGradingSystem);
        }
        
        const activeScoringConfig = scoringConfigs.find((config: any) => config.is_active);
        if (activeScoringConfig) {
          setScoringConfig(activeScoringConfig);
        }
        
        setLoading(false);
        return;
      }

      // Fetch senior secondary term report (consolidated data) and individual results
      const [
        termReports,
        subjectResults,
        gradingSystems,
        scoringConfigs
      ] = await Promise.all([
        (service as any).getSeniorSecondaryTermReports({ 
          student: studentId, 
          exam_session: examSessionId 
        }),
        service.getSeniorSecondaryTermlyResults({ 
          student: studentId, 
          exam_session: examSessionId 
        }),
        service.getGradingSystems(),
        service.getScoringConfigurationsByEducationLevel('SENIOR_SECONDARY')
      ]);

      // Debug the fetched data
      console.log('Term Reports:', termReports);
      console.log('Subject Results:', subjectResults);
      console.log('Grading Systems:', gradingSystems);
      console.log('Scoring Configs:', scoringConfigs);
      
      // Debug term reports specifically
      if (termReports && termReports.length > 0) {
        console.log('🔍 [SeniorSecondaryTermlyResult] First term report:', termReports[0]);
        console.log('🔍 [SeniorSecondaryTermlyResult] First term report next_term_begins:', termReports[0]?.next_term_begins);
        console.log('🔍 [SeniorSecondaryTermlyResult] First term report next_term_begins type:', typeof termReports[0]?.next_term_begins);
      } else {
        console.log('🔍 [SeniorSecondaryTermlyResult] No term reports found or empty array');
      }
      
      // Check if we have any data
      if (!subjectResults || subjectResults.length === 0) {
        console.error('No subject results found!');
        setError('No subject results found for this student and exam session.');
        setLoading(false);
        return;
      }

      // Transform the array of subject results into SeniorSecondaryTermlyResultData format
      if (subjectResults && subjectResults.length > 0) {
        // Get consolidated data from term report if available
        const termReport = termReports && termReports.length > 0 ? termReports[0] : null;
        console.log('Using Term Report:', termReport);
        
        // Debug the first subject result to see the structure
        console.log('First Subject Result:', subjectResults[0]);
        console.log('Student Data:', subjectResults[0].student);
        
        const transformedData: SeniorSecondaryTermlyResultData = {
          id: `termly-${studentId}-${examSessionId}`,
          student: {
            id: studentId,
            name: subjectResults[0].student?.name || subjectResults[0].student?.full_name || studentId,
            username: subjectResults[0].student?.username || studentId,
            admission_number: subjectResults[0].student?.registration_number || studentId, 
            class: subjectResults[0].student?.class || subjectResults[0].student?.student_class || 'SSS', 
            education_level: 'SENIOR_SECONDARY',
            age: subjectResults[0].student?.age
          },
          term: {
            id: examSessionId,
            name: subjectResults[0].exam_session?.name || subjectResults[0].exam_session?.term_display || 'Current Term', 
            start_date: subjectResults[0].exam_session?.start_date || new Date().toISOString(), 
            end_date: subjectResults[0].exam_session?.end_date || new Date().toISOString(),   
            academic_session: typeof subjectResults[0].exam_session?.academic_session === 'object' 
              ? subjectResults[0].exam_session.academic_session 
              : {
                  id: examSessionId,
                  name: subjectResults[0].exam_session?.academic_session_name || 'Current Session', 
                  start_date: new Date().toISOString(),
                  end_date: new Date().toISOString(),
                  is_current: true,
                  is_active: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                }
          },
          subjects: subjectResults.map((result: any) => ({
            id: result.id,
            subject: {
              id: result.subject?.id || result.subject,
              name: result.subject?.name || result.subject_name || result.subject, 
              code: result.subject?.code || result.subject_name || result.subject
            },
            test1_score: result.test1_score || result.first_test_score || 0,
            test2_score: result.test2_score || result.second_test_score || 0,
            test3_score: result.test3_score || result.third_test_score || 0,
            exam_score: result.exam_score || 0,
            total_score: result.total_score || 0,
            total_obtainable: 100,
            class_average: result.class_average || 0,
            highest_in_class: result.highest_in_class || 0,
            lowest_in_class: result.lowest_in_class || 0,
            position: result.position || 0,
            grade: result.grade || '',
            teacher_remark: result.teacher_remark || '',
            percentage: result.percentage || 0
          })),
          total_score: termReport?.total_score || subjectResults.reduce((sum: number, result: any) => sum + (result.total_score || 0), 0),
          average_score: termReport?.average_score || (subjectResults.length > 0 
            ? subjectResults.reduce((sum: number, result: any) => sum + (result.total_score || 0), 0) / subjectResults.length
            : 0),
          overall_grade: termReport?.overall_grade || '', // Will be calculated later with grading system
          class_position: termReport?.class_position || 0,
          total_students: termReport?.total_students || 0,
          attendance: {
            times_opened: termReport?.times_opened || 0,
            times_present: termReport?.times_present || 0
          },
          next_term_begins: (() => {
            console.log('🔍 [SeniorSecondaryTermlyResult] termReport:', termReport);
            console.log('🔍 [SeniorSecondaryTermlyResult] termReport?.next_term_begins:', termReport?.next_term_begins);
            console.log('🔍 [SeniorSecondaryTermlyResult] termReport?.next_term_begins type:', typeof termReport?.next_term_begins);
            console.log('🔧 [SeniorSecondaryTermlyResult] Using corrected next_term_begins:', correctedNextTermBegins);
            return correctedNextTermBegins || termReport?.next_term_begins;
          })(),
          class_teacher_remark: termReport?.class_teacher_remark || '',
          head_teacher_remark: termReport?.head_teacher_remark || '',
          is_published: termReport?.is_published || false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Filter subjects to only include published ones
        const publishedSubjectResults = transformedData.subjects.filter((subject: any) => subject.status === 'PUBLISHED');
        
        // Recalculate totals based on published subjects only
        const publishedTotalScore = publishedSubjectResults.reduce((sum: number, subject: any) => sum + (subject.total_score || 0), 0);
        const publishedAverageScore = publishedSubjectResults.length > 0 
          ? publishedTotalScore / publishedSubjectResults.length 
          : 0;
        
        console.log('🔍 [SeniorSecondaryTermlyResult] All subjects:', transformedData.subjects.length);
        console.log('🔍 [SeniorSecondaryTermlyResult] Published subjects:', publishedSubjectResults.length);
        console.log('🔍 [SeniorSecondaryTermlyResult] Recalculated total from published:', publishedTotalScore);
        console.log('🔍 [SeniorSecondaryTermlyResult] Recalculated average from published:', publishedAverageScore);
        
        // Update the transformed data with published-only calculations
        transformedData.subjects = transformedData.subjects; // Keep all subjects but will filter in display
        transformedData.total_score = publishedTotalScore;
        transformedData.average_score = publishedAverageScore;
        
        setResultData(transformedData);
        
        // Set active grading system and scoring config
        const activeGradingSystem = gradingSystems.find((system: any) => system.is_active);
        if (activeGradingSystem) {
          setGradingSystem(activeGradingSystem);
        }
        
        const activeScoringConfig = scoringConfigs.find((config: any) => config.is_active);
        if (activeScoringConfig) {
          setScoringConfig(activeScoringConfig);
        }
      } else {
        setError('No subject results found for this student and exam session.');
      }

    } catch (err) {
      console.error('Error fetching result data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load result data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  fetchData();
}, [isReady, studentId, examSessionId, data, service]);

  // Load grading system and scoring configuration
  useEffect(() => {
    const loadConfigurations = async () => {
      if (!isReady) return;

      try {
        const [gradingSystems, scoringConfigs] = await Promise.all([
          service.getGradingSystems(),
          service.getScoringConfigurationsByEducationLevel('SENIOR_SECONDARY')
        ]);

        const activeGradingSystem = gradingSystems.find((system: GradingSystem) => system.is_active);
        if (activeGradingSystem) {
          setGradingSystem(activeGradingSystem);
        }

        const seniorScoringConfig = scoringConfigs.find((config: ScoringConfiguration) => 
          config.education_level === 'SENIOR_SECONDARY' && config.is_active
        );
        if (seniorScoringConfig) {
          setScoringConfig(seniorScoringConfig);
        }
      } catch (err) {
        console.error('Error loading configurations:', err);
        // Don't set error state as this is not critical
      }
    };

    loadConfigurations();
  }, [isReady, service]);

  // Enhanced PDF download with better error handling
  const downloadPDF = useCallback(async () => {
    const element = ref.current;
    if (!element || !resultData) return;

    try {
      setIsGeneratingPDF(true);
      
      const canvas = await html2canvas(element, { 
        scale: 2, // Better quality than devicePixelRatio
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        removeContainer: true,
        scrollX: 0,
        scrollY: 0,
        width: element.scrollWidth,
        height: element.scrollHeight
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgProps = (pdf as any).getImageProperties(imgData);
      const imgWidth = pdfWidth;
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      if (imgHeight <= pdfHeight) {
        // Single page
        (pdf as any).addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      } else {
        // Multiple pages for longer content
        let remainingHeight = imgHeight;
        let yPosition = 0;
        
        while (remainingHeight > 0) {
          if (yPosition > 0) {
            (pdf as any).addPage();
          }
          
          (pdf as any).addImage(
            imgData, 
            'PNG', 
            0, 
            -yPosition, 
            imgWidth, 
            imgHeight
          );
          
          yPosition += pdfHeight;
          remainingHeight -= pdfHeight;
        }
      }

      const fileName = `${resultData.student?.name || resultData.student?.id || studentId}_senior_secondary_result.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [resultData, studentId]);

  // Calculate grade based on score and grading system
  const getGrade = useCallback((score: number): string => {
    if (!gradingSystem?.grades || isNaN(score)) return '';
    
    const sortedGrades = gradingSystem.grades
      .sort((a, b) => b.min_score - a.min_score);
    
    const grade = sortedGrades.find(g => score >= g.min_score && score <= g.max_score);
    return grade?.grade || '';
  }, [gradingSystem]);

  // Get subject result data with improved matching - from subjects to use
  const getSubjectData = useCallback((subjectName: string) => {
    if (!subjectsToUse || subjectsToUse.length === 0) return null;
    
    const normalizedSubjectName = subjectName.toLowerCase().trim();
    
    return subjectsToUse.find((subject: any) => {
      const normalizedDbSubject = subject.subject.name.toLowerCase().trim();
      
      // Exact match
      if (normalizedDbSubject === normalizedSubjectName) return true;
      
      // Contains match
      if (normalizedDbSubject.includes(normalizedSubjectName) || 
          normalizedSubjectName.includes(normalizedDbSubject)) return true;
      
      // Special case mappings for common variations
      const mappings: Record<string, string[]> = {
        'economics': ['economic'],
        'food & nut or h.mgt': ['food & nutrition', 'home management', 'food and nutrition'],
        'further maths': ['further mathematics'],
        'computer': ['computer science'],
        'bookkeeping/accounting': ['accounting', 'bookkeeping'],
      };
      
      for (const [key, aliases] of Object.entries(mappings)) {
        if (normalizedSubjectName.includes(key)) {
          return aliases.some(alias => normalizedDbSubject.includes(alias));
        }
        if (aliases.some(alias => normalizedSubjectName.includes(alias))) {
          return normalizedDbSubject.includes(key);
        }
      }
      
      return false;
    });
  }, [subjectsToUse]);

  // Transform subject data with improved error handling
  const transformSubjectScores = useCallback((): SubjectScore[] => {
    return SUBJECTS.map(subject => {
      const subjectData = getSubjectData(subject);
      if (!subjectData) {
        return {
          subject,
          t1: "",
          t2: "",
          t3: "",
          exam: "",
          total: "",
          classAverage: "",
          highest: "",
          lowest: "",
          position: "",
          grade: "",
          teacherRemark: ""
        };
      }

      const t1 = Number(subjectData.test1_score) || 0;
      const t2 = Number(subjectData.test2_score) || 0;
      const t3 = Number(subjectData.test3_score) || 0;
      const exam = Number(subjectData.exam_score) || 0;
      const total = t1 + t2 + t3 + exam;
      
      return {
        subject,
        t1: t1 > 0 ? t1 : "",
        t2: t2 > 0 ? t2 : "",
        t3: t3 > 0 ? t3 : "",
        exam: exam > 0 ? exam : "",
        total: total > 0 ? total : "",
        classAverage: subjectData.class_average || "",
        highest: subjectData.highest_in_class || "",
        lowest: subjectData.lowest_in_class || "",
        position: (() => {
          // Check if position is already formatted (contains 'st', 'nd', 'rd', 'th')
          if (subjectData?.position && typeof subjectData.position === 'string' && 
              ((subjectData.position as string).includes('st') || (subjectData.position as string).includes('nd') || 
               (subjectData.position as string).includes('rd') || (subjectData.position as string).includes('th'))) {
            return subjectData.position;
          } else if (subjectData?.subject_position && typeof subjectData.subject_position === 'number') {
            return `${subjectData.subject_position}${getOrdinalSuffix(subjectData.subject_position)}`;
          } else if (subjectData?.position && typeof subjectData.position === 'number') {
            return `${subjectData.position}${getOrdinalSuffix(subjectData.position)}`;
          }
          return "";
        })(),
        grade: total > 0 ? getGrade(total) : "",
        teacherRemark: subjectData.teacher_remark || ""
      };
    });
  }, [getSubjectData, getGrade]);

  // Helper function to get position with ordinal suffix
  const getOrdinalSuffix = (num: number): string => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return "st";
    if (j === 2 && k !== 12) return "nd";
    if (j === 3 && k !== 13) return "rd";
    return "th";
  };

  // Loading state
  if (serviceLoading || loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading result data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center text-red-600 max-w-md">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-lg font-semibold mb-2">Error Loading Result</p>
          <p className="text-sm">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No data state
  if (!resultData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center text-gray-600">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-lg font-semibold mb-2">No Data Available</p>
          <p className="text-sm">No result data found for this student and session.</p>
        </div>
      </div>
    );
  }

  const subjectScores = transformSubjectScores();

  // Calculate pass/fail based on average score
  const passThreshold = gradingSystem?.pass_mark || 50;
  const averageScore = Number(resultData.average_score) || 0;
  const isPassed = averageScore >= passThreshold;

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      {/* Action Bar */}
      <div className="mb-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4">
          <button
            onClick={downloadPDF}
            disabled={isGeneratingPDF}
            className="px-4 py-2 bg-indigo-700 text-white rounded shadow hover:bg-indigo-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGeneratingPDF ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                Generating PDF...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download PDF
              </>
            )}
          </button>
        </div>
        
        <div className="text-sm text-gray-600 flex flex-wrap items-center gap-4">
          <span>Student ID: <strong>{studentId}</strong></span>
          <span>Session: <strong>{resultData.term?.academic_session?.name || 'N/A'}</strong></span>
          <span>Term: <strong>{resultData.term?.name || 'N/A'}</strong></span>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            resultData.is_published 
              ? 'bg-green-100 text-green-800' 
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {resultData.is_published ? 'Published' : 'Draft'}
          </span>
        </div>
      </div>

      {/* Result Sheet */}
      <div ref={ref} className="bg-white p-8 max-w-4xl mx-auto shadow-lg">
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
          {schoolSettings?.school_name?.split(' ').map((word: string) => word[0]).join('') || 'LOGO'}
        </div>
      )}
    </div>

    {/* School name block - 70% width, centered */}
    <div className="text-center">
      <h1 className="text-2xl font-bold text-blue-900">
        {schoolSettings?.school_name?.toUpperCase() || "SCHOOL NAME"}
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
  <h2 className="text-xl font-bold mb-2 text-blue-800">STUDENT'S TERMLY REPORT</h2>
  <p className="text-sm">
    {(resultData as any).exam_session?.term_display || resultData.term?.name || 'Term'} Term, {(resultData as any).exam_session?.academic_session_name || resultData.term?.academic_session?.name || 'Academic Session'} Academic Session
  </p>
</div>

        {/* Student Information */}
        <div className="mb-6 text-sm space-y-2">
          <div className="flex flex-wrap">
            <span className="font-semibold min-w-0 flex-1">Name: {resultData.student?.name?.toUpperCase() || 'STUDENT NAME'}</span>
            <span className="font-semibold ml-4">Class: {(resultData.student as any)?.student_class || resultData.student?.class || 'SSS 2'}</span>
            <span className="font-semibold ml-4">Year: {(resultData as any).exam_session?.academic_session_name || resultData.term?.academic_session?.name || 'N/A'}</span>
          </div>
          
          <div className="flex flex-wrap">
            <span className="font-semibold">Age: {resultData.student?.age || 'N/A'}</span>
            <span className="ml-6 font-semibold">Average: {Math.round(averageScore * 100) / 100}</span>
            <span className="ml-6 font-semibold">Class Age: {resultData.student?.age || 'N/A'}</span>
            <span className="ml-6 font-semibold">No in class: {resultData.total_students || 'N/A'}</span>
            <span className="ml-6 font-semibold">Next Term Begins: {correctedNextTermBegins || resultData.next_term_begins}</span>
          </div>

          <div className="flex flex-wrap">
            <span className="font-semibold">No of Times School Opened: {resultData.attendance?.times_opened || 'N/A'}</span>
            <span className="ml-6 font-semibold">No of Attendance: {resultData.attendance?.times_present || 'N/A'}</span>
            <span className="ml-6 font-semibold">G.P.: {resultData.overall_grade || getGrade(averageScore)}</span>
          </div>

          <div className="flex flex-wrap items-center">
            <span className="font-semibold">Average Score: </span>
            <span className="ml-2 px-2 py-1 bg-blue-100 rounded font-medium">
              {Math.round(averageScore * 100) / 100}
            </span>

            <span className="ml-6 font-semibold">Grade: </span>
            <span className="ml-2 px-2 py-1 bg-green-100 rounded font-medium">
              {getGrade(averageScore)}
            </span>

            <span className="ml-6 font-semibold">Result: </span>
            <span className={`ml-2 px-2 py-1 rounded font-medium ${
              isPassed 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {isPassed ? 'PASS' : 'FAIL'}
            </span>
          </div>

          <div>
            <span className="font-semibold">Position in Class: </span>
            <span className="ml-2 px-2 py-1 bg-yellow-100 rounded font-medium">
              {resultData.class_position || 'N/A'} of {resultData.total_students || 'N/A'}
            </span>
          </div>
        </div>

{/* Results Table */}
<div className="mt-6">
  <div className="w-full overflow-hidden">
    <table className="w-full text-xs border-collapse table-fixed" style={{ border: "2px solid #333" }}>
      <colgroup>
        <col style={{ width: '18%' }} /> {/* Subject */}
        <col style={{ width: '6%' }} />  {/* 1st Test */}
        <col style={{ width: '6%' }} />  {/* 2nd Test */}
        <col style={{ width: '6%' }} />  {/* 3rd Test */}
        <col style={{ width: '8%' }} />  {/* Exam */}
        <col style={{ width: '8%' }} />  {/* Term Total */}
        <col style={{ width: '8%' }} />  {/* Class Average */}
        <col style={{ width: '7%' }} />  {/* Highest */}
        <col style={{ width: '7%' }} />  {/* Lowest */}
        <col style={{ width: '7%' }} />  {/* Position */}
        <col style={{ width: '6%' }} />  {/* Grade */}
        <col style={{ width: '13%' }} /> {/* Teacher's Remark */}
      </colgroup>
      
      <thead>
        <tr>
          <th
            className="border-2 border-gray-800 px-1 py-2 text-left bg-blue-50 font-bold"
            rowSpan={2}
            style={{ verticalAlign: "middle" }}
          >
            <div className="font-semibold text-xs leading-tight">Subject</div>
          </th>

          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-50 font-bold" colSpan={4}>
            <div className="font-semibold text-xs">Test/Examination Scores</div>
          </th>

          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-50 font-bold" rowSpan={2}>
            <div className="font-semibold text-xs leading-tight">Term<br />Total</div>
          </th>

          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-50 font-bold" rowSpan={2}>
            <div className="font-semibold text-xs leading-tight">Class<br />Average</div>
          </th>

          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-50 font-bold" rowSpan={2}>
            <div className="font-semibold text-xs leading-tight">Highest</div>
          </th>

          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-50 font-bold" rowSpan={2}>
            <div className="font-semibold text-xs leading-tight">Lowest</div>
          </th>

          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-50 font-bold" rowSpan={2}>
            <div className="font-semibold text-xs leading-tight">Position</div>
          </th>

          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-50 font-bold" rowSpan={2}>
            <div className="font-semibold text-xs leading-tight">Grade</div>
          </th>

          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-50 font-bold" rowSpan={2}>
            <div className="font-semibold text-xs leading-tight">Teacher's<br />Remark</div>
          </th>
        </tr>

        <tr>
          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-100 font-bold">
            <div className="text-xs leading-tight">
              {scoringConfig?.first_test_max_score || 10}<br />1st Test
            </div>
          </th>
          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-100 font-bold">
            <div className="text-xs leading-tight">
              {scoringConfig?.second_test_max_score || 10}<br />2nd Test
            </div>
          </th>
          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-100 font-bold">
            <div className="text-xs leading-tight">
              {scoringConfig?.third_test_max_score || 10}<br />3rd Test
            </div>
          </th>
          <th className="border-2 border-gray-800 px-1 py-1 text-center bg-blue-100 font-bold">
            <div className="text-xs leading-tight">
              {scoringConfig?.exam_max_score || 70}<br />Exam
            </div>
          </th>
        </tr>
      </thead>

      <tbody>
        {subjectScores.map((row, idx) => (
          <tr key={idx} className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-25`}>
            <td className="border border-gray-600 px-1 py-1 align-top text-xs font-medium">
              <div className="leading-tight break-words">{row.subject}</div>
            </td>

            <td className="border border-gray-600 px-1 py-1 text-center text-xs">{row.t1}</td>
            <td className="border border-gray-600 px-1 py-1 text-center text-xs">{row.t2}</td>
            <td className="border border-gray-600 px-1 py-1 text-center text-xs">{row.t3}</td>
            <td className="border border-gray-600 px-1 py-1 text-center text-xs">{row.exam}</td>

            <td className="border border-gray-600 px-1 py-1 text-center font-bold text-blue-700 bg-blue-25 text-xs">
              {row.total}
            </td>
            <td className="border border-gray-600 px-1 py-1 text-center text-xs">{row.classAverage}</td>
            <td className="border border-gray-600 px-1 py-1 text-center text-green-600 font-medium text-xs">{row.highest}</td>
            <td className="border border-gray-600 px-1 py-1 text-center text-red-600 font-medium text-xs">{row.lowest}</td>
            <td className="border border-gray-600 px-1 py-1 text-center font-medium text-xs">{row.position}</td>
            <td className="border border-gray-600 px-1 py-1 text-center font-bold text-blue-600 text-xs">{row.grade}</td>
            <td className="border border-gray-600 px-1 py-1 text-xs">
              <div className="leading-tight break-words">{row.teacherRemark}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

        {/* Footer remarks and signatures */}
        <div className="mt-3 text-sm space-y-4">
          <div>
            <div className="font-bold text-blue-900 mb-2">Form Master's Remark:</div>
            <div className="text-gray-800 bg-gray-50 p-3 rounded border italic">
              {resultData.class_teacher_remark || "Keep up the excellent work and maintain your high standards."}
            </div>
          </div>

          <div>
            <div className="font-bold text-blue-900 mb-2">Principal's Remarks:</div>
            <div className="text-gray-800 bg-gray-50 p-3 rounded border italic">
              {resultData.head_teacher_remark || "Outstanding performance. Continue to strive for excellence."}
            </div>
          </div>

          <div className="flex justify-between items-end mt-8 pt-8">
            <div className="text-center">
              <div className="border-b-2 border-gray-600 w-64 h-16 mb-2"></div>
              <div className="text-sm font-medium">Form Master's Signature & Date</div>
            </div>

            <div className="text-right">
              <div className="border-b border-gray-400 w-80 h-px mb-2"></div>
              <div className="text-xs text-right">Principal's Signature & Stamp</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}