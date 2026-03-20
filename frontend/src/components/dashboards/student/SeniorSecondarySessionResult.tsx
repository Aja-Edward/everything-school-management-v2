import { useRef, useState, useEffect, useCallback } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useResultService } from "@/hooks/useResultService";
// import { SchoolSettings } from '@/types/types';
import { SeniorSecondarySessionResultData } from '@/services/ResultCheckerService'
import type { 
  GradingSystem, 
  // ScoringConfiguration
} from "@/services/ResultSettingsService";

const SUBJECTS = [
  "Mathematics",
  "English Language",
  "Literature in English",
  "Biology",
  "Physics",
  "Chemistry",
  "Geography",
  "Animal Husbandry",
  "Government",
  "History",
  "Economics",
  "Commerce",
  "CRK",
  "Yoruba/Hausa/Igbo",
  "Food & Nut or H.Mgt",
  "BookKeeping/Accounting",
  "Further Maths",
  "Computer",
];

interface SubjectScore {
  subject: string;
  term1: number | string;
  term2: number | string;
  term3: number | string;
  yearAverage: number | string;
  obtainable: number | string;
  obtained: number | string;
  classAverage: number | string;
  highest: number | string;
  lowest: number | string;
  position: number | string;
  teacherRemark: string;
}

interface SeniorSecondarySessionResultProps {
  studentId: string;
  academicSessionId: string;
  templateId?: string;
  data?: SeniorSecondarySessionResultData | any; // Allow any for transformed data
  showOnlyPublished?: boolean; // NEW: Control whether to show only published results
}

export default function SeniorSecondarySessionResult({ 
  studentId, 
  academicSessionId, 
  templateId,
  data,
  showOnlyPublished = false // NEW: Default to false (show all results)
}: SeniorSecondarySessionResultProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { service, schoolSettings, loading: serviceLoading, isReady } = useResultService();
  
  const [resultData, setResultData] = useState<SeniorSecondarySessionResultData | any>(data || null);
  const [gradingSystem, setGradingSystem] = useState<GradingSystem | null>(null);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Only fetch data if not provided via props
  useEffect(() => {
    const fetchData = async () => {
      if (!isReady || !studentId || !academicSessionId || data) return;

      try {
        setLoading(true);
        setError(null);

        // Fetch session result data
        const [
          sessionResultData,
          gradingSystems
        ] = await Promise.all([
          service.getSeniorSecondarySessionResults({ 
            student: studentId, 
            exam_session: academicSessionId 
          }).then(results => results[0]), // Get first result
          service.getGradingSystems()
        ]);

        setResultData(sessionResultData);

        // Set active grading system
        const activeGradingSystem = gradingSystems.find((system: GradingSystem) => system.is_active);
        if (activeGradingSystem) {
          setGradingSystem(activeGradingSystem);
        }

      } catch (err) {
        console.error('Error fetching session result data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load session result data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isReady, studentId, academicSessionId, data, service]);

  // Load grading system even when data is provided
  useEffect(() => {
    const loadConfigurations = async () => {
      if (!isReady) return;

      try {
        const gradingSystems = await service.getGradingSystems();
        const activeGradingSystem = gradingSystems.find((system: GradingSystem) => system.is_active);
        if (activeGradingSystem) {
          setGradingSystem(activeGradingSystem);
        }
      } catch (err) {
        console.error('Error loading grading system:', err);
      }
    };

    loadConfigurations();
  }, [isReady, service]);

  const downloadPDF = useCallback(async () => {
    const element = ref.current;
    if (!element || !resultData) return;

    try {
      setIsGeneratingPDF(true);
      
      const canvas = await html2canvas(element, { 
        scale: 2,
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

      const fileName = `${resultData.student?.name || resultData.student?.id || studentId}_session_result.pdf`;
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

  // Get subject result data with improved matching - handle both API data and transformed data
  const getSubjectData = useCallback((subjectName: string) => {
    if (!resultData?.subjects) return null;
    
    const normalizedSubjectName = subjectName.toLowerCase().trim();
    
    return resultData.subjects.find((subject: any) => {
      // Handle both API format and transformed format
      const subjectNameFromData = subject.subject?.name || subject.name || '';
      const normalizedDbSubject = subjectNameFromData.toLowerCase().trim();
      
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
  }, [resultData?.subjects]);

  // Transform subject data to the format expected by the session template
  const transformSubjectScores = useCallback((): SubjectScore[] => {
    return SUBJECTS.map(subject => {
      const subjectData = getSubjectData(subject);
      if (!subjectData) {
        return {
          subject,
          term1: "",
          term2: "",
          term3: "",
          yearAverage: "",
          obtainable: "",
          obtained: "",
          classAverage: "",
          highest: "",
          lowest: "",
          position: "",
          teacherRemark: ""
        };
      }

      // Handle both API format and transformed format
      const term1 = Number(subjectData.term1_score || subjectData.term1 || 0);
      const term2 = Number(subjectData.term2_score || subjectData.term2 || 0);
      const term3 = Number(subjectData.term3_score || subjectData.term3 || 0);
      const yearAverage = Number(subjectData.average_score || subjectData.yearAverage || 0);
      
      return {
        subject,
        term1: term1 > 0 ? term1 : "",
        term2: term2 > 0 ? term2 : "",
        term3: term3 > 0 ? term3 : "",
        yearAverage: yearAverage > 0 ? yearAverage.toFixed(1) : "",
        obtainable: 100, // Standard obtainable score
        obtained: yearAverage > 0 ? Math.round(yearAverage) : "",
        classAverage: subjectData.class_average || subjectData.classAverage || "",
        highest: subjectData.highest_in_class || subjectData.highest || "",
        lowest: subjectData.lowest_in_class || subjectData.lowest || "",
        position: subjectData.position || (subjectData.subject_position ? `${subjectData.subject_position}${getOrdinalSuffix(subjectData.subject_position)}` : "") || "",
        teacherRemark: subjectData.teacher_remark || subjectData.teacherRemark || (yearAverage >= 70 ? "Excellent" : yearAverage >= 60 ? "Good" : yearAverage >= 50 ? "Fair" : "Needs Improvement")
      };
    });
  }, [getSubjectData]);

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
          <p className="text-gray-600">Loading session result data...</p>
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
          <p className="text-lg font-semibold mb-2">Error Loading Session Result</p>
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
          <p className="text-sm">No session result data found for this student and academic session.</p>
        </div>
      </div>
    );
  }

  const subjectScores = transformSubjectScores();

  // Extract academic session info - handle both API format and transformed format
  const academicSession = resultData.academic_session || {
    name: 'N/A',
    start_year: new Date().getFullYear(),
    end_year: new Date().getFullYear() + 1
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      {/* Action Bar */}
      <div className="mb-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4">
          <button
            onClick={downloadPDF}
            disabled={isGeneratingPDF}
            className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          <span>Academic Session: <strong>{academicSession.name}</strong></span>
          <span>Total Annual Average: <strong>{resultData.taa_score || resultData.average_for_year || 'N/A'}</strong></span>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            resultData.is_published 
              ? 'bg-green-100 text-green-800' 
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {resultData.is_published ? 'Published' : 'Draft'}
          </span>
        </div>
      </div>

      {/* Session Result Sheet */}
      <div
        ref={ref}
        className="bg-white p-8 border border-gray-300 w-[850px] mx-auto text-gray-900 shadow-lg"
      >
        {/* Header with Logo + School Info */}
        <div className="flex items-center justify-between border-b pb-2">
          <div className="w-24 h-24 border flex items-center justify-center text-xs">
            {schoolSettings?.logo ? (
              <img 
                src={schoolSettings.logo} 
                alt="School Logo" 
                className="w-20 h-20 object-contain"
              />
            ) : (
              <div className="text-center font-bold text-blue-600">
                {schoolSettings?.school_name?.split(' ').map((word: string) => word[0]).join('').slice(0, 3) || 'LOGO'}
              </div>
            )}
          </div>
          <div className="text-center flex-1">
            <h1 className="text-4xl font-bold text-blue-900 mb-2">
              {schoolSettings?.school_name?.toUpperCase() || "SCHOOL NAME"}
            </h1>
            <p className="m-2">{schoolSettings?.motto || "Knowledge at its spring"}</p>
            <p className="text-sm text-blue-600 font-semibold mb-1">
              {schoolSettings?.address || "School Address, City, State"}
            </p>
            {schoolSettings?.phone && schoolSettings?.email && (
              <p className="text-xs">
                Phone: {schoolSettings.phone} | Email: {schoolSettings.email}
              </p>
            )}
            <p className="text-xs italic text-red-700 font-semibold mt-2">
              CONTINUOUS ASSESSMENT DOSSIER FOR SENIOR SECONDARY SCHOOL
            </p>
          </div>
          <div className="w-24 h-24"></div>
        </div>

        {/* Summary Line */}
        <div className="mt-4 text-sm text-blue-990 flex justify-between border-b pb-1">
          <h2 className="text-xl text-blue-900 font-bold">
            Summary of Annual Academic Report {academicSession.name}
          </h2>
        </div>

        {/* Student Info Section */}
        <div className="mt-4 text-sm space-y-2">
          <div className="flex w-full">
            <span className="font-semibold flex-[70]">Name: {resultData.student?.name?.toUpperCase() || 'STUDENT NAME'}</span>
            <span className="font-semibold flex-[15]">Class: {resultData.student?.class || 'SSS'}</span>
            <span className="dotted flex-1"></span>
            <span className="font-semibold flex-[15]">Year: {academicSession.name}</span>
          </div>

          <div className="flex w-full">
            <span className="font-semibold flex-[12]">Age: {resultData.student?.age || 'N/A'}</span>
            <span className="ml-6 font-semibold flex-[15]">Average for Year: {(resultData.average_for_year || 0).toFixed(1)}</span>
            <span className="ml-6 font-semibold flex-[20]">TAA Score: {(resultData.taa_score || resultData.average_for_year || 0).toFixed(1)}</span>
            <span className="ml-6 font-semibold flex-[23]">No in class: {resultData.total_students || 'N/A'}</span>
          </div>

          <div className="flex w-full">
            <span className="font-semibold flex-[50]">Total Obtainable: {resultData.obtainable || 'N/A'}</span>
            <span className="ml-6 font-semibold flex-[40]">Total Obtained: {resultData.obtained || 'N/A'}</span>
            <span className="ml-6 font-semibold flex-[30]">Overall Grade: {resultData.overall_grade || getGrade(resultData.average_for_year || 0)}</span>
          </div>

          <div className="flex w-full">
            <span className="font-semibold">Position in Class: </span>
            <span className="ml-2 px-2 py-1 bg-yellow-100 rounded font-medium">
              {resultData.class_position ? `${resultData.class_position}${getOrdinalSuffix(resultData.class_position)}` : 'N/A'} of {resultData.total_students || 'N/A'}
            </span>
          </div>

          {/* Configuration Info */}
          {gradingSystem && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-sm mb-2 text-blue-900">Grading System: {gradingSystem.name}</h3>
              <div className="text-xs space-y-1 text-blue-800">
                <div><span className="font-medium">Score Range:</span> {gradingSystem.min_score} - {gradingSystem.max_score}</div>
                <div><span className="font-medium">Pass Mark:</span> {gradingSystem.pass_mark}</div>
                <div><span className="font-medium">Type:</span> {gradingSystem.grading_type}</div>
              </div>
            </div>
          )}
        </div>

        {/* Results Table */}
        <table className="mt-6 w-full border-collapse text-xs">
          <thead>
            <tr>
              <th rowSpan={2} className="border-2 border-gray-800 px-2 py-1 bg-blue-50 font-bold">
                Subject
              </th>
              <th colSpan={4} className="border-2 border-gray-800 px-2 py-1 bg-blue-50 font-bold">
                Termly Cumulative Average
              </th>
              <th rowSpan={2} className="border-2 border-gray-800 px-2 py-1 bg-blue-50 font-bold">
                Obtainable
              </th>
              <th rowSpan={2} className="border-2 border-gray-800 px-2 py-1 bg-blue-50 font-bold">
                Obtained
              </th>
              <th rowSpan={2} className="border-2 border-gray-800 px-2 py-1 bg-blue-50 font-bold">
                Class Avg
              </th>
              <th rowSpan={2} className="border-2 border-gray-800 px-2 py-1 bg-blue-50 font-bold">
                Highest in Class
              </th>
              <th rowSpan={2} className="border-2 border-gray-800 px-2 py-1 bg-blue-50 font-bold">
                Lowest in Class
              </th>
              <th rowSpan={2} className="border-2 border-gray-800 px-2 py-1 bg-blue-50 font-bold">
                Position
              </th>
              <th rowSpan={2} className="border-2 border-gray-800 px-2 py-1 bg-blue-50 font-bold">
                Teacher's Remark
              </th>
            </tr>
            <tr>
              <th className="border-2 border-gray-800 px-2 py-1 bg-blue-100 font-bold">1st Term</th>
              <th className="border-2 border-gray-800 px-2 py-1 bg-blue-100 font-bold">2nd Term</th>
              <th className="border-2 border-gray-800 px-2 py-1 bg-blue-100 font-bold">3rd Term</th>
              <th className="border-2 border-gray-800 px-2 py-1 bg-blue-100 font-bold">Average of Year</th>
            </tr>
          </thead>
          <tbody>
            {subjectScores.map((row, index) => (
              <tr key={index} className={`${index % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-25`}>
                <td className="border border-gray-600 px-2 py-1 font-medium">{row.subject}</td>
                <td className="border border-gray-600 px-2 py-1 text-center">{row.term1}</td>
                <td className="border border-gray-600 px-2 py-1 text-center">{row.term2}</td>
                <td className="border border-gray-600 px-2 py-1 text-center">{row.term3}</td>
                <td className="border border-gray-600 px-2 py-1 text-center font-bold text-blue-700">
                  {row.yearAverage}
                </td>
                <td className="border border-gray-600 px-2 py-1 text-center">{row.obtainable}</td>
                <td className="border border-gray-600 px-2 py-1 text-center font-medium">
                  {row.obtained}
                </td>
                <td className="border border-gray-600 px-2 py-1 text-center">{row.classAverage}</td>
                <td className="border border-gray-600 px-2 py-1 text-center text-green-600 font-medium">{row.highest}</td>
                <td className="border border-gray-600 px-2 py-1 text-center text-red-600 font-medium">{row.lowest}</td>
                <td className="border border-gray-600 px-2 py-1 text-center font-medium">{row.position}</td>
                <td className="border border-gray-600 px-2 py-1 text-xs">{row.teacherRemark}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Remarks */}
        <div className="mt-8 text-sm space-y-4">
          <div>
            <div className="font-bold text-blue-900 mb-2">Form Master's Remark:</div>
            <div className="text-gray-800 bg-gray-50 p-3 rounded border italic">
              {resultData.class_teacher_remark || resultData.teacher_remark || "No remark provided."}
            </div>
          </div>

          <div>
            <div className="font-bold text-blue-900 mb-2">Principal's Remarks:</div>
            <div className="text-gray-800 bg-gray-50 p-3 rounded border italic">
              {resultData.head_teacher_remark || "No remark provided."}
            </div>
          </div>

          <div className="flex items-center justify-between mt-12 pt-8">
            <div className="text-center">
              <div className="border-b-2 border-gray-600 w-64 h-16 mb-2"></div>
              <div className="text-sm font-medium">Form Master's Signature & Date</div>
            </div>

            <div className="text-center">
              <div className="border-b-2 border-gray-600 w-64 h-16 mb-2"></div>
              <div className="text-sm font-medium">Principal's Signature & Stamp</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}