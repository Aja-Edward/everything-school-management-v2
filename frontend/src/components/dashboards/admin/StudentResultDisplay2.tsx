import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import StudentService from '@/services/StudentService';
import { useAuthenticatedStudent } from '@/hooks/useAuthenticatedStudent';
import { useResultService, type EnhancedResultSheet } from '@/hooks/useResultService';
import { toast } from 'react-hot-toast';
import { PDFDownloadButton } from './PDFDownloadComponents';

// Import NEW single source of truth types
import {
  AcademicSession,
  EducationLevel,
} from '@/types/types';

// Import extracted utilities
import { 
  getAcademicSessionString,
  getAcademicSessionId,
  normalizeEducationLevel,
  normalizeTermName
} from '@/utils/resultHelpers';

// Import data transformers
import {
  ExtendedStandardResult,
  ExtendedStudentTermResult
} from '@/utils/resultTransformers';


interface StudentData {
  id: string;
  full_name: string;
  username: string;
  student_class: string;
  education_level: EducationLevel | string;
  profile_picture?: string;
  gender?: string;
  age?: number;
  date_of_birth?: string;
  classroom?: string;
  stream?: string;
  parent_contact?: string;
  emergency_contact?: string;
  admission_date?: string;
  house?: string;
}

interface TermData {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  academic_session: AcademicSession;
  next_term_begins?: string;
}

interface SelectionData {
  academicSession: AcademicSession;
  term: TermData;
  class: { 
    id: string; 
    name: string; 
    section: string; 
    education_level?: string 
  };
  resultType?: string;
  examSession?: string;
}

interface StudentResultDisplayProps {
  student: StudentData;
  selections: SelectionData;
  currentUser?: { id: string; student_id?: string };
}

const StudentResultDisplay2: React.FC<StudentResultDisplayProps> = ({
  student,
  selections
}) => {
  const { isDarkMode } = useGlobalTheme();
  const {
    service: resultService,
    loading: settingsLoading
  } = useResultService();

  // Authentication
  const { authenticatedStudentId, loading: authLoading } = useAuthenticatedStudent();

  // State — pre-populate from props so a failed/blocked API call doesn't leave the view blank
  const [studentData, setStudentData] = useState<StudentData | null>({
    id: student.id,
    full_name: student.full_name,
    username: student.username,
    student_class: student.student_class,
    education_level: student.education_level as EducationLevel,
    profile_picture: student.profile_picture,
  });
  const [results, setResults] = useState<ExtendedStandardResult[]>([]);
  const [termResults, setTermResults] = useState<ExtendedStudentTermResult[]>([]);
  const [enhancedResult, setEnhancedResult] = useState<EnhancedResultSheet | null>(null);
  const [actualTermReport, setActualTermReport] = useState<any>(null);
  const [pdfReportId, setPdfReportId] = useState<string | null>(null); // Separate state for valid PDF UUID
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // COMPUTED VALUES (Memoized)
  // ============================================================================
  
  const actualStudentId = useMemo(() => {
    if (authenticatedStudentId) {
      console.log('✅ Using authenticated student ID:', authenticatedStudentId);
      return authenticatedStudentId;
    }
    console.warn('⚠️ No authenticated student ID, using prop:', student.id);
    return student.id;
  }, [authenticatedStudentId, student.id]);

  const educationLevel = useMemo(
    (): EducationLevel => normalizeEducationLevel(student.education_level, student.student_class),
    [student.education_level, student.student_class]
  );

  const normalizedTerm = useMemo(
    () => normalizeTermName(selections.term?.name),
    [selections.term]
  );

  // const resolvedExamSession = useMemo(() => {
  //   if (selections.examSession && selections.examSession.trim() !== '') {
  //     return selections.examSession;
  //   }
  //   return `${getAcademicSessionString(selections.academicSession)}_${normalizedTerm}`;
  // }, [selections.examSession, selections.academicSession, normalizedTerm]);

  const themeClasses = useMemo(() => ({
    bgPrimary: isDarkMode ? 'bg-gray-900' : 'bg-white',
    bgSecondary: isDarkMode ? 'bg-gray-800' : 'bg-gray-50',
    bgCard: isDarkMode ? 'bg-gray-800' : 'bg-white',
    textPrimary: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    textTertiary: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    buttonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonSecondary: isDarkMode 
      ? 'bg-gray-700 hover:bg-gray-600 text-white' 
      : 'bg-gray-200 hover:bg-gray-300 text-gray-700',
  }), [isDarkMode]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  
useEffect(() => {
    const fetchResultData = async () => {
      if (!actualStudentId) {
        setError('Missing student ID');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setPdfReportId(null); // Reset PDF ID on new fetch

      try {
        console.log('📊 Fetching results with academic session + term...');

        // 1️⃣ Build filters
        const academicSessionId = getAcademicSessionId(selections.academicSession);
        const termId = selections.term?.id;

        if (!academicSessionId || !termId) {
          throw new Error('Missing academic session or term information');
        }

        const filters = {
          student: actualStudentId,
          academic_session: academicSessionId,
          term: termId,
        };

        console.log('📊 Fetching with filters:', filters);

        // 2️⃣ Fetch full student info (enriches the prop data with gender, age, etc.)
        // For student users the API is blocked by SectionFilterMixin → try but don't throw.
        console.log('👤 Fetching student info...');
        try {
          const studentInfo = await StudentService.getStudent(parseInt(actualStudentId));
          setStudentData({
            id: studentInfo.id.toString(),
            full_name: studentInfo.full_name ?? student.full_name,
            username: studentInfo.username ?? student.username,
            student_class: studentInfo.student_class ?? student.student_class,
            education_level: (studentInfo.education_level ?? student.education_level) as EducationLevel,
            profile_picture: studentInfo.profile_picture ?? student.profile_picture,
            gender: studentInfo.gender ?? undefined,
            age: studentInfo.age ?? undefined,
            date_of_birth: studentInfo.date_of_birth ?? undefined,
            classroom: studentInfo.classroom ?? undefined,
            stream: studentInfo.stream != null ? String(studentInfo.stream) : undefined,
            parent_contact: studentInfo.parent_contact ?? undefined,
            emergency_contact: studentInfo.emergency_contact ?? undefined,
            admission_date: studentInfo.admission_date ?? undefined,
          });
        } catch {
          // Student role cannot fetch the full profile via the standard endpoint —
          // the section_filtering middleware blocks it. Prop data is already set in
          // useState initialiser so the view can continue without interruption.
          console.info('ℹ️ Could not enrich student profile from API — using prop data.');
        }

        // 3️⃣ Fetch results based on education level
        console.log('📚 Fetching results for education level:', educationLevel);
        let fetchedResults: ExtendedStandardResult[] = [];
        
        switch (educationLevel) {
          case 'NURSERY':
            fetchedResults = await resultService.getNurseryResults(filters) as any;
            break;
          case 'PRIMARY':
            fetchedResults = await resultService.getPrimaryResults(filters) as any;
            break;
          case 'JUNIOR_SECONDARY':
            fetchedResults = await resultService.getJuniorSecondaryResults(filters) as any;
            break;
          case 'SENIOR_SECONDARY':
            fetchedResults = selections.resultType === 'annually'
              ? await resultService.getSeniorSecondarySessionResults(filters) as any
              : await resultService.getSeniorSecondaryTermlyResults(filters) as any;
            break;
          default:
            fetchedResults = await resultService.getStudentResults(filters) as any;
        }

        console.log('✅ Fetched results:', fetchedResults.length, 'subjects');

        // 4️⃣ Fetch term results (non-fatal — StudentTermResult is a legacy model with
        //    potentially 0 records; the real per-level term data comes from step 5)
        console.log('📈 Fetching term results...');
        let fetchedTermResults: any[] = [];
        try {
          fetchedTermResults = await resultService.getStudentTermResults(filters) as any;
          console.log('✅ Fetched term results:', fetchedTermResults.length, 'items');
        } catch (termResultErr) {
          console.info('ℹ️ getStudentTermResults skipped (non-fatal):', (termResultErr as any)?.message);
        }

        // 5️⃣ Fetch term report UUID for PDF download (ALL education levels except session reports)
        console.log('🔍 Checking if should fetch term report...', {
          educationLevel,
          resultType: selections.resultType,
          isSessionReport: educationLevel === 'SENIOR_SECONDARY' && selections.resultType === 'annually'
        });
        
        // Skip only for Senior Secondary Session Reports (annually)
        const shouldFetchTermReport = !(educationLevel === 'SENIOR_SECONDARY' && selections.resultType === 'annually');
        
        if (shouldFetchTermReport) {
          try {
            console.log(`📋 Fetching ${educationLevel} term reports using service...`);
            
            // ✅ Use appropriate service method based on education level
            let termReports: any[] = [];
            
            switch (educationLevel) {
              case 'NURSERY':
                termReports = await resultService.getNurseryTermReports(filters);
                break;
              case 'PRIMARY':
                termReports = await resultService.getPrimaryTermReports(filters);
                break;
              case 'JUNIOR_SECONDARY':
                termReports = await resultService.getJuniorSecondaryTermReports(filters);
                break;
              case 'SENIOR_SECONDARY':
                termReports = await resultService.getSeniorSecondaryTermReports(filters);
                break;
              default:
                console.warn('⚠️ Unknown education level for term report fetch:', educationLevel);
            }
            
            console.log('✅ Fetched term reports via service:', termReports);
            console.log('📊 Number of reports:', termReports?.length || 0);
            
            if (termReports && termReports.length > 0) {
              const currentReport = termReports[0]; // Should be the only one matching our filters
              
              console.log('🔍 Examining report:', {
                reportId: currentReport.id,
                reportIdType: typeof currentReport.id,
                isValidUUID: currentReport.id?.includes('-'),
                hasHyphens: currentReport.id?.split('-').length,
                educationLevel,
                term: currentReport.exam_session?.term || currentReport.term,
                session: currentReport.exam_session?.academic_session
              });
              
              if (currentReport && currentReport.id && currentReport.id.includes('-')) {
                console.log('✅✅✅ SUCCESS: Found valid term report for PDF!');
                console.log('📋 Report UUID:', currentReport.id);
                console.log('📋 Education Level:', educationLevel);
                console.log('📋 Report structure:', Object.keys(currentReport));
                
                setActualTermReport(currentReport);
                setPdfReportId(currentReport.id); // ✅ Set valid UUID for PDF download
                
                console.log('💾 Stored in state - pdfReportId:', currentReport.id);
              } else {
                console.warn('⚠️ Report found but ID is not a valid UUID:', {
                  id: currentReport?.id,
                  type: typeof currentReport?.id,
                  value: currentReport
                });
                setPdfReportId(null);
              }
            } else {
              console.warn(`⚠️ No ${educationLevel} term reports returned from service`);
              console.warn('📋 This could mean:');
              console.warn('   1. Result has not been published yet');
              console.warn('   2. No term report exists for these filters');
              console.warn('   3. Filters:', filters);
              setPdfReportId(null);
            }
          } catch (reportError: any) {
            console.error(`❌ Error fetching ${educationLevel} term report via service:`, reportError);
            console.error('📍 Error details:', {
              message: reportError?.message,
              response: reportError?.response,
              status: reportError?.status,
              educationLevel
            });
            setPdfReportId(null);
            
            // Show user-friendly error
            if (reportError?.status === 401) {
              console.error('🔒 Authentication error - session may have expired');
              toast.error('Session expired. Please refresh the page.');
            } else if (reportError?.status === 404) {
              console.warn(`ℹ️ No ${educationLevel} term reports found - result may not be published yet`);
            } else {
              console.warn(`⚠️ Error fetching ${educationLevel} term report:`, reportError?.message);
            }
          }
        } else {
          console.log('⏭️ Skipping term report fetch - Session report (annually) selected');
          setPdfReportId(null);
        }



        

        // 6️⃣ Fetch enhanced result sheet
        try {
          console.log('🌟 Fetching enhanced result sheet...');
          const enhanced = await resultService.generateEnhancedResultSheet(
            actualStudentId, 
            academicSessionId,
            termId
          );
          setEnhancedResult(enhanced);
          console.log('✅ Enhanced result loaded');
        } catch (enhancedError) {
          console.warn('⚠️ Could not fetch enhanced result:', enhancedError);
        }

        // 7️⃣ Set state
        setResults(fetchedResults);
        setTermResults(fetchedTermResults);

        if (fetchedResults.length === 0) {
          setError('No subject results found for this term and session');
        } else {
          console.log('🎉 Successfully loaded all data');
        }

      } catch (err: any) {
        console.error('❌ Error in fetchResultData:', err);
        
        const errorMessage = err.message || 'Failed to load results. Please try again.';
        setError(errorMessage);
        toast.error(errorMessage);
        setPdfReportId(null);
      } finally {
        setLoading(false);
      }
    };

    fetchResultData();
  }, [actualStudentId, educationLevel, selections.academicSession, selections.term, selections.resultType, resultService]);
  
  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  


  if (settingsLoading || loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className={themeClasses.textSecondary}>
            {authLoading ? 'Authenticating...' : settingsLoading ? 'Loading settings...' : 'Loading results...'}
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // ERROR STATE
  // ============================================================================

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h4 className={`text-lg font-semibold ${themeClasses.textPrimary} mb-2`}>
          Unable to Load Results
        </h4>
        <p className={`${themeClasses.textSecondary} mb-4`}>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className={`px-4 py-2 rounded-lg ${themeClasses.buttonPrimary}`}
        >
          Retry
        </button>
      </div>
    );
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Status Banner & Action Buttons */}
      <div className="flex items-center justify-between print:hidden mb-4">
        {/* PDF Status Indicator */}
        <div className="flex items-center gap-3">
          {pdfReportId && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700 font-medium">PDF Report Available</span>
            </div>
          )}
          {!pdfReportId && results.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <span className="text-sm text-yellow-700">Report pending approval/publication</span>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-3">

          {/* PDF Download Button - Using same pattern as EnhancedResultsManagement */}
          {pdfReportId ? (
            <PDFDownloadButton
              reportId={pdfReportId}
              educationLevel={educationLevel}
              studentName={student.full_name}
              term={normalizedTerm}
              session={getAcademicSessionString(selections.academicSession)}
              variant="button"
              size="md"
              onSuccess={() => {
                toast.success('Result downloaded as PDF');
              }}
              onError={(error: any) => {
                toast.error(`Failed to download PDF: ${error}`);
              }}
            />
          ) : (
            <div
              className={`px-4 py-2 rounded-lg ${themeClasses.buttonSecondary} opacity-50 cursor-not-allowed flex items-center gap-2`}
              title="PDF download requires a published report. Please ensure the result has been approved and published through the results management system."
            >
              <AlertCircle className="w-4 h-4" />
              <span>PDF Unavailable</span>
            </div>
          )}
        </div>
      </div>

      {/* Result Content */}
      {actualTermReport && (
        <div className={`rounded-xl border ${themeClasses.border} overflow-hidden`}>
          {/* Summary Row */}
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 p-4 ${themeClasses.bgSecondary} border-b ${themeClasses.border}`}>
            <div className="text-center">
              <p className={`text-xl font-bold ${themeClasses.textPrimary}`}>
                {actualTermReport.overall_percentage != null
                  ? `${parseFloat(actualTermReport.overall_percentage).toFixed(1)}%`
                  : actualTermReport.average_score != null
                  ? `${parseFloat(actualTermReport.average_score).toFixed(1)}%`
                  : '—'}
              </p>
              <p className={`text-xs mt-1 ${themeClasses.textTertiary}`}>Overall %</p>
            </div>
            <div className="text-center">
              <p className={`text-xl font-bold ${themeClasses.textPrimary}`}>
                {actualTermReport.class_position
                  ? `${actualTermReport.class_position}/${actualTermReport.total_students_in_class || actualTermReport.total_students || '—'}`
                  : '—'}
              </p>
              <p className={`text-xs mt-1 ${themeClasses.textTertiary}`}>Position</p>
            </div>
            <div className="text-center">
              <p className={`text-xl font-bold ${themeClasses.textPrimary}`}>
                {actualTermReport.overall_grade || actualTermReport.grade || '—'}
              </p>
              <p className={`text-xs mt-1 ${themeClasses.textTertiary}`}>Grade</p>
            </div>
            <div className="text-center">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                actualTermReport.status === 'PUBLISHED' ? 'bg-violet-100 text-violet-700' :
                actualTermReport.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {actualTermReport.status || 'DRAFT'}
              </span>
              <p className={`text-xs mt-1 ${themeClasses.textTertiary}`}>Status</p>
            </div>
          </div>

          {/* Subject Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={`${themeClasses.bgSecondary} border-b ${themeClasses.border}`}>
                <tr>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>Subject</th>
                  {educationLevel === 'NURSERY' ? (
                    <>
                      <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>Marks</th>
                      <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>Max</th>
                      <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>%</th>
                    </>
                  ) : (
                    <>
                      <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>CA</th>
                      <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>Total</th>
                      <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>%</th>
                    </>
                  )}
                  <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>Grade</th>
                  {educationLevel === 'NURSERY' && (
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>Comment</th>
                  )}
                </tr>
              </thead>
              <tbody className={`divide-y ${themeClasses.border}`}>
                {(actualTermReport.subject_results ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`px-4 py-8 text-center ${themeClasses.textTertiary}`}>
                      No subject results recorded
                    </td>
                  </tr>
                ) : (
                  (actualTermReport.subject_results as any[]).map((sr: any, i: number) => (
                    <tr key={sr.id || i} className={`hover:${themeClasses.bgSecondary}`}>
                      <td className={`px-4 py-3 font-medium ${themeClasses.textPrimary}`}>
                        {sr.subject?.name || sr.subject_name || '—'}
                      </td>
                      {educationLevel === 'NURSERY' ? (
                        <>
                          <td className={`px-4 py-3 text-center ${themeClasses.textPrimary}`}>{sr.mark_obtained ?? '—'}</td>
                          <td className={`px-4 py-3 text-center ${themeClasses.textSecondary}`}>{sr.max_marks_obtainable ?? '—'}</td>
                          <td className={`px-4 py-3 text-center ${themeClasses.textPrimary}`}>
                            {sr.percentage != null ? `${parseFloat(sr.percentage).toFixed(1)}%` : '—'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={`px-4 py-3 text-center ${themeClasses.textSecondary}`}>
                            {sr.ca_total != null ? parseFloat(sr.ca_total).toFixed(1) : '—'}
                          </td>
                          <td className={`px-4 py-3 text-center font-medium ${themeClasses.textPrimary}`}>
                            {sr.total_score != null ? parseFloat(sr.total_score).toFixed(1) : '—'}
                          </td>
                          <td className={`px-4 py-3 text-center ${themeClasses.textPrimary}`}>
                            {sr.percentage != null ? `${parseFloat(sr.percentage).toFixed(1)}%` : '—'}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          sr.grade?.startsWith('A') ? 'bg-emerald-100 text-emerald-700' :
                          sr.grade?.startsWith('B') ? 'bg-blue-100 text-blue-700' :
                          sr.grade?.startsWith('C') ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {sr.grade || '—'}
                        </span>
                      </td>
                      {educationLevel === 'NURSERY' && (
                        <td className={`px-4 py-3 text-sm italic ${themeClasses.textSecondary}`}>
                          {sr.academic_comment || '—'}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Teacher Remarks */}
          {(actualTermReport.class_teacher_remark || actualTermReport.head_teacher_remark) && (
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-t ${themeClasses.border}`}>
              {actualTermReport.class_teacher_remark && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Class Teacher Remark</p>
                  <p className="text-sm text-blue-900">{actualTermReport.class_teacher_remark}</p>
                </div>
              )}
              {actualTermReport.head_teacher_remark && (
                <div className="bg-violet-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-violet-700 mb-1">Head Teacher Remark</p>
                  <p className="text-sm text-violet-900">{actualTermReport.head_teacher_remark}</p>
                </div>
              )}
            </div>
          )}

          {/* Nursery Physical Development */}
          {educationLevel === 'NURSERY' && (actualTermReport.physical_development || actualTermReport.health || actualTermReport.cleanliness || actualTermReport.general_conduct) && (
            <div className={`p-4 border-t ${themeClasses.border}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${themeClasses.textTertiary}`}>Physical Development</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {actualTermReport.physical_development && (
                  <div className={`rounded-lg p-3 ${themeClasses.bgSecondary}`}>
                    <p className={`text-xs ${themeClasses.textTertiary}`}>Physical</p>
                    <p className={`text-sm font-medium mt-1 ${themeClasses.textPrimary}`}>{actualTermReport.physical_development_display || actualTermReport.physical_development}</p>
                  </div>
                )}
                {actualTermReport.health && (
                  <div className={`rounded-lg p-3 ${themeClasses.bgSecondary}`}>
                    <p className={`text-xs ${themeClasses.textTertiary}`}>Health</p>
                    <p className={`text-sm font-medium mt-1 ${themeClasses.textPrimary}`}>{actualTermReport.health_display || actualTermReport.health}</p>
                  </div>
                )}
                {actualTermReport.cleanliness && (
                  <div className={`rounded-lg p-3 ${themeClasses.bgSecondary}`}>
                    <p className={`text-xs ${themeClasses.textTertiary}`}>Cleanliness</p>
                    <p className={`text-sm font-medium mt-1 ${themeClasses.textPrimary}`}>{actualTermReport.cleanliness_display || actualTermReport.cleanliness}</p>
                  </div>
                )}
                {actualTermReport.general_conduct && (
                  <div className={`rounded-lg p-3 ${themeClasses.bgSecondary}`}>
                    <p className={`text-xs ${themeClasses.textTertiary}`}>Conduct</p>
                    <p className={`text-sm font-medium mt-1 ${themeClasses.textPrimary}`}>{actualTermReport.general_conduct_display || actualTermReport.general_conduct}</p>
                  </div>
                )}
              </div>
              {actualTermReport.physical_development_comment && (
                <p className={`mt-3 text-sm italic ${themeClasses.textSecondary}`}>{actualTermReport.physical_development_comment}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fallback: show raw results if no term report */}
      {!actualTermReport && results.length > 0 && (
        <div className={`rounded-xl border ${themeClasses.border} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={`${themeClasses.bgSecondary} border-b ${themeClasses.border}`}>
                <tr>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>Subject</th>
                  <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>Score</th>
                  <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>Grade</th>
                  <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textTertiary}`}>Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${themeClasses.border}`}>
                {results.map((r: any, i: number) => (
                  <tr key={r.id || i} className={`hover:${themeClasses.bgSecondary}`}>
                    <td className={`px-4 py-3 font-medium ${themeClasses.textPrimary}`}>{r.subject?.name || '—'}</td>
                    <td className={`px-4 py-3 text-center ${themeClasses.textPrimary}`}>
                      {r.total_score != null ? parseFloat(r.total_score).toFixed(1) : r.mark_obtained ?? '—'}
                    </td>
                    <td className={`px-4 py-3 text-center ${themeClasses.textPrimary}`}>{r.grade || '—'}</td>
                    <td className={`px-4 py-3 text-center`}>
                      <span className={`text-xs font-medium ${r.status === 'PUBLISHED' ? 'text-violet-600' : r.status === 'APPROVED' ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default StudentResultDisplay2;