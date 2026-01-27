import React, { useState, useEffect, useMemo, ReactNode } from 'react';
import { Calendar, BookOpen, GraduationCap, ArrowRight, Download, Trophy, Loader2, AlertCircle } from 'lucide-react';
import { AcademicSession, Term, EducationLevel } from '@/types/types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface GradeLevel {
  id: number;
  name: string;
  education_level: EducationLevel;
  order: number;
  is_active: boolean;
}

interface Section {
  id: number;
  name: string;
  grade_level: number | GradeLevel;
  is_active: boolean;
}

interface ClassInfo {
  id: number;
  class_name?: string;
  name?: string;
  education_level?: EducationLevel;
  section_id?: number;
  grade_level_id?: number;
  grade_name?: string;
  section_name?: string;
}

interface ExamSession {
  id: string | number;
  name: string;
  term: number;
  academic_session: number;
  exam_type?: string;
  start_date?: string;
  end_date?: string;
  is_published?: boolean;
  is_active?: boolean;
}

interface SelectionData {
  academicSession: AcademicSession;
  term: Term;
  class: ClassInfo;
  resultType?: string;
  examSession?: string;
}

interface TokenVerificationData {
  is_valid: boolean;
  message: string;
  school_term: string;
  expires_at: string;
  student_id?: string | number;
  student_name?: string;
  education_level?: EducationLevel;
  current_class?: string | number;
}

interface StudentInfo {
  full_name: string;
  education_level: EducationLevel | '';
  current_class?: string | number;
  verified: boolean;
}

interface ResultSelectionProps {
  onSelectionComplete: (data: SelectionData) => void;
  verifiedTokenData?: TokenVerificationData | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://school-project-with-edward.onrender.com/api';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ResultSelection = ({ onSelectionComplete, verifiedTokenData }: ResultSelectionProps) => {
  // State
  const [academicSessions, setAcademicSessions] = useState<AcademicSession[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  
  const [selectedSessionId, setSelectedSessionId] = useState<number | string | null>(null);
  const [selectedTermId, setSelectedTermId] = useState<number | string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [resultType, setResultType] = useState<'termly' | 'yearly' | 'annually' | ''>('');
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getAuthToken = (): string | null => {
    const tokenKeys = ['authToken', 'token', 'access_token', 'accessToken', 'jwt'];
    for (const key of tokenKeys) {
      const val = localStorage.getItem(key);
      if (val) return val;
    }
    return null;
  };

  const getTermDisplayName = (term: Term): string => {
    return term.name_display || term.name || 'Term';
  };

  const getClassDisplayName = (classItem: ClassInfo): string => {
    return classItem.name || classItem.class_name || 'Class';
  };

  const getSessionDisplayName = (session: AcademicSession): string => {
    return session.name || `${session.start_date}/${session.end_date}` || 'Session';
  };

  const normalizeClassName = (name: string): string => {
    return name.toLowerCase()
      .replace(/\s+/g, '') // Remove all whitespace
      .replace(/^ss(\d)/, 'sss$1'); // Convert SS1 to SSS1 if needed
  };

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    if (!verifiedTokenData?.is_valid) {
      setError('Token verification failed. Please login again.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    console.log('✅ Starting data fetch with verified token');
    console.log('📋 Verified token data:', verifiedTokenData);

    const fetchAllData = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const authToken = getAuthToken();
        console.log('🔑 Auth token present:', !!authToken);
        if (!authToken) throw new Error('No auth token found');

        const headers = {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        };

        const verifiedStudent: StudentInfo = {
          full_name: verifiedTokenData.student_name || 'Student',
          education_level: verifiedTokenData.education_level || '',
          current_class: verifiedTokenData.current_class,
          verified: true
        };
        
        console.log('✅ Verified student:', verifiedStudent);
        setStudentInfo(verifiedStudent);

        // Fetch academic session and exam sessions in parallel
        const [sessionRes, examsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/classrooms/academic-sessions/current/`, { headers }),
          fetch(`${API_BASE_URL}/results/exam-sessions/`, { headers }),
        ]);

        if (!sessionRes.ok) throw new Error('Failed to load current academic session');

        const currentSession: AcademicSession = await sessionRes.json();
        console.log('📅 Current session:', currentSession.name);

        // Fetch terms for current session
        const termsRes = await fetch(
          `${API_BASE_URL}/classrooms/academic-sessions/${currentSession.id}/terms/`,
          { headers }
        );

        if (!termsRes.ok) throw new Error('Failed to load terms');

        const termsData: Term[] = await termsRes.json();
        const examSessionsData: ExamSession[] = examsRes.ok ? await examsRes.json() : [];

        console.log('📚 Terms loaded:', termsData.length);
        console.log('📋 Exam sessions loaded:', examSessionsData.length);

        // Fetch classes
        let classesData: ClassInfo[] = [];
        
        console.log('📍 Education level to fetch:', verifiedStudent.education_level);
        
        try {
          // Step 1: Fetch all grade levels
          const gradesRes = await fetch(
            `${API_BASE_URL}/classrooms/results-portal/grades/`,
            { headers }
          );
          
          if (!gradesRes.ok) {
            throw new Error(`Grades fetch failed: ${gradesRes.status}`);
          }
          
          const gradesData = await gradesRes.json();
          const allGrades: GradeLevel[] = Array.isArray(gradesData) ? gradesData : (gradesData.results || []);
          
          console.log(`✅ Total grades fetched: ${allGrades.length}`);
          if (allGrades.length > 0) {
            console.log('📋 Sample grade:', allGrades[0]);
          }
          
          // Step 2: Filter grades by education level
          const relevantGrades = verifiedStudent.education_level 
            ? allGrades.filter((g) => g.education_level === verifiedStudent.education_level)
            : allGrades;
          
          console.log(`✅ Relevant grades for ${verifiedStudent.education_level}: ${relevantGrades.length}`);
          
          if (relevantGrades.length === 0) {
            console.warn(`⚠️ No grades found for: ${verifiedStudent.education_level}`);
            console.log('Available education levels:', [...new Set(allGrades.map((g) => g.education_level))]);
          }
          
          // Step 3: For each grade, get sections then classrooms
          for (const grade of relevantGrades) {
            console.log(`\n📌 Processing Grade: ${grade.name} (ID: ${grade.id})`);
            
            // Get sections for this grade
            const sectionsRes = await fetch(
              `${API_BASE_URL}/classrooms/results-portal/grades/${grade.id}/sections/`,
              { headers }
            );
            
            if (!sectionsRes.ok) {
              console.warn(`   ⚠️ Sections fetch failed (${sectionsRes.status})`);
              continue;
            }
            
            const sectionsData = await sectionsRes.json();
            const sections: Section[] = Array.isArray(sectionsData) ? sectionsData : (sectionsData.results || []);
            
            console.log(`   ✅ Found ${sections.length} sections`);
            
            // For each section, get classrooms
            for (const section of sections) {
              console.log(`      📌 Section: ${section.name} (ID: ${section.id})`);
              
              const classroomsRes = await fetch(
                `${API_BASE_URL}/classrooms/results-portal/sections/${section.id}/classrooms/`,
                { headers }
              );

              if (!classroomsRes.ok) {
                console.warn(`         ⚠️ Classrooms fetch failed (${classroomsRes.status})`);
                continue;
              }
              
              const classroomsData = await classroomsRes.json();
              const classrooms: any[] = Array.isArray(classroomsData) ? classroomsData : (classroomsData.results || []);
              
              console.log(`         ✅ Found ${classrooms.length} classrooms`);
              
              classrooms.forEach((classroom: any) => {
                const mappedClass: ClassInfo = {
                  id: classroom.id,
                  name: classroom.name || `${grade.name} ${section.name}`,
                  class_name: classroom.name,
                  education_level: grade.education_level,
                  section_id: section.id,
                  grade_level_id: grade.id,
                  grade_name: grade.name,
                  section_name: section.name
                };
                classesData.push(mappedClass);
                console.log(`            ✅ Added classroom: ${mappedClass.name}`);
              });
            }
          }
          
          console.log(`\n✅ Total classrooms collected: ${classesData.length}`);
          
          if (classesData.length === 0) {
            console.error('❌ DIAGNOSTIC: No classrooms found. Checking each step:');
            console.error(`   1. GradeLevel count: ${allGrades.length}`);
            console.error(`   2. Relevant grades for ${verifiedStudent.education_level}: ${relevantGrades.length}`);
            console.error('   3. Check if Sections exist in Django admin');
            console.error('   4. Check if Classrooms exist in Django admin');
            console.error('   5. Verify relationships: Grade → Section → Classroom');
          }
          
        } catch (e) {
          console.error('❌ Error in classroom fetching:', e);
          setError(`Failed to load classrooms: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }

        if (!isMounted) return;

        setAcademicSessions([currentSession]);
        setSelectedSessionId(currentSession.id);
        setTerms(Array.isArray(termsData) ? termsData : []);
        setExamSessions(Array.isArray(examSessionsData) ? examSessionsData : []);
        setClasses(classesData);

        // Auto-select term
        if (verifiedTokenData.school_term && Array.isArray(termsData)) {
          const tokenTerm = verifiedTokenData.school_term.toLowerCase();
          const match = termsData.find((t: Term) => {
            const termName = (t?.name || t?.name_display || '').toLowerCase();
            return termName === tokenTerm || termName.includes(tokenTerm);
          });
          if (match) {
            console.log('🎯 Auto-selected term:', match.name);
            setSelectedTermId(match.id);
          }
        }

        // Auto-select student's class
        if (verifiedTokenData.current_class && classesData.length > 0) {
          const currentClassName = String(verifiedTokenData.current_class).trim();
          console.log('🔍 Looking for class:', currentClassName);
          
          const normalizedTarget = normalizeClassName(currentClassName);
          
          // Try exact match first
          let studentClass = classesData.find(c => 
            (c.name === currentClassName) || (c.class_name === currentClassName)
          );
          
          // Try normalized fuzzy match
          if (!studentClass) {
            studentClass = classesData.find(c => {
              const name1 = normalizeClassName(c.name || '');
              const name2 = normalizeClassName(c.class_name || '');
              return name1 === normalizedTarget || name2 === normalizedTarget;
            });
          }
          
          if (studentClass) {
            console.log('✅ Auto-selected class:', studentClass.name);
            setSelectedClassId(studentClass.id);
          } else {
            console.warn('⚠️ Could not find class:', currentClassName);
            console.log('Available:', classesData.map(c => c.name).join(', '));
            console.log('Normalized target:', normalizedTarget);
            console.log('Normalized available:', classesData.map(c => normalizeClassName(c.name || '')).join(', '));
          }
        }
      } catch (err) {
        console.error('❌ Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load academic data');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAllData();

    return () => {
      isMounted = false;
    };
  }, [verifiedTokenData]);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const selectedSession = useMemo(
    () => academicSessions.find(s => s.id === selectedSessionId),
    [academicSessions, selectedSessionId]
  );

  const selectedTerm = useMemo(
    () => terms.find(t => t.id === selectedTermId),
    [terms, selectedTermId]
  );
  
  const selectedClass = useMemo(
    () => classes.find(c => c.id === selectedClassId),
    [classes, selectedClassId]
  );

  const getFilteredTerms = useMemo(() => {
    if (!selectedSessionId) return terms;
    return terms.filter(t => t.academic_session === selectedSessionId);
  }, [terms, selectedSessionId]);

  const isSecondaryClass = useMemo(() => {
    if (!selectedClass) return false;
    const name = (selectedClass.name || selectedClass.class_name || '').toLowerCase();
    return name.includes('jss') || name.includes('sss') || name.includes('secondary') || name.includes('ss');
  }, [selectedClass]);

  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================

  const getNextStep = (): void => {
    const maxSteps = isSecondaryClass ? 4 : 3;
    
    if (currentStep < maxSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      const session = selectedSession;
      const term = selectedTerm;
      const classObj = selectedClass;

      if (!session || !term || !classObj) {
        setError('Please complete all selections');
        return;
      }

      let examSessionId = '';
      if (examSessions.length > 0) {
        const matchingExamSession = examSessions.find(es => 
          es.term === term.id && 
          es.academic_session === Number(session.id)
        );
        examSessionId = matchingExamSession?.id?.toString() || examSessions[0]?.id?.toString() || '';
      }

      console.log('✅ Submitting:', { session: session.name, term: term.name, class: classObj.name });
      onSelectionComplete({
        academicSession: session,
        term: term,
        class: classObj,
        resultType,
        examSession: examSessionId
      });
    }
  };

  const getPreviousStep = (): void => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1: return selectedSessionId !== null;
      case 2: return selectedTermId !== null;
      case 3: return selectedClassId !== null;
      case 4: return isSecondaryClass ? resultType !== '' : true;
      default: return false;
    }
  };

  // ============================================================================
  // UI HELPERS
  // ============================================================================

  const getStepColor = (step: number): string => {
    if (step < currentStep) return 'bg-green-500';
    if (step === currentStep) return 'bg-blue-500';
    return 'bg-gray-300 dark:bg-slate-600';
  };

  // ============================================================================
  // RENDER STEP CONTENT
  // ============================================================================

  const getStepContent = (): React.ReactNode => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p className="text-gray-600 dark:text-slate-400">Loading your academic information...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      );
    }

    const filteredTerms = getFilteredTerms;

    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Calendar className="w-16 h-16 text-blue-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-2">Select Academic Session</h3>
              <p className="text-gray-600 dark:text-slate-400">Choose the academic year for your result</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {academicSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`p-6 rounded-xl border-2 transition-all duration-200 ${
                    selectedSessionId === session.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-slate-600 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200'
                  }`}
                >
                  <div className="text-lg font-semibold">
                    {getSessionDisplayName(session)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <BookOpen className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-2">Select Term</h3>
              <p className="text-gray-600 dark:text-slate-400">
                {filteredTerms.length === 0 
                  ? 'No terms available for selected session' 
                  : 'Choose the term for your result'}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {filteredTerms.length === 0 ? (
                <div className="col-span-3 text-center text-gray-500 dark:text-slate-400 py-8">
                  Please select a different academic session
                </div>
              ) : (
                filteredTerms.map((term) => (
                  <button
                    key={term.id}
                    onClick={() => setSelectedTermId(term.id)}
                    className={`p-6 rounded-xl border-2 transition-all duration-200 ${
                      selectedTermId === term.id
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'border-gray-200 dark:border-slate-600 hover:border-green-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="text-lg font-semibold">
                      {getTermDisplayName(term)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <GraduationCap className="w-16 h-16 text-purple-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-2">Select Class</h3>
              <p className="text-gray-600 dark:text-slate-400">Choose your class</p>
            </div>
            {classes.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-slate-400 py-8">
                <p className="mb-4">❌ No classes found for {studentInfo?.education_level}</p>
                <p className="text-sm space-y-2">
                  <div>📋 Possible issues:</div>
                  <div className="inline-block text-left">
                    <div>• No GradeLevel exists with education_level = {studentInfo?.education_level}</div>
                    <div>• GradeLevel exists but has no Sections</div>
                    <div>• Sections exist but have no Classrooms</div>
                  </div>
                  <div className="mt-4">Check browser console for diagnostic details</div>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                {classes.map((classItem) => (
                  <button
                    key={classItem.id}
                    onClick={() => setSelectedClassId(classItem.id)}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                      selectedClassId === classItem.id
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                        : 'border-gray-200 dark:border-slate-600 hover:border-purple-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="text-lg font-semibold">
                      {getClassDisplayName(classItem)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      case 4:
        if (!isSecondaryClass) return null;
        
        const isSeniorSecondary = (selectedClass?.name || selectedClass?.class_name || '').toLowerCase().includes('ss');
        
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Trophy className="w-16 h-16 text-orange-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-2">Select Result Type</h3>
              <p className="text-gray-600 dark:text-slate-400">Choose the type of result you want to view</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={() => setResultType(isSeniorSecondary ? 'termly' : 'yearly')}
                className={`p-8 rounded-xl border-2 transition-all duration-200 ${
                  resultType === (isSeniorSecondary ? 'termly' : 'yearly')
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                    : 'border-gray-200 dark:border-slate-600 hover:border-orange-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">📅</div>
                  <div className="text-xl font-semibold mb-2">{isSeniorSecondary ? 'Termly Result' : 'Yearly Result'}</div>
                  <div className="text-sm">{isSeniorSecondary ? 'Single term performance' : 'Complete academic year'}</div>
                </div>
              </button>
              <button
                onClick={() => setResultType('annually')}
                className={`p-8 rounded-xl border-2 transition-all duration-200 ${
                  resultType === 'annually'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                    : 'border-gray-200 dark:border-slate-600 hover:border-orange-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">📊</div>
                  <div className="text-xl font-semibold mb-2">Annual Result</div>
                  <div className="text-sm">Annual assessment</div>
                </div>
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  const maxSteps = isSecondaryClass ? 4 : 3;
  const steps = Array.from({ length: maxSteps }, (_, i) => i + 1);
  const studentName = studentInfo?.full_name || 'Student';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-slate-100 mb-2">Result Portal</h1>
        <p className="text-gray-600 dark:text-slate-400">Welcome, {studentName}</p>
        {studentInfo?.verified && (
          <p className="text-sm text-green-600 dark:text-green-400 mt-2">✅ Identity verified</p>
        )}
      </div>

      <div className="flex justify-center mb-8">
        <div className="flex items-center space-x-4">
          {steps.map((step) => (
            <div key={step} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${getStepColor(step)}`}>
                {step}
              </div>
              {step < steps.length && (
                <div className={`w-16 h-1 mx-2 ${step < currentStep ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`}></div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-slate-700">
        {getStepContent()}

        {!loading && !error && (
          <div className="flex justify-between mt-8">
            <button
              onClick={getPreviousStep}
              disabled={currentStep === 1}
              className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                currentStep === 1
                  ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-600'
              }`}
            >
              Previous
            </button>
            
            <button
              onClick={getNextStep}
              disabled={!canProceed()}
              className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 ${
                canProceed()
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
              }`}
            >
              <span>{currentStep === maxSteps ? 'View Result' : 'Next'}</span>
              {currentStep === maxSteps ? <Download className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultSelection;