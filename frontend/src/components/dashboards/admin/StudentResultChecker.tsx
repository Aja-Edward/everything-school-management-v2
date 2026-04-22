// import React, { useState, useEffect } from 'react';
// import { Search, User, GraduationCap, Calendar, ArrowRight, Trophy, X } from 'lucide-react';
// import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
// import ResultCheckerService, { StudentBasicInfo } from '@/services/ResultCheckerService';
// import StudentResultDisplay from './StudentResultDisplay';
// import { toast } from 'react-hot-toast';
// import { AcademicSession } from '@/types/types';

// interface StudentData {
//   id: string;
//   full_name: string;
//   username: string;
//   student_class: string;
//   education_level: string;
//   profile_picture?: string;
// }

// // Fixed: Updated SelectionData to match expected types
// interface SelectionData {
//   academicSession: AcademicSession; 
//   term: {
//     id: string;
//     name: string;
//     start_date: string;
//     end_date: string;
//     academic_session: AcademicSession;
//   };
//   class: {
//     id: string;
//     name: string;
//     section: string;
//     education_level?: string;
//   };
//   resultType?: string;
// }

// interface StudentResultCheckerProps {
//   onClose: () => void;
  
// }

// const StudentResultChecker: React.FC<StudentResultCheckerProps> = ({ onClose }) => {
//   const { isDarkMode } = useGlobalTheme();
//   const [username, setUsername] = useState('');
//   const [student, setStudent] = useState<StudentData | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
  
//   // Fixed: Updated selections to use proper types
//   const [selections, setSelections] = useState<SelectionData>({
//   academicSession: {
//     id: "",
//     name: "",
//     start_date: "",
//     end_date: "",
//     is_current: false,
//     is_active: false,
//     created_at: "",
//     updated_at: ""
//   },
//   term: {
//     id: "",
//     name: "",
//     start_date: "",
//     end_date: "",
//     academic_session: {
//       id: "",
//       name: "",
//       start_date: "",
//       end_date: "",
//       is_current: false,
//       is_active: false,
//       created_at: "",
//       updated_at: ""
//     }
//   },
//   class: {
//     id: "",
//     name: "",
//     section: ""
//   },
//   resultType: ""
// });

  
//   // Fixed: Using proper interfaces from the service
//   const [availableSessions, setAvailableSessions] = useState<AcademicSession[]>([]);

  
//   const [availableTerms, setAvailableTerms] = useState<Array<{ 
//     id: string; 
//     name: string; 
//     start_date: string; 
//     end_date: string;
//     academic_session: AcademicSession;
//   }>>([]);
  
//   const [availableClasses, setAvailableClasses] = useState<Array<{ 
//     id: string; 
//     name: string; 
//     section: string; 
//     education_level?: string 
//   }>>([]);
  
//   const [loadingFilters, setLoadingFilters] = useState(true);

//   useEffect(() => {
//     const loadFilters = async () => {
//       setLoadingFilters(true);
//       try {
//         console.log('Loading filters...');
        
//         // Load each filter separately with proper error handling
//         const results = await Promise.allSettled([
//           ResultCheckerService.getAvailableSessions(),
//           ResultCheckerService.getAvailableTerms(),
//           ResultCheckerService.getAvailableClasses()
//         ]);

//         // Handle sessions
//         if (results[0].status === 'fulfilled') {
//           console.log('Sessions loaded:', results[0].value);
//           setAvailableSessions(results[0].value || []);
//         } else {
//           console.error('Failed to load sessions:', results[0].reason);
//           toast.error('Failed to load academic sessions');
//           setAvailableSessions([]);
//         }

//         // Handle terms
//         if (results[1].status === 'fulfilled') {
//           console.log('Terms loaded:', results[1].value);
//           setAvailableTerms(results[1].value || []);
//         } else {
//           console.error('Failed to load terms:', results[1].reason);
//           toast.error('Failed to load terms');
//           setAvailableTerms([]);
//         }

//         // Handle classes
//         if (results[2].status === 'fulfilled') {
//           console.log('Classes loaded:', results[2].value);
//           setAvailableClasses(results[2].value || []);
//         } else {
//           console.error('Failed to load classes:', results[2].reason);
//           toast.error('Failed to load classes');
//           setAvailableClasses([]);
//         }

//         // Show success message if at least some data was loaded
//         const successCount = results.filter(r => r.status === 'fulfilled').length;
//         if (successCount > 0) {
//           console.log(`${successCount}/3 filter categories loaded successfully`);
//         } else {
//           toast.error('Failed to load all filter options. Using fallback data.');
//         }

//       } catch (generalError) {
//         console.error('General error loading filters:', generalError);
//         toast.error('Failed to load filter options');
//         // Set empty arrays as fallback
//         setAvailableSessions([]);
//         setAvailableTerms([]);
//         setAvailableClasses([]);
//       } finally {
//         setLoadingFilters(false);
//       }
//     };
    
//     loadFilters();
//   }, []);

//   const [currentStep, setCurrentStep] = useState(1);
//   const [showResult, setShowResult] = useState(false);

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

//   // Fixed: Improved student search with multiple strategies
//   const handleSearchStudent = async () => {
//     if (!username.trim()) {
//       setError('Please enter a username');
//       return;
//     }

//     setLoading(true);
//     setError(null);

//     try {
//       console.log('Searching for student with username:', username);
      
//       // Strategy 1: Try direct search using the existing method
//       let foundStudents: StudentBasicInfo[] = [];
      
//       try {
//         foundStudents = await ResultCheckerService.searchStudents({ 
//           search: username.trim()
//         });
//         console.log('Search results from searchStudents:', foundStudents);
//       } catch (searchError) {
//         console.warn('Search method failed, trying alternative approaches:', searchError);
//       }

//       // Strategy 2: If no results, try searching by admission number specifically
//       if (!foundStudents || foundStudents.length === 0) {
//         try {
//           foundStudents = await ResultCheckerService.searchStudents({ 
//             admission_number: username.trim()
//           });
//           console.log('Search results by admission number:', foundStudents);
//         } catch (admissionError) {
//           console.warn('Admission number search failed:', admissionError);
//         }
//       }

//       // Strategy 3: If still no results, try fetching all results and filtering manually
//       if (!foundStudents || foundStudents.length === 0) {
//         try {
//           console.log('Trying manual search through all results...');
//           const allResultsData = await ResultCheckerService.getResults({});
//           const allStudents: StudentBasicInfo[] = [];
          
//           // Extract students from termly results
//           if (allResultsData.termly_results) {
//             allResultsData.termly_results.forEach((result: any) => {
//               if (result.student) {
//                 allStudents.push(result.student);
//               }
//             });
//           }
          
//           // Extract students from session results
//           if (allResultsData.session_results) {
//             allResultsData.session_results.forEach((result: any) => {
//               if (result.student) {
//                 allStudents.push(result.student);
//               }
//             });
//           }

//           // Remove duplicates and filter by search term
//           const uniqueStudents = Array.from(
//             new Map(allStudents.map(s => [s.id, s])).values()
//           );

//           const searchTerm = username.trim().toLowerCase();
//           foundStudents = uniqueStudents.filter(student => 
//             student.name?.toLowerCase().includes(searchTerm) ||
//             student.username?.toLowerCase().includes(searchTerm) ||
//             student.admission_number?.toLowerCase().includes(searchTerm)
//           );
          
//           console.log('Manual search results:', foundStudents);
//         } catch (manualError) {
//           console.warn('Manual search failed:', manualError);
//         }
//       }

//       // Strategy 4: Try different education levels individually
//       if (!foundStudents || foundStudents.length === 0) {
//         const educationLevels = ['NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'];
        
//         for (const level of educationLevels) {
//           try {
//             console.log(`Searching in ${level} level...`);
//             const levelResults = await ResultCheckerService.getTermlyResults(level, {});
            
//             const levelStudents = levelResults
//               .map((result: any) => result.student)
//               .filter(Boolean)
//               .filter((student: StudentBasicInfo) => {
//                 const searchTerm = username.trim().toLowerCase();
//                 return student.name?.toLowerCase().includes(searchTerm) ||
//                        student.username?.toLowerCase().includes(searchTerm) ||
//                        student.admission_number?.toLowerCase().includes(searchTerm);
//               });

//             if (levelStudents.length > 0) {
//               foundStudents = levelStudents;
//               console.log(`Found students in ${level}:`, foundStudents);
//               break;
//             }
//           } catch (levelError) {
//             console.warn(`Failed to search ${level}:`, levelError);
//           }
//         }
//       }
          
//       if (!foundStudents || foundStudents.length === 0) {
//         setError('No student found with this username or admission number. Please check the spelling and try again.');
//         setStudent(null);
//         return;
//       }

//       // Find the best match
//       const searchTerm = username.trim().toLowerCase();
//       let selectedStudent = foundStudents.find((s: StudentBasicInfo) => 
//         s.username?.toLowerCase() === searchTerm ||
//         s.admission_number?.toLowerCase() === searchTerm
//       );
      
//       if (!selectedStudent) {
//         // If no exact match, find closest match
//         selectedStudent = foundStudents.find((s: StudentBasicInfo) => 
//           s.name?.toLowerCase().includes(searchTerm) ||
//           s.username?.toLowerCase().includes(searchTerm) ||
//           s.admission_number?.toLowerCase().includes(searchTerm)
//         ) || foundStudents[0];
        
//         toast.success(`Found closest match: ${selectedStudent.name}`);
//       } else {
//         toast.success(`Found student: ${selectedStudent.name}`);
//       }

//       // Transform the student data to match the expected interface
//       const transformedStudent: StudentData = {
//         id: selectedStudent.id,
//         full_name: selectedStudent.name || 'Unknown',
//         username: selectedStudent.username || selectedStudent.admission_number || '',
//         student_class: selectedStudent.class || 'Unknown',
//         education_level: selectedStudent.education_level || 'Unknown',
//         profile_picture: undefined
//       };

//       console.log('Transformed student data:', transformedStudent);
//       setStudent(transformedStudent);
      
//     } catch (err) {
//       console.error('Error searching for student:', err);
//       const errorMessage = err instanceof Error ? err.message : 'Failed to search for student';
//       setError(`Search failed: ${errorMessage}. Please try with a different username or admission number.`);
//       toast.error(errorMessage);
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Fixed: Updated selection handlers to use proper object types
//   const handleSessionSelection = (sessionName: string) => {
//     const selectedSession = availableSessions.find(s => s.name === sessionName);
//     if (selectedSession) {
//       setSelections(prev => ({ 
//         ...prev, 
//         academicSession: {
//           id: selectedSession.id,
//           name: selectedSession.name,
//           is_current: selectedSession.is_current,
//           start_date: selectedSession.start_date,
//           end_date: selectedSession.end_date,
//           is_active: true, // assuming current session is active
//           created_at: new Date().toISOString(),
//           updated_at: new Date().toISOString()
//         } as AcademicSession
//       }));
//     }
//   };

//   const handleTermSelection = (termName: string) => {
//     const selectedTerm = availableTerms.find(t => t.name === termName);
//     if (selectedTerm) {
//       setSelections(prev => ({ 
//         ...prev, 
//         term: selectedTerm
//       }));
//     }
//   };

//   const handleClassSelection = (className: string) => {
//     const selectedClass = availableClasses.find(c => c.name === className);
//     if (selectedClass) {
//       setSelections(prev => ({ 
//         ...prev, 
//         class: selectedClass
//       }));
//     }
//   };

//   const handleResultTypeSelection = (resultType: string) => {
//     setSelections(prev => ({ ...prev, resultType }));
//   };

//   // Fixed: Better education level detection
//   const isSecondaryLevel = (className: string) => {
//     const classLower = className.toLowerCase();
//     return classLower.includes('jss') || 
//            classLower.includes('sss') ||
//            classLower.includes('junior') ||
//            classLower.includes('senior') ||
//            classLower.includes('js ') ||
//            classLower.includes('ss ') ||
//            classLower.includes('sss ');;
//   };

//   const getNextStep = () => {
//     const maxSteps = isSecondaryLevel(selections.class?.name || '') ? 4 : 3;
    
//     if (currentStep < maxSteps) {
//       setCurrentStep(currentStep + 1);
//     } else {
//       setShowResult(true);
//     }
//   };

//   const getPreviousStep = () => {
//     if (currentStep > 1) {
//       setCurrentStep(currentStep - 1);
//     }
//   };

//   const canProceed = () => {
//     switch (currentStep) {
//       case 1: return selections.academicSession?.id !== '';
//       case 2: return selections.term?.id !== '';
//       case 3: return selections.class?.id !== '';
//       case 4: return isSecondaryLevel(selections.class?.name || '') ? selections.resultType !== '' : true;
//       default: return false;
//     }
//   };

//   // Fixed: Better fallback data and proper data extraction
//   const getSessionOptions = () => {
//     if (availableSessions && availableSessions.length > 0) {
//       return availableSessions.map(s => s.name);
//     }
//     console.warn('Using fallback session data');
//     return ['2023/2024', '2024/2025', '2025/2026'];
//   };

//   const getTermOptions = () => {
//     if (availableTerms && availableTerms.length > 0) {
//       return availableTerms.map(t => t.name);
//     }
//     console.warn('Using fallback term data');
//     return ['FIRST', 'SECOND', 'THIRD'];
//   };

//   const getClassOptions = () => {
//     if (availableClasses && availableClasses.length > 0) {
//       // Sort classes by education level and name for better organization
//       const sortedClasses = availableClasses.sort((a, b) => {
//         const levelOrder = ['NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'];
//         const aLevelIndex = levelOrder.indexOf(a.education_level || '');
//         const bLevelIndex = levelOrder.indexOf(b.education_level || '');
        
//         if (aLevelIndex !== bLevelIndex) {
//           return aLevelIndex - bLevelIndex;
//         }
        
//         // Within same level, sort by name
//         return a.name.localeCompare(b.name);
//       });
      
//       console.log('🔍 [StudentResultChecker] Available classes:', sortedClasses);
//       return sortedClasses.map(c => c.name);
//     }
    
//     console.warn('🔍 [StudentResultChecker] Using fallback class data');
//     return [
//       'Pre-Nursery', 'Nursery 1', 'Nursery 2', 
//       'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 
//       'JSS 1', 'JSS 2', 'JSS 3', 
//       'SS 1', 'SS 2', 'SS 3'
//     ];
//   };

//   // Calculate which step should be shown and max steps dynamically
//   const getCurrentMaxSteps = () => {
//     return isSecondaryLevel(selections.class?.name || '') ? 4 : 3;
//   };

//   const getStepContent = () => {
//     if (loadingFilters) {
//       return (
//         <div className="text-center py-8">
//           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
//           <p className={themeClasses.textSecondary}>Loading options...</p>
//         </div>
//       );
//     }

//     switch (currentStep) {
//       case 1:
//         const sessionOptions = getSessionOptions();
//         return (
//           <div className="space-y-6">
//             <div className="text-center mb-8">
//               <Calendar className={`w-16 h-16 ${themeClasses.iconPrimary} mx-auto mb-4`} />
//               <h3 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-2`}>Select Academic Session</h3>
//               <p className={themeClasses.textSecondary}>Choose the academic year for the result</p>
//               {(!availableSessions || availableSessions.length === 0) && (
//                 <p className="text-sm text-orange-600 mt-2">
//                   ⚠️ Using default options (unable to load from database)
//                 </p>
//               )}
//             </div>
//             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
//               {sessionOptions.map((session) => (
//                 <button
//                   key={session}
//                   onClick={() => handleSessionSelection(session)}
//                   className={`p-6 rounded-xl border-2 transition-all duration-200 ${
//                     selections.academicSession?.name === session
//                       ? `border-blue-500 ${isDarkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`
//                       : `${themeClasses.border} hover:${themeClasses.borderHover} hover:${themeClasses.bgSecondary} ${themeClasses.textPrimary}`
//                   }`}
//                 >
//                   <div className="text-lg font-semibold">{session}</div>
//                 </button>
//               ))}
//             </div>
//           </div>
//         );
//       case 2:
//         const termOptions = getTermOptions();
//         return (
//           <div className="space-y-6">
//             <div className="text-center mb-8">
//               <Calendar className={`w-16 h-16 ${themeClasses.iconPrimary} mx-auto mb-4`} />
//               <h3 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-2`}>Select Term</h3>
//               <p className={themeClasses.textSecondary}>Choose the term for the result</p>
//               {(!availableTerms || availableTerms.length === 0) && (
//                 <p className="text-sm text-orange-600 mt-2">
//                   ⚠️ Using default options (unable to load from database)
//                 </p>
//               )}
//             </div>
//             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//               {termOptions.map((term) => (
//                 <button
//                   key={term}
//                   onClick={() => handleTermSelection(term)}
//                   className={`p-6 rounded-xl border-2 transition-all duration-200 ${
//                     selections.term?.name === term
//                       ? `border-blue-500 ${isDarkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`
//                       : `${themeClasses.border} hover:${themeClasses.borderHover} hover:${themeClasses.bgSecondary} ${themeClasses.textPrimary}`
//                   }`}
//                 >
//                   <div className="text-lg font-semibold">{term}</div>
//                 </button>
//               ))}
//             </div>
//           </div>
//         );
//       case 3:
//         const classOptions = getClassOptions();
//         return (
//           <div className="space-y-6">
//             <div className="text-center mb-8">
//               <GraduationCap className={`w-16 h-16 ${themeClasses.iconPrimary} mx-auto mb-4`} />
//               <h3 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-2`}>Select Class</h3>
//               <p className={themeClasses.textSecondary}>Choose the class for the result</p>
//               {(!availableClasses || availableClasses.length === 0) && (
//                 <p className="text-sm text-orange-600 mt-2">
//                   ⚠️ Using default options (unable to load from database)
//                 </p>
//               )}
//             </div>
//             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
//               {classOptions.map((className) => (
//                 <button
//                   key={className}
//                   onClick={() => handleClassSelection(className)}
//                   className={`p-4 rounded-xl border-2 transition-all duration-200 ${
//                     selections.class?.name === className
//                       ? `border-blue-500 ${isDarkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`
//                       : `${themeClasses.border} hover:${themeClasses.borderHover} hover:${themeClasses.bgSecondary} ${themeClasses.textPrimary}`
//                   }`}
//                 >
//                   <div className="text-lg font-semibold">{className}</div>
//                 </button>
//               ))}
//             </div>
//           </div>
//         );
//       case 4:
//         if (!isSecondaryLevel(selections.class?.name || '')) return null;
        
//         return (
//           <div className="space-y-6">
//             <div className="text-center mb-8">
//               <Trophy className={`w-16 h-16 ${themeClasses.iconPrimary} mx-auto mb-4`} />
//               <h3 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-2`}>Select Result Type</h3>
//               <p className={themeClasses.textSecondary}>Choose the type of result to view</p>
//             </div>
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               <button
//                 onClick={() => handleResultTypeSelection('termly')}
//                 className={`p-6 rounded-xl border-2 transition-all duration-200 ${
//                   selections.resultType === 'termly'
//                     ? `border-blue-500 ${isDarkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`
//                     : `${themeClasses.border} hover:${themeClasses.borderHover} hover:${themeClasses.bgSecondary} ${themeClasses.textPrimary}`
//                 }`}
//               >
//                 <div className="text-lg font-semibold">Termly Result</div>
//                 <div className={`text-sm ${themeClasses.textSecondary} mt-2`}>View term-by-term performance</div>
//               </button>
//               <button
//                 onClick={() => handleResultTypeSelection('session')}
//                 className={`p-6 rounded-xl border-2 transition-all duration-200 ${
//                   selections.resultType === 'session'
//                     ? `border-blue-500 ${isDarkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`
//                     : `${themeClasses.border} hover:${themeClasses.borderHover} hover:${themeClasses.bgSecondary} ${themeClasses.textPrimary}`
//                 }`}
//               >
//                 <div className="text-lg font-semibold">Session Result</div>
//                 <div className={`text-sm ${themeClasses.textSecondary} mt-2`}>View yearly performance summary</div>
//               </button>
//             </div>
//           </div>
//         );
//       default:
//         return null;
//     }
//   };

//   const resetForm = () => {
//     setUsername('');
//     setStudent(null);
//     setError(null);
//     setSelections({
//       academicSession: {} as AcademicSession,
//       term: {} as any,
//       class: {} as any,
//       resultType: ''
//     });
//     setCurrentStep(1);
//     setShowResult(false);
//   };

//   if (showResult && student) {
//     return (
//       <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
//         <div className={`${themeClasses.bgCard} rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto`}>
//           {/* Header */}
//           <div className={`sticky top-0 z-10 ${themeClasses.bgCard} border-b ${themeClasses.border} p-6 rounded-t-xl`}>
//             <div className="flex items-center justify-between">
//               <div>
//                 <h2 className={`text-2xl font-bold ${themeClasses.textPrimary}`}>
//                   Student Result Viewer
//                 </h2>
//                 <p className={themeClasses.textSecondary}>
//                   Viewing results for {student.full_name} ({student.username})
//                 </p>
//               </div>
//               <div className="flex items-center space-x-3">
//                 <button
//                   onClick={() => setShowResult(false)}
//                   className={`px-4 py-2 rounded-lg ${themeClasses.buttonSecondary}`}
//                 >
//                   Back to Selection
//                 </button>
//                 <button
//                   onClick={onClose}
//                   className={`p-2 rounded-lg ${themeClasses.buttonDanger}`}
//                 >
//                   <X size={20} />
//                 </button>
//               </div>
//             </div>
//           </div>

//           {/* Result Content */}
//           <div className="p-6">
//             <div className={`${themeClasses.bgCard} rounded-lg border ${themeClasses.border} p-6`}>
//               <div className="text-center mb-6">
//                 <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-2`}>
//                   {student.full_name}
//                 </h3>
//                 <p className={themeClasses.textSecondary}>
//                   {student.student_class} • {selections.academicSession?.name} • {selections.term?.name}
//                   {selections.resultType && ` • ${selections.resultType}`}
//                 </p>
//               </div>
              
//               {/* Real Result Display */}
//               <StudentResultDisplay 
//                 student={student}
//                 selections={selections}
//               />
//             </div>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
//       <div className={`${themeClasses.bgCard} rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto`}>
//         {/* Header */}
//         <div className={`sticky top-0 z-10 ${themeClasses.bgCard} border-b ${themeClasses.border} p-6 rounded-t-xl`}>
//           <div className="flex items-center justify-between">
//             <div>
//               <h2 className={`text-2xl font-bold ${themeClasses.textPrimary}`}>
//                 Student Result Checker
//               </h2>
//               <p className={themeClasses.textSecondary}>
//                 Check any student's results by entering their username
//               </p>
//             </div>
//             <button
//               onClick={onClose}
//               className={`p-2 rounded-lg ${themeClasses.buttonDanger}`}
//             >
//               <X size={20} />
//             </button>
//           </div>
//         </div>

//         {/* Content */}
//         <div className="p-6">
//           {!student ? (
//             // Step 1: Search for student
//             <div className="space-y-6">
//               <div className="text-center mb-8">
//                 <Search className={`w-16 h-16 ${themeClasses.iconPrimary} mx-auto mb-4`} />
//                 <h3 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-2`}>Find Student</h3>
//                 <p className={themeClasses.textSecondary}>Enter the student's username or admission number to view their results</p>
//               </div>

//               <div className="max-w-md mx-auto">
//                 <div className="space-y-4">
//                   <div>
//                     <label htmlFor="username" className={`block text-sm font-medium ${themeClasses.textPrimary} mb-1`}>
//                       Student Username or Admission Number
//                     </label>
//                     <input
//                       id="username"
//                       type="text"
//                       value={username}
//                       onChange={(e) => setUsername(e.target.value)}
//                       placeholder="Enter student username or admission number"
//                       className={`w-full px-4 py-3 border ${themeClasses.border} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bgCard} ${themeClasses.textPrimary}`}
//                       onKeyPress={(e) => e.key === 'Enter' && handleSearchStudent()}
//                     />
//                   </div>

//                   {error && (
//                     <div className="text-red-600 text-sm text-center bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
//                       {error}
//                     </div>
//                   )}

//                   <button
//                     onClick={handleSearchStudent}
//                     disabled={loading || !username.trim()}
//                     className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
//                       loading || !username.trim()
//                         ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
//                         : themeClasses.buttonPrimary
//                     }`}
//                   >
//                     {loading ? 'Searching...' : 'Search Student'}
//                   </button>
//                 </div>
//               </div>
//             </div>
//           ) : (
//             // Step 2: Result selection
//             <div className="space-y-6">
//               {/* Student Info */}
//               <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
//                 <div className="flex items-center space-x-4">
//                   <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
//                     <User className="text-white" size={24} />
//                   </div>
//                   <div className="flex-1">
//                     <h4 className={`font-semibold ${themeClasses.textPrimary}`}>
//                       {student.full_name}
//                     </h4>
//                     <p className={`text-sm ${themeClasses.textSecondary}`}>
//                       Username: {student.username} • Class: {student.student_class}
//                     </p>
//                   </div>
//                   <button
//                     onClick={resetForm}
//                     className="text-sm text-blue-600 hover:text-blue-700 px-3 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
//                   >
//                     Change Student
//                   </button>
//                 </div>
//               </div>

//               {/* Selection Steps */}
//               <div className="space-y-6">
//                 {getStepContent()}
//               </div>

//               {/* Navigation */}
//               <div className={`flex items-center justify-between pt-6 border-t ${themeClasses.border}`}>
//                 <button
//                   onClick={getPreviousStep}
//                   disabled={currentStep === 1}
//                   className={`px-4 py-2 rounded-lg transition-colors ${
//                     currentStep === 1
//                       ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
//                       : themeClasses.buttonSecondary
//                   }`}
//                 >
//                   Previous
//                 </button>

//                 <div className="flex items-center space-x-2">
//                   {Array.from({ length: getCurrentMaxSteps() }, (_, i) => i + 1).map((step) => (
//                     <div
//                       key={step}
//                       className={`w-3 h-3 rounded-full transition-colors ${
//                         step <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
//                       }`}
//                     />
//                   ))}
//                 </div>

//                 <button
//                   onClick={getNextStep}
//                   disabled={!canProceed() || loadingFilters}
//                   className={`px-6 py-2 rounded-lg flex items-center space-x-2 transition-colors ${
//                     canProceed() && !loadingFilters
//                       ? themeClasses.buttonPrimary
//                       : 'bg-gray-300 text-gray-500 cursor-not-allowed'
//                   }`}
//                 >
//                   <span>{currentStep === getCurrentMaxSteps() ? 'View Result' : 'Next'}</span>
//                   <ArrowRight size={16} />
//                 </button>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default StudentResultChecker;