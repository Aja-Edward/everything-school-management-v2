import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import ResultService, {type ResultQueryParams} from '@/services/ResultService';
import ResultCreateTab from '@/components/dashboards/teacher/ResultCreateTab';
import useResultActionsManager from '@/components/dashboards/teacher/ResultActionsManager';
import { toast } from 'react-toastify';
import { TeacherAssignment, StudentResult, AcademicSession, EducationLevel, ResultStatus } from '@/types/types';
import { 
  Plus, Edit, Trash2, Eye, CheckCircle, AlertCircle, RefreshCw, 
  Search, X, FileText, Filter, TrendingUp, Award, Calendar, 
  GraduationCap, Grid, List
} from 'lucide-react';

type ViewMode = 'table' | 'card';

const TeacherResults: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  
  const [results, setResults] = useState<StudentResult[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEducationLevel, setFilterEducationLevel] = useState<EducationLevel | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<'results' | 'record'>('results');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  async function loadTeacherData() {
    try {
      setLoading(true);
      setError(null);
      let debugLog = '';

      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user as unknown as object);
      debugLog += `Teacher ID: ${teacherId}\n`;
      
      if (!teacherId) throw new Error('Teacher ID not found');

      const subjects = await TeacherDashboardService.getTeacherSubjects(teacherId);
      debugLog += `Subjects loaded: ${subjects.length}\n`;
      console.log('📚 Raw subjects from API:', subjects);

      type ExtendedAssignment = TeacherAssignment & { classroom_id?: number | null };

      const assignments: ExtendedAssignment[] = subjects.flatMap((subject: any) => {
        if (!subject.assignments || !Array.isArray(subject.assignments)) {
          return [{
            id: subject.id,
            classroom_name: subject.classroom ?? 'Unknown',
            section_name: subject.section_name ?? subject.section ?? 'Unknown',
            grade_level_name: subject.grade_level_name ?? subject.grade_level ?? 'Unknown',
            education_level: subject.education_level || 
                            subject.grade_level_education_level ||
                            subject.classroom_education_level ||
                            undefined,
            subject_name: subject.name ?? subject.subject_name ?? 'Unknown Subject',
            subject_code: subject.code ?? subject.subject_code ?? '',
            subject_id: Number(subject.subject_id || subject.grade_subject_id || subject.id),
            grade_level_id: subject.grade_level_id ?? null,
            section_id: subject.section_id ?? null,
            classroom_id: subject.classroom_id ?? null,
            student_count: subject.student_count ?? 0,
            periods_per_week: subject.periods_per_week ?? 0,
            teacher: subject.teacher ?? null,
            grade_level: subject.grade_level ?? null,
            section: subject.section ?? null,
            academic_year: subject.academic_year ?? null,
            is_primary_teacher: subject.is_primary_teacher ?? false,
          }];
        }
        
        return subject.assignments.map((assignment: any) => ({
          id: assignment.id || subject.id,
          classroom_name: assignment.classroom_name || subject.classroom_name || 'Unknown',
          section_name: assignment.section_name || subject.section_name || 'Unknown',
          grade_level_name: assignment.grade_level_name || subject.grade_level_name || 'Unknown',
          education_level: assignment.education_level || 
                          assignment.grade_level?.education_level ||
                          subject.education_level || 
                          undefined,
          subject_name: subject.name ?? subject.subject_name ?? 'Unknown Subject',
          subject_code: subject.code ?? subject.subject_code ?? '',
          subject_id: Number(assignment.subject_id || assignment.grade_subject_id || subject.subject_id || subject.id),
          grade_level_id: assignment.grade_level_id || subject.grade_level_id || null,
          section_id: assignment.section_id || subject.section_id || null,
          classroom_id: assignment.classroom_id || subject.classroom_id || null,
          student_count: assignment.student_count || subject.student_count || 0,
          periods_per_week: assignment.periods_per_week || subject.periods_per_week || 0,
          teacher: assignment.teacher || subject.teacher || null,
          grade_level: assignment.grade_level || subject.grade_level || null,
          section: assignment.section || subject.section || null,
          academic_year: assignment.academic_year || subject.academic_year || null,
          is_primary_teacher: assignment.is_primary_teacher ?? subject.is_primary_teacher ?? false,
        }));
      });
      
      setTeacherAssignments(assignments as TeacherAssignment[]);
      debugLog += `Created ${assignments.length} assignment entries\n`;
      
      console.log('📋 All assignments with subject IDs:', assignments.map(a => ({
        classroom: a.classroom_name,
        classroom_id: a.classroom_id,
        subject: a.subject_name,
        subject_id: a.subject_id,
        education_level: a.education_level
      })));

      const gradeSubjectIds = Array.from(
        new Set(
          assignments
            .map(a => Number(a.subject_id))
            .filter(id => !isNaN(id) && id > 0)
        )
      );
      
      console.log('🎯 Unique subject IDs to query:', gradeSubjectIds);
      debugLog += `Unique subject IDs: ${gradeSubjectIds.join(', ')}\n`;

      if (gradeSubjectIds.length === 0) {
        setResults([]);
        debugLog += 'No subject IDs found\n';
        console.warn('⚠️ No subject IDs found for teacher');
        setDebugInfo(debugLog);
        return;
      }

      const subjectIdsByLevel: Record<EducationLevel, number[]> = {
        NURSERY: [],
        PRIMARY: [],
        JUNIOR_SECONDARY: [],
        SENIOR_SECONDARY: [],
      };

      assignments.forEach((assignment) => {
        if (!assignment.education_level || !assignment.subject_id) return;
        if (!subjectIdsByLevel[assignment.education_level].includes(Number(assignment.subject_id))) {
          subjectIdsByLevel[assignment.education_level].push(Number(assignment.subject_id));
        }
      });

      debugLog += `Subjects grouped by level:\n${JSON.stringify(subjectIdsByLevel, null, 2)}\n`;
      console.log('📊 Subjects grouped by education level:', subjectIdsByLevel);

      const levelEndpoints: Record<EducationLevel, (params?: ResultQueryParams) => Promise<any[]>> = {
        NURSERY: (params) => ResultService.getNurseryResults(params),
        PRIMARY: (params) => ResultService.getPrimaryResults(params),
        JUNIOR_SECONDARY: (params) => ResultService.getJuniorSecondaryResults(params),
        SENIOR_SECONDARY: (params) => ResultService.getSeniorSecondaryResults(params),
      };

      const assignmentsBySubject = new Map<number, ExtendedAssignment[]>();
      const teacherClassroomIdsBySubject = new Map<number, Set<number>>();
      const teacherClassroomNamesBySubject = new Map<number, Set<string>>();

      assignments.forEach((assignment) => {
        if (!assignment.subject_id) return;
        const subjectId = Number(assignment.subject_id);
        
        if (!assignmentsBySubject.has(subjectId)) {
          assignmentsBySubject.set(subjectId, []);
        }
        assignmentsBySubject.get(subjectId)!.push(assignment);
        
        if (!teacherClassroomIdsBySubject.has(subjectId)) {
          teacherClassroomIdsBySubject.set(subjectId, new Set());
        }
        if (assignment.classroom_id) {
          teacherClassroomIdsBySubject.get(subjectId)!.add(Number(assignment.classroom_id));
        }
        
        if (!teacherClassroomNamesBySubject.has(subjectId)) {
          teacherClassroomNamesBySubject.set(subjectId, new Set());
        }
        if (assignment.classroom_name) {
          teacherClassroomNamesBySubject.get(subjectId)!.add(assignment.classroom_name.trim());
        }
      });

      console.log('🏫 Teacher classroom names by subject:', 
        Array.from(teacherClassroomNamesBySubject.entries()).map(([subjectId, names]) => ({
          subjectId,
          classroomNames: Array.from(names)
        }))
      );

      const resultPromises = Object.entries(subjectIdsByLevel)
        .filter(([_, ids]) => ids.length > 0)
        .flatMap(([level, ids]) =>
          ids.map((subjectId) => {
            const subjectAssignments = assignmentsBySubject.get(subjectId) || [];
            
            debugLog += `Querying ${level} | subject=${subjectId} | classes=${subjectAssignments.length}\n`;
            console.log(`🔎 Fetching ${level} results for subject:`, subjectId, 
              'in classrooms:', subjectAssignments.map((a: ExtendedAssignment) => a.classroom_name));

            return levelEndpoints[level as EducationLevel]!({
              subject: String(subjectId),
            }).then(results => ({
              results,
              subjectId,
              classrooms: subjectAssignments,
              classroomIds: Array.from(teacherClassroomIdsBySubject.get(subjectId) || []),
              classroomNames: Array.from(teacherClassroomNamesBySubject.get(subjectId) || []),
              educationLevel: level as EducationLevel
            }));
          })
        );

      const resultsArray = await Promise.allSettled(resultPromises);

      const allResults: any[] = [];
      resultsArray.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          const { results, subjectId, classrooms, classroomIds, classroomNames, educationLevel } = res.value;
          
          const teacherClassroomIds = new Set(classroomIds.map((id: number) => Number(id)));
          const teacherClassroomNamesSet = new Set(classroomNames.map((name: string) => name.trim()));
          
          console.log(`🔍 Filtering results for subject ${subjectId} (${educationLevel}):`, {
            totalResults: results.length,
            teacherClassroomIds: Array.from(teacherClassroomIds),
            teacherClassroomNames: Array.from(teacherClassroomNamesSet),
            classroomAssignments: classrooms.map((a: ExtendedAssignment) => ({
              classroom_name: a.classroom_name,
              classroom_id: a.classroom_id,
              education_level: a.education_level
            })),
            educationLevel
          });
          
          if (results.length > 0) {
            const firstResult = results[0];
            console.log(`🔬 Sample result structure for subject ${subjectId}:`, {
              resultKeys: Object.keys(firstResult),
              hasClassroomId: 'classroom_id' in firstResult,
              resultClassroomId: firstResult.classroom_id,
              hasStudent: 'student' in firstResult,
              studentKeys: firstResult.student ? Object.keys(firstResult.student) : [],
              studentClass: firstResult.student?.student_class,
              studentClassDisplay: firstResult.student?.student_class_display,
              fullSample: firstResult
            });
          }
          
          // 🔥 NEW STRATEGY: For secondary levels, trust API filtering
          const isSecondaryLevel = educationLevel === 'JUNIOR_SECONDARY' || educationLevel === 'SENIOR_SECONDARY';
          
          let filteredResults: any[];
          
          if (isSecondaryLevel) {
            console.log(`🎓 Secondary level detected for subject ${subjectId}, using lenient filtering`);
            
            // For secondary: Trust API subject filtering, only do basic validation
            filteredResults = results.filter((result: any) => {
              return result.student && result.student.id;
            });
            
            console.log(`✅ Secondary: Accepted ${filteredResults.length} of ${results.length} results for subject ${subjectId}`);
          } else {
            // For primary/nursery: Use strict classroom filtering
            filteredResults = teacherClassroomNamesSet.size === 0 
              ? results
              : results.filter((result: any) => {
                  const resultClassroomName = (
                    result.student?.student_class_display || 
                    result.student?.student_class || 
                    result.classroom_name ||
                    ''
                  ).trim();
                  
                  const resultClassroomId = Number(
                    result.classroom_id || 
                    result.student?.classroom_id ||
                    result.student?.current_classroom_id ||
                    0
                  );
                  
                  // Match by classroom ID first
                  if (teacherClassroomIds.size > 0 && resultClassroomId > 0) {
                    const matchesById = teacherClassroomIds.has(resultClassroomId);
                    if (matchesById) {
                      return true;
                    }
                  }
                  
                  if (!resultClassroomName) {
                    return true;
                  }
                  
                  let matchesByName = teacherClassroomNamesSet.has(resultClassroomName);
                  if (matchesByName) {
                    return true;
                  }
                  
                  // Flexible matching
                  for (const teacherClassName of Array.from(teacherClassroomNamesSet)) {
                    if (teacherClassName.startsWith(resultClassroomName + ' ') || 
                        teacherClassName === resultClassroomName) {
                      return true;
                    }
                    
                    const teacherClassBase = teacherClassName.split(' ').slice(0, -1).join(' ');
                    if (teacherClassBase && resultClassroomName.startsWith(teacherClassBase)) {
                      return true;
                    }
                  }
                  
                  return false;
                });
            
            console.log(`✅ Primary/Nursery: Filtered from ${results.length} to ${filteredResults.length} results for subject ${subjectId}`);
          }
          
          allResults.push(...filteredResults);
          debugLog += `✅ Query ${i} returned ${results.length} results (${filteredResults.length} for teacher's classes)\n`;
        } else {
          console.error(`❌ Query ${i} failed:`, res.reason);
          debugLog += `❌ Query ${i} failed: ${res.reason?.message || res.reason}\n`;
        }
      });

      debugLog += `Total raw results: ${allResults.length}\n`;
      console.log('📊 All raw results:', allResults);
    
      const normalized: StudentResult[] = allResults.map((r: any): StudentResult => {
        const studentId = (r.student && r.student.id) || r.student || r.student_id;
        const subjectId = (r.subject && r.subject.id) || r.subject || r.subject_id;
        const examSessionId = (r.exam_session && r.exam_session.id) || r.exam_session || r.exam_session_id || r.session_id;

        const educationLevel = (r.education_level || r.student?.education_level) as EducationLevel;
        
        let ca_score = 0;
        let exam_score = 0;
        let total_score = 0;
        
        if (educationLevel === 'NURSERY') {
          const markObtained = Number(r.mark_obtained || 0);
          total_score = markObtained;
          ca_score = 0;
          exam_score = markObtained;
        } else {
          const caFromSenior = Number(r.first_test_score || 0) + Number(r.second_test_score || 0) + Number(r.third_test_score || 0);
          const caFromPrimary =
            r.ca_total !== undefined
              ? Number(r.ca_total)
              : Number(r.continuous_assessment_score || 0) +
                Number(r.take_home_test_score || 0) +
                Number(r.appearance_score || 0) +
                Number(r.practical_score || 0) +
                Number(r.project_score || 0) +
                Number(r.note_copying_score || 0);
          const caFromTotalField = r.total_ca_score !== undefined ? Number(r.total_ca_score) : undefined;
          ca_score = caFromTotalField ?? (caFromSenior > 0 ? caFromSenior : caFromPrimary || 0);
          exam_score = Number((r.exam_score ?? r.exam) ?? 0);
          total_score = Number((r.total_score ?? (ca_score + exam_score)) ?? 0);
        }

        const examSession = typeof r.exam_session === 'object' ? r.exam_session : null;
        
        const termDisplay = examSession?.term_display 
          || examSession?.term 
          || r.term_display 
          || r.term 
          || 'N/A';
        
        const examSessionName = examSession?.name 
          || r.exam_session_name 
          || r.session_name 
          || 'N/A';
        
        let academicSessionName = 'N/A';
        if (examSession?.academic_session_name) {
          academicSessionName = String(examSession.academic_session_name);
        } else if (typeof examSession?.academic_session === 'string') {
          academicSessionName = examSession.academic_session;
        } else if (typeof examSession?.academic_session === 'object' && examSession.academic_session?.name) {
          academicSessionName = String(examSession.academic_session.name);
        } else if (r.academic_session_name) {
          academicSessionName = String(r.academic_session_name);
        } else if (r.academic_session) {
          academicSessionName = typeof r.academic_session === 'string' 
            ? r.academic_session 
            : (r.academic_session?.name || 'N/A');
        }
        
        const safeNumberConvert = (value: any): number => {
          if (value === null || value === undefined || value === '') return 0;
          const num = Number(value);
          return isNaN(num) ? 0 : num;
        };
        
        return {
          id: safeNumberConvert(r.id),
          student: {
            id: safeNumberConvert(studentId),
            full_name: r.student?.full_name ?? r.student_name ?? r.student_full_name ?? 'Unknown Student',
            registration_number: r.student?.username ?? r.registration_number ?? r.student_registration_number ?? '',
            profile_picture: r.student?.profile_picture ?? r.student_profile_picture ?? null,
            education_level: educationLevel,
          },
          subject: {
            id: safeNumberConvert(subjectId),
            name: r.subject?.name ?? r.subject_name ?? 'Unknown Subject',
            code: r.subject?.code ?? r.subject_code ?? '',
          },
          exam_session: {
            id: safeNumberConvert(examSessionId),
            name: examSessionName,
            term: termDisplay,
            academic_session: academicSessionName,
          },
          academic_session: (() => {
            const raw = r.academic_session && typeof r.academic_session === 'object' ? r.academic_session : null;
            return {
              id: String(raw?.id ?? examSession?.academic_session ?? 0),
              name: raw?.name || academicSessionName,
              start_date: raw?.start_date ?? '',
              end_date: raw?.end_date ?? '',
              is_current: raw?.is_current ?? false,
              is_active: raw?.is_active ?? false,
              created_at: raw?.created_at ?? '',
              updated_at: raw?.updated_at ?? ''
            } as AcademicSession;
          })(),
          first_test_score: Number(r.first_test_score || 0),
          second_test_score: Number(r.second_test_score || 0),
          third_test_score: Number(r.third_test_score || 0),
          continuous_assessment_score: Number(r.continuous_assessment_score || 0),
          take_home_test_score: Number(r.take_home_test_score || 0),
          appearance_score: Number(r.appearance_score || 0),
          practical_score: Number(r.practical_score || 0),
          project_score: Number(r.project_score || 0),
          note_copying_score: Number(r.note_copying_score || 0),
          ca_score,
          ca_total: ca_score,
          exam_score,
          total_score,
          education_level: educationLevel,
          grade: r.grade ?? r.letter_grade,
          status: (typeof r.status === 'string' ? r.status.toUpperCase() : 'DRAFT') as ResultStatus,
          remarks: r.remarks ?? '',
          created_at: r.created_at ?? '',
          updated_at: r.updated_at ?? '',
        };
      });

      debugLog += `Normalized results: ${normalized.length}\n`;
      console.log('🔄 Normalized results:', normalized);

      const subjectIdSet = new Set(gradeSubjectIds);
      console.log('🎯 Subject ID Set for filtering:', Array.from(subjectIdSet));
      
      const filtered = normalized.filter((item) => {
        const itemSubjectId = Number(item.subject.id);
        return subjectIdSet.has(itemSubjectId);
      });
      
      debugLog += `Filtered results (matching teacher subjects): ${filtered.length}\n`;
      console.log('✅ Final filtered results:', filtered);
      
      if (filtered.length === 0 && normalized.length > 0) {
        console.warn('⚠️ No results matched teacher subjects after filtering.');
        console.warn('Teacher subject IDs:', Array.from(subjectIdSet));
        console.warn('Result subject IDs:', [...new Set(normalized.map(r => r.subject.id))]);
      }
      
      setResults(filtered);
      setDebugInfo(debugLog);
      console.log('📝 Full Debug Log:\n', debugLog);
      console.log('🎉 FINAL RESULTS SET:', {
        totalResults: filtered.length,
        byEducationLevel: {
          NURSERY: filtered.filter(r => r.education_level === 'NURSERY').length,
          PRIMARY: filtered.filter(r => r.education_level === 'PRIMARY').length,
          JUNIOR_SECONDARY: filtered.filter(r => r.education_level === 'JUNIOR_SECONDARY').length,
          SENIOR_SECONDARY: filtered.filter(r => r.education_level === 'SENIOR_SECONDARY').length,
        },
        sampleResults: filtered.slice(0, 3).map(r => ({
          id: r.id,
          student: r.student.full_name,
          subject: r.subject.name,
          education_level: r.education_level,
          total_score: r.total_score
        }))
      });
      
    } catch (err) {
      console.error('❌ Error loading teacher data:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMsg);
      setDebugInfo(prev => prev + `\nERROR: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }

  const { 
    handleEditResult, 
    handleViewResult, 
    handleDeleteResult, 
    ResultModalsComponent,
  } = useResultActionsManager(loadTeacherData);

  useEffect(() => {
    if (user && !authLoading) {
      void loadTeacherData();
    }
  }, [user, authLoading]);

  const availableEducationLevels = useMemo(
    () => Array.from(new Set(results.map((r) => r.education_level))).filter(Boolean) as EducationLevel[],
    [results]
  );

  const availableSubjects = useMemo(
    () =>
      teacherAssignments.map((assignment) => ({
        id: String(assignment.subject_id),
        name: String(assignment.subject_name || 'Unknown'),
        code: String(assignment.subject_code || ''),
      })),
    [teacherAssignments]
  );

  const filteredResults = useMemo(() => {
    const term = (searchTerm || '').toLowerCase();
    return results.filter((result) => {
      const matchesSearch =
        (result.student?.full_name || '').toLowerCase().includes(term) ||
        (result.student?.registration_number || '').toLowerCase().includes(term) ||
        (result.subject?.name || '').toLowerCase().includes(term);

      const matchesSubject = filterSubject === 'all' || String(result.subject?.id ?? '') === filterSubject;
      const matchesStatus =
        filterStatus === 'all' || (String(result.status || '').toLowerCase() === filterStatus.toLowerCase());
      const matchesEducationLevel =
        filterEducationLevel === 'all' || result.education_level === filterEducationLevel;

      return matchesSearch && matchesSubject && matchesStatus && matchesEducationLevel;
    });
  }, [results, searchTerm, filterSubject, filterStatus, filterEducationLevel]);

  const stats = useMemo(() => {
    console.log('📊 Calculating stats from results:', results.length);
    console.log('📊 Results breakdown by education level:', {
      NURSERY: results.filter(r => r.education_level === 'NURSERY').length,
      PRIMARY: results.filter(r => r.education_level === 'PRIMARY').length,
      JUNIOR_SECONDARY: results.filter(r => r.education_level === 'JUNIOR_SECONDARY').length,
      SENIOR_SECONDARY: results.filter(r => r.education_level === 'SENIOR_SECONDARY').length,
    });
    
    const totalResults = results.length;
    const publishedCount = results.filter(r => r.status === 'PUBLISHED').length;
    
    const validScores = results.filter(r => r.total_score > 0);
    const averageScore = validScores.length > 0 
      ? Math.round(validScores.reduce((acc, r) => acc + r.total_score, 0) / validScores.length)
      : 0;
    
    const aGradesCount = results.filter(r => r.grade === 'A' || r.grade === 'A+').length;
    
    console.log('📊 Final stats:', {
      total: totalResults,
      published: publishedCount,
      average: averageScore,
      aGrades: aGradesCount
    });
    
    return [
      { label: 'Total', value: totalResults, icon: FileText, color: 'bg-blue-500' },
      { label: 'Published', value: publishedCount, icon: CheckCircle, color: 'bg-green-500' },
      { label: 'Average', value: averageScore, icon: TrendingUp, color: 'bg-purple-500' },
      { label: 'A Grades', value: aGradesCount, icon: Award, color: 'bg-amber-500' }
    ];
  }, [results]);

  const handleCreateResult = () => {
    setActiveTab('record');
  };

  const handleResultSuccess = async (): Promise<void> => {
    try {
      await loadTeacherData();
      setActiveTab('results');
      toast.success('Result saved successfully');
    } catch (error) {
      console.error('Error handling result success:', error);
      toast.error('Failed to reload data');
    }
  };

  const getStatusColor = (status: ResultStatus) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-amber-100 text-amber-700 border-amber-200',
      PUBLISHED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      APPROVED: 'bg-blue-100 text-blue-700 border-blue-200',
      ARCHIVED: 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return colors[status] || colors.DRAFT;
  };

  const getGradeColor = (grade?: string) => {
    const colors: Record<string, string> = {
      A: 'bg-green-500 text-white',
      B: 'bg-blue-500 text-white',
      C: 'bg-yellow-500 text-white',
      D: 'bg-orange-500 text-white',
      F: 'bg-red-500 text-white'
    };
    return colors[grade || ''] || 'bg-gray-400 text-white';
  };

  if (loading) {
    return (
      <TeacherDashboardLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div>
            <p className="text-sm md:text-base text-gray-600 font-medium">Loading Results...</p>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  if (error) {
    return (
      <TeacherDashboardLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 md:p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-red-600 flex-shrink-0" />
                <h3 className="text-base md:text-lg font-semibold text-red-900">Error Loading Data</h3>
              </div>
              <p className="text-sm text-red-800 mb-4">{error}</p>
              <button 
                onClick={loadTeacherData}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  if (activeTab === 'record') {
    return (
      <TeacherDashboardLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-3 md:p-6">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="text-lg md:text-xl font-bold text-gray-900">Record Result</h2>
                <button 
                  onClick={() => setActiveTab('results')}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" /> Close
                </button>
              </div>
              <ResultCreateTab
                onResultCreated={loadTeacherData}
                onSuccess={handleResultSuccess}
                onClose={() => setActiveTab('results')}
              />
            </div>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  return (
    <TeacherDashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        {/* Compact Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 md:px-6 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base md:text-lg font-bold text-gray-900 truncate">Results</h1>
                  <p className="text-xs text-gray-500 hidden sm:block">Manage performance</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button 
                  onClick={loadTeacherData}
                  disabled={loading}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button 
                  onClick={handleCreateResult}
                  className="px-3 md:px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all flex items-center gap-1.5 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Record</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4 space-y-3 md:space-y-4">
          {/* Compact Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
            {stats.map((stat, idx) => (
              <div key={idx} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600 mb-0.5 truncate">{stat.label}</p>
                    <p className="text-xl md:text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className={`w-8 h-8 md:w-10 md:h-10 ${stat.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <stat.icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Compact Search and Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm flex items-center gap-1.5"
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Filters</span>
                  {(filterSubject !== 'all' || filterStatus !== 'all' || filterEducationLevel !== 'all') && (
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  )}
                </button>
                {/* View Mode Toggle - Hidden on Mobile */}
                <div className="hidden md:flex border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-2 ${viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'} transition-colors`}
                    title="Table View"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('card')}
                    className={`p-2 ${viewMode === 'card' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'} transition-colors border-l border-gray-200`}
                    title="Card View"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showFilters && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                  <select
                    value={String(filterEducationLevel)}
                    onChange={(e) => setFilterEducationLevel(e.target.value as EducationLevel | 'all')}
                    className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  >
                    <option value="all">All Levels</option>
                    {availableEducationLevels.map((level) => (
                      <option key={String(level)} value={String(level)}>
                        {String(level).replace(/_/g, ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  >
                    <option value="all">All Subjects</option>
                    {availableSubjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="approved">Approved</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Results Display - Card View on Mobile, Toggle on Desktop */}
          {(viewMode === 'card' || isMobile) ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs md:text-sm text-gray-600">
                  {filteredResults.length} of {results.length} results
                </p>
              </div>
              
              {filteredResults.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredResults.map((result) => (
                    <div key={result.id} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                      {/* Card Header */}
                      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 border-b border-gray-100">
                        <div className="flex items-start gap-2">
                          {result.student.profile_picture ? (
                            <img 
                              src={result.student.profile_picture} 
                              alt={result.student.full_name} 
                              className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0" 
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold flex-shrink-0 text-sm">
                              {result.student.full_name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-gray-900 truncate">{String(result.student?.full_name || 'Unknown')}</h3>
                            <p className="text-xs text-gray-500 truncate">{String(result.student?.registration_number || 'N/A')}</p>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(result.status ?? 'DRAFT')} flex-shrink-0`}>
                            {result.status ?? 'DRAFT'}
                          </span>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">Subject:</span>
                          <span className="font-medium text-gray-900 truncate ml-2">{String(result.subject?.name || 'N/A')}</span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">
                            {String(result.exam_session?.term || 'N/A')} - {String(result.exam_session?.academic_session || 'N/A')}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                          <div className="text-center">
                            <p className="text-xs text-gray-500 mb-1">CA</p>
                            <div className="bg-blue-50 rounded-lg py-1.5">
                              <p className="text-base font-bold text-blue-900">{result.ca_score}</p>
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500 mb-1">Exam</p>
                            <div className="bg-purple-50 rounded-lg py-1.5">
                              <p className="text-base font-bold text-purple-900">{result.exam_score}</p>
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500 mb-1">Total</p>
                            <div className="bg-green-50 rounded-lg py-1.5">
                              <p className="text-base font-bold text-green-900">{result.total_score}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Grade:</span>
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${getGradeColor(result.grade)}`}>
                              {result.grade ?? '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => handleViewResult(result)} 
                              className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" 
                              title="View"
                            >
                              <Eye className="w-4 h-4 text-gray-600" />
                            </button>
                            <button 
                              onClick={() => handleEditResult(result)} 
                              className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors" 
                              title="Edit"
                            >
                              <Edit className="w-4 h-4 text-gray-600" />
                            </button>
                            <button 
                              onClick={() => handleDeleteResult(result)} 
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" 
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-gray-600" />
                            </button>
                            
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-lg p-8 md:p-12 text-center">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
                    <FileText className="w-6 h-6 md:w-8 md:h-8 text-gray-400" />
                  </div>
                  <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2">No results found</h3>
                  <p className="text-sm text-gray-500 mb-4 md:mb-6">
                    {searchTerm || filterSubject !== 'all' || filterStatus !== 'all' || filterEducationLevel !== 'all'
                      ? 'Try adjusting your filters' 
                      : 'Start by recording your first result'}
                  </p>
                  <button 
                    onClick={handleCreateResult} 
                    className="px-4 md:px-6 py-2 md:py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all inline-flex items-center gap-2 font-medium text-sm"
                  >
                    <Plus className="w-4 h-4" /> Record First Result
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-3 md:p-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base md:text-lg font-semibold text-gray-900">Student Results</h2>
                    <p className="text-xs md:text-sm text-gray-500">{filteredResults.length} of {results.length} results</p>
                  </div>
                </div>
              </div>

              {filteredResults.length > 0 ? (
                <div className="overflow-x-auto">
                  <div style={{ minWidth: '1200px' }}>
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '200px' }}>
                            Student
                          </th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '160px' }}>
                            Subject
                          </th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '180px' }}>
                            Session
                          </th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-blue-800 uppercase tracking-wider bg-blue-50 whitespace-nowrap" style={{ minWidth: '90px' }}>
                            CA
                          </th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-purple-800 uppercase tracking-wider bg-purple-50 whitespace-nowrap" style={{ minWidth: '90px' }}>
                            Exam
                          </th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-green-800 uppercase tracking-wider bg-green-50 whitespace-nowrap" style={{ minWidth: '90px' }}>
                            Total
                          </th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '80px' }}>
                            Grade
                          </th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '120px' }}>
                            Status
                          </th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '140px' }}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {filteredResults.map((result, index) => (
                          <tr key={result.id} className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ minWidth: '200px' }}>
                              <div className="flex items-center gap-2">
                                {result.student.profile_picture ? (
                                  <img 
                                    src={result.student.profile_picture} 
                                    alt={result.student.full_name} 
                                    className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 flex-shrink-0" 
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold flex-shrink-0 text-xs">
                                    {result.student?.full_name?.charAt(0) || '?'}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-900 text-xs truncate">{String(result.student?.full_name || 'Unknown')}</p>
                                  <p className="text-xs text-gray-500 truncate">{String(result.student?.registration_number || 'N/A')}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ minWidth: '160px' }}>
                              <p className="font-medium text-gray-900 text-xs truncate">{String(result.subject?.name || 'N/A')}</p>
                              <p className="text-xs text-gray-500">{String(result.subject?.code || '')}</p>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ minWidth: '180px' }}>
                              <p className="text-xs text-gray-900 truncate">{String(result.exam_session?.term || 'N/A')}</p>
                              <p className="text-xs text-gray-500 truncate">{String(result.exam_session?.academic_session || 'N/A')}</p>
                            </td>
                            <td className="px-3 py-2.5 text-center bg-blue-50/50 whitespace-nowrap" style={{ minWidth: '90px' }}>
                              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-blue-100 text-blue-900 font-bold text-xs">
                                {result.ca_score}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center bg-purple-50/50 whitespace-nowrap" style={{ minWidth: '90px' }}>
                              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-purple-100 text-purple-900 font-bold text-xs">
                                {result.exam_score}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center bg-green-50/50 whitespace-nowrap" style={{ minWidth: '90px' }}>
                              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-green-100 text-green-900 font-bold text-xs">
                                {result.total_score}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap" style={{ minWidth: '80px' }}>
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-xs ${getGradeColor(result.grade)}`}>
                                {result.grade ?? '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap" style={{ minWidth: '120px' }}>
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(result.status ?? 'DRAFT')}`}>
                                {result.status ?? 'DRAFT'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap" style={{ minWidth: '140px' }}>
                              <div className="flex items-center justify-center gap-1">
                                <button 
                                  onClick={() => handleViewResult(result)} 
                                  className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" 
                                  title="View"
                                >
                                  <Eye className="w-4 h-4 text-gray-600" />
                                </button>
                                <button 
                                  onClick={() => handleEditResult(result)} 
                                  className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors" 
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4 text-gray-600" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteResult(result)} 
                                  className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" 
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4 text-gray-600" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 md:p-12 text-center">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
                    <FileText className="w-6 h-6 md:w-8 md:h-8 text-gray-400" />
                  </div>
                  <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2">No results found</h3>
                  <p className="text-sm text-gray-500 mb-4 md:mb-6">
                    {searchTerm || filterSubject !== 'all' || filterStatus !== 'all' || filterEducationLevel !== 'all'
                      ? 'Try adjusting your filters' 
                      : 'Start by recording your first result'}
                  </p>
                  <button 
                    onClick={handleCreateResult} 
                    className="px-4 md:px-6 py-2 md:py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all inline-flex items-center gap-2 font-medium text-sm"
                  >
                    <Plus className="w-4 h-4" /> Record First Result
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <ResultModalsComponent />
      </div>
    </TeacherDashboardLayout>
  );
};

export default TeacherResults;