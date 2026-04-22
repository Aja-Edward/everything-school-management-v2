// import React, { useState, useEffect, useMemo } from 'react';
// import { Trophy, Download, Printer, Loader2, AlertCircle } from 'lucide-react';
// import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
// import ResultService, { 
//   FilterParams,
// } from '@/services/ResultService';
// import ResultCheckerService from '@/services/ResultCheckerService';
// import StudentService from '@/services/StudentService';
// import { 
//   SelectionData, 
//   AcademicSession, 
//   StandardResult, 
//   StudentTermResult,
//   // StudentInfo,
//   // SubjectInfo,
//   // ExamSessionInfo
// } from '@/types/types'
// import { useResultService, type EnhancedResultSheet } from '@/hooks/useResultService';
// import { toast } from 'react-hot-toast';

// // Import result templates based on education level
// import NurseryResult from '../student/NurseryResult';
// import PrimaryResult from '../student/PrimaryResult';
// import JuniorSecondaryResult from '../student/JuniorSecondaryResult';
// import SeniorSecondarySessionResult from '../student/SeniorSecondarySessionResult';
// import SeniorSecondaryTermlyResult from '../student/SeniorSecondaryTermlyResult';

// interface StudentData {
//   id: string;
//   age?: number;
//   gender?: string;
//   full_name: string;
//   date_of_birth?: string;
//   stream?: string;
//   classroom?: string;
//   parent_contact?: string;
//   emergency_contact?: string;
//   admission_date?: string;
//   house?: string;
//   username: string;
//   student_class: string;
//   education_level: string;
//   profile_picture?: string;
// }


// interface StudentResultDisplayProps {
//   student: StudentData;
//   selections: SelectionData;
// }

// // Type guard for AcademicSession
// const isAcademicSessionObject = (value: any): value is AcademicSession => {
//   return value && typeof value === 'object' && 'id' in value && 'name' in value;
// };

// const StudentResultDisplay: React.FC<StudentResultDisplayProps> = ({ student, selections }) => {
  
  
//   const { isDarkMode } = useGlobalTheme();
//   const { service: resultService, schoolSettings, loading: settingsLoading, isReady } = useResultService();
  
//   const [results, setResults] = useState<StandardResult[]>([]);
//   const [termResults, setTermResults] = useState<StudentTermResult[]>([]);
//   const [enhancedResult, setEnhancedResult] = useState<EnhancedResultSheet | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const [completeStudent, setCompleteStudent] = useState<StudentData | null>(null);
//   const [debugInfo, setDebugInfo] = useState<any>(null);

//   // Function to fetch complete student information
//   const fetchCompleteStudentInfo = async () => {
//     try {
//       console.log('🔄 [StudentResultDisplay] Fetching complete student info for ID:', student.id);
      
//       // Use the student service to fetch complete student information
//       const studentInfo = await StudentService.getStudent(parseInt(student.id));
//       console.log('✅ [StudentResultDisplay] Complete student info fetched:', studentInfo);
      
//       // Map the student info to StudentData interface
//       const mappedStudentData: StudentData = {
//         id: studentInfo.id?.toString() || student.id,
//         full_name: studentInfo.full_name || student.full_name,
//         username: studentInfo.user_details?.username || studentInfo.registration_number || student.username,
//         student_class: studentInfo.student_class || student.student_class,
//         education_level: studentInfo.education_level || student.education_level,
//         profile_picture: studentInfo.profile_picture_url,
//       };
      
//       setCompleteStudent(mappedStudentData);
//     } catch (error) {
//       console.error('❌ [StudentResultDisplay] Error fetching complete student info:', error);
//       // Fallback to the original student prop
//       setCompleteStudent(student);
//     }
//   };

//   const themeClasses = {
//     bgPrimary: isDarkMode ? 'bg-gray-900' : 'bg-white',
//     bgSecondary: isDarkMode ? 'bg-gray-800' : 'bg-gray-50',
//     bgCard: isDarkMode ? 'bg-gray-800' : 'bg-white',
//     textPrimary: isDarkMode ? 'text-white' : 'text-gray-900',
//     textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
//     textTertiary: isDarkMode ? 'text-gray-400' : 'text-gray-500',
//     border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
//     borderHover: isDarkMode ? 'border-gray-600' : 'border-gray-300',
//     iconPrimary: isDarkMode ? 'text-blue-400' : 'text-blue-600',
//     iconSecondary: isDarkMode ? 'text-gray-400' : 'text-gray-500',
//     buttonPrimary: isDarkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
//     buttonSecondary: isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700',
//     buttonSuccess: isDarkMode ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white',
//     buttonWarning: isDarkMode ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-orange-600 hover:bg-orange-700 text-white',
//     buttonDanger: isDarkMode ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white',
//   };

//   // Memoized education level determination
//   const educationLevel = useMemo(() => {
//     if (student.education_level) {
//       return student.education_level.toUpperCase();
//     }
    
//     const className = student.student_class?.toLowerCase() || '';
//     if (className.includes('nursery')) return 'NURSERY';
//     if (className.includes('primary')) return 'PRIMARY';
//     if (className.includes('jss') || className.includes('junior')) return 'JUNIOR_SECONDARY';
//     if (className.includes('sss') || className.includes('senior')) return 'SENIOR_SECONDARY';
//     return 'UNKNOWN';
//   }, [student.education_level, student.student_class]);

//   // Memoized term format conversion - FIXED
//   const normalizedTerm = useMemo(() => {
//     // Access the term name from the term object
//     const termName = selections.term?.name;
    
//     // Add null/undefined check and ensure it's a string
//     if (!termName || typeof termName !== 'string') {
//       return '';
//     }
    
//     const termMap: { [key: string]: string } = {
//       '1st Term': 'FIRST',
//       '2nd Term': 'SECOND', 
//       '3rd Term': 'THIRD',
//       'First Term': 'FIRST',
//       'Second Term': 'SECOND',
//       'Third Term': 'THIRD',
//       'FIRST': 'FIRST',
//       'SECOND': 'SECOND',
//       'THIRD': 'THIRD'
//     };
    
//     return termMap[termName] || termName.toUpperCase();
//   }, [selections.term]);

//   // Helper function to extract academic session string
//   const getAcademicSessionString = (academicSession: AcademicSession | string | undefined): string => {
//     if (typeof academicSession === 'string') {
//       return academicSession;
//     }
//     if (isAcademicSessionObject(academicSession)) {
//       return academicSession.name || academicSession.id || '';
//     }
//     return '';
//   };

//   // Helper function to extract academic session ID
//   const getAcademicSessionId = (academicSession: AcademicSession | string | undefined): string => {
//     if (typeof academicSession === 'string') {
//       return academicSession;
//     }
//     if (isAcademicSessionObject(academicSession)) {
//       return academicSession.id || '';
//     }
//     return '';
//   };

//   // Load results data with improved error handling and filtering
//   useEffect(() => {
//     const loadResults = async () => {
//       // Wait for result service to be ready
//       if (!isReady) return;

//       try {
//         setLoading(true);
//         setError(null);
        
//         // First fetch complete student information
//         await fetchCompleteStudentInfo();

//         if (educationLevel === 'UNKNOWN') {
//           throw new Error('Unable to determine education level from student data');
//         }

//         // Try to load enhanced results first if exam session is available
//         if (selections.examSession) {
//           try {
//             const enhancedData = await resultService.generateEnhancedResultSheet(
//               student.id, 
//               selections.examSession
//             );
//             setEnhancedResult(enhancedData);
            
//             if (import.meta.env.DEV) {
//               console.log('Enhanced result loaded:', enhancedData);
//             }
//           } catch (enhancedError) {
//             console.warn('Enhanced result generation failed, falling back to standard results:', enhancedError);
//           }
//         }

//         // Load standard results
//         const filterParams: FilterParams = {
//           student: student.id,
//           education_level: educationLevel,
//           result_type: selections.resultType === 'annually' ? 'session' : 'termly'
//         };

//         // Add academic session filter if available
//         const academicSessionString = getAcademicSessionString(selections.academicSession);
//         if (academicSessionString && isAcademicSessionObject(selections.academicSession)) {
//           filterParams.academic_session = selections.academicSession;
//         }

//         // Add term filter if available
//         if (normalizedTerm && selections.resultType !== 'annually') {
//           filterParams.term = normalizedTerm;
//         }

//         if (import.meta.env.DEV) {
//           console.log('Loading standard results with params:', filterParams);
//           setDebugInfo({
//             studentId: student.id,
//             educationLevel,
//             originalTerm: selections.term?.name, // FIXED
//             normalizedTerm,
//             academicSession: academicSessionString,
//             resultType: selections.resultType,
//             examSession: selections.examSession,
//             filterParams,
//             schoolSettings: schoolSettings ? 'Available' : 'Not Available'
//           });
//         }

//         const [resultsData, termResultsData] = await Promise.allSettled([
//           ResultService.getStudentResults(filterParams),
//           // Use the correct service method to get term reports with next_term_begins
//           ResultCheckerService.getTermReports(educationLevel, {
//             student_id: student.id,
//             education_level: educationLevel as "NURSERY" | "PRIMARY" | "JUNIOR_SECONDARY" | "SENIOR_SECONDARY",
//             result_type: selections.resultType === 'annually' ? 'session' : 'termly'
//           })
//         ]);

//         // Handle results data
//         let processedResults: StandardResult[] = [];
//         if (resultsData.status === 'fulfilled') {
//           processedResults = resultsData.value || [];
//         } else {
//           console.error('Error fetching results:', resultsData.reason);
//           toast.error('Failed to load subject results');
//         }

//         // Handle term results data
//         let processedTermResults: StudentTermResult[] = [];
//         if (termResultsData.status === 'fulfilled') {
//           processedTermResults = termResultsData.value || [];
          
//           // Filter term results by selection criteria - FIXED
//           processedTermResults = processedTermResults.filter((termResult) => {
//             const termMatch = !normalizedTerm || 
//                              termResult.term?.toUpperCase() === normalizedTerm ||
//                              termResult.term === selections.term?.name; // FIXED
            
//             const sessionMatch = !academicSessionString ||
//                                 (isAcademicSessionObject(termResult.academic_session) && 
//                                  termResult.academic_session.name === academicSessionString);
            
//             return termMatch && sessionMatch;
//           });
//         } else {
//           console.error('Error fetching term results:', termResultsData.reason);
//         }

//         if (import.meta.env.DEV) {
//           console.log('Processed standard results:', {
//             subjectResults: processedResults.length,
//             termResults: processedTermResults.length,
//             sampleResult: processedResults[0],
//             sampleTermResult: processedTermResults[0]
//           });
//         }

//         setResults(processedResults);
//         setTermResults(processedTermResults);

//         // Set appropriate error message if no results found - FIXED
//         if (processedResults.length === 0 && processedTermResults.length === 0 && !enhancedResult) {
//           const academicSessionName = getAcademicSessionString(selections.academicSession);
//           setError(`No results found for ${student.full_name} in ${academicSessionName} ${selections.term?.name}. Please verify that results have been published for this academic session and term.`);
//         }
//       } catch (err) {
//         const errorMessage = err instanceof Error ? err.message : 'Failed to load results';
//         console.error('Error loading results:', err);
//         setError(errorMessage);
//         toast.error(errorMessage);
//       } finally {
//         setLoading(false);
//       }
//     };

//     loadResults();
//   }, [student.id, educationLevel, normalizedTerm, selections.academicSession, selections.resultType, selections.examSession, isReady, resultService]);

//   // Utility functions
//   const getGradeColor = (grade: string) => {
//     if (!grade || grade === 'N/A') return isDarkMode ? 'text-gray-400 bg-gray-700' : 'text-gray-600 bg-gray-100';
    
//     const gradeUpper = grade.toUpperCase();
//     if (gradeUpper.includes('A')) return isDarkMode ? 'text-green-400 bg-green-900/30' : 'text-green-600 bg-green-100';
//     if (gradeUpper.includes('B')) return isDarkMode ? 'text-blue-400 bg-blue-900/30' : 'text-blue-600 bg-blue-100';
//     if (gradeUpper.includes('C')) return isDarkMode ? 'text-yellow-400 bg-yellow-900/30' : 'text-yellow-600 bg-yellow-100';
//     if (gradeUpper.includes('D')) return isDarkMode ? 'text-orange-400 bg-orange-900/30' : 'text-orange-600 bg-orange-100';
//     return isDarkMode ? 'text-red-400 bg-red-900/30' : 'text-red-600 bg-red-100';
//   };

//   const getStatusColor = (status: string) => {
//     if (!status) return isDarkMode ? 'text-gray-400 bg-gray-700' : 'text-gray-600 bg-gray-100';
    
//     switch (status.toUpperCase()) {
//       case 'PUBLISHED': 
//       case 'APPROVED':
//         return isDarkMode ? 'text-green-400 bg-green-900/30' : 'text-green-600 bg-green-100';
//       case 'DRAFT':
//       case 'PENDING':
//         return isDarkMode ? 'text-yellow-400 bg-yellow-900/30' : 'text-yellow-600 bg-yellow-100';
//       case 'REJECTED':
//         return isDarkMode ? 'text-red-400 bg-red-900/30' : 'text-red-600 bg-red-100';
//       default: 
//         return isDarkMode ? 'text-gray-400 bg-gray-700' : 'text-gray-600 bg-gray-100';
//     }
//   };

//   const handlePrint = () => {
//     window.print();
//   };

//   const handleDownload = async () => {
//     try {
//       if (selections.examSession && isReady) {
//         await resultService.generateEnhancedResultSheet(
//           student.id, 
//           selections.examSession
//         );
//         toast.success('PDF generated successfully');
//       } else {
//         await ResultService.generateTranscript(student.id, {
//           include_assessment_details: true,
//           include_comments: true,
//           include_subject_remarks: true,
//           format: 'PDF'
//         });
//         toast.success('PDF generated successfully');
//       }
//     } catch (error) {
//       console.error('Download error:', error);
//       toast.error('Failed to generate PDF. Please try again.');
//     }
//   };

//   // Get school name for display
//   const getSchoolName = () => {
//     if (schoolSettings?.school_name) {
//       return schoolSettings.school_name;
//     }
//     if (enhancedResult?.school_info?.school_name) {
//       return enhancedResult.school_info.school_name;
//     }
//     return "School Name";
//   };

//   // Transform data to match the expected interfaces for each component
//   const transformDataForNursery = () => {
//     return {
//       id: `nursery-${student.id}`,
//       student: {
//         id: student.id,
//         name: student.full_name,
//         admission_number: student.username,
//         username: student.username,
//         class: student.student_class,
//         education_level: educationLevel as "NURSERY" | "PRIMARY" | "JUNIOR_SECONDARY" | "SENIOR_SECONDARY" | undefined,
//         gender: undefined,
//         age: undefined,
//         house: undefined
//       },
//       term: {
//         id: 'term-1',
//         name: selections.term?.name || '', // FIXED
//         academic_session: isAcademicSessionObject(selections.academicSession) 
//           ? selections.academicSession 
//           : { id: 'session-1', name: getAcademicSessionString(selections.academicSession), start_year: 2024, end_year: 2025 },
//         start_date: new Date().toISOString(),
//         end_date: new Date().toISOString()
//       },
//       subjects: results.map(result => ({
//         subject: {
//           id: result.subject?.id || 'subject-unknown',
//           name: result.subject?.name || 'Unknown Subject',
//           code: result.subject?.code || ''
//         },
//         total_score: result.total_score || 0,
//         percentage: result.percentage || 0,
//         grade: result.grade || '',
//         position: result.position || 0,
//         class_average: result.class_average || 0,
//         highest_in_class: result.highest_in_class || 0,
//         lowest_in_class: result.lowest_in_class || 0,
//         teacher_remark: result.teacher_remark,
//         max_marks_obtainable: 100,
//         mark_obtained: result.total_score || 0,
//         physical_development_score: undefined,
//         id: result.id
//       })),
//       total_score: results.reduce((sum, r) => sum + (r.total_score || 0), 0),
//       max_marks_obtainable: results.length * 100,
//       mark_obtained: results.reduce((sum, r) => sum + (r.total_score || 0), 0),
//       position: termResults[0]?.class_position || 0,
//       class_position: termResults[0]?.class_position || 0,
//       total_students: termResults[0]?.total_students || 0,
//       attendance: {
//         times_opened: 0,
//         times_present: 0
//       },
//       next_term_begins: '',
//       class_teacher_remark: termResults[0]?.remarks,
//       head_teacher_remark: '',
//       is_published: true,
//       created_at: new Date().toISOString(),
//       updated_at: new Date().toISOString()
//     };
//   };

//   const transformDataForPrimary = () => {
//     const studentData = completeStudent || student;
//     console.log('🔄 [StudentResultDisplay] transformDataForPrimary using student:', studentData);
    
//     return {
//       id: `primary-${studentData.id}`,
//       student: {
//         id: studentData.id,
//         name: studentData.full_name,
//         admission_number: studentData.username,
//         username: studentData.username,
//         class: studentData.student_class,
//         education_level: educationLevel as "NURSERY" | "PRIMARY" | "JUNIOR_SECONDARY" | "SENIOR_SECONDARY" | undefined,
//         gender: studentData.gender,
//         age: studentData.age,
//         date_of_birth: studentData.date_of_birth,
//         classroom: studentData.classroom,
//         stream: studentData.stream,
//         parent_contact: studentData.parent_contact,
//         emergency_contact: studentData.emergency_contact,
//         admission_date: studentData.admission_date,
//         house: studentData.house
//       },
//       term: {
//         id: 'term-1',
//         name: selections.term?.name || '', // FIXED
//         academic_session: isAcademicSessionObject(selections.academicSession) 
//           ? selections.academicSession 
//           : { id: 'session-1', name: getAcademicSessionString(selections.academicSession), start_year: 2024, end_year: 2025 },
//         start_date: new Date().toISOString(),
//         end_date: new Date().toISOString()
//       },
//       subjects: results.map(result => ({
//         subject: {
//           id: result.subject?.id || 'subject-unknown',
//           name: result.subject?.name || 'Unknown Subject',
//           code: result.subject?.code || ''
//         },
//         total_score: result.total_score || 0,
//         percentage: result.percentage || 0,
//         grade: result.grade || '',
//         position: result.position || 0,
//         class_average: result.class_average || 0,
//         highest_in_class: result.highest_in_class || 0,
//         lowest_in_class: result.lowest_in_class || 0,
//         teacher_remark: result.teacher_remark,
//         continuous_assessment_score: result.continuous_assessment_score || 0,
//         take_home_test_score: result.take_home_test_score || 0,
//         project_score: result.project_score || 0,
//         appearance_score: result.appearance_score || 0,
//         note_copying_score: result.note_copying_score || 0,
//         practical_score: result.practical_score || 0,
//         ca_total: (result.continuous_assessment_score || 0) + 
//                   (result.take_home_test_score || 0) + 
//                   (result.project_score || 0) + 
//                   (result.appearance_score || 0) + 
//                   (result.note_copying_score || 0) + 
//                   (result.practical_score || 0),
//         exam_marks: result.exam_score || 0,
//         mark_obtained: (result.continuous_assessment_score || 0) + 
//                        (result.take_home_test_score || 0) + 
//                        (result.project_score || 0) + 
//                        (result.appearance_score || 0) + 
//                        (result.note_copying_score || 0) + 
//                        (result.practical_score || 0) + 
//                        (result.exam_score || 0),
//         total_obtainable: 100,
//         id: result.id
//       })),
//       total_score: results.reduce((sum, r) => sum + ((r.continuous_assessment_score || 0) + 
//                                                       (r.take_home_test_score || 0) + 
//                                                       (r.project_score || 0) + 
//                                                       (r.appearance_score || 0) + 
//                                                       (r.note_copying_score || 0) + 
//                                                       (r.practical_score || 0) + 
//                                                       (r.exam_score || 0)), 0),
//       // Calculate average score from subject results
//       average_score: results.length > 0 ? results.reduce((sum, r) => sum + ((r.continuous_assessment_score || 0) + 
//                                                                              (r.take_home_test_score || 0) + 
//                                                                              (r.project_score || 0) + 
//                                                                              (r.appearance_score || 0) + 
//                                                                              (r.note_copying_score || 0) + 
//                                                                              (r.practical_score || 0) + 
//                                                                              (r.exam_score || 0)), 0) / results.length : 0,
//       // Calculate overall grade based on average score
//       overall_grade: results.length > 0 ? (() => {
//         const avgScore = results.reduce((sum, r) => sum + ((r.continuous_assessment_score || 0) + 
//                                                            (r.take_home_test_score || 0) + 
//                                                            (r.project_score || 0) + 
//                                                            (r.appearance_score || 0) + 
//                                                            (r.note_copying_score || 0) + 
//                                                            (r.practical_score || 0) + 
//                                                            (r.exam_score || 0)), 0) / results.length;
//         return avgScore >= 75 ? 'A' : avgScore >= 70 ? 'B' : avgScore >= 65 ? 'C' : avgScore >= 60 ? 'D' : 'F';
//       })() : 'F',
//       class_position: termResults[0]?.class_position || 1,
//       total_students: termResults[0]?.total_students || 1,
//       attendance: {
//         times_opened: termResults[0]?.times_opened || 0,
//         times_present: termResults[0]?.times_present || 0
//       },
//       next_term_begins: (() => {
        
//         return termResults[0]?.next_term_begins || 'TBA';
//       })(),
//       class_teacher_remark: termResults[0]?.remarks,
//       head_teacher_remark: '',
//       is_published: true,
//       created_at: new Date().toISOString(),
//       updated_at: new Date().toISOString()
//     };
//   };

//   const transformDataForSeniorSecondary = () => {
//     if (selections.resultType === 'annually') {
//       // Session result data
//       return {
//         id: `senior-session-${student.id}`,
//         student: {
//           id: (completeStudent || student).id,
//           name: (completeStudent || student).full_name,
//           full_name: (completeStudent || student).full_name,
//           admission_number: (completeStudent || student).username,
//           username: (completeStudent || student).username,
//           class: (completeStudent || student).student_class,
//           student_class: (completeStudent || student).student_class,
//           education_level: educationLevel as "NURSERY" | "PRIMARY" | "JUNIOR_SECONDARY" | "SENIOR_SECONDARY" | undefined,
//           gender: (completeStudent || student).gender,
//           age: (completeStudent || student).age || 0,
//           date_of_birth: (completeStudent || student).date_of_birth,
//           classroom: (completeStudent || student).classroom,
//           stream: (completeStudent || student).stream,
//           parent_contact: (completeStudent || student).parent_contact,
//           emergency_contact: (completeStudent || student).emergency_contact,
//           admission_date: (completeStudent || student).admission_date,
//           house: undefined
//         },
//         academic_session: isAcademicSessionObject(selections.academicSession) 
//           ? selections.academicSession 
//           : { 
//               id: getAcademicSessionId(selections.academicSession) || 'session-1', 
//               name: getAcademicSessionString(selections.academicSession), 
//               start_year: 2024, 
//               end_year: 2025 
//             },
//         term1_total: 0,
//         term2_total: 0,
//         term3_total: 0,
//         taa_score: termResults[0]?.average_score || 0,
//         average_for_year: termResults[0]?.average_score || 0,
//         obtainable: results.length * 100,
//         obtained: results.reduce((sum, r) => sum + (r.total_score || 0), 0),
//         overall_grade: termResults[0]?.gpa?.toString() || '',
//         class_position: termResults[0]?.class_position || 0,
//         total_students: termResults[0]?.total_students || 0,
//         subjects: results.map(result => ({
//           subject: {
//             id: result.subject?.id || 'subject-unknown',
//             name: result.subject?.name || 'Unknown Subject',
//             code: result.subject?.code || ''
//           },
//           term1_score: 0,
//           term2_score: 0,
//           term3_score: 0,
//           average_score: result.percentage || 0,
//           class_average: result.class_average || 0,
//           highest_in_class: result.highest_in_class || 0,
//           lowest_in_class: result.lowest_in_class || 0,
//           position: result.position || 0,
//           teacher_remark: result.teacher_remark,
//           head_teacher_remark: ''
//         })),
//         is_published: true,
//         created_at: new Date().toISOString(),
//         updated_at: new Date().toISOString()
//       };
//     } else {
//       // Termly result data - Senior Secondary specific transformation
//       return {
//         id: `senior-termly-${student.id}`,
//         student: {
//           id: (completeStudent || student).id,
//           name: (completeStudent || student).full_name,
//           full_name: (completeStudent || student).full_name,
//           username: (completeStudent || student).username,
//           admission_number: (completeStudent || student).username,
//           class: (completeStudent || student).student_class,
//           student_class: (completeStudent || student).student_class,
//           education_level: educationLevel as "NURSERY" | "PRIMARY" | "JUNIOR_SECONDARY" | "SENIOR_SECONDARY" | undefined,
//           age: (completeStudent || student).age || 0,
//           gender: (completeStudent || student).gender,
//           date_of_birth: (completeStudent || student).date_of_birth,
//           classroom: (completeStudent || student).classroom,
//           stream: (completeStudent || student).stream,
//           parent_contact: (completeStudent || student).parent_contact,
//           emergency_contact: (completeStudent || student).emergency_contact,
//           admission_date: (completeStudent || student).admission_date
//         },
//         term: {
//           id: selections.examSession || 'term-1',
//           name: selections.term?.name || 'Current Term',
//           start_date: new Date().toISOString(),
//           end_date: new Date().toISOString(),
//           academic_session: isAcademicSessionObject(selections.academicSession) 
//             ? selections.academicSession 
//             : { 
//                 id: getAcademicSessionId(selections.academicSession) || 'session-1', 
//                 name: getAcademicSessionString(selections.academicSession),
//                 start_date: new Date().toISOString(),
//                 end_date: new Date().toISOString(),
//                 is_current: true,
//                 is_active: true,
//                 created_at: new Date().toISOString(),
//                 updated_at: new Date().toISOString()
//               }
//         },
//         subjects: results.map(result => ({
//           id: result.id,
//           subject: {
//             id: result.subject?.id || 'subject-unknown',
//             name: result.subject?.name || 'Unknown Subject',
//             code: result.subject?.code || ''
//           },
//           test1_score: result.test1_score || result.first_test_score || 0,
//           test2_score: result.test2_score || result.second_test_score || 0,
//           test3_score: result.test3_score || result.third_test_score || 0,
//           exam_score: result.exam_score || 0,
//           total_score: result.total_score || 0,
//           total_obtainable: 100,
//           class_average: result.class_average || 0,
//           highest_in_class: result.highest_in_class || 0,
//           lowest_in_class: result.lowest_in_class || 0,
//           position: result.position || 0,
//           grade: result.grade || '',
//           teacher_remark: result.teacher_remark || '',
//           percentage: result.percentage || 0
//         })),
//         // Calculate average score from subject results
//         average_score: results.length > 0 ? results.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0) / results.length : 0,
//         total_score: results.reduce((sum, r) => sum + (parseFloat(r.total_score) || 0), 0),
//         total_students: 1, // Since this is individual student data
//         attendance: {
//           times_opened: termResults[0]?.times_opened || 0,
//           times_present: termResults[0]?.times_present || 0
//         },
//         next_term_begins: (() => {
//           console.log('🔍 [StudentResultDisplay] termResults[0]:', termResults[0]);
//           console.log('🔍 [StudentResultDisplay] termResults[0]?.next_term_begins:', termResults[0]?.next_term_begins);
//           console.log('🔍 [StudentResultDisplay] termResults[0]?.next_term_begins type:', typeof termResults[0]?.next_term_begins);
//           return termResults[0]?.next_term_begins || 'TBA';
//         })(),
//         class_teacher_remark: termResults[0]?.class_teacher_remark || '',
//         head_teacher_remark: termResults[0]?.head_teacher_remark || '',
//         // Calculate overall grade based on average score
//         overall_grade: results.length > 0 ? (results.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0) / results.length >= 75 ? 'A' : 
//                                               results.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0) / results.length >= 70 ? 'B' :
//                                               results.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0) / results.length >= 65 ? 'C' :
//                                               results.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0) / results.length >= 60 ? 'D' : 'F') : 'F',
//         class_position: 1, // Since this is individual student data
//         is_published: true,
//         created_at: new Date().toISOString(),
//         updated_at: new Date().toISOString()
//       };
//     }
//   };

//   // Render appropriate result template
//   const getResultTemplate = () => {
//     switch (educationLevel) {
//       case 'NURSERY':
//         const nurseryData = transformDataForNursery();
//         return <NurseryResult data={nurseryData as any} showOnlyPublished={false} />;

//       case 'PRIMARY':
//         const primaryData = transformDataForPrimary();
//         return (
//           <PrimaryResult 
//             studentId={student.id}
//             examSessionId={selections.examSession || ''}
//             templateId=""
//             data={primaryData as any}
//             showOnlyPublished={false}
//           />
//         );

//       case 'JUNIOR_SECONDARY':
//         const juniorData = transformDataForPrimary(); // Same structure as primary
//         return (
//           <JuniorSecondaryResult 
//             studentId={student.id}
//             examSessionId={selections.examSession || ''}
//             templateId=""
//             data={juniorData as any}
//             showOnlyPublished={false}
//           />
//         );

//       case 'SENIOR_SECONDARY':
//         const seniorData = transformDataForSeniorSecondary();
//         if (selections.resultType === 'annually') {
//           return (
//             <SeniorSecondarySessionResult 
//               studentId={student.id}
//               academicSessionId={getAcademicSessionId(selections.academicSession) || ''}
//               templateId=""
//               data={seniorData as any}
//               showOnlyPublished={false}
//             />
//           );
//         } else {
//           return (
//             <SeniorSecondaryTermlyResult 
//               studentId={student.id}
//               examSessionId={selections.examSession || ''}
//               data={seniorData as any}
//               showOnlyPublished={false}
//             />
//           );
//         }

//       default:
//         return <GenericResultDisplay />;
//     }
//   };

//   // Generic fallback result display component
//   const GenericResultDisplay = () => (
//     <div className="space-y-6 print:space-y-4">
//       {/* Print Header */}
//       <div className="hidden print:block print:mb-6">
//         <div className="text-center border-b-2 border-gray-300 pb-4 mb-6">
//           <h1 className="text-2xl font-bold text-gray-900">{getSchoolName()}</h1>
//           <p className="text-gray-600">Student Result Report</p>
//           <p className="text-sm text-gray-500 mt-2">
//             Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
//           </p>
//         </div>
//         <div className="grid grid-cols-2 gap-4 mb-6">
//           <div>
//             <p><strong>Student Name:</strong> {student.full_name}</p>
//             <p><strong>Username:</strong> {student.username}</p>
//             <p><strong>Class:</strong> {student.student_class}</p>
//           </div>
//           <div>
//             <p><strong>Academic Session:</strong> {getAcademicSessionString(selections.academicSession)}</p>
//             <p><strong>Term:</strong> {selections.term?.name}</p> {/* FIXED */}
//             <p><strong>Education Level:</strong> {educationLevel}</p>
//           </div>
//         </div>
//       </div>

//       {/* Enhanced Result Summary if available */}
//       {enhancedResult && (
//         <div className={`${themeClasses.bgCard} rounded-lg p-6 border ${themeClasses.border} print:bg-white print:border-gray-300`}>
//           <h3 className={`text-lg font-semibold ${themeClasses.textPrimary} mb-4 flex items-center print:text-black`}>
//             <Trophy className="w-5 h-5 text-blue-600 mr-2" />
//             Result Summary
//           </h3>
//           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
//             <div className={`${themeClasses.bgSecondary} rounded-lg p-4 border ${themeClasses.border} print:border-gray-300 print:bg-gray-50`}>
//               <div className="text-center">
//                 <div className={`text-2xl font-bold ${themeClasses.textPrimary} print:text-black`}>
//                   {enhancedResult.overall_total || 0}
//                 </div>
//                 <div className={`text-sm ${themeClasses.textSecondary} print:text-black`}>
//                   Total Score
//                 </div>
//               </div>
//             </div>
//             <div className={`${themeClasses.bgSecondary} rounded-lg p-4 border ${themeClasses.border} print:border-gray-300 print:bg-gray-50`}>
//               <div className="text-center">
//                 <div className={`text-2xl font-bold ${themeClasses.textPrimary} print:text-black`}>
//                   {enhancedResult.average && typeof enhancedResult.average === 'number' ? enhancedResult.average.toFixed(1) + '%' : 'N/A'}
//                 </div>
//                 <div className={`text-sm ${themeClasses.textSecondary} print:text-black`}>
//                   Average
//                 </div>
//               </div>
//             </div>
//             <div className={`${themeClasses.bgSecondary} rounded-lg p-4 border ${themeClasses.border} print:border-gray-300 print:bg-gray-50`}>
//               <div className="text-center">
//                 <div className={`text-2xl font-bold ${themeClasses.textPrimary} print:text-black`}>
//                   {enhancedResult.position || 'N/A'}
//                 </div>
//                 <div className={`text-sm ${themeClasses.textSecondary} print:text-black`}>
//                   Position
//                 </div>
//               </div>
//             </div>
//             <div className={`${themeClasses.bgSecondary} rounded-lg p-4 border ${themeClasses.border} print:border-gray-300 print:bg-gray-50`}>
//               <div className="text-center">
//                 <div className={`text-2xl font-bold ${themeClasses.textPrimary} print:text-black`}>
//                   {enhancedResult.subjects?.length || 0}
//                 </div>
//                 <div className={`text-sm ${themeClasses.textSecondary} print:text-black`}>
//                   Subjects
//                 </div>
//               </div>
//             </div>
//           </div>
//           {enhancedResult.remarks && (
//             <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg print:bg-gray-50 print:border-gray-300">
//               <h4 className="font-semibold text-blue-900 mb-2 print:text-black">Remarks</h4>
//               <p className="text-blue-800 print:text-black">{enhancedResult.remarks}</p>
//             </div>
//           )}
//         </div>
//       )}

//       {/* Individual Subject Results */}
//       {results.length > 0 && (
//         <div className={`${themeClasses.bgCard} rounded-lg border ${themeClasses.border} overflow-hidden print:border-gray-300`}>
//           <div className={`px-6 py-4 border-b ${themeClasses.border} print:border-gray-300`}>
//             <h3 className={`text-lg font-semibold ${themeClasses.textPrimary} print:text-black`}>
//               Subject Results
//             </h3>
//           </div>
//           <div className="overflow-x-auto">
//             <table className="w-full">
//               <thead className={`${themeClasses.bgSecondary} print:bg-gray-100`}>
//                 <tr>
//                   <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.textSecondary} uppercase tracking-wider print:text-black print:border-b print:border-gray-300`}>
//                     Subject
//                   </th>
//                   <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.textSecondary} uppercase tracking-wider print:text-black print:border-b print:border-gray-300`}>
//                     Total Score
//                   </th>
//                   <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.textSecondary} uppercase tracking-wider print:text-black print:border-b print:border-gray-300`}>
//                     Percentage
//                   </th>
//                   <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.textSecondary} uppercase tracking-wider print:text-black print:border-b print:border-gray-300`}>
//                     Grade
//                   </th>
//                   <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.textSecondary} uppercase tracking-wider print:text-black print:border-b print:border-gray-300`}>
//                     Position
//                   </th>
//                   <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.textSecondary} uppercase tracking-wider print:text-black print:border-b print:border-gray-300`}>
//                     Status
//                   </th>
//                 </tr>
//               </thead>
//               <tbody className={`${themeClasses.bgCard} divide-y ${themeClasses.border.replace('border-', 'divide-')} print:divide-gray-300`}>
//                 {results.map((result, index) => (
//                   <tr key={result.id || index} className={`hover:${themeClasses.bgSecondary} print:hover:bg-transparent`}>
//                     <td className="px-6 py-4 whitespace-nowrap print:border-b print:border-gray-200">
//                       <div>
//                         <div className={`text-sm font-medium ${themeClasses.textPrimary} print:text-black`}>
//                           {result.subject?.name || 'N/A'}
//                         </div>
//                         <div className={`text-sm ${themeClasses.textSecondary} print:text-gray-600`}>
//                           {result.subject?.code || ''}
//                         </div>
//                       </div>
//                     </td>
//                     <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${themeClasses.textPrimary} print:text-black print:border-b print:border-gray-200`}>
//                       {result.total_score ?? 0}
//                     </td>
//                     <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.textPrimary} print:text-black print:border-b print:border-gray-200`}>
//                       {result.percentage && typeof result.percentage === 'number' ? result.percentage.toFixed(1) + '%' : 'N/A'}
//                     </td>
//                     <td className="px-6 py-4 whitespace-nowrap print:border-b print:border-gray-200">
//                       <span className={`px-2 py-1 rounded-full text-xs font-medium ${getGradeColor(result.grade)} print:bg-gray-200 print:text-black`}>
//                         {result.grade || 'N/A'}
//                       </span>
//                     </td>
//                     <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.textPrimary} print:text-black print:border-b print:border-gray-200`}>
//                       {result.position ? `${result.position}` : 'N/A'}
//                     </td>
//                     <td className="px-6 py-4 whitespace-nowrap print:border-b print:border-gray-200">
//                       <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(result.status)} print:bg-gray-200 print:text-black`}>
//                         {result.status || 'N/A'}
//                       </span>
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       )}
//     </div>
//   );

//   // Loading state
//   if (settingsLoading || loading) {
//     return (
//       <div className="flex items-center justify-center py-12">
//         <div className="text-center">
//           <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
//           <p className={themeClasses.textSecondary}>
//             {settingsLoading ? 'Loading school settings...' : 'Loading results...'}
//           </p>
//         </div>
//       </div>
//     );
//   }

//   // Error state
//   if (error) {
//     return (
//       <div className="text-center py-12">
//         <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
//         <h4 className={`text-lg font-semibold ${themeClasses.textPrimary} mb-2`}>No Results Found</h4>
//         <p className={`${themeClasses.textSecondary} mb-4`}>{error}</p>
        
//         {/* Debug information in development */}
//         {import.meta.env.DEV && debugInfo && (
//           <details className="text-left max-w-2xl mx-auto">
//             <summary className={`cursor-pointer ${themeClasses.textSecondary} mb-2`}>
//               Debug Information (Development Only)
//             </summary>
//             <div className={`text-xs ${themeClasses.bgSecondary} p-4 rounded-lg`}>
//               <pre className="whitespace-pre-wrap overflow-x-auto">
//                 {JSON.stringify(debugInfo, null, 2)}
//               </pre>
//             </div>
//           </details>
//         )}
//       </div>
//     );
//   }

//   return (
//     <div className="space-y-6 print:space-y-4">
//       {/* School Settings Status - Only shown in development */}
//       {import.meta.env.DEV && (
//         <div className={`${themeClasses.bgCard} rounded-lg p-4 border ${themeClasses.border} mb-4`}>
//           <div className="flex items-center justify-between">
//             <span className={`text-sm ${themeClasses.textSecondary}`}>
//               School Settings Status:
//             </span>
//             <span className={`text-sm font-medium ${schoolSettings ? 'text-green-600' : 'text-yellow-600'}`}>
//               {schoolSettings ? 'Loaded' : 'Not Available'}
//             </span>
//           </div>
//           {schoolSettings && (
//             <div className={`text-xs ${themeClasses.textTertiary} mt-2`}>
//               School: {schoolSettings.school_name || schoolSettings.school_name || 'Unknown'}
//             </div>
//           )}
//         </div>
//       )}

//       {/* Action Buttons - Hidden when printing */}
//       <div className="flex items-center justify-end space-x-3 print:hidden">
//         <button
//           onClick={handlePrint}
//           className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors ${themeClasses.buttonSecondary}`}
//         >
//           <Printer size={16} />
//           <span>Print</span>
//         </button>
//         <button
//           onClick={handleDownload}
//           className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors ${themeClasses.buttonPrimary}`}
//           disabled={!isReady}
//         >
//           <Download size={16} />
//           <span>{isReady ? 'Download PDF' : 'Loading...'}</span>
//         </button>
//       </div>

//       {/* Display the appropriate result template */}
//       {getResultTemplate()}

//       {/* Print Footer */}
//       <div className="hidden print:block print:mt-8 print:pt-4 print:border-t print:border-gray-300">
//         <div className="text-center text-sm text-gray-500">
//           <p>This is an official result document from {getSchoolName()}</p>
//           <p>Generated by Admin Portal on {new Date().toLocaleDateString()}</p>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default StudentResultDisplay;
