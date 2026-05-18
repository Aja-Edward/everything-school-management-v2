import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, BookOpen, GraduationCap, ArrowRight, Download, Trophy, Loader2, AlertCircle, Check } from 'lucide-react';
import { AcademicSession, Term, EducationLevel } from '@/types/types';
import { API_BASE_URL } from '@/services/api';
import { useDesign } from '@/contexts/DesignContext';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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
// COLOR HELPERS
// ============================================================================

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
};

const makeColorStyles = (primaryColor: string) => {
  const rgb = hexToRgb(primaryColor);
  const rgba = (alpha: number) =>
    rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : primaryColor;

  return {
    primaryColor,
    selectedCard: {
      border: `2px solid ${primaryColor}`,
      background: rgba(0.08),
      color: primaryColor,
    },
    hoverCard: {
      border: `2px solid ${rgba(0.4)}`,
      background: rgba(0.04),
    },
    defaultCard: {
      border: '2px solid #e5e7eb',
    },
    stepActive: {
      background: primaryColor,
      color: '#fff',
    },
    stepDone: {
      background: primaryColor,
      color: '#fff',
    },
    stepConnectorDone: {
      background: primaryColor,
    },
    primaryBtn: {
      background: primaryColor,
      color: '#fff',
    },
    iconColor: { color: primaryColor },
    iconBg: { background: rgba(0.1) },
  };
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ResultSelection = ({ onSelectionComplete, verifiedTokenData }: ResultSelectionProps) => {
  const { settings: designSettings } = useDesign();
  const primaryColor = designSettings?.primary_color || '#4F46E5';
  const colors = makeColorStyles(primaryColor);

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
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getTermDisplayName = (term: Term): string =>
    term.name_display || term.name || 'Term';

  const getClassDisplayName = (classItem: ClassInfo): string =>
    classItem.name || classItem.class_name || 'Class';

  const getSessionDisplayName = (session: AcademicSession): string =>
    session.name || `${session.start_date}/${session.end_date}` || 'Session';

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

    const fetchAllData = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const fetchOptions: RequestInit = {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        };

        const verifiedStudent: StudentInfo = {
          full_name: verifiedTokenData.student_name || 'Student',
          education_level: verifiedTokenData.education_level || '',
          current_class: verifiedTokenData.current_class,
          verified: true,
        };
        setStudentInfo(verifiedStudent);

        const [sessionRes, examsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/classrooms/academic-sessions/current/`, fetchOptions),
          fetch(`${API_BASE_URL}/results/exam-sessions/`, fetchOptions),
        ]);

        if (!sessionRes.ok) throw new Error('Failed to load current academic session');

        const currentSession: AcademicSession = await sessionRes.json();

        const termsRes = await fetch(
          `${API_BASE_URL}/classrooms/academic-sessions/${currentSession.id}/terms/`,
          fetchOptions
        );

        if (!termsRes.ok) throw new Error('Failed to load terms');

        const termsData: Term[] = await termsRes.json();
        const examSessionsData: ExamSession[] = examsRes.ok ? await examsRes.json() : [];

        let classesData: ClassInfo[] = [];

        const myClassroomRes = await fetch(
          `${API_BASE_URL}/students/my-classroom/`,
          fetchOptions
        );

        if (myClassroomRes.ok) {
          const myData = await myClassroomRes.json();
          const cls = myData.classroom;

          if (myData.education_level) {
            verifiedStudent.education_level = myData.education_level as EducationLevel;
          }

          if (cls && (cls.id || cls.name)) {
            classesData = [{
              id: cls.id ?? 0,
              name: cls.name || myData.student_class || 'My Class',
              class_name: cls.name,
              education_level: (myData.education_level ?? '') as EducationLevel,
              section_id: undefined,
              grade_level_id: undefined,
              grade_name: myData.student_class,
              section_name: cls.section_name,
            }];
          }
        }

        if (!isMounted) return;

        setAcademicSessions([currentSession]);
        setSelectedSessionId(currentSession.id);
        setTerms(Array.isArray(termsData) ? termsData : []);
        setExamSessions(Array.isArray(examSessionsData) ? examSessionsData : []);
        setClasses(classesData);

        if (verifiedTokenData.school_term && Array.isArray(termsData)) {
          const tokenTerm = verifiedTokenData.school_term.toLowerCase();
          const match = termsData.find((t: Term) => {
            const termName = (t?.name || t?.name_display || '').toLowerCase();
            return termName === tokenTerm || termName.includes(tokenTerm);
          });
          if (match) setSelectedTermId(match.id);
        }

        if (classesData.length > 0) {
          setSelectedClassId(classesData[0].id);
        }
      } catch (err) {
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

      onSelectionComplete({
        academicSession: session,
        term: term,
        class: classObj,
        resultType,
        examSession: examSessionId,
      });
    }
  };

  const getPreviousStep = (): void => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
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
  // CARD STYLE HELPER
  // ============================================================================

  const cardStyle = (isSelected: boolean, cardKey: string) => {
    if (isSelected) return colors.selectedCard;
    if (hoveredCard === cardKey) return { ...colors.defaultCard, ...colors.hoverCard };
    return colors.defaultCard;
  };

  // ============================================================================
  // STEP DEFINITIONS
  // ============================================================================

  const stepLabels = ['Session', 'Term', 'Class', ...(isSecondaryClass ? ['Type'] : [])];

  // ============================================================================
  // RENDER STEP CONTENT
  // ============================================================================

  const getStepContent = (): React.ReactNode => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
            style={colors.iconBg}
          >
            <Loader2 className="w-7 h-7 animate-spin" style={colors.iconColor} />
          </div>
          <p className="text-gray-500 dark:text-slate-400 text-sm">Loading your academic information...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <p className="text-red-500 text-sm mb-5">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={colors.primaryBtn}
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
            <StepHeader
              icon={Calendar}
              title="Academic Session"
              subtitle="Choose the academic year for your result"
              colors={colors}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {academicSessions.map((session) => {
                const key = `session-${session.id}`;
                const isSelected = selectedSessionId === session.id;
                return (
                  <button
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    onMouseEnter={() => setHoveredCard(key)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={cardStyle(isSelected, key)}
                    className="p-5 rounded-xl transition-all duration-200 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{getSessionDisplayName(session)}</span>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: primaryColor }}>
                          <Check className="w-3 h-3 text-white" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <StepHeader
              icon={BookOpen}
              title="Term"
              subtitle={filteredTerms.length === 0 ? 'No terms available for selected session' : 'Choose the term for your result'}
              colors={colors}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {filteredTerms.length === 0 ? (
                <div className="col-span-3 text-center text-gray-400 dark:text-slate-500 py-8 text-sm">
                  Please select a different academic session
                </div>
              ) : (
                filteredTerms.map((term) => {
                  const key = `term-${term.id}`;
                  const isSelected = selectedTermId === term.id;
                  return (
                    <button
                      key={term.id}
                      onClick={() => setSelectedTermId(term.id)}
                      onMouseEnter={() => setHoveredCard(key)}
                      onMouseLeave={() => setHoveredCard(null)}
                      style={cardStyle(isSelected, key)}
                      className="p-5 rounded-xl transition-all duration-200 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{getTermDisplayName(term)}</span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: primaryColor }}>
                            <Check className="w-3 h-3 text-white" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <StepHeader
              icon={GraduationCap}
              title="Class"
              subtitle="Your enrolled class"
              colors={colors}
            />
            {classes.length === 0 ? (
              <div className="text-center text-gray-400 dark:text-slate-500 py-10 text-sm">
                <p className="font-medium mb-1 text-gray-500">No classes found</p>
                <p>No active classrooms found for your education level ({studentInfo?.education_level}). Please contact your school office.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {classes.map((classItem) => {
                  const key = `class-${classItem.id}`;
                  const isSelected = selectedClassId === classItem.id;
                  return (
                    <button
                      key={classItem.id}
                      onClick={() => setSelectedClassId(classItem.id)}
                      onMouseEnter={() => setHoveredCard(key)}
                      onMouseLeave={() => setHoveredCard(null)}
                      style={cardStyle(isSelected, key)}
                      className="p-5 rounded-xl transition-all duration-200 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{getClassDisplayName(classItem)}</span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: primaryColor }}>
                            <Check className="w-3 h-3 text-white" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 4: {
        if (!isSecondaryClass) return null;

        const isSeniorSecondary = (selectedClass?.name || selectedClass?.class_name || '').toLowerCase().includes('ss');
        const firstTypeKey = isSeniorSecondary ? 'termly' : 'yearly';
        const firstTypeValue = isSeniorSecondary ? 'termly' : 'yearly';

        const resultOptions = [
          {
            value: firstTypeValue as 'termly' | 'yearly',
            label: isSeniorSecondary ? 'Termly Result' : 'Yearly Result',
            description: isSeniorSecondary ? 'Single term performance' : 'Complete academic year',
            icon: '📅',
            key: `type-${firstTypeKey}`,
          },
          {
            value: 'annually' as const,
            label: 'Annual Result',
            description: 'Annual cumulative assessment',
            icon: '📊',
            key: 'type-annually',
          },
        ];

        return (
          <div className="space-y-6">
            <StepHeader
              icon={Trophy}
              title="Result Type"
              subtitle="Choose the type of result you want to view"
              colors={colors}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {resultOptions.map((opt) => {
                const isSelected = resultType === opt.value;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setResultType(opt.value)}
                    onMouseEnter={() => setHoveredCard(opt.key)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={cardStyle(isSelected, opt.key)}
                    className="p-7 rounded-xl transition-all duration-200 text-center"
                  >
                    <div className="text-3xl mb-3">{opt.icon}</div>
                    <div className="text-base font-semibold mb-1">{opt.label}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">{opt.description}</div>
                    {isSelected && (
                      <div className="mt-3 flex justify-center">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: primaryColor }}>
                          <Check className="w-3 h-3 text-white" />
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

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
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
          style={colors.iconBg}
        >
          <GraduationCap className="w-7 h-7" style={colors.iconColor} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-1">Result Portal</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400">Welcome, <span className="font-medium text-gray-700 dark:text-slate-300">{studentName}</span></p>
        {studentInfo?.verified && (
          <span className="inline-flex items-center gap-1 mt-2 text-xs font-medium px-2.5 py-1 rounded-full" style={{ color: primaryColor, background: makeColorStyles(primaryColor).iconBg.background }}>
            <Check className="w-3 h-3" />
            Identity verified
          </span>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex justify-center mb-8">
        <div className="flex items-center gap-0">
          {steps.map((step, idx) => {
            const isDone = step < currentStep;
            const isActive = step === currentStep;
            return (
              <div key={step} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300"
                    style={
                      isDone
                        ? colors.stepDone
                        : isActive
                        ? colors.stepActive
                        : { background: '#e5e7eb', color: '#9ca3af' }
                    }
                  >
                    {isDone ? <Check className="w-4 h-4" /> : step}
                  </div>
                  <span className="text-xs mt-1.5 font-medium" style={isActive ? colors.iconColor : { color: '#9ca3af' }}>
                    {stepLabels[idx]}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className="w-14 h-0.5 mx-1 mb-5 transition-all duration-300"
                    style={step < currentStep ? colors.stepConnectorDone : { background: '#e5e7eb' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-8">
        {getStepContent()}

        {!loading && !error && (
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100 dark:border-slate-700">
            <button
              onClick={getPreviousStep}
              disabled={currentStep === 1}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={
                currentStep === 1
                  ? { background: '#f3f4f6', color: '#d1d5db', cursor: 'not-allowed' }
                  : { background: '#f3f4f6', color: '#374151' }
              }
            >
              Previous
            </button>

            <button
              onClick={getNextStep}
              disabled={!canProceed()}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-opacity"
              style={
                canProceed()
                  ? { ...colors.primaryBtn, opacity: 1 }
                  : { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' }
              }
            >
              <span>{currentStep === maxSteps ? 'View Result' : 'Next'}</span>
              {currentStep === maxSteps
                ? <Download className="w-4 h-4" />
                : <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// STEP HEADER SUB-COMPONENT
// ============================================================================

interface StepHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  colors: ReturnType<typeof makeColorStyles>;
}

const StepHeader = ({ icon: Icon, title, subtitle, colors }: StepHeaderProps) => (
  <div className="flex items-center gap-4 mb-6">
    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={colors.iconBg}>
      <Icon className="w-6 h-6" style={colors.iconColor} />
    </div>
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>
    </div>
  </div>
);

export default ResultSelection;
