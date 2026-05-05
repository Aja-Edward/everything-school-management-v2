import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
 
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import { ExamService, Exam } from '@/services/ExamService';
import { toast } from 'react-toastify';
import ExamCreationForm from '@/components/dashboards/teacher/ExamCreationForm';
import TestCreationForm from '@/components/dashboards/teacher/TestCreationForm';
import { normalizeExamDataForDisplay } from '@/utils/examDataNormalizer';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  Calendar, 
  Clock, 
  BookOpen, 
  Users, 
  CheckSquare,
  CheckCircle,
  Award,
  AlertCircle,
  RefreshCw,
  Search,
  X,
  GraduationCap,
  Target,
  Clock3,
  Filter,
  ChevronDown
} from 'lucide-react';

interface TeacherExamData {
  id: number;
  title: string;
  code: string;
  subject_name: string;
  grade_level_name: string;
  section_name?: string;
  exam_type: string;
  exam_type_display: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  total_marks: number;
  status: string;
  status_display: string;
  student_count?: number;
  created_at: string;
  updated_at: string;
}

const TeacherExams: React.FC = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  
  const [exams, setExams] = useState<TeacherExamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [editingTest, setEditingTest] = useState<Exam | null>(null);
  const [selectedExam, setSelectedExam] = useState<TeacherExamData | null>(null);
  const [selectedExamDetail, setSelectedExamDetail] = useState<Exam | null>(null);
  const [activeTab, setActiveTab] = useState<'exams' | 'tests'>('exams');
  const [showFilters, setShowFilters] = useState(false);

  // Load teacher data and exams
  useEffect(() => {
    if (user && !isLoading) {
      loadTeacherData();
    }
  }, [user, isLoading]);

  
const loadTeacherData = async () => {
  try {
    setLoading(true);
    setError(null);

    const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
    
    if (!teacherId) {
      throw new Error('Teacher ID not found');
    }

    const [assignmentsResponse, examsResponse] = await Promise.all([
      TeacherDashboardService.getTeacherClasses(teacherId),
      ExamService.getExamsByTeacher(teacherId)
    ]);

    const assignments = assignmentsResponse || [];
    let examsData = examsResponse || [];

    const subjectIds = Array.from(new Set(
      (assignments || []).map((a: any) => a.subject_id).filter((id: any) => !!id)
    ));

    if (subjectIds.length > 0) {
      try {
        const bySubjectLists = await Promise.all(
          subjectIds.map((sid: number) => ExamService.getExamsBySubject(sid))
        );
        const bySubject = bySubjectLists.flat();
        
        const examMap = new Map();
        [...examsData, ...bySubject].forEach((e: any) => {
          if (e && e.id) {
            examMap.set(e.id, e);
          }
        });
        examsData = Array.from(examMap.values());
      } catch (e) {
        console.warn('Fallback by subject failed:', e);
      }
    }

    const validExamsData = examsData.filter((exam: any) => {
      return exam && exam.id && exam.id > 0 && exam.title && exam.exam_type;
    });
    
    const transformedExams: TeacherExamData[] = validExamsData.map((exam: any) => {
      // exam_type and status come from the API as nested objects {id, code, name, ...}
      const examTypeCode = exam.exam_type?.code ?? (typeof exam.exam_type === 'string' ? exam.exam_type : '');
      const examTypeName = exam.exam_type?.name ?? exam.exam_type_display ?? examTypeCode;
      const statusCode   = exam.status?.code   ?? (typeof exam.status   === 'string' ? exam.status   : 'scheduled');
      const statusName   = exam.status?.name   ?? exam.status_display   ?? statusCode;

      return {
        id: exam.id,
        title: exam.title,
        code: exam.code || `EX-${exam.id}`,
        subject_name: exam.subject_name || exam.subject?.name || 'Unknown Subject',
        grade_level_name: exam.grade_level_name || exam.grade_level?.name || 'Unknown Class',
        section_name: exam.section_name || exam.section?.name,
        exam_type: examTypeCode,
        exam_type_display: examTypeName,
        exam_date: exam.exam_date || '',
        start_time: exam.start_time || '',
        end_time: exam.end_time || '',
        duration_minutes: exam.duration_minutes || 0,
        total_marks: exam.total_marks || 0,
        status: statusCode,
        status_display: statusName,
        student_count: exam.student_count || 0,
        created_at: exam.created_at,
        updated_at: exam.updated_at || exam.created_at,
      };
    });

    setExams(transformedExams);

  } catch (error) {
    console.error('Error loading teacher data:', error);
    setError(error instanceof Error ? error.message : 'Failed to load teacher data');
    toast.error('Failed to load teacher data. Please try again.');
  } finally {
    setLoading(false);
  }
};

  const handleRefresh = async () => {
    await loadTeacherData();
    toast.success('Data refreshed successfully!');
  };

  const handleCreateExam = () => {
    setShowCreateModal(true);
    setEditingExam(null);
  };

  const handleCreateTest = () => {
    setShowTestModal(true);
    setEditingTest(null);
  };

  const handleEditExam = async (exam: TeacherExamData) => {
    try {
      const full = await ExamService.getExam(exam.id);
      setEditingExam(full);
      setShowCreateModal(true);
    } catch (e) {
      console.error('Error loading exam for editing:', e);
      
      const is404Error = e instanceof Error && (
        e.message.includes('404') || 
        e.message.includes('Not Found') ||
        e.message.includes('No Exam matches')
      );
      
      if (is404Error) {
        toast.info('This exam no longer exists. Removing from list...');
        setExams(prevExams => prevExams.filter(e => e.id !== exam.id));
        await loadTeacherData();
      } else {
        setEditingExam(null);
        setShowCreateModal(true);
        toast.warning('Exam not found in database. Opened form to correct and re-save.');
      }
    }
  };

  const handleEditTest = async (exam: TeacherExamData) => {
    try {
      const full = await ExamService.getExam(exam.id);
      setEditingTest(full);
      setShowTestModal(true);
    } catch (e) {
      console.error('Error loading test for editing:', e);
      
      const is404Error = e instanceof Error && (
        e.message.includes('404') || 
        e.message.includes('Not Found') ||
        e.message.includes('No Exam matches')
      );
      
      if (is404Error) {
        toast.info('This test no longer exists. Removing from list...');
        setExams(prevExams => prevExams.filter(e => e.id !== exam.id));
        await loadTeacherData();
      } else {
        toast.error('Failed to load test details');
      }
    }
  };

  const handleSubmitForApproval = async (examId: number) => {
    if (window.confirm('Are you sure you want to submit this exam for approval? You won\'t be able to edit it until it\'s approved or rejected.')) {
      try {
        await ExamService.submitForApproval(examId);
        toast.success('Exam submitted for approval successfully!');
        await loadTeacherData();
      } catch (error) {
        console.error('Error submitting exam for approval:', error);
        toast.error('Failed to submit exam for approval. Please try again.');
      }
    }
  };



const handleDeleteExam = async (examId: number) => {
  const examToDelete = exams.find(e => e.id === examId);
  if (!examToDelete) {
    return;
  }
  
  if (!window.confirm(`Are you sure you want to delete "${examToDelete.title}"?`)) {
    return;
  }
  
  try {
    // DELETE FROM API FIRST
    await ExamService.deleteExam(examId);
    
    // THEN remove from local state
    setExams(prevExams => prevExams.filter(e => e.id !== examId));
    toast.success('Exam deleted successfully!');
    
    // Optionally refresh to ensure sync
    await loadTeacherData();
  } catch (error) {
    console.error('Error deleting exam:', error);
    
    const is404Error = error instanceof Error && (
      error.message.includes('404') || 
      error.message.includes('Not Found') ||
      error.message.includes('No Exam matches')
    );
    
    if (is404Error) {
      // Exam already doesn't exist on server, remove from local state
      setExams(prevExams => prevExams.filter(e => e.id !== examId));
      toast.success('Exam removed successfully!');
      await loadTeacherData();
    } else {
      // Real error, show message but still refresh to sync
      toast.error('Failed to delete exam. Refreshing list...');
      await loadTeacherData();
    }
  }
};
  const handleViewExam = async (exam: TeacherExamData) => {
    try {
      const full = await ExamService.getExam(exam.id);
      const normalizedFull = normalizeExamDataForDisplay(full);
      setSelectedExam(exam);
      setSelectedExamDetail(normalizedFull);
    } catch (e) {
      console.error('Error loading exam details:', e);
      
      const is404Error = e instanceof Error && (
        e.message.includes('404') || 
        e.message.includes('Not Found') ||
        e.message.includes('No Exam matches')
      );
      
      if (is404Error) {
        toast.error('This exam no longer exists. Refreshing list...');
        setExams(prevExams => prevExams.filter(e => e.id !== exam.id));
        await loadTeacherData();
      } else {
        toast.error('Failed to load exam details. Please try again.');
      }
    }
  };

  const closeExamModal = () => {
    setShowCreateModal(false);
    setEditingExam(null);
  };

  const closeTestModal = () => {
    setShowTestModal(false);
    setEditingTest(null);
  };

  const closeViewModal = () => {
    setSelectedExam(null);
    setSelectedExamDetail(null);
  };

  const handleExamCreated = () => {
    loadTeacherData();
  };

  const handleTestCreated = () => {
    loadTeacherData();
  };

  // Filter exams based on current tab and filters
  const filteredExams = useMemo(() => {
    let filtered = exams;

    if (activeTab === 'exams') {
      filtered = filtered.filter(exam => 
        exam.exam_type === 'mid_term' || exam.exam_type === 'final_exam' || exam.exam_type === 'practical' || exam.exam_type === 'oral_exam'
      );
    } else {
      filtered = filtered.filter(exam => 
        exam.exam_type === 'test' || exam.exam_type === 'quiz'
      );
    }

    if (searchTerm) {
      filtered = filtered.filter(exam =>
        exam.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exam.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exam.grade_level_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterSubject !== 'all') {
      filtered = filtered.filter(exam => exam.subject_name === filterSubject);
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(exam => exam.exam_type === filterType);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(exam => exam.status === filterStatus);
    }

    return filtered;
  }, [exams, activeTab, searchTerm, filterSubject, filterType, filterStatus]);

  const uniqueSubjects = useMemo(() => {
    const subjects = Array.from(new Set(exams.map(exam => exam.subject_name)));
    return subjects.sort();
  }, [exams]);

  
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      scheduled: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: Calendar, text: 'Scheduled' },
      in_progress: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', icon: AlertCircle, text: 'In Progress' },
      completed: { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle, text: 'Completed' },
      cancelled: { color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', icon: X, text: 'Cancelled' },
      postponed: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', icon: Clock3, text: 'Postponed' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.scheduled;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3.5 h-3.5 mr-1.5" />
        {config.text}
      </span>
    );
  };

  const getTypeIcon = (type: string) => {
    const typeConfig = {
      test: { icon: Target, color: 'text-green-600 dark:text-green-400' },
      quiz: { icon: CheckSquare, color: 'text-purple-600 dark:text-purple-400' },
      mid_term: { icon: Calendar, color: 'text-indigo-600 dark:text-indigo-400' },
      final_exam: { icon: Award, color: 'text-red-600 dark:text-red-400' },
      practical: { icon: GraduationCap, color: 'text-blue-600 dark:text-blue-400' },
      oral_exam: { icon: Users, color: 'text-orange-600 dark:text-orange-400' }
    };

    const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.test;
    const Icon = config.icon;

    return <Icon className={`w-5 h-5 ${config.color}`} />;
  };

  if (isLoading) {
    return (
      <TeacherDashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  return (
    <TeacherDashboardLayout>
      <div className="space-y-4 sm:space-y-6 px-2 sm:px-4 lg:px-6 py-3 sm:py-4">
        {/* Header - Desktop and Mobile */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-3 lg:space-y-0">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">
              Exam & Test Management
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Create and manage exams, tests, and assessments
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="w-full lg:w-auto flex items-center justify-center space-x-2 px-4 py-2.5 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Summary Cards - Responsive Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col">
              <BookOpen className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-2" />
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Total Exams</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{exams.length}</p>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col">
              <Calendar className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-2" />
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Scheduled</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{exams.filter(e => e.status === 'scheduled').length}</p>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col">
              <AlertCircle className="w-8 h-8 text-yellow-600 dark:text-yellow-400 mb-2" />
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">In Progress</p>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{exams.filter(e => e.status === 'in_progress').length}</p>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400 mb-2" />
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Completed</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{exams.filter(e => e.status === 'completed').length}</p>
            </div>
          </div>
          
          <div className="col-span-2 sm:col-span-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col">
              <Target className="w-8 h-8 text-purple-600 dark:text-purple-400 mb-2" />
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tests/Quizzes</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{exams.filter(e => e.exam_type === 'test' || e.exam_type === 'quiz').length}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          <button
            onClick={() => setActiveTab('exams')}
            className={`flex-1 sm:flex-none px-6 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === 'exams'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <GraduationCap className="w-4 h-4" />
              <span>Exams</span>
              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                activeTab === 'exams' 
                  ? 'bg-blue-700 text-white' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}>
                {exams.filter(e => e.exam_type === 'mid_term' || e.exam_type === 'final_exam' || e.exam_type === 'practical' || e.exam_type === 'oral_exam').length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('tests')}
            className={`flex-1 sm:flex-none px-6 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === 'tests'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Target className="w-4 h-4" />
              <span>Tests & Quizzes</span>
              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                activeTab === 'tests' 
                  ? 'bg-blue-700 text-white' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}>
                {exams.filter(e => e.exam_type === 'test' || e.exam_type === 'quiz').length}
              </span>
            </div>
          </button>
        </div>

        {/* Action Bar - Desktop and Mobile */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="space-y-3">
            {/* Create Button */}
            {activeTab === 'exams' ? (
              <button
                onClick={handleCreateExam}
                className="w-full lg:w-auto flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
              >
                <Plus className="w-5 h-5" />
                <span>Create New Exam</span>
              </button>
            ) : (
              <button
                onClick={handleCreateTest}
                className="w-full lg:w-auto flex items-center justify-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-sm"
              >
                <Plus className="w-5 h-5" />
                <span>Create New Test/Quiz</span>
              </button>
            )}

            {/* Search and Filter Row */}
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by title, subject, or class..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                />
              </div>

              {/* Desktop Filters */}
              <div className="hidden lg:flex gap-3">
                <select
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white min-w-[180px]"
                >
                  <option value="all">All Subjects</option>
                  {uniqueSubjects.map(subject => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white min-w-[160px]"
                >
                  <option value="all">All Types</option>
                  <option value="test">Class Test</option>
                  <option value="quiz">Quiz</option>
                  <option value="mid_term">Mid-Term</option>
                  <option value="final_exam">Final Exam</option>
                  <option value="practical">Practical</option>
                  <option value="oral_exam">Oral Exam</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white min-w-[150px]"
                >
                  <option value="all">All Status</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="postponed">Postponed</option>
                </select>
              </div>

              {/* Mobile Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden flex items-center justify-center space-x-2 px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Mobile Filters - Collapsible */}
            {showFilters && (
              <div className="lg:hidden space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <select
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                >
                  <option value="all">All Subjects</option>
                  {uniqueSubjects.map(subject => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                >
                  <option value="all">All Types</option>
                  <option value="test">Class Test</option>
                  <option value="quiz">Quiz</option>
                  <option value="mid_term">Mid-Term</option>
                  <option value="final_exam">Final Exam</option>
                  <option value="practical">Practical</option>
                  <option value="oral_exam">Oral Exam</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                >
                  <option value="all">All Status</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="postponed">Postponed</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 dark:text-red-400 mb-4 text-lg font-medium">{error}</p>
            <button
              onClick={loadTeacherData}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Try Again
            </button>
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <BookOpen className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
              No {activeTab === 'exams' ? 'exams' : 'tests'} found
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {activeTab === 'exams' 
                ? 'Create your first exam to get started'
                : 'Create your first test or quiz to get started'
              }
            </p>
            {activeTab === 'exams' ? (
              <button
                onClick={handleCreateExam}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus className="w-5 h-5" />
                <span>Create New Exam</span>
              </button>
            ) : (
              <button
                onClick={handleCreateTest}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                <Plus className="w-5 h-5" />
                <span>Create New Test</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredExams.map((exam) => (
              <div
                key={exam.id}
                className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-600"
              >
                {/* Card Header */}
                <div className="flex items-start space-x-3 mb-4">
                  <div className="flex-shrink-0 mt-1">
                    {getTypeIcon(exam.exam_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1 line-clamp-2">
                      {exam.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {exam.code}
                    </p>
                  </div>
                </div>

                {/* Card Body */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-300">
                    <BookOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{exam.subject_name}</span>
                  </div>
                  
                  <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-300">
                    <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{exam.grade_level_name}</span>
                    {exam.section_name && (
                      <span className="text-slate-400">• {exam.section_name}</span>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(exam.status)}
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
                      <Clock className="w-4 h-4" />
                      <span>{exam.duration_minutes} min</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
                      <Target className="w-4 h-4" />
                      <span>{exam.total_marks} marks</span>
                    </div>
                  </div>
                  
                  {exam.exam_date && (
                    <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(exam.exam_date).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}</span>
                      {exam.start_time && (
                        <>
                          <span>•</span>
                          <Clock className="w-4 h-4" />
                          <span>{exam.start_time}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons - Always Visible */}
                <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => handleViewExam(exam)}
                    className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View</span>
                  </button>
                  
                  {(exam.status === 'scheduled' || exam.status === 'draft') && (
                    <button
                      onClick={() => activeTab === 'exams' ? handleEditExam(exam) : handleEditTest(exam)}
                      className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                  )}
                  
                  {(exam.status === 'completed' || exam.status === 'in_progress') && (
                    <button
                      onClick={() => navigate('/teacher/results')}
                      className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 text-sm text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
                    >
                      <Award className="w-4 h-4" />
                      <span>Results</span>
                    </button>
                  )}
                  
                  {exam.status === 'draft' && (
                    <button
                      onClick={() => handleSubmitForApproval(exam.id)}
                      className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-lg transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Submit</span>
                    </button>
                  )}
                  
                  {(exam.status === 'scheduled' || exam.status === 'draft') && (
                    <button
                      onClick={() => handleDeleteExam(exam.id)}
                      className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exam Creation Modal */}
      {showCreateModal && (
        <ExamCreationForm
          isOpen={showCreateModal}
          onClose={closeExamModal}
          onExamCreated={handleExamCreated}
          editingExam={editingExam}
          prefill={!editingExam && selectedExam ? {
            title: selectedExam.title,
            exam_type: selectedExam.exam_type,
            subject: 0,
            grade_level: 0,
          } : undefined}
        />
      )}

      {/* Test Creation Modal */}
      {showTestModal && (
        <TestCreationForm
          isOpen={showTestModal}
          onClose={closeTestModal}
          onTestCreated={handleTestCreated}
          editingTest={editingTest}
        />
      )}

      {/* Exam View Modal - Mobile Optimized */}
      {selectedExam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 z-10">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Exam Details
              </h2>
              <button
                onClick={closeViewModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Basic Information */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Title</label>
                    <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1">{selectedExam.title}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Code</label>
                    <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1 font-mono">{selectedExam.code}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Subject</label>
                    <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1">{selectedExam.subject_name}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Grade Level</label>
                    <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1">{selectedExam.grade_level_name}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</label>
                    <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1">{selectedExam.exam_type_display}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</label>
                    <div className="mt-1">{getStatusBadge(selectedExam.status)}</div>
                  </div>
                </div>
              </div>

              {/* Exam Details */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4">Exam Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Marks</label>
                    <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1 font-semibold">{selectedExam.total_marks}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Duration</label>
                    <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1">{selectedExam.duration_minutes} minutes</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Students</label>
                    <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1">{selectedExam.student_count || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Schedule */}
              {selectedExam.exam_date && (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                  <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4">Schedule</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</label>
                      <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1">
                        {new Date(selectedExam.exam_date).toLocaleDateString('en-US', { 
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Start Time</label>
                      <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1">{selectedExam.start_time || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">End Time</label>
                      <p className="text-sm sm:text-base text-slate-900 dark:text-white mt-1">{selectedExam.end_time || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Questions Preview */}
              {selectedExamDetail && (
                <div className="space-y-4">
                  {(selectedExamDetail.objective_questions || []).length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
                        <CheckSquare className="w-5 h-5 mr-2 text-blue-600" />
                        Objective Questions ({selectedExamDetail.objective_questions?.length || 0})
                      </h3>
                      <div className="space-y-4">
                        {selectedExamDetail.objective_questions!.map((q: any, i: number) => (
                          <div key={i} className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg">
                            <div className="font-medium text-slate-900 dark:text-white mb-3 flex items-start gap-2">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-semibold flex-shrink-0">
                                {i + 1}
                              </span>
                              <div dangerouslySetInnerHTML={{ __html: q.question }} />
                            </div>
                            {q.imageUrl && (
                              <img src={q.imageUrl} alt={q.imageAlt || 'question image'} className="max-h-48 object-contain mb-3 rounded border border-slate-200 dark:border-slate-600" />
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {q.optionA && <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded text-sm"><span className="font-semibold text-slate-600 dark:text-slate-400">A.</span> {q.optionA}</div>}
                              {q.optionB && <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded text-sm"><span className="font-semibold text-slate-600 dark:text-slate-400">B.</span> {q.optionB}</div>}
                              {q.optionC && <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded text-sm"><span className="font-semibold text-slate-600 dark:text-slate-400">C.</span> {q.optionC}</div>}
                              {q.optionD && <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded text-sm"><span className="font-semibold text-slate-600 dark:text-slate-400">D.</span> {q.optionD}</div>}
                              {q.optionE && <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded text-sm"><span className="font-semibold text-slate-600 dark:text-slate-400">E.</span> {q.optionE}</div>}
                            </div>
                            {q.correctAnswer && (
                              <div className="mt-2 text-xs text-green-600 dark:text-green-400 font-medium">
                                Correct: {q.correctAnswer}
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Marks: <span className="text-blue-600 dark:text-blue-400 font-semibold">{q.marks}</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedExamDetail.theory_questions || []).length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
                        <BookOpen className="w-5 h-5 mr-2 text-green-600" />
                        Theory Questions ({selectedExamDetail.theory_questions?.length})
                      </h3>
                      <div className="space-y-4">
                        {selectedExamDetail.theory_questions!.map((q: any, i: number) => (
                          <div key={i} className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg">
                            <div className="font-medium text-slate-900 dark:text-white mb-3 flex items-start gap-2">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-sm font-semibold flex-shrink-0">
                                {i + 1}
                              </span>
                              <div dangerouslySetInnerHTML={{ __html: q.question }} />
                            </div>
                            {q.imageUrl && (
                              <img src={q.imageUrl} alt={q.imageAlt || 'theory image'} className="max-h-48 object-contain mb-3 rounded border border-slate-200 dark:border-slate-600" />
                            )}
                            {q.table && typeof q.table === 'string' && q.table.includes('<table') && (
                              <div className="overflow-auto mb-3" dangerouslySetInnerHTML={{ __html: q.table }} />
                            )}
                            {(q.subQuestions || []).length > 0 && (
                              <div className="space-y-3 mt-3 pl-4 border-l-2 border-green-200 dark:border-green-800">
                                {q.subQuestions.map((sq: any, si: number) => (
                                  <div key={si}>
                                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-start gap-1">
                                      <span>{String.fromCharCode(97 + si)}.</span>
                                      <div dangerouslySetInnerHTML={{ __html: sq.question }} />
                                      <span className="ml-2 text-xs text-slate-500 flex-shrink-0">({sq.marks || 0} marks)</span>
                                    </div>
                                    {(sq.subSubQuestions || []).length > 0 && (
                                      <div className="pl-4 space-y-1">
                                        {sq.subSubQuestions.map((ssq: any, ssi: number) => (
                                          <div key={ssi} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-1">
                                            <span>{String.fromCharCode(105 + ssi)}.</span>
                                            <div dangerouslySetInnerHTML={{ __html: ssq.question }} />
                                            <span className="ml-2 text-xs text-slate-500 flex-shrink-0">({ssq.marks || 0} marks)</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Total Marks: <span className="text-green-600 dark:text-green-400 font-semibold">{q.marks}</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedExamDetail.practical_questions || []).length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
                        <GraduationCap className="w-5 h-5 mr-2 text-purple-600" />
                        Practical Questions ({selectedExamDetail.practical_questions?.length})
                      </h3>
                      <div className="space-y-4">
                        {selectedExamDetail.practical_questions!.map((q: any, i: number) => (
                          <div key={i} className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg">
                            <div className="font-medium text-slate-900 dark:text-white mb-2 flex items-start gap-2">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-sm font-semibold flex-shrink-0">
                                {i + 1}
                              </span>
                              <div dangerouslySetInnerHTML={{ __html: q.question || q.task || '' }} />
                            </div>
                            {q.expectedOutcome && (
                              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 italic">
                                Expected: {q.expectedOutcome}
                              </p>
                            )}
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Marks: <span className="text-purple-600 dark:text-purple-400 font-semibold">{q.marks}</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedExamDetail.custom_sections || []).length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
                        <GraduationCap className="w-5 h-5 mr-2 text-purple-600" />
                        Custom Sections ({selectedExamDetail.custom_sections?.length})
                      </h3>
                      <div className="space-y-4">
                        {selectedExamDetail.custom_sections!.map((s: any, si: number) => (
                          <div key={s.id || si} className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg">
                            <div className="font-semibold text-slate-900 dark:text-white mb-2">{s.name}</div>
                            {s.instructions && (
                              <div className="text-sm text-slate-600 dark:text-slate-400 italic mb-3 p-2 bg-purple-50 dark:bg-purple-900/20 rounded">
                                {s.instructions}
                              </div>
                            )}
                            <div className="space-y-3">
                              {(s.questions || []).map((q: any, qi: number) => (
                                <div key={q.id || qi} className="pl-4 border-l-2 border-purple-200 dark:border-purple-800">
                                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-start gap-1">
                                    <span className="flex-shrink-0">{qi + 1}.</span>
                                    <div dangerouslySetInnerHTML={{ __html: q.question }} />
                                  </div>
                                  {q.imageUrl && (
                                    <img src={q.imageUrl} alt={q.imageAlt || 'custom image'} className="max-h-40 object-contain mb-2 rounded border border-slate-200 dark:border-slate-600" />
                                  )}
                                  {q.table && (
                                    <div className="overflow-auto mb-2">
                                      <table className="min-w-full border border-slate-300 dark:border-slate-600 text-xs">
                                        <tbody>
                                          {q.table.data.map((row: string[], r: number) => (
                                            <tr key={r}>
                                              {row.map((cell: string, c: number) => (
                                                <td key={c} className="border border-slate-300 dark:border-slate-600 p-1">{cell}</td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                  <div className="text-xs text-slate-500 mt-2">Marks: {q.marks || 0}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-4 flex justify-end space-x-3">
              <button
                onClick={closeViewModal}
                className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-medium"
              >
                Close
              </button>
              {(selectedExam.status === 'scheduled' || selectedExam.status === 'draft') && (
                <button
                  onClick={() => {
                    closeViewModal();
                    activeTab === 'exams' ? handleEditExam(selectedExam) : handleEditTest(selectedExam);
                  }}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Edit Exam
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </TeacherDashboardLayout>
  );
};

export default TeacherExams;