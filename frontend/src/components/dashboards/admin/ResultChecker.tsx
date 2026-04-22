// import React, { useState, useEffect } from 'react';
// import { Search, Filter, Download, Eye, Calendar, Users, BookOpen, AlertCircle } from 'lucide-react';
// import toast from 'react-hot-toast';
// import ResultCheckerService, { 
//   TermlyResult, 
//   SessionResult, 
//   ResultSearchFilters,
//   TermInfo,
//   StudentBasicInfo
// } from '@/services/ResultCheckerService';
// import SeniorSecondaryTermlyResult from '../student/SeniorSecondaryTermlyResult';
// // import SeniorSecondarySessionReport from '../student/SeniorSecondarySessionReport';
// import JuniorSecondaryResult from '../student/JuniorSecondaryResult';
// import PrimaryResult from '../student/PrimaryResult';
// import NurseryResult from '../student/NurseryResult';

// interface UserRole {
//   role: 'admin' | 'teacher' | 'student' | 'parent';
//   permissions: string[];
// }

// const ResultChecker: React.FC = () => {
//   // State management
//   const [userRole, setUserRole] = useState<UserRole>({ role: 'admin', permissions: ['view_all'] });
//   const [resultType, setResultType] = useState<'termly' | 'session'>('termly');
//   const [filters, setFilters] = useState<ResultSearchFilters>({});
//   const [termlyResults, setTermlyResults] = useState<TermlyResult[]>([]);
//   const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);
//   const [selectedResult, setSelectedResult] = useState<TermlyResult | SessionResult | null>(null);
//   const [showResultView, setShowResultView] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [searchTerm, setSearchTerm] = useState('');
//   const [searchResults, setSearchResults] = useState<StudentBasicInfo[]>([]);
//   const [searchLoading, setSearchLoading] = useState(false);
//   const [showFilters, setShowFilters] = useState(false);
  
//   // Filter options
//   const [terms, setTerms] = useState<TermInfo[]>([]);
//   const [sessions, setSessions] = useState<any[]>([]);
//   const [classes, setClasses] = useState<any[]>([]);
//   const [examSessions, setExamSessions] = useState<any[]>([]);

//   // Load filter options on component mount
//   useEffect(() => {
//     loadFilterOptions();
//   }, []);

//   // Load results when filters change
//   useEffect(() => {
//     if (Object.keys(filters).length > 0 && Object.values(filters).some(value => value !== undefined && value !== '')) {
//       loadResults();
//     }
//   }, [filters, resultType]);

//   // Update the loadFilterOptions method in ResultChecker.tsx

//   const loadFilterOptions = async () => {
//     try {
//       console.log('🔄 Loading filter options...');
      
//       // Load filter options with proper error handling
//       const results = await Promise.allSettled([
//         ResultCheckerService.getAvailableTerms(),
//         ResultCheckerService.getAvailableSessions(),
//         ResultCheckerService.getExamSessions(),
//         // Only load classes for admin/teacher roles
//         ...(userRole.role === 'admin' || userRole.role === 'teacher' 
//           ? [ResultCheckerService.getAvailableClasses()] 
//           : []
//         )
//       ]);

//       // Process terms
//       if (results[0].status === 'fulfilled') {
//         const termsData = results[0].value || [];
//         console.log('✅ Loaded terms:', termsData.length);
//         setTerms(termsData);
//       } else {
//         console.warn('⚠️ Failed to load terms:', results[0].reason);
//         setTerms([]);
//       }

//       // Process sessions
//       if (results[1].status === 'fulfilled') {
//         const sessionsData = results[1].value || [];
//         console.log('✅ Loaded sessions:', sessionsData.length);
//         setSessions(sessionsData);
//       } else {
//         console.warn('⚠️ Failed to load sessions:', results[1].reason);
//         setSessions([]);
//       }

//       // Process exam sessions
//       if (results[2].status === 'fulfilled') {
//         const examSessionsData = results[2].value || [];
//         console.log('✅ Loaded exam sessions:', examSessionsData.length);
//         setExamSessions(examSessionsData);
//       } else {
//         console.warn('⚠️ Failed to load exam sessions:', results[2].reason);
//         setExamSessions([]);
//       }

//       // Process classes (if requested)
//       if (results[3] && results[3].status === 'fulfilled') {
//         const classesData = results[3].value || [];
//         console.log('✅ Loaded classes:', classesData.length);
//         setClasses(classesData);
//       } else if (results[3]) {
//         console.warn('⚠️ Failed to load classes:', results[3].reason);
//         setClasses([]);
//       }

//       console.log('✅ Filter options loaded successfully');
      
//     } catch (error) {
//       console.error('❌ Error loading filter options:', error);
//       // Don't show error toast - the app should still work with empty filters
//       // toast.error('Failed to load filter options');
//     }
//   };

//   const loadResults = async () => {
//     setLoading(true);
//     try {
//       if (resultType === 'termly') {
//         console.log('🔄 [ResultChecker] loadResults - Fetching term reports for termly results');
//         console.log('🔄 [ResultChecker] loadResults - Filters:', filters);
        
//         // Fetch term reports instead of individual results for consolidated data
//         const allTermReports: any[] = [];
        
//         // Fetch term reports for the specified education level(s)
//         const educationLevels = filters.education_level 
//           ? [filters.education_level] 
//           : ['NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'];
        
//         console.log(`🔄 [ResultChecker] loadResults - Fetching term reports for education levels:`, educationLevels);
        
//         for (const level of educationLevels) {
//           try {
//             console.log(`🔄 [ResultChecker] loadResults - Fetching term reports for ${level}`);
//             const termReports = await ResultCheckerService.getTermReports(level, filters);
//             console.log(`✅ [ResultChecker] loadResults - Got ${termReports.length} term reports for ${level}:`, termReports);
//             allTermReports.push(...termReports);
//           } catch (error) {
//             console.warn(`Failed to fetch term reports for ${level}:`, error);
//           }
//         }
        
//         console.log('✅ [ResultChecker] loadResults - All term reports:', allTermReports);
//         console.log('🔍 [ResultChecker] First term report next_term_begins:', allTermReports[0]?.next_term_begins);
//         console.log('🔍 [ResultChecker] First term report next_term_begins type:', typeof allTermReports[0]?.next_term_begins);
//         setTermlyResults(allTermReports);
//         setSessionResults([]); // Clear session results when viewing termly
        
//         if (allTermReports.length > 0) {
//           toast.success(`Found ${allTermReports.length} termly result(s)`);
//         } else {
//           toast.error('No termly results found for the selected criteria');
//         }
//       } else {
//         // For session results, use the session-specific endpoint
//         const sessionResultsData = await ResultCheckerService.getSessionResults(filters);
//         setSessionResults(sessionResultsData);
//         setTermlyResults([]); // Clear termly results when viewing session
        
//         if (sessionResultsData.length > 0) {
//           toast.success(`Found ${sessionResultsData.length} session result(s)`);
//         } else {
//           toast.error('No session results found for the selected criteria');
//         }
//       }
//     } catch (error) {
//       console.error('Error loading results:', error);
//       toast.error('Failed to load results');
//       setTermlyResults([]);
//       setSessionResults([]);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleFilterChange = (key: keyof ResultSearchFilters, value: any) => {
//     setFilters(prev => ({
//       ...prev,
//       [key]: value || undefined // Convert empty strings to undefined
//     }));
//   };

//   const handleSearch = async (searchValue: string) => {
//     if (!searchValue.trim()) {
//       setSearchResults([]);
//       return;
//     }

//     setSearchLoading(true);
//     try {
//       const searchData = await ResultCheckerService.searchStudents({ 
//         search: searchValue,
//         admission_number: searchValue // Also search by admission number
//       });
//       setSearchResults(searchData || []);
      
//       if (searchData && searchData.length === 1) {
//         toast.success('One student found. Click "View Results" to see their academic records.');
//       }
//     } catch (error) {
//       console.error('Error searching students:', error);
//       toast.error('Failed to search students');
//       setSearchResults([]);
//     } finally {
//       setSearchLoading(false);
//     }
//   };

//   // Debounced search
//   useEffect(() => {
//     const timeoutId = setTimeout(() => {
//       if (searchTerm) {
//         handleSearch(searchTerm);
//       } else {
//         setSearchResults([]);
//       }
//     }, 500);

//     return () => clearTimeout(timeoutId);
//   }, [searchTerm]);

//   const handleSelectStudent = async (student: StudentBasicInfo) => {
//     try {
//       setLoading(true);
      
//       // Update filters with selected student
//       const newFilters = {
//         ...filters,
//         student_id: student.id,
//         education_level: student.education_level as 'SENIOR_SECONDARY' | 'JUNIOR_SECONDARY' | 'PRIMARY' | 'NURSERY',
//         // Set default academic session to current session if not already set
//         academic_session_id: filters.academic_session_id || (sessions.find(s => s.is_current)?.id || sessions[0]?.id)
//       };
      
//       setFilters(newFilters);
      
//       // Clear search results and term
//       setSearchResults([]);
//       setSearchTerm('');
      
//       toast.success(`Selected ${student.name || 'Unknown Student'} (${student.class || 'Unknown Class'}). Loading their results...`);
      
//     } catch (error) {
//       console.error('Error selecting student:', error);
//       toast.error('Failed to select student');
//       setLoading(false);
//     }
//   };

//   const handleViewResult = async (result: TermlyResult | SessionResult) => {
//     try {
//       console.log('🔍 [ResultChecker] handleViewResult called with result:', result);
//       console.log('🔍 [ResultChecker] result.next_term_begins:', (result as any).next_term_begins);
//       console.log('🔍 [ResultChecker] result.next_term_begins type:', typeof (result as any).next_term_begins);
      
//       // Fetch full result details using the appropriate endpoint
//       const educationLevel = result.student.education_level;
//       console.log('📊 [ResultChecker] Education level:', educationLevel);
      
//       let fullResult;
      
//       // For termly results, fetch term reports which contain consolidated data
//       if (resultType === 'termly') {
//         console.log('📋 [ResultChecker] Fetching term report for ID:', result.id);
//         fullResult = await ResultCheckerService.getTermReportById(
//         result.id, 
//           educationLevel
//         );
//         console.log('✅ [ResultChecker] Raw term report fetched:', fullResult);
//         console.log('✅ [ResultChecker] Raw student data:', fullResult?.student);
//         console.log('✅ [ResultChecker] Raw subject_results:', fullResult?.subject_results);
//         console.log('🔍 [ResultChecker] API fullResult.next_term_begins:', fullResult?.next_term_begins);
//         console.log('🔍 [ResultChecker] API fullResult.next_term_begins type:', typeof fullResult?.next_term_begins);
        
//         // Debug the key fields we need
//         console.log('🔍 [ResultChecker] DEBUGGING KEY FIELDS:');
//         console.log('  - total_score:', fullResult?.total_score);
//         console.log('  - average_score:', fullResult?.average_score);
//         console.log('  - class_position:', fullResult?.class_position);
//         console.log('  - total_students:', fullResult?.total_students);
//         console.log('  - overall_grade:', fullResult?.overall_grade);
        
//         // Debug individual subject results
//         if (fullResult?.subject_results && fullResult.subject_results.length > 0) {
//           console.log('🔍 [ResultChecker] DEBUGGING SUBJECT RESULTS:');
//           fullResult.subject_results.forEach((subject: any, index: number) => {
//             console.log(`  Subject ${index + 1} (${subject.subject?.name}):`);
//             console.log(`    - total_score: ${subject.total_score}`);
//             console.log(`    - mark_obtained: ${subject.mark_obtained}`);
//             console.log(`    - ca_total: ${subject.ca_total}`);
//             console.log(`    - exam_marks: ${subject.exam_marks}`);
//             console.log(`    - continuous_assessment_score: ${subject.continuous_assessment_score}`);
//             console.log(`    - take_home_test_score: ${subject.take_home_test_score}`);
//             console.log(`    - project_score: ${subject.project_score}`);
//             console.log(`    - appearance_score: ${subject.appearance_score}`);
//             console.log(`    - note_copying_score: ${subject.note_copying_score}`);
//             console.log(`    - practical_score: ${subject.practical_score}`);
//           });
//         }
//       } else {
//         // For session results, use the session report endpoint
//         console.log('📋 [ResultChecker] Fetching session report for ID:', result.id);
//         fullResult = await ResultCheckerService.getSessionReportById(result.id);
//         console.log('✅ [ResultChecker] Session report fetched:', fullResult);
//       }
      
//       setSelectedResult(fullResult);
//       setShowResultView(true);
//     } catch (error) {
//       console.error('❌ [ResultChecker] Error loading result details:', error);
//       toast.error('Failed to load result details');
//     }
//   };

//   const handleCloseResultView = () => {
//     setShowResultView(false);
//     setSelectedResult(null);
//   };

//   const transformDataForPrimary = (result: TermlyResult) => {
//     console.log('🔄 [ResultChecker] transformDataForPrimary called with:', result);
//     console.log('🔍 [ResultChecker] result.next_term_begins:', result.next_term_begins);
//     console.log('🔍 [ResultChecker] result.next_term_begins type:', typeof result.next_term_begins);
//     console.log('🔍 [ResultChecker] result.subject_results:', (result as any).subject_results);
//     console.log('🔍 [ResultChecker] result.subject_results length:', (result as any).subject_results?.length);
//     console.log('🔍 [ResultChecker] Student ID:', result.student?.id);
//     console.log('🔍 [ResultChecker] Student Name:', result.student?.name);
//     console.log('🔍 [ResultChecker] Student Username:', result.student?.username);
//     console.log('🔍 [ResultChecker] Student User Username:', (result.student as any)?.user?.username);
//     console.log('🔍 [ResultChecker] Full Student Data:', result.student);
    
//     // Transform the term report data to match what PrimaryResult expects
//     const transformedData = {
//       id: result.id,
//       student: {
//         id: result.student?.id || '',
//         name: result.student?.name || 'Unknown Student',
//         full_name: result.student?.name || 'Unknown Student',
//         username: result.student?.username || (result.student as any)?.user?.username || 'N/A',
//         admission_number: result.student?.admission_number || result.student?.username || '',
//         class: result.student?.class || 'Unknown',
//         student_class: result.student?.class || 'Unknown',
//         education_level: result.student?.education_level || 'Unknown',
//         gender: result.student?.gender || '',
//         age: (result.student as any)?.age || 0,
//         date_of_birth: (result.student as any).date_of_birth,
//         classroom: (result.student as any).classroom,
//         stream: (result.student as any).stream,
//         parent_contact: (result.student as any).parent_contact,
//         emergency_contact: (result.student as any).emergency_contact,
//         admission_date: (result.student as any).admission_date
//       },
//       term: result.term || {
//         id: 'term-1',
//         name: 'First Term',
//         academic_session: { id: 'session-1', name: '2024/2025' }
//       },
//       exam_session: (result as any).exam_session,
//       subjects: (result as any).subject_results?.map((subjectResult: any, index: number) => {
//         console.log(`🔍 [ResultChecker] Processing subject ${index + 1}:`, {
//           subjectName: subjectResult.subject?.name,
//           subjectId: subjectResult.subject?.id,
//           studentId: subjectResult.student?.id || 'No student ID',
//           resultId: subjectResult.id,
//           hasValidScores: !!(subjectResult.continuous_assessment_score || subjectResult.exam_score),
//           status: subjectResult.status,
//           subject_position: subjectResult.subject_position
//         });
        
//         // Calculate CA total from individual components
//         const caTotal = (subjectResult.continuous_assessment_score || 0) + 
//                        (subjectResult.take_home_test_score || 0) + 
//                        (subjectResult.project_score || 0) + 
//                        (subjectResult.appearance_score || 0) + 
//                        (subjectResult.note_copying_score || 0) + 
//                        (subjectResult.practical_score || 0);
        
//         // Calculate exam marks
//         const examMarks = subjectResult.exam_score || subjectResult.exam_marks || 0;
        
//         // Use backend's calculated total_score if available, otherwise calculate from CA + Exam
//         const backendTotalScore = subjectResult.total_score || 0;
//         const calculatedTotal = caTotal + examMarks;
//         const markObtained = backendTotalScore > 0 ? backendTotalScore : calculatedTotal;
        
//         console.log(`🔍 [ResultChecker] Subject ${subjectResult.subject?.name}:`, {
//           backendTotalScore,
//           caTotal,
//           examMarks,
//           calculatedTotal,
//           finalMarkObtained: markObtained
//         });
        
//         const transformedSubject = {
//           subject: {
//             id: subjectResult.subject?.id,
//             name: subjectResult.subject?.name,
//             code: subjectResult.subject?.code || ''
//           },
//           total_score: markObtained, // Use backend total_score if available, otherwise calculated
//           percentage: subjectResult.percentage || 0,
//           grade: subjectResult.grade || '',
//           position: subjectResult.position || 0,
//           class_average: subjectResult.class_average || 0,
//           highest_in_class: subjectResult.highest_in_class || 0,
//           lowest_in_class: subjectResult.lowest_in_class || 0,
//           teacher_remark: subjectResult.teacher_remark,
//           continuous_assessment_score: subjectResult.continuous_assessment_score || 0,
//           take_home_test_score: subjectResult.take_home_test_score || 0,
//           project_score: subjectResult.project_score || 0,
//           appearance_score: subjectResult.appearance_score || 0,
//           note_copying_score: subjectResult.note_copying_score || 0,
//           practical_score: subjectResult.practical_score || 0,
//           ca_total: caTotal,
//           exam_marks: examMarks,
//           mark_obtained: markObtained,
//           total_obtainable: 100,
//           status: subjectResult.status, // CRITICAL: Include the status field
//           subject_position: subjectResult.subject_position, // Include subject position
//           id: subjectResult.id
//         };
        
//         console.log(`🔍 [ResultChecker] Transformed subject ${subjectResult.subject?.name}:`, {
//           status: transformedSubject.status,
//           subject_position: transformedSubject.subject_position,
//           hasStatus: 'status' in transformedSubject
//         });
        
//         return transformedSubject;
//       }) || [],
//       // Use backend term report totals if available, otherwise calculate from individual subjects
//       total_score: (() => {
//         const backendTotal = Number((result as any).total_score) || 0;
//         const isBackendTotalValid = (result as any).total_score !== undefined && 
//                                    (result as any).total_score !== null && 
//                                    (result as any).total_score !== 0 && 
//                                    !isNaN(backendTotal) && 
//                                    backendTotal > 0 &&
//                                    backendTotal < 10000 && // Reasonable upper limit
//                                    String((result as any).total_score).length < 20; // Concatenated strings are very long
        
//         if (isBackendTotalValid) {
//           console.log('🔍 [ResultChecker] Using backend term report total_score:', backendTotal);
//           return backendTotal;
//         } else {
//           console.log('🔍 [ResultChecker] Backend total_score is invalid:', {
//             raw_value: (result as any).total_score,
//             parsed_value: backendTotal,
//             isNaN: isNaN(backendTotal),
//             reason: 'Backend total_score appears to be concatenated or invalid'
//           });
//         }
        
//         // Calculate from individual subject results
//         const subjects = (result as any).subject_results || [];
//         const calculatedTotal = subjects.reduce((total: number, subjectResult: any) => {
//           const backendScore = subjectResult.total_score || 0;
//           if (backendScore > 0) {
//             return total + backendScore;
//           }
//           // Fallback to CA + Exam calculation
//           const caTotal = (subjectResult.continuous_assessment_score || 0) + 
//                          (subjectResult.take_home_test_score || 0) + 
//                          (subjectResult.project_score || 0) + 
//                          (subjectResult.appearance_score || 0) + 
//                          (subjectResult.note_copying_score || 0) + 
//                          (subjectResult.practical_score || 0);
//           const examMarks = subjectResult.exam_score || subjectResult.exam_marks || 0;
//           return total + (caTotal + examMarks);
//         }, 0);
        
//         console.log('🔍 [ResultChecker] Calculated total_score from subjects:', calculatedTotal);
//         return calculatedTotal;
//       })(),
//       average_score: (() => {
//         const backendAverage = Number((result as any).average_score) || 0;
//         const isBackendAverageValid = (result as any).average_score !== undefined && 
//                                      (result as any).average_score !== null && 
//                                      (result as any).average_score !== 0 && 
//                                      !isNaN(backendAverage) && 
//                                      backendAverage > 0 &&
//                                      backendAverage <= 100; // Average should be percentage
        
//         if (isBackendAverageValid) {
//           console.log('🔍 [ResultChecker] Using backend term report average_score:', backendAverage);
//           return backendAverage;
//         } else {
//           console.log('🔍 [ResultChecker] Backend average_score is invalid:', {
//             raw_value: (result as any).average_score,
//             parsed_value: backendAverage,
//             isNaN: isNaN(backendAverage),
//             reason: 'Backend average_score appears to be invalid'
//           });
//         }
        
//         // Calculate from individual subject results
//         const subjects = (result as any).subject_results || [];
//         if (subjects.length === 0) return 0;
        
//         const totalScore = subjects.reduce((total: number, subjectResult: any) => {
//           const backendScore = subjectResult.total_score || 0;
//           if (backendScore > 0) {
//             return total + backendScore;
//           }
//           // Fallback to CA + Exam calculation
//           const caTotal = (subjectResult.continuous_assessment_score || 0) + 
//                          (subjectResult.take_home_test_score || 0) + 
//                          (subjectResult.project_score || 0) + 
//                          (subjectResult.appearance_score || 0) + 
//                          (subjectResult.note_copying_score || 0) + 
//                          (subjectResult.practical_score || 0);
//           const examMarks = subjectResult.exam_score || subjectResult.exam_marks || 0;
//           return total + (caTotal + examMarks);
//         }, 0);
        
//         const calculatedAverage = totalScore / subjects.length;
//         console.log('🔍 [ResultChecker] Calculated average_score from subjects:', calculatedAverage);
//         return calculatedAverage;
//       })(),
//       overall_grade: (result as any).overall_grade || '',
//       class_position: (result as any).class_position || 0,
//       total_students: (result as any).total_students || 0,
//       attendance: result.attendance || {
//         times_opened: 0,
//         times_present: 0
//       },
//       next_term_begins: (result as any).next_term_begins || '',
//       class_teacher_remark: (result as any).class_teacher_remark || '',
//       head_teacher_remark: (result as any).head_teacher_remark || '',
//       class_teacher_signature: (result as any).class_teacher_signature || '',
//       head_teacher_signature: (result as any).head_teacher_signature || '',
//       nurse_comment: (result as any).nurse_comment || '',
//       is_published: (result as any).is_published || true,
//       created_at: (result as any).created_at || new Date().toISOString(),
//       updated_at: (result as any).updated_at || new Date().toISOString()
//     };
    
//     return transformedData;
//   };

//   const transformDataForSeniorSecondary = (result: TermlyResult) => {
//     console.log('🔄 [ResultChecker] transformDataForSeniorSecondary called with:', result);
//     console.log('🔍 [ResultChecker] result.next_term_begins:', result.next_term_begins);
//     console.log('🔍 [ResultChecker] result.next_term_begins type:', typeof result.next_term_begins);
//     console.log('🔍 [ResultChecker] Student Username:', result.student?.username);
//     console.log('🔍 [ResultChecker] Student User Username:', (result.student as any)?.user?.username);
//     console.log('🔍 [ResultChecker] Full Student Data:', result.student);
    
//     // Transform the term report data to match what SeniorSecondaryTermlyResult expects
//     const transformedData = {
//       id: result.id,
//       student: {
//         id: result.student?.id || '',
//         name: result.student?.name || 'Unknown Student',
//         full_name: result.student?.name || 'Unknown Student',
//         username: result.student?.username || (result.student as any)?.user?.username || 'N/A',
//         admission_number: result.student?.admission_number || result.student?.username || '',
//         class: result.student?.class || 'Unknown',
//         student_class: result.student?.class || 'Unknown',
//         education_level: result.student?.education_level || 'Unknown',
//         gender: result.student.gender,
//         age: (result.student as any).age,
//         date_of_birth: (result.student as any).date_of_birth,
//         classroom: (result.student as any).classroom,
//         stream: (result.student as any).stream,
//         parent_contact: (result.student as any).parent_contact,
//         emergency_contact: (result.student as any).emergency_contact,
//         admission_date: (result.student as any).admission_date
//       },
//       term: result.term || {
//         id: 'term-1',
//         name: 'First Term',
//         academic_session: { id: 'session-1', name: '2024/2025' }
//       },
//       exam_session: (result as any).exam_session,
//       subjects: (result as any).subject_results?.map((subjectResult: any) => ({
//         subject: {
//           id: subjectResult.subject?.id,
//           name: subjectResult.subject?.name,
//           code: subjectResult.subject?.code || ''
//         },
//         total_score: subjectResult.total_score || 0,
//         percentage: subjectResult.percentage || 0,
//         grade: subjectResult.grade || '',
//         position: subjectResult.position || 0,
//         class_average: subjectResult.class_average || 0,
//         highest_in_class: subjectResult.highest_in_class || 0,
//         lowest_in_class: subjectResult.lowest_in_class || 0,
//         teacher_remark: subjectResult.teacher_remark,
//         test1_score: subjectResult.first_test_score || subjectResult.test1_score || 0,
//         test2_score: subjectResult.second_test_score || subjectResult.test2_score || 0,
//         test3_score: subjectResult.third_test_score || subjectResult.test3_score || 0,
//         exam_score: subjectResult.exam_score || 0,
//         total_obtainable: 100,
//         id: subjectResult.id
//       })) || [],
//       // Calculate overall totals from individual subjects
//       total_score: (() => {
//         const subjects = (result as any).subject_results || [];
//         return subjects.reduce((total: number, subjectResult: any) => {
//           const caTotal = (subjectResult.continuous_assessment_score || 0) + 
//                          (subjectResult.take_home_test_score || 0) + 
//                          (subjectResult.project_score || 0) + 
//                          (subjectResult.appearance_score || 0) + 
//                          (subjectResult.note_copying_score || 0) + 
//                          (subjectResult.practical_score || 0);
//           const examMarks = subjectResult.exam_score || subjectResult.exam_marks || 0;
//           return total + (caTotal + examMarks);
//         }, 0);
//       })(),
//       average_score: (() => {
//         const subjects = (result as any).subject_results || [];
//         if (subjects.length === 0) return 0;
//         const totalScore = subjects.reduce((total: number, subjectResult: any) => {
//           const caTotal = (subjectResult.continuous_assessment_score || 0) + 
//                          (subjectResult.take_home_test_score || 0) + 
//                          (subjectResult.project_score || 0) + 
//                          (subjectResult.appearance_score || 0) + 
//                          (subjectResult.note_copying_score || 0) + 
//                          (subjectResult.practical_score || 0);
//           const examMarks = subjectResult.exam_score || subjectResult.exam_marks || 0;
//           return total + (caTotal + examMarks);
//         }, 0);
//         return totalScore / subjects.length;
//       })(),
//       overall_grade: (result as any).overall_grade || '',
//       class_position: (result as any).class_position || 1,
//       total_students: (result as any).total_students || 1,
//       attendance: result.attendance || {
//         times_opened: 0,
//         times_present: 0
//       },
//       next_term_begins: result.next_term_begins,
//       class_teacher_remark: result.class_teacher_remark || '',
//       head_teacher_remark: result.head_teacher_remark || '',
//       is_published: result.is_published || true,
//       created_at: result.created_at || new Date().toISOString(),
//       updated_at: result.updated_at || new Date().toISOString()
//     };
    
//     console.log('✅ [ResultChecker] Senior Secondary data transformed:', transformedData);
//     return transformedData;
//   };

//   const transformDataForNursery = (result: TermlyResult) => {
//     console.log('🔄 [ResultChecker] transformDataForNursery called with:', result);
    
//     // Transform the term report data to match what NurseryResult expects
//     const transformedData = {
//       id: result.id,
//       student: {
//         id: result.student?.id || '',
//         name: result.student?.name || 'Unknown Student',
//         full_name: result.student?.name || 'Unknown Student',
//         class: result.student?.class || 'Unknown',
//         education_level: result.student?.education_level || 'Unknown',
//         age: (result.student as any).age,
//         date_of_birth: (result.student as any).date_of_birth,
//         classroom: (result.student as any).classroom,
//         stream: (result.student as any).stream,
//         parent_contact: (result.student as any).parent_contact,
//         emergency_contact: (result.student as any).emergency_contact,
//         admission_date: (result.student as any).admission_date
//       },
//       term: result.term || {
//         id: 'term-1',
//         name: 'First Term',
//         academic_session: { id: 'session-1', name: '2024/2025' }
//       },
//       subjects: (result as any).subject_results?.map((subjectResult: any) => ({
//         subject: {
//           id: subjectResult.subject?.id,
//           name: subjectResult.subject?.name,
//           code: subjectResult.subject?.code || ''
//         },
//         max_marks_obtainable: subjectResult.max_marks_obtainable || 100,
//         mark_obtained: subjectResult.exam_score || subjectResult.mark_obtained || 0,
//         grade: subjectResult.grade || '',
//         position: subjectResult.position || 0,
//         physical_development: subjectResult.physical_development || 'GOOD',
//         health: subjectResult.health || 'GOOD',
//         cleanliness: subjectResult.cleanliness || 'GOOD',
//         general_conduct: subjectResult.general_conduct || 'GOOD',
//         academic_comment: subjectResult.academic_comment || '',
//         id: subjectResult.id
//       })) || [],
//       total_score: (result as any).total_score || 0,
//       max_marks_obtainable: 100,
//       mark_obtained: (result as any).mark_obtained || 0,
//       position: (result as any).position || 1,
//       class_position: (result as any).class_position || 1,
//       total_students: (result as any).total_students || 1,
//       attendance: result.attendance || {
//         times_opened: 0,
//         times_present: 0
//       },
//       next_term_begins: (result as any).next_term_begins || '',
//       class_teacher_remark: (result as any).class_teacher_remark || '',
//       head_teacher_remark: (result as any).head_teacher_remark || '',
//       class_teacher_signature: (result as any).class_teacher_signature || '',
//       head_teacher_signature: (result as any).head_teacher_signature || '',
//       nurse_comment: (result as any).nurse_comment || '',
//       is_published: (result as any).is_published || true,
//       created_at: (result as any).created_at || new Date().toISOString(),
//       updated_at: (result as any).updated_at || new Date().toISOString()
//     };
    
//     return transformedData;
//   };

//   const getResultComponent = (result: TermlyResult | SessionResult) => {
//     console.log('🎯 [ResultChecker] getResultComponent called with result:', result);
//     console.log('🔍 [ResultChecker] result.next_term_begins in getResultComponent:', (result as any).next_term_begins);
//     console.log('🔍 [ResultChecker] result.next_term_begins type in getResultComponent:', typeof (result as any).next_term_begins);
//     const educationLevel = result.student.education_level.toUpperCase();
//     console.log('📚 [ResultChecker] Education level:', educationLevel);
    
//     switch (educationLevel) {
//       case 'NURSERY':
//         console.log('🧸 [ResultChecker] Processing NURSERY result');
//         const nurseryData = transformDataForNursery(result as TermlyResult);
//         console.log('📋 [ResultChecker] Passing data to NurseryResult:', nurseryData);
//         return <NurseryResult data={nurseryData as any} />;
//       case 'PRIMARY':
//         console.log('🏫 [ResultChecker] Processing PRIMARY result');
//         const primaryData = transformDataForPrimary(result as TermlyResult);
//         console.log('📋 [ResultChecker] Passing data to PrimaryResult:', primaryData);
//         return <PrimaryResult 
//           data={primaryData as any}
//           studentId={result.student.id}
//           showOnlyPublished={true}
//         />;
//       case 'JUNIOR_SECONDARY':
//         const juniorData = transformDataForPrimary(result as TermlyResult);
//         return <JuniorSecondaryResult 
//           data={juniorData as any}
//           studentId={result.student.id}
//         />;
//       case 'SENIOR_SECONDARY':
//         console.log('🎓 [ResultChecker] Processing SENIOR_SECONDARY result');
//         if (resultType === 'termly') {
//           console.log('📊 [ResultChecker] Termly result type');
//           const seniorData = transformDataForSeniorSecondary(result as TermlyResult);
//           console.log('📋 [ResultChecker] Passing data to SeniorSecondaryTermlyResult:', seniorData);
//           return <SeniorSecondaryTermlyResult 
//               studentId={result.student.id}
//               examSessionId={filters.exam_session_id || ''}
//             data={seniorData as any}
//           />;
//         } else {
//           return <SeniorSecondarySessionReport 
//               studentId={result.student.id}
//               academicSessionId={(result as SessionResult).academic_session.id}
//               data={result as any}
//             />;
//         }
//       default:
//         const defaultData = transformDataForPrimary(result as TermlyResult);
//         return <PrimaryResult 
//           data={defaultData as any}
//           studentId={result.student.id}
//           showOnlyPublished={true}
//         />;
//     }
//   };

//   const clearFilters = () => {
//     setFilters({});
//     setTermlyResults([]);
//     setSessionResults([]);
//     setSearchTerm('');
//     setSearchResults([]);
//     toast.success('Filters cleared');
//   };

//   const getRoleTitle = () => {
//     switch (userRole.role) {
//       case 'admin': return 'Admin Result Checker';
//       case 'teacher': return 'Teacher Result Checker';
//       case 'student': return 'My Results';
//       case 'parent': return 'Children Results';
//       default: return 'Result Checker';
//     }
//   };

//   const getResultScore = (result: TermlyResult | SessionResult) => {
//     if (resultType === 'session') {
//       return (result as SessionResult).average_for_year || 0;
//     } else {
//       const termlyResult = result as TermlyResult;
//       // Handle different result types based on the interface
//       if ('average_score' in termlyResult && termlyResult.average_score !== undefined) {
//         return termlyResult.average_score;
//       } else {
//         // For NurseryResult, calculate percentage
//         const nurseryResult = termlyResult as any;
//         if (nurseryResult.max_marks_obtainable && nurseryResult.mark_obtained) {
//           return (nurseryResult.mark_obtained / nurseryResult.max_marks_obtainable) * 100;
//         } else if (nurseryResult.total_score) {
//           return nurseryResult.total_score;
//         }
//         return 0;
//       }
//     }
//   };

//   const getResultGrade = (result: TermlyResult | SessionResult) => {
//     if ('overall_grade' in result) {
//       return result.overall_grade;
//     }
//     // For nursery results or results without overall_grade, calculate based on score
//     if (result.student.education_level === 'NURSERY') {
//       const score = getResultScore(result);
//       if (score >= 80) return 'A';
//       if (score >= 70) return 'B';
//       if (score >= 60) return 'C';
//       if (score >= 50) return 'D';
//       if (score >= 40) return 'E';
//       return 'F';
//     }
//     return 'N/A';
//   };

//   // Get current results based on result type
//   const currentResults = resultType === 'termly' ? termlyResults : sessionResults;

//   return (
//     <div className="p-6 bg-gray-50 min-h-screen">
//       {/* Header */}
//       <div className="mb-6">
//         <div className="flex items-center justify-between">
//           <div>
//             <h1 className="text-2xl font-bold text-gray-900 mb-2">{getRoleTitle()}</h1>
//             <p className="text-gray-600">
//               {userRole.role === 'admin' && 'View and manage all student results'}
//               {userRole.role === 'teacher' && 'View results for your assigned classes'}
//               {userRole.role === 'student' && 'View your academic performance'}
//               {userRole.role === 'parent' && 'View your children\'s academic performance'}
//             </p>
//           </div>
          
//           {/* Role Switcher for Testing */}
//           <div className="flex items-center space-x-2">
//             <select
//               value={userRole.role}
//               onChange={(e) => setUserRole({ 
//                 role: e.target.value as any, 
//                 permissions: ['view_all'] 
//               })}
//               className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
//             >
//               <option value="admin">Admin</option>
//               <option value="teacher">Teacher</option>
//               <option value="student">Student</option>
//               <option value="parent">Parent</option>
//             </select>
//           </div>
//         </div>
//       </div>

//       {/* Search Section */}
//       <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
//         <h2 className="text-lg font-semibold text-gray-900 mb-4">Search for Student Results</h2>
//         <div className="flex gap-4 items-center">
//           <div className="flex-1 max-w-md">
//             <div className="relative">
//               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
//               <input
//                 type="text"
//                 placeholder="Search by username, name, or admission number"
//                 value={searchTerm}
//                 onChange={(e) => setSearchTerm(e.target.value)}
//                 className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//               />
//               {searchLoading && (
//                 <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
//                   <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
//                 </div>
//               )}
//             </div>
//           </div>
//         </div>

//         {/* Search Results */}
//         {searchResults.length > 0 && (
//           <div className="mt-4">
//             <h3 className="text-md font-medium text-gray-900 mb-3">
//               Search Results ({searchResults.length} found):
//             </h3>
//             <div className="space-y-3 max-h-60 overflow-y-auto">
//               {searchResults.filter(student => student && student.id).map((student) => (
//                 <div key={student.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors">
//                   <div className="flex items-center justify-between">
//                     <div className="flex-1">
//                       <h4 className="font-medium text-gray-900">
//                         {student.name || 'Unknown Student'}
//                       </h4>
//                       <p className="text-sm text-gray-600">
//                         Username: {student.username || 'N/A'} • 
//                         ID: {student.admission_number || 'N/A'} • Class: {student.class || 'N/A'} • Level: {student.education_level || 'N/A'}
//                         {student.house && ` • House: ${student.house}`}
//                         {student.gender && ` • Gender: ${student.gender}`}
//                       </p>
//                     </div>
//                     <button
//                       onClick={() => handleSelectStudent(student)}
//                       disabled={loading}
//                       className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
//                     >
//                       {loading ? 'Loading...' : 'View Results'}
//                     </button>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         )}

//         {/* Selected student info */}
//         {filters.student_id && (
//           <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
//             <div className="flex items-center justify-between">
//               <p className="text-blue-800 text-sm">
//                 <strong>Selected Student:</strong> {
//                   searchResults.find(s => s.id === filters.student_id)?.name || 
//                   'Student ID: ' + filters.student_id
//                 }
//                 {filters.education_level && ` • Level: ${filters.education_level}`}
//               </p>
//               <button
//                 onClick={() => {
//                   setFilters(prev => {
//                     const newFilters = { ...prev };
//                     delete newFilters.student_id;
//                     delete newFilters.education_level;
//                     return newFilters;
//                   });
//                   toast.success('Student selection cleared');
//                 }}
//                 className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 transition-colors"
//               >
//                 Clear Selection
//               </button>
//             </div>
//           </div>
//         )}
//       </div>

//       {/* Filters and Results Type */}
//       <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
//         <div className="flex flex-wrap gap-4 items-center justify-between">
//           <div className="flex items-center space-x-2">
//             {/* Result Type Toggle */}
//             <button
//               onClick={() => setResultType('termly')}
//               className={`px-4 py-2 rounded-lg font-medium transition-colors ${
//                 resultType === 'termly'
//                   ? 'bg-blue-600 text-white'
//                   : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
//               }`}
//             >
//               <Calendar className="w-4 h-4 mr-2 inline" />
//               Termly Results
//             </button>
//             <button
//               onClick={() => setResultType('session')}
//               className={`px-4 py-2 rounded-lg font-medium transition-colors ${
//                 resultType === 'session'
//                   ? 'bg-blue-600 text-white'
//                   : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
//               }`}
//             >
//               <BookOpen className="w-4 h-4 mr-2 inline" />
//               Session Results
//             </button>
//           </div>

//           <div className="flex items-center space-x-2">
//             <button 
//               onClick={() => setShowFilters(!showFilters)}
//               className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
//             >
//               <Filter className="w-4 h-4 mr-2 inline" />
//               Filters
//             </button>
            
//             {Object.keys(filters).some(key => filters[key as keyof ResultSearchFilters]) && (
//               <button
//                 onClick={clearFilters}
//                 className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
//               >
//                 Clear All
//               </button>
//             )}
//           </div>
//         </div>

//         {/* Advanced Filters */}
//         {showFilters && (
//           <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//             {/* Education Level Filter */}
//             <select
//               value={filters.education_level || ''}
//               onChange={(e) => handleFilterChange('education_level', e.target.value)}
//               className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//             >
//               <option value="">All Education Levels</option>
//               <option value="NURSERY">Nursery</option>
//               <option value="PRIMARY">Primary</option>
//               <option value="JUNIOR_SECONDARY">Junior Secondary</option>
//               <option value="SENIOR_SECONDARY">Senior Secondary</option>
//             </select>

//             {/* Term Filter */}
//             <select
//               value={filters.term_id || ''}
//               onChange={(e) => handleFilterChange('term_id', e.target.value)}
//               className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//             >
//               <option value="">All Terms</option>
//               {terms.map(term => (
//                 <option key={term.id} value={term.id}>
//                   {term.name} ({term.academic_session?.name || 'Unknown Session'})
//                 </option>
//               ))}
//             </select>

//             {/* Session Filter */}
//             <select
//               value={filters.academic_session_id || ''}
//               onChange={(e) => handleFilterChange('academic_session_id', e.target.value)}
//               className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//             >
//               <option value="">All Academic Sessions</option>
//               {sessions.map(session => (
//                 <option key={session.id} value={session.id}>
//                   {session.name || 'Unknown Session'} ({session.start_year || 'N/A'}/{session.end_year || 'N/A'})
//                 </option>
//               ))}
//             </select>

//             {/* Exam Session Filter */}
//             <select
//               value={filters.exam_session_id || ''}
//               onChange={(e) => handleFilterChange('exam_session_id', e.target.value)}
//               className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//             >
//               <option value="">All Exam Sessions</option>
//               {examSessions.map(session => (
//                 <option key={session.id} value={session.id}>
//                   {session.name || `Session ${session.id || 'Unknown'}`}
//                 </option>
//               ))}
//             </select>

//             {/* Class Filter (Admin/Teacher only) */}
//             {(userRole.role === 'admin' || userRole.role === 'teacher') && (
//               <select
//                 value={filters.class_id || ''}
//                 onChange={(e) => handleFilterChange('class_id', e.target.value)}
//                 className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//               >
//                 <option value="">All Classes</option>
//                 {classes.map(cls => (
//                   <option key={cls.id} value={cls.id}>
//                     {cls.name || 'Unknown Class'} {cls.section && `(${cls.section})`}
//                   </option>
//                 ))}
//               </select>
//             )}

//             {/* Published Status Filter */}
//             <select
//               value={filters.is_published?.toString() || ''}
//               onChange={(e) => handleFilterChange('is_published', 
//                 e.target.value === '' ? undefined : e.target.value === 'true'
//               )}
//               className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//             >
//               <option value="">All Results</option>
//               <option value="true">Published Only</option>
//               <option value="false">Unpublished Only</option>
//             </select>
//           </div>
//         )}
//       </div>

//       {/* Results List */}
//       <div className="bg-white rounded-lg shadow-sm border border-gray-200">
//         <div className="p-6 border-b border-gray-200">
//           <h2 className="text-lg font-semibold text-gray-900">
//             {resultType === 'termly' ? 'Termly' : 'Session'} Results 
//             ({currentResults.length} found)
//           </h2>
//           {Object.keys(filters).some(key => filters[key as keyof ResultSearchFilters]) && (
//             <p className="text-sm text-gray-600 mt-1">
//               Filtered results based on your search criteria
//             </p>
//           )}
//         </div>

//         {loading ? (
//           <div className="p-6 text-center">
//             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
//             <p className="mt-2 text-gray-600">Loading results...</p>
//           </div>
//         ) : currentResults.length === 0 ? (
//           <div className="p-6 text-center">
//             {Object.keys(filters).some(key => filters[key as keyof ResultSearchFilters]) ? (
//               <>
//                 <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
//                 <p className="text-gray-600">No results found for your search criteria</p>
//                 <p className="text-sm text-gray-500 mt-2">
//                   The selected student may not have results for the current filters, or results might not be published yet.
//                 </p>
//                 <div className="mt-4 space-x-2">
//                   <button
//                     onClick={clearFilters}
//                     className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
//                   >
//                     Clear Filters
//                   </button>
//                   <button
//                     onClick={() => setShowFilters(true)}
//                     className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
//                   >
//                     Adjust Filters
//                   </button>
//                 </div>
//               </>
//             ) : (
//               <>
//                 <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
//                 <p className="text-gray-600">Search for a student to view their results</p>
//                 <p className="text-sm text-gray-500 mt-2">
//                   Use the search bar above or apply filters to find student results
//                 </p>
//               </>
//             )}
//           </div>
//         ) : (
//           <div className="divide-y divide-gray-200">
//             {currentResults.map((result) => (
//               <div key={result.id} className="p-6 hover:bg-gray-50 transition-colors">
//                 <div className="flex items-center justify-between">
//                   <div className="flex-1">
//                     <div className="flex items-center space-x-2">
//                       <h3 className="text-lg font-medium text-gray-900">
//                         {result.student?.name || 'Unknown Student'}
//                       </h3>
//                       {!result.is_published && (
//                         <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
//                           Unpublished
//                         </span>
//                       )}
//                     </div>
//                     <p className="text-sm text-gray-600">
//                       {result.student.admission_number} • {result.student.class} • {result.student.education_level}
//                       • Username: {result.student.username || 'N/A'}
//                     </p>
//                     <p className="text-sm text-gray-500 mt-1">
//                       {resultType === 'termly' 
//                         ? `Term: ${(result as TermlyResult).term?.name || 'Unknown Term'} (${(result as TermlyResult).term?.academic_session?.name || 'Unknown Session'})`
//                         : `Session: ${(result as SessionResult).academic_session?.name || 'Unknown Session'}`
//                       }
//                     </p>
//                   </div>
                  
//                   <div className="flex items-center space-x-4">
//                     <div className="text-right">
//                       <p className="text-sm font-medium text-gray-900">
//                         Score: {getResultScore(result) && typeof getResultScore(result) === 'number' ? getResultScore(result).toFixed(1) + '%' : 'N/A'}
//                       </p>
//                       <p className="text-sm text-gray-600">
//                         Grade: {getResultGrade(result)}
//                       </p>
//                       <p className="text-sm text-gray-500">
//                         Position: {result.class_position}/{result.total_students}
//                       </p>
//                     </div>
                    
//                     <div className="flex space-x-2">
//                       <button
//                         onClick={() => handleViewResult(result)}
//                         className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
//                       >
//                         <Eye className="w-4 h-4 mr-1 inline" />
//                         View
//                       </button>
//                       <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
//                         <Download className="w-4 h-4 mr-1 inline" />
//                         Download
//                       </button>
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>

//       {/* Result View Modal */}
//       {showResultView && selectedResult && (
//         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
//           <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
//             <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
//               <h2 className="text-lg font-semibold text-gray-900">
//                 {selectedResult.student?.name || 'Unknown Student'} - {resultType === 'termly' ? 'Termly' : 'Session'} Result
//               </h2>
//               <button
//                 onClick={handleCloseResultView}
//                 className="text-gray-400 hover:text-gray-600 text-xl font-bold"
//               >
//                 ×
//               </button>
//             </div>
//             <div className="p-4">
//               {getResultComponent(selectedResult)}
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default ResultChecker;