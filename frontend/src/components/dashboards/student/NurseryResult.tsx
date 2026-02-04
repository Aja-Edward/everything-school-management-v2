import { useState, useEffect, useMemo } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { useResultService } from '@/hooks/useResultService';
import type { GradingSystem, GradeRange } from '@/services/ResultSettingsService';

// Updated interfaces to match your data structure
export interface StudentBasicInfo {
  id: string;
  name: string;
  full_name?: string;
  class: string;
  house?: string;
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
  max_marks_obtainable: number;
  mark_obtained: number;
  grade?: string;
  /**
   * Primary field for subject position.
   * Use formatPosition from resultHelpers for consistent display.
   */
  subject_position?: number | null;
  is_passed?: boolean;
  physical_development_score?: number;
  physical_development?: 'EXCELLENT' | 'VERY GOOD' | 'GOOD' | 'FAIR';
  health?: 'EXCELLENT' | 'VERY GOOD' | 'GOOD' | 'FAIR';
  cleanliness?: 'EXCELLENT' | 'VERY GOOD' | 'GOOD' | 'FAIR';
  general_conduct?: 'EXCELLENT' | 'VERY GOOD' | 'GOOD' | 'FAIR';
  academic_comment?: string;
  status?: string;
}

export interface NurseryResultData {
  id: string;
  student: StudentBasicInfo;
  term: TermInfo;
  subjects: SubjectResult[];
  total_score: number;
  max_marks_obtainable: number;
  mark_obtained: number;
  /**
   * Overall class position.
   * Use formatPosition from resultHelpers for consistent display.
   */
  class_position?: number | null;
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

type NurseryResultProps = {
  data: NurseryResultData;
  onDataChange?: (data: NurseryResultData) => void;
  showOnlyPublished?: boolean;
};

const SchoolLogo = ({ logoUrl, tenant_name }: { logoUrl?: string; tenant_name?: string }) => {
  if (logoUrl) {
    return (
      <div className="w-16 h-16 rounded-xl overflow-hidden shadow-lg border-2 border-indigo-600">
        <img 
          src={logoUrl} 
          alt={`${tenant_name || 'School'} Logo`}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.nextElementSibling?.classList.remove('hidden');
          }}
        />
        <div className="w-full h-full rounded-xl flex items-center justify-center text-white shadow-lg hidden" 
             style={{
               background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
               border: '2px solid #4f46e5'
             }}>
          <div className="text-center text-xs">
            <div className="font-bold text-base mb-1">
              {tenant_name?.split(' ').map(word => word[0]).join('').slice(0, 3) || 'SCH'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-16 h-16 rounded-xl flex items-center justify-center text-white shadow-lg" 
         style={{
           background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
           border: '2px solid #4f46e5'
         }}>
      <div className="text-center text-xs">
        <div className="font-bold text-base mb-1">
          {tenant_name?.split(' ').map(word => word[0]).join('').slice(0, 3) || 'SCH'}
        </div>
      </div>
    </div>
  );
};

const WatermarkLogo = ({ logoUrl, tenant_name }: { logoUrl?: string; tenant_name?: string }) => {
  if (logoUrl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.08] z-0">
        <div className="w-96 h-96 rounded-full overflow-hidden border-4 border-indigo-200">
          <img 
            src={logoUrl} 
            alt="Watermark"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.08] z-0">
      <div className="text-center">
        <div className="w-96 h-96 rounded-full flex items-center justify-center border-4 border-indigo-200 bg-gradient-to-br from-indigo-100 to-indigo-200 mb-4">
          <div className="text-8xl font-black text-indigo-600">
            {tenant_name?.split(' ').map(word => word[0]).join('').slice(0, 3) || 'SCH'}
          </div>
        </div>
        <div className="text-4xl font-bold text-indigo-400 tracking-wider">
          {tenant_name?.toUpperCase() || 'SCHOOL NAME'}
        </div>
      </div>
    </div>
  );
};

export default function NurseryResult({ data, showOnlyPublished = false }: NurseryResultProps) {
  const [correctedNextTermBegins, setCorrectedNextTermBegins] = useState<string | null>(null);
  
  const { service, schoolSettings, loading: serviceLoading, error: serviceError } = useResultService();
  const [gradingSystem, setGradingSystem] = useState<GradingSystem | null>(null);
  const [grades, setGrades] = useState<GradeRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fixNextTermBegins = async () => {
      if (!data?.next_term_begins || data?.next_term_begins === 'Invalid Date' || data?.next_term_begins === 'TBA') {
        try {
          const { default: AcademicCalendarService } = await import('@/services/AcademicCalendarService');
          
          const academicSessions = await AcademicCalendarService.getAcademicSessions();
          const currentSession = academicSessions.find(session => session.is_current);
          
          if (currentSession) {
            const allTerms = await AcademicCalendarService.getTerms();
            const terms = allTerms.filter(term => term.academic_session === currentSession.id);
            
            const currentTerm = terms.find(term => term.is_current);
            if (currentTerm) {
              if (currentTerm.next_term_begins) {
                setCorrectedNextTermBegins(currentTerm.next_term_begins);
                return;
              }
              
              const termOrder = ['FIRST', 'SECOND', 'THIRD'];
              const currentIndex = termOrder.indexOf(currentTerm.name);
              
              if (currentIndex < termOrder.length - 1) {
                const nextTermName = termOrder[currentIndex + 1];
                const nextTerm = terms.find(term => term.name === nextTermName);
                
                if (nextTerm && nextTerm.next_term_begins) {
                  setCorrectedNextTermBegins(nextTerm.next_term_begins);
                  return;
                }
              }
            }
          }
          
          setCorrectedNextTermBegins('2025-01-17');
          
        } catch (error) {
          console.error('Error fetching next term begins date:', error);
          setCorrectedNextTermBegins('2025-01-17');
        }
      } else {
        setCorrectedNextTermBegins(data?.next_term_begins);
      }
    };
    
    fixNextTermBegins();
  }, [data?.next_term_begins]);

  useEffect(() => {
    const fetchGradingData = async () => {
      if (!service || serviceLoading) return;

      try {
        setLoading(true);
        setError(null);

        const gradingSystems = await service.getGradingSystems();
        const activeSystem = gradingSystems.find((system: GradingSystem) => system.is_active);
        
        if (activeSystem) {
          setGradingSystem(activeSystem);
          const systemGrades = await service.getGrades(activeSystem.id);
          setGrades(systemGrades);
        } else {
          setError('No active grading system found');
        }
      } catch (err) {
        console.error('Error fetching grading system:', err);
        setError('Failed to load grading system');
      } finally {
        setLoading(false);
      }
    };

    fetchGradingData();
  }, [service, serviceLoading]);

  const getGradeForScore = (score: number): { grade: string; remark: string; isPass: boolean } => {
    if (!gradingSystem || grades.length === 0) {
      return { grade: 'N/A', remark: 'Loading...', isPass: false };
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

  const calculatePercentage = (obtained: number, total: number): number => {
    return total > 0 ? (obtained / total) * 100 : 0;
  };

  const subjectsToUse = useMemo(() => {
    if (!data?.subjects) return [];
    
    if (showOnlyPublished) {
      const publishedSubjects = data.subjects.filter((subject: any) => subject.status === 'PUBLISHED');
      return publishedSubjects;
    } else {
      return data.subjects;
    }
  }, [data?.subjects, showOnlyPublished]);

  const enhancedResults = subjectsToUse.map((subject: any) => {
    const markObtained = Number(subject.mark_obtained) || 0;
    const maxMarks = Number(subject.max_marks_obtainable) || 0;
    const percentage = calculatePercentage(markObtained, maxMarks);
    const gradeInfo = getGradeForScore(percentage);
    
    return {
      ...subject,
      mark_obtained: markObtained,
      max_marks_obtainable: maxMarks,
      percentage,
      calculated_grade: gradeInfo.grade,
      calculated_remark: gradeInfo.remark,
      is_calculated_pass: gradeInfo.isPass,
      grade: subject.grade || gradeInfo.grade,
      is_passed: subject.is_passed !== undefined ? subject.is_passed : gradeInfo.isPass
    };
  }) || [];

  const totalObtained = subjectsToUse.reduce((sum: number, subject: any) => {
    const markObtained = Number(subject.mark_obtained) || 0;
    return sum + markObtained;
  }, 0);
  const totalObtainable = subjectsToUse.reduce((sum: number, subject: any) => {
    const maxMarks = Number(subject.max_marks_obtainable) || 0;
    return sum + maxMarks;
  }, 0);
  
  const overallPercentage = totalObtainable > 0 
    ? (totalObtained / totalObtainable) * 100 
    : 0;
  const overallGrade = getGradeForScore(overallPercentage);

  const downloadPDF = async () => {
    const input = document.getElementById("nursery-result-sheet");
    if (!input) return;
    
    try {
      const canvas = await html2canvas(input, { 
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794,
        windowHeight: input.scrollHeight
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      
      const pageWidth = 210;
      const pageHeight = 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`${data.student?.name || "nursery-result"}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const getPhysicalDevelopmentData = (category: string) => {
    const subjectWithData = subjectsToUse.find((subject: any) => {
      switch(category) {
        case "PHYSICAL DEVELOPMENT": return subject.physical_development;
        case "HEALTH": return subject.health;
        case "CLEANLINESS": return subject.cleanliness;
        case "GENERAL CONDUCT": return subject.general_conduct;
        default: return false;
      }
    });

    if (!subjectWithData) return '';

    switch(category) {
      case "PHYSICAL DEVELOPMENT": return subjectWithData.physical_development;
      case "HEALTH": return subjectWithData.health;
      case "CLEANLINESS": return subjectWithData.cleanliness;
      case "GENERAL CONDUCT": return subjectWithData.general_conduct;
      default: return '';
    }
  };

  function getOrdinalSuffix(num: number): string {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return "st";
    if (j === 2 && k !== 12) return "nd";
    if (j === 3 && k !== 13) return "rd";
    return "th";
  }

  if (serviceLoading || loading || !schoolSettings) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p>Loading school settings and grading system...</p>
        </div>
      </div>
    );
  }

  if (serviceError || error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center text-red-600">
          <p className="text-lg font-semibold mb-2">Error Loading Grading System</p>
          <p className="text-sm">{serviceError || error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      <div className="mb-4 flex justify-between items-center max-w-[794px] mx-auto">
        <button
          onClick={downloadPDF}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 transition-all duration-200 font-medium"
        >
          Download PDF
        </button>
        
        {schoolSettings && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">School:</span> {schoolSettings.tenant_name} 
            {gradingSystem && (
              <>
                <span className="ml-4 font-medium">Grading:</span> {gradingSystem.name}
              </>
            )}
          </div>
        )}
      </div>

      <div id="nursery-result-sheet" className="relative w-[794px] mx-auto bg-white shadow-2xl rounded-lg overflow-hidden">
        
        <WatermarkLogo 
          logoUrl={schoolSettings?.logo} 
          tenant_name={schoolSettings?.tenant_name} 
        />
        
        <div className="relative z-10 p-8">
          
          {/* HEADER */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-indigo-100">
            <SchoolLogo 
              logoUrl={schoolSettings?.logo} 
            tenant_name={schoolSettings?.tenant_name} 
            />
            
            <div className="flex-1 text-center mx-6">
              <h1 className="text-2xl font-black mb-1 text-indigo-900 tracking-tight">
                {schoolSettings?.tenant_name?.toUpperCase() || 'SCHOOL NAME'}
              </h1>
              <p className="text-xs text-slate-600 font-medium mb-1">
                {schoolSettings?.address || 'School Address Not Set'}
              </p>
              <div className="text-xs text-slate-600 font-medium mb-2">
                {schoolSettings?.phone && <span>{schoolSettings.phone}</span>}
                {schoolSettings?.phone && schoolSettings?.email && ' | '}
                {schoolSettings?.email && <span>{schoolSettings.email}</span>}
              </div>
              {schoolSettings?.motto && (
                <p className="text-xs text-slate-500 italic mb-2">"{schoolSettings.motto}"</p>
              )}
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-2 px-6 rounded-lg inline-block shadow-md mt-2">
                <p className="text-xs font-semibold">{data.term?.name || 'First'} Term, {data.term?.session || data.term?.year || '2025'} Academic Session</p>
              </div>
            </div>
            
            <div className="w-16"></div>
          </div>

          {/* STUDENT INFORMATION */}
          <div className="mb-5 p-4 rounded-lg bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200">
            <div className="text-center font-bold mb-3 text-sm text-indigo-900 tracking-wide">
              PUPIL'S INFORMATION
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="flex items-center">
                <span className="font-semibold text-slate-700 mr-2">NAME:</span>
                <span className="border-b border-indigo-300 flex-1 text-slate-800 font-medium pb-0.5">
                  {data.student?.name || data.student?.full_name || ""}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-semibold text-slate-700 mr-2">CLASS:</span>
                <span className="border-b border-indigo-300 flex-1 text-slate-800 font-medium pb-0.5">
                  {data.student?.class || ""}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-semibold text-slate-700 mr-2">TERM:</span>
                <span className="border-b border-indigo-300 flex-1 text-slate-800 font-medium pb-0.5">
                  {data.term?.name || ""} TERM
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-semibold text-slate-700 mr-2">HOUSE:</span>
                <span className="border-b border-indigo-300 flex-1 text-slate-800 font-medium pb-0.5">
                  {data.student?.house || ""}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-semibold text-slate-700 mr-2">POSITION:</span>
                <span className="border-b border-indigo-300 flex-1 text-slate-800 font-medium pb-0.5">
                  {data.class_position !== null && data.class_position !== undefined
                    ? `${data.class_position}${getOrdinalSuffix(data.class_position)}`
                    : "N/A"}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-semibold text-slate-700 mr-2">TOTAL PUPILS:</span>
                <span className="border-b border-indigo-300 flex-1 text-slate-800 font-medium pb-0.5">
                  {data.total_students || "N/A"}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-semibold text-slate-700 mr-2 text-[10px]">SCHOOL OPENED:</span>
                <span className="border-b border-indigo-300 flex-1 text-slate-800 font-medium pb-0.5">
                  {data.attendance?.times_opened || ""}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-semibold text-slate-700 mr-2 text-[10px]">TIMES PRESENT:</span>
                <span className="border-b border-indigo-300 flex-1 text-slate-800 font-medium pb-0.5">
                  {data.attendance?.times_present || ""}
                </span>
              </div>
            </div>
          </div>

          {/* PHYSICAL DEVELOPMENT */}
          <div className="mb-5 rounded-lg overflow-hidden shadow-md border border-slate-200">
            <div className="text-center font-bold py-2 text-white text-xs bg-gradient-to-r from-rose-600 to-rose-700">
              PHYSICAL DEVELOPMENT / SPECIAL REPORTS
            </div>
            <table className="w-full border-collapse bg-white text-[10px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-300 w-1/5 py-2 text-center font-bold text-slate-700"></th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700">EXCELLENT</th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700">VERY GOOD</th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700">GOOD</th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700">FAIR</th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700">COMMENTS</th>
                </tr>
              </thead>
              <tbody>
                {["PHYSICAL DEVELOPMENT", "HEALTH", "CLEANLINESS", "GENERAL CONDUCT"].map((item, idx) => {
                  const value = getPhysicalDevelopmentData(item);
                  return (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border border-slate-300 text-left px-3 py-2 font-semibold text-slate-700">{item}</td>
                      <td className="border border-slate-300 py-2 text-center">{value === 'EXCELLENT' ? '✓' : ''}</td>
                      <td className="border border-slate-300 py-2 text-center">{value === 'VERY GOOD' ? '✓' : ''}</td>
                      <td className="border border-slate-300 py-2 text-center">{value === 'GOOD' ? '✓' : ''}</td>
                      <td className="border border-slate-300 py-2 text-center">{value === 'FAIR' ? '✓' : ''}</td>
                      <td className="border border-slate-300 py-2 px-2 text-center">
                        {value && !['EXCELLENT', 'VERY GOOD', 'GOOD', 'FAIR'].includes(value) ? value : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ACADEMIC PERFORMANCE */}
          <div className="mb-5 rounded-lg overflow-hidden shadow-md border border-slate-200">
            <div className="text-center font-bold py-2 text-white text-xs bg-gradient-to-r from-indigo-600 to-indigo-700">
              ACADEMIC PERFORMANCE
            </div>
            <table className="w-full border-collapse bg-white text-[10px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-300 w-2/5 py-2 text-center font-bold text-slate-700">SUBJECTS</th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700 text-[9px]">MAX MARKS</th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700 text-[9px]">MARK OBT.</th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700">%</th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700">GRADE</th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700 text-[9px]">POSITION</th>
                  <th className="border border-slate-300 py-2 text-center font-bold text-slate-700">REMARK</th>
                </tr>
              </thead>
              <tbody>
                {enhancedResults.length > 0 ? (
                  enhancedResults.map((result, idx) => (
                    <tr key={result.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border border-slate-300 text-left px-3 py-2 font-medium text-slate-700">
                        {result.subject?.name || 'N/A'}
                      </td>
                      <td className="border border-slate-300 py-2 text-center">{result.max_marks_obtainable}</td>
                      <td className="border border-slate-300 py-2 text-center">{result.mark_obtained}</td>
                      <td className="border border-slate-300 py-2 text-center">{result.percentage.toFixed(1)}%</td>
                      <td className="border border-slate-300 py-2 text-center font-bold">{result.calculated_grade}</td>
                      <td className="border border-slate-300 py-2 text-center">
                        {result.subject_position !== null && result.subject_position !== undefined
                          ? `${result.subject_position}${getOrdinalSuffix(result.subject_position)}`
                          : 'N/A'}
                      </td>
                      <td className="border border-slate-300 py-2 px-2 text-center">{result.calculated_remark}</td>
                    </tr>
                  ))
                ) : (
                  ["English (Alphabet)", "Mathematics (Numbers)", "Social Studies", "Basic Science",
                    "Christian Religious Studies", "Computer Studies", "Moral & Value Studies",
                    "Colouring Activities", "Rhymes", "Physical & Health Education", "Writing Skill", "Craft"
                  ].map((subject, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border border-slate-300 text-left px-3 py-2 font-medium text-slate-700">{subject}</td>
                      <td className="border border-slate-300 py-2 text-center">{gradingSystem?.max_score || 100}</td>
                      <td className="border border-slate-300 py-2 text-center"></td>
                      <td className="border border-slate-300 py-2 text-center"></td>
                      <td className="border border-slate-300 py-2 text-center"></td>
                      <td className="border border-slate-300 py-2 text-center"></td>
                      <td className="border border-slate-300 py-2 text-center"></td>
                    </tr>
                  ))
                )}
                <tr className="bg-slate-100 font-bold">
                  <td className="border border-slate-300 text-right px-3 py-2 text-slate-800">Total</td>
                  <td className="border border-slate-300 py-2 text-center">{totalObtainable}</td>
                  <td className="border border-slate-300 py-2 text-center">{totalObtained}</td>
                  <td className="border border-slate-300 py-2 text-center">{overallPercentage.toFixed(1)}%</td>
                  <td className="border border-slate-300 py-2 text-center">{overallGrade.grade}</td>
                  <td className="border border-slate-300 py-2 text-center"></td>
                  <td className="border border-slate-300 py-2 text-center">{overallGrade.remark}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* COMMENTS AND SIGNATURES */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="p-3 rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200">
              <div className="font-bold text-slate-800 mb-2 text-center text-xs">NURSE'S COMMENT</div>
              <div className="bg-white rounded-md p-2 text-[10px] min-h-[60px] border border-purple-300">
                {data.nurse_comment || "Child is healthy and physically fit for academic activities."}
              </div>
              <div className="mt-2 text-center">
                <span className="font-semibold text-slate-700 text-[10px]">SIGNATURE/DATE</span>
                {data.class_teacher_signature ? (
                  <div className="bg-white rounded-md mt-1 p-1 border border-purple-300">
                    <img 
                      src={data.class_teacher_signature} 
                      alt="Nurse Signature" 
                      className="h-6 w-auto mx-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="bg-white h-6 rounded-md mt-1 border border-purple-300"></div>
                )}
                <div className="text-[9px] text-slate-600 mt-1">Date: {new Date().toLocaleDateString()}</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200">
              <div className="font-bold text-slate-800 mb-2 text-center text-xs">HEAD TEACHER'S COMMENT</div>
              <div className="bg-white rounded-md p-2 text-[10px] min-h-[60px] border border-amber-300">
                {data.head_teacher_remark || ''}
              </div>
              <div className="mt-2 text-center">
                <span className="font-semibold text-slate-700 text-[10px]">SIGNATURE/DATE</span>
                {data.head_teacher_signature ? (
                  <div className="bg-white rounded-md mt-1 p-1 border border-amber-300">
                    <img 
                      src={data.head_teacher_signature} 
                      alt="Head Teacher Signature" 
                      className="h-6 w-auto mx-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="bg-white h-6 rounded-md mt-1 border border-amber-300"></div>
                )}
                <div className="text-[9px] text-slate-600 mt-1">Date: {new Date().toLocaleDateString()}</div>
              </div>
            </div>
          </div>

          {/* NEXT TERM BEGINS */}
          <div className="mb-4">
            <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
              <div className="text-center">
                <span className="font-bold text-slate-700 block mb-2 text-sm">NEXT TERM BEGINS</span>
                <div className="bg-white h-10 rounded-md flex items-center justify-center border border-blue-300 text-sm font-semibold text-indigo-900">
                  {correctedNextTermBegins ? new Date(correctedNextTermBegins).toLocaleDateString() : (data.next_term_begins ? new Date(data.next_term_begins).toLocaleDateString() : '')}
                </div>
              </div>
            </div>
          </div>

          {/* Publication Status */}
          {data.is_published && (
            <div className="text-center">
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                ✓ Published Report
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}