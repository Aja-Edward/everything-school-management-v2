import React, { useState, useEffect, useMemo } from 'react';
import { 
  Eye, Edit, Trash2, CheckCircle, XCircle, 
  FileText, Filter, Search,
  User, Award, AlertCircle, Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { toast } from 'react-toastify';
import ResultService from '@/services/ResultService';
import { useSettings } from '@/contexts/SettingsContext';
import { AcademicSession } from '@/types/types';
import EditSubjectResultForm from './EditSubjectResultForm';
import AddResultForm from './AddResultForm';
import { PDFDownloadButton, BulkPDFDownload } from './PDFDownloadComponents';

// Enhanced interfaces for result management
interface StudentResult {
  id: string;
  student: {
    id: string;
    full_name: string;
    username: string;
    student_class: string;
    education_level: string;
    profile_picture?: string;
  };
  academic_session:AcademicSession;
  term: string;
  total_subjects: number;
  subjects_passed: number;
  subjects_failed: number;
  total_score: number;
  average_score: number;
  gpa: number;
  class_position: number | null;
  total_students: number;
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED';
  remarks: string;
  next_term_begins?: string;
  subject_results: SubjectResult[];
  created_at: string;
  updated_at: string;
  entered_by?: {
    id: string;
    full_name: string;
  };
  approved_by?: {
    id: string;
    full_name: string;
  };
  published_by?: {
    id: string;
    full_name: string;
  };
  approved_date?: string;
  published_date?: string;
  subject_name?: string;
  education_level?: string;
}

interface SubjectResult {
  id: string;
  subject: {
    name: string;
    code: string;
  };
  total_ca_score: number;
  ca_total?: number;
  exam_score: number;
  total_score: number;
  percentage: number;
  grade: string;
  grade_point: number;
  is_passed: boolean;
  status: string;
  continuous_assessment_score?: number;
  take_home_test_score?: number;
  practical_score?: number;
  project_score?: number;
  appearance_score?: number;
  note_copying_score?: number;
  first_test_score?: number;
  second_test_score?: number;
  third_test_score?: number;
}

interface StatusAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  hoverColor: string;
}

const EnhancedResultsManagement: React.FC = () => {
  const { settings } = useSettings();
  
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'term-reports' | 'subject-results'>('subject-results');
  
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingResult, setEditingResult] = useState<StudentResult | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [resultToDelete, setResultToDelete] = useState<StudentResult | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [educationLevelFilter, setEducationLevelFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [termFilter, setTermFilter] = useState<string>('all');
  const [sessionFilter, setSessionFilter] = useState<string>('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const statusActions: StatusAction[] = [
    {
      id: 'APPROVED',
      label: 'Approve Result',
      icon: <CheckCircle className="w-4 h-4" />,
      color: 'text-green-700',
      bgColor: 'bg-green-100',
      hoverColor: 'hover:bg-green-200'
    },
    {
      id: 'PUBLISHED',
      label: 'Publish Result',
      icon: <Award className="w-4 h-4" />,
      color: 'text-purple-700',
      bgColor: 'bg-purple-100',
      hoverColor: 'hover:bg-purple-200'
    }
  ];

  useEffect(() => {
    loadResults();
  }, [viewMode]);

  const loadResults = async () => {
  try {
    setLoading(true);
    setError(null);
    
    let data: any[] = [];
    
    if (viewMode === 'term-reports') {
      console.log('🔄 Loading ALL TERM REPORTS (with pagination)...');
      
      // ✅ This will now fetch ALL pages automatically
      const allResults = await ResultService.getTermResults();
      
      console.log(`📊 [Term Reports] Loaded ${allResults.length} total results`);
      
      // CALCULATE MISSING FIELDS FROM SUBJECT RESULTS
      data = allResults.map((report: any) => {
        const subjectResults = report.subject_results || [];
        
        // Calculate totals from subject results
        let totalScore = 0;
        let totalGradePoints = 0;
        let passedCount = 0;
        
        subjectResults.forEach((subject: any) => {
          totalScore += subject.total_score || 0;
          totalGradePoints += subject.grade_point || 0;
          if (subject.is_passed) passedCount++;
        });
        
        // Average score is the average of all subject scores (already percentages)
        const averageScore = subjectResults.length > 0 
          ? (totalScore / subjectResults.length) 
          : 0;
        
        const gpa = subjectResults.length > 0 
          ? (totalGradePoints / subjectResults.length) 
          : 0;
        
        // Calculate overall grade from average
        let overallGrade = 'F';
        if (averageScore >= 70) overallGrade = 'A';
        else if (averageScore >= 60) overallGrade = 'B';
        else if (averageScore >= 50) overallGrade = 'C';
        else if (averageScore >= 45) overallGrade = 'D';
        else if (averageScore >= 39) overallGrade = 'E';
        
        console.log(`📊 Calculated for ${report.student?.full_name}:`, {
          totalScore,
          averageScore,
          gpa,
          overallGrade,
          subjectsCount: subjectResults.length
        });
        
        // Return report with calculated values
        return {
          ...report,
          total_score: totalScore,
          average_score: averageScore,
          gpa: parseFloat(gpa.toFixed(2)),
          overall_grade: overallGrade,
          total_subjects: subjectResults.length,
          subjects_passed: passedCount,
          subjects_failed: subjectResults.length - passedCount,
          class_position: report.class_position || null,
          total_students: report.total_students || 0
        };
      });
      
      if (data && data.length > 0) {
        const seniorResult = data.find((r: any) => r.student?.education_level === 'SENIOR_SECONDARY');
        if (seniorResult) {
          console.log('🎓 [Senior Secondary Term Report] Sample:', {
            student: seniorResult.student?.full_name,
            total_score: seniorResult.total_score,
            average_score: seniorResult.average_score,
            gpa: seniorResult.gpa,
            class_position: seniorResult.class_position,
            total_students: seniorResult.total_students,
          });
        }
      }
      
    } else {
      console.log('🔄 Loading ALL SUBJECT RESULTS (with pagination)...');
      
      // ✅ These will now fetch ALL pages automatically
      const [nursery, primary, junior, senior] = await Promise.all([
        ResultService.getNurseryResults(),
        ResultService.getPrimaryResults(),
        ResultService.getJuniorSecondaryResults(),
        ResultService.getSeniorSecondaryResults()
      ]);
      
      console.log(`📊 Subject Results Loaded: Nursery=${nursery.length}, Primary=${primary.length}, Junior=${junior.length}, Senior=${senior.length}`);
      
      data = [
        ...nursery.map(r => transformSubjectResult(r, 'NURSERY')),
        ...primary.map(r => transformSubjectResult(r, 'PRIMARY')),
        ...junior.map(r => transformSubjectResult(r, 'JUNIOR_SECONDARY')),
        ...senior.map(r => transformSubjectResult(r, 'SENIOR_SECONDARY'))
      ];
    }
    
    console.log(`✅ TOTAL LOADED: ${data?.length || 0} results in ${viewMode} mode`);
    setStudentResults(data || []);
    
  } catch (err) {
    console.error('❌ Error loading results:', err);
    setError('Failed to load results. Please try again.');
  } finally {
    setLoading(false);
  }
};

  const transformSubjectResult = (result: any, educationLevel: string): StudentResult => {
    console.log(`🔄 [transformSubjectResult] Transforming ${educationLevel}:`, result.student?.full_name);
    
    const sessionName = result.exam_session?.academic_session_name || 
                       result.exam_session?.academic_session?.name || 
                       result.exam_session?.academic_session?.academic_session_name || 
                       'N/A';
    
    const sessionObj = typeof result.exam_session?.academic_session === 'object' 
      ? result.exam_session.academic_session 
      : { name: sessionName };
    
    let examScore = 0;
    let totalScore = 0;
    let caTotal = 0;
    let percentage = 0;
    
    if (educationLevel === 'NURSERY') {
      examScore = result.exam_score || result.mark_obtained || 0;
      totalScore = result.total_score || examScore || 0;
      caTotal = 0;
      percentage = result.percentage || result.total_percentage || totalScore;
    } else if (educationLevel === 'SENIOR_SECONDARY') {
      const firstTest = result.first_test_score || 0;
      const secondTest = result.second_test_score || 0;
      const thirdTest = result.third_test_score || 0;
      examScore = result.exam_score || 0;
      
      caTotal = firstTest + secondTest + thirdTest;
      totalScore = result.total_score || (caTotal + examScore);
      percentage = result.percentage || totalScore;
      
      console.log(`📊 [SS Calc] ${result.subject?.name}:`, {
        tests: [firstTest, secondTest, thirdTest],
        exam: examScore,
        ca: caTotal,
        total: totalScore
      });
    } else {
      examScore = result.exam_score || result.mark_obtained || 0;
      caTotal = result.ca_total || result.total_ca_score || 0;
      totalScore = result.total_score || (caTotal + examScore);
      percentage = result.percentage || result.total_percentage || totalScore;
    }
    
    const subjectResult: any = {
      id: result.id,
      subject: result.subject,
      total_ca_score: caTotal,
      ca_total: caTotal,
      exam_score: examScore,
      total_score: totalScore,
      percentage: percentage,
      grade: result.grade || 'N/A',
      grade_point: result.grade_point || 0,
      is_passed: result.is_passed,
      status: result.status
    };
    
    if (educationLevel === 'SENIOR_SECONDARY') {
      subjectResult.first_test_score = result.first_test_score || 0;
      subjectResult.second_test_score = result.second_test_score || 0;
      subjectResult.third_test_score = result.third_test_score || 0;
    }
    
    return {
      id: result.id,
      student: result.student,
      academic_session: sessionObj,
      term: result.exam_session?.term || 'N/A',
      total_subjects: 1,
      subjects_passed: result.is_passed ? 1 : 0,
      subjects_failed: result.is_passed ? 0 : 1,
      total_score: totalScore,
      average_score: percentage,
      gpa: result.grade_point || 0,
      class_position: result.position || null,
      total_students: 0,
      status: result.status,
      remarks: result.class_teacher_remark || result.teacher_remark || result.academic_comment || '',
      subject_results: [subjectResult],
      created_at: result.created_at,
      updated_at: result.updated_at,
      education_level: educationLevel,
      subject_name: result.subject?.name || 'N/A',
      overall_grade: result.grade || 'N/A',
    } as any;
  };

  const filteredResults = useMemo(() => {
    return studentResults.filter(result => {
      const matchesSearch = searchTerm === '' || 
        result.student?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.student?.username?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || result.status === statusFilter;
      const matchesEducationLevel = educationLevelFilter === 'all' || 
        result.student?.education_level === educationLevelFilter;
      const matchesClass = classFilter === 'all' || 
        result.student?.student_class === classFilter;
      const matchesTerm = termFilter === 'all' || result.term === termFilter;
      const matchesSession = sessionFilter === 'all' || 
        result.academic_session?.name === sessionFilter;
      
      const matchesTab = activeTab === 'ALL' || result.term === activeTab;
      
      return matchesSearch && matchesStatus && matchesEducationLevel && 
             matchesClass && matchesTerm && matchesSession && matchesTab;
    });
  }, [studentResults, searchTerm, statusFilter, educationLevelFilter, classFilter, termFilter, sessionFilter, activeTab]);

  const uniqueEducationLevels = useMemo(() => 
    Array.from(new Set(studentResults.map(r => r.student?.education_level).filter(Boolean))), 
    [studentResults]);
  
  const uniqueClasses = useMemo(() => 
    Array.from(new Set(studentResults.map(r => r.student?.student_class).filter(Boolean))), 
    [studentResults]);
  
  const uniqueTerms = useMemo(() => 
    Array.from(new Set(studentResults.map(r => r.term).filter(Boolean))), 
    [studentResults]);
  
  const uniqueSessions = useMemo(() => 
    Array.from(new Set(studentResults.map(r => r.academic_session?.name).filter(Boolean))), 
    [studentResults]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedResults = filteredResults.slice(startIndex, endIndex);
  
  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, educationLevelFilter, classFilter, termFilter, sessionFilter, activeTab, itemsPerPage]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  const updateResultStatus = async (resultId: string, newStatus: string, educationLevel: string) => {
    try {
      setActionLoading(resultId);
      
      let response;
      
      if (viewMode === 'subject-results') {
        switch (newStatus) {
          case 'APPROVED':
            response = await ResultService.approveSubjectResult(resultId, educationLevel);
            break;
          case 'PUBLISHED':
            response = await ResultService.publishSubjectResult(resultId, educationLevel);
            break;
          default:
            throw new Error(`Unsupported status change: ${newStatus}`);
        }
        
        toast.success(`Subject result ${newStatus.toLowerCase()} successfully`);
      } else {
        switch (newStatus) {
          case 'APPROVED':
            response = await ResultService.approveResult(resultId, educationLevel);
            break;
          case 'PUBLISHED':
            response = await ResultService.publishResult(resultId, educationLevel);
            break;
          default:
            throw new Error(`Unsupported status change: ${newStatus}`);
        }
        
        toast.success(`Term report ${newStatus.toLowerCase()} successfully`);
      }
      
      setStudentResults(prev => prev.map(result => 
        result.id === resultId 
          ? { ...result, status: newStatus as any, ...response }
          : result
      ));
      
    } catch (error) {
      console.error('Error updating result status:', error);
      toast.error(`Failed to ${newStatus.toLowerCase()} result`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResultAdded = () => {
    setShowAddForm(false);
    loadResults();
    toast.success('Result recorded successfully!');
  };

  const bulkUpdateStatus = async (resultIds: string[], newStatus: string) => {
    try {
      setActionLoading('bulk');
      
      const promises = resultIds.map(id => {
        const result = studentResults.find(r => r.id === id);
        return updateResultStatus(id, newStatus, result?.student?.education_level || '');
      });
      
      await Promise.all(promises);
      setSelectedResults([]);
      toast.success(`${resultIds.length} results ${newStatus.toLowerCase()} successfully`);
    } catch (error) {
      console.error('Error bulk updating results:', error);
      toast.error('Failed to update results');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteResult = async (result: StudentResult) => {
  try {
    setActionLoading('delete');
    const educationLevel = (result as any).education_level || result.student?.education_level;
    
    if (!educationLevel) {
      toast.error('Cannot determine education level for this result');
      return;
    }
    
    console.log('🗑️ Deleting result:', {
      id: result.id,
      education_level: educationLevel,
      view_mode: viewMode,
      status: result.status
    });
    
    // Determine if this is a term report or subject result
    if (viewMode === 'term-reports') {
      await ResultService.deleteTermResult(result.id, educationLevel);
      toast.success('Term report deleted successfully');
    } else {
      await ResultService.deleteStudentResult(result.id, educationLevel);
      toast.success('Subject result deleted successfully');
    }
    
    // Remove from UI
    setStudentResults(prev => prev.filter(r => r.id !== result.id));
    setShowDeleteModal(false);
    setResultToDelete(null);
    
  } catch (error: any) {
    console.error('Error deleting result:', error);
    
    // Show detailed error message from backend
    const errorMessage = error.response?.data?.error || 
                         error.response?.data?.detail || 
                         error.message || 
                         'Failed to delete result';
    
    toast.error(errorMessage);
  } finally {
    setActionLoading(null);
  }
};

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: { color: 'bg-gray-100 text-gray-800', icon: <Edit className="w-3 h-3" /> },
      APPROVED: { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" /> },
      PUBLISHED: { color: 'bg-purple-100 text-purple-800', icon: <Award className="w-3 h-3" /> }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.icon}
        {status}
      </span>
    );
  };

  const getGradeColor = (grade: string) => {
    if (grade === 'A' || grade === 'A+') return 'text-green-600';
    if (grade === 'B' || grade === 'B+') return 'text-blue-600';
    if (grade === 'C' || grade === 'C+') return 'text-yellow-600';
    if (grade === 'D' || grade === 'D+') return 'text-purple-600';
    return 'text-red-600';
  };

  const getOverallGrade = (student: StudentResult): string => {
    if ((student as any).overall_grade) {
      return (student as any).overall_grade;
    }
    
    if (!student.average_score || typeof student.average_score !== 'number' || isNaN(student.average_score)) {
      return 'N/A';
    }
    
    const avg = student.average_score;
    if (avg >= 70) return 'A';
    if (avg >= 60) return 'B';
    if (avg >= 50) return 'C';
    if (avg >= 45) return 'D';
    if (avg >= 39) return 'E';
    return 'F';
  };

  const formatScore = (score: any): string => {
    if (score === null || score === undefined) return 'N/A';
    const numScore = typeof score === 'string' ? parseFloat(score) : score;
    if (typeof numScore !== 'number' || isNaN(numScore)) return 'N/A';
    return `${numScore.toFixed(1)}%`;
  };

  const formatTermDisplay = (term: string): string => {
    if (!term) return 'N/A';
    
    const termMap: { [key: string]: string } = {
      'FIRST': '1st Term',
      'SECOND': '2nd Term',
      'THIRD': '3rd Term',
      '1st Term': '1st Term',
      '2nd Term': '2nd Term',
      '3rd Term': '3rd Term'
    };
    
    return termMap[term.toUpperCase()] || term;
  };

  const getTermColor = (term: string): string => {
    if (!term) return 'bg-gray-100 text-gray-800';
    
    switch (term.toUpperCase()) {
      case 'FIRST':
      case '1ST TERM':
        return 'bg-blue-100 text-blue-800';
      case 'SECOND':
      case '2ND TERM':
        return 'bg-green-100 text-green-800';
      case 'THIRD':
      case '3RD TERM':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleRowClick = (result: StudentResult) => {
    console.log('🎯 ============ ROW CLICK DEBUG ============');
    console.log('🎯 View Mode:', viewMode);
    console.log('🎯 Student:', result.student?.full_name);
    console.log('🎯 Education Level:', result.student?.education_level);
    console.log('🎯 Performance Stats:', {
      total_score: result.total_score,
      average_score: result.average_score,
      gpa: result.gpa,
      class_position: result.class_position,
      total_students: result.total_students
    });
    console.log('🎯 Subject Results Count:', result.subject_results?.length);
    if (result.subject_results?.[0]) {
      console.log('🎯 First Subject:', {
        name: result.subject_results[0].subject?.name,
        first_test: result.subject_results[0].first_test_score,
        second_test: result.subject_results[0].second_test_score,
        third_test: result.subject_results[0].third_test_score,
        exam: result.subject_results[0].exam_score,
        total: result.subject_results[0].total_score
      });
    }
    console.log('🎯 ========================================');
    
    setSelectedStudent(result);
    setShowDetailModal(true);
  };

  const handleSelectResult = (resultId: string) => {
    setSelectedResults(prev => 
      prev.includes(resultId) 
        ? prev.filter(id => id !== resultId)
        : [...prev, resultId]
    );
  };

  const handleSelectAll = () => {
    if (selectedResults.length === paginatedResults.length && paginatedResults.length > 0) {
      setSelectedResults([]);
    } else {
      setSelectedResults(paginatedResults.map(r => r.id));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">{error}</div>
          <button 
            onClick={loadResults}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Results Management</h1>
              <p className="text-gray-600 mt-2">
                Manage student results, approve, and publish for report cards
              </p>
              <p className="text-sm text-blue-600 mt-1">
                Currently viewing: <strong>{viewMode === 'subject-results' ? 'Individual Subject Results' : 'Consolidated Term Reports'}</strong>
              </p>
            </div>
            
            <div className="flex gap-3 flex-wrap items-center">
              <div className="flex bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg p-1.5 shadow-md">
                <button
                  onClick={() => setViewMode('subject-results')}
                  className={`px-6 py-2.5 rounded-md text-sm font-bold transition-all duration-200 ${
                    viewMode === 'subject-results'
                      ? 'bg-blue-600 text-white shadow-lg scale-105'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  📝 Subject Results
                </button>
                <button
                  onClick={() => setViewMode('term-reports')}
                  className={`px-6 py-2.5 rounded-md text-sm font-bold transition-all duration-200 ${
                    viewMode === 'term-reports'
                      ? 'bg-purple-600 text-white shadow-lg scale-105'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  📊 Term Reports
                </button>
              </div>
              
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Record Result
              </button>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
              
              {selectedResults.length > 0 && (
                <div className="flex gap-2">
                  {statusActions.map(action => (
                    <button
                      key={action.id}
                      onClick={() => bulkUpdateStatus(selectedResults, action.id)}
                      disabled={actionLoading === 'bulk'}
                      className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm ${action.bgColor} ${action.color} ${action.hoverColor} disabled:opacity-50`}
                    >
                      {action.icon}
                      {action.label}
                    </button>
                  ))}
                  <BulkPDFDownload
                    selectedResults={filteredResults.filter(r => selectedResults.includes(r.id))}
                    className="ml-2"
                  />
                </div>
              )}
            </div>
          </div>
          
          {/* Status Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Results</p>
                  <p className="text-2xl font-bold text-gray-900">{studentResults.length}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Draft</p>
                  <p className="text-2xl font-bold text-gray-700">
                    {studentResults.filter(r => r.status === 'DRAFT').length}
                  </p>
                </div>
                <Edit className="w-8 h-8 text-gray-500" />
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Approved</p>
                  <p className="text-2xl font-bold text-green-700">
                    {studentResults.filter(r => r.status === 'APPROVED').length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Published</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {studentResults.filter(r => r.status === 'PUBLISHED').length}
                  </p>
                </div>
                <Award className="w-8 h-8 text-purple-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PUBLISHED">Published</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Education Level</label>
                <select
                  value={educationLevelFilter}
                  onChange={(e) => setEducationLevelFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Levels</option>
                  {uniqueEducationLevels.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Classes</option>
                  {uniqueClasses.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Term</label>
                <select
                  value={termFilter}
                  onChange={(e) => setTermFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Terms</option>
                  {uniqueTerms.map(term => (
                    <option key={term} value={term}>{term}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Session</label>
                <select
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Sessions</option>
                  {uniqueSessions.map(session => (
                    <option key={session} value={session}>{session}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Term Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-4">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('ALL')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'ALL'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                All Results ({studentResults.length})
              </button>
              <button
                onClick={() => setActiveTab('FIRST')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'FIRST'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${getTermColor('FIRST')}`}>
                  1st Term
                </span>
                ({studentResults.filter(r => r.term === 'FIRST').length})
              </button>
              <button
                onClick={() => setActiveTab('SECOND')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'SECOND'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${getTermColor('SECOND')}`}>
                  2nd Term
                </span>
                ({studentResults.filter(r => r.term === 'SECOND').length})
              </button>
              <button
                onClick={() => setActiveTab('THIRD')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'THIRD'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${getTermColor('THIRD')}`}>
                  3rd Term
                </span>
                ({studentResults.filter(r => r.term === 'THIRD').length})
              </button>
            </nav>
          </div>
        </div>

        {/* Results Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {activeTab === 'ALL' ? 'All Results' : `${formatTermDisplay(activeTab)} Results`} ({filteredResults.length})
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {viewMode === 'subject-results' 
                    ? '📝 Showing individual subject results with all statuses' 
                    : '📊 Showing consolidated term reports'}
                </p>
              </div>
              {selectedResults.length > 0 && (
                <span className="text-sm text-gray-600">
                  {selectedResults.length} selected
                </span>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedResults.length === paginatedResults.length && paginatedResults.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student
                  </th>
                  {viewMode === 'subject-results' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Subject
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Class
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Term
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Average
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Grade
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedResults.length === 0 ? (
                  <tr>
                    <td colSpan={viewMode === 'subject-results' ? 10 : 9} className="px-6 py-12 text-center text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No results found</p>
                      {searchTerm && (
                        <p className="text-sm mt-2">Try adjusting your search criteria</p>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedResults.map((result) => (
                    <tr key={result.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedResults.includes(result.id)}
                          onChange={() => handleSelectResult(result.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            {result.student?.profile_picture ? (
                              <img
                                className="h-10 w-10 rounded-full"
                                src={result.student.profile_picture}
                                alt={result.student.full_name}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                <User className="h-5 w-5 text-blue-600" />
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {result.student?.full_name || 'N/A'}
                            </div>
                            <div className="text-sm text-gray-500">
                              {result.student?.username || 'N/A'}
                            </div>
                          </div>
                        </div>
                      </td>
                      {viewMode === 'subject-results' && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {(result as any).subject_name || result.subject_results?.[0]?.subject?.name || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {result.subject_results?.[0]?.subject?.code || ''}
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {result.student?.student_class || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {result.student?.education_level || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTermColor(result.term)}`}>
                            {formatTermDisplay(result.term)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {result.academic_session?.name || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatScore(result.average_score)}
                        </div>
                        {result.class_position && (
                          <div className="text-sm text-gray-500">
                            Position: {result.class_position}/{result.total_students}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${getGradeColor(getOverallGrade(result))}`}>
                          {getOverallGrade(result)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(result.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(result.updated_at).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(result.updated_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRowClick(result)}
                            className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <PDFDownloadButton
                              reportId={result.id}
                              educationLevel={
                              (result as any).education_level || 
                              result.student?.education_level || 
                              'PRIMARY'
                              }
                              studentName={result.student?.full_name || 'Student'}
                              term={result.term}
                              session={result.academic_session?.name || 'Session'}
                              variant="icon"
                              size="md"
                            />
                          <button
                            onClick={() => {
                              setEditingResult(result);
                              setShowEditModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                            title="Edit Result"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          
                          {statusActions.map(action => (
                            <button
                              key={action.id}
                              onClick={() => updateResultStatus(result.id, action.id, result.student?.education_level || '')}
                              disabled={actionLoading === result.id || result.status === action.id}
                              className={`p-1 rounded transition-colors ${action.bgColor} ${action.color} ${action.hoverColor} disabled:opacity-50 disabled:cursor-not-allowed`}
                              title={action.label}
                            >
                              {action.icon}
                            </button>
                          ))}
                          
                          <button
                            onClick={() => {
                              setResultToDelete(result);
                              setShowDeleteModal(true);
                            }}
                            className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors"
                            title="Delete Result"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {filteredResults.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Items per page selector */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Show</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-gray-700">
                    per page
                  </span>
                </div>

                {/* Pagination info */}
                <div className="text-sm text-gray-700 font-medium">
                  Showing <span className="text-blue-600">{startIndex + 1}</span> to{' '}
                  <span className="text-blue-600">{Math.min(endIndex, filteredResults.length)}</span> of{' '}
                  <span className="text-blue-600">{filteredResults.length}</span> results
                </div>

                {/* Page navigation */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    {/* First page button */}
                    <button
                      onClick={() => goToPage(1)}
                      disabled={currentPage === 1}
                      className="p-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm"
                      title="First page"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>

                    {/* Previous page button */}
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm"
                      title="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Page numbers */}
                    <div className="hidden sm:flex items-center gap-1">
                      {getPageNumbers().map((page, index) => (
                        page === '...' ? (
                          <span key={`ellipsis-${index}`} className="px-3 py-2 text-gray-500">
                            ...
                          </span>
                        ) : (
                          <button
                            key={page}
                            onClick={() => goToPage(page as number)}
                            className={`min-w-[2.5rem] px-3 py-2 border rounded-lg text-sm font-medium transition-all shadow-sm ${
                              currentPage === page
                                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </button>
                        )
                      ))}
                    </div>

                    {/* Mobile: Current page indicator */}
                    <div className="sm:hidden px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700">
                      Page {currentPage} of {totalPages}
                    </div>

                    {/* Next page button */}
                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm"
                      title="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    {/* Last page button */}
                    <button
                      onClick={() => goToPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="p-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm"
                      title="Last page"
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {showDetailModal && selectedStudent && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              Result Details - {selectedStudent.student?.full_name}
            </h3>
            <div className="mt-1 flex items-center space-x-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTermColor(selectedStudent.term)}`}>
                {formatTermDisplay(selectedStudent.term)}
              </span>
              <span className="text-sm text-gray-500">
                {selectedStudent.academic_session?.name}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <PDFDownloadButton
              reportId={selectedStudent.id}
              educationLevel={
                (selectedStudent as any).education_level || 
                selectedStudent.student?.education_level || 
                'PRIMARY'
              }
              studentName={selectedStudent.student?.full_name || 'Student'}
              term={selectedStudent.term}
              session={selectedStudent.academic_session?.name || 'Session'}
              variant="button"
              size="sm"
            />
            <button
              onClick={() => {
                setShowDetailModal(false);
                setEditingResult(selectedStudent);
                setShowEditModal(true);
              }}
              className="text-blue-600 hover:text-blue-900 p-2 rounded-lg hover:bg-blue-50 transition-colors"
              title="Edit Result"
            >
              <Edit className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setShowDetailModal(false);
                setSelectedStudent(null);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-3">Student Information</h4>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Name:</span> {selectedStudent.student?.full_name}</p>
              <p><span className="font-medium">Class:</span> {selectedStudent.student?.student_class}</p>
              <p><span className="font-medium">Term:</span> 
                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTermColor(selectedStudent.term)}`}>
                  {formatTermDisplay(selectedStudent.term)}
                </span>
              </p>
              <p><span className="font-medium">Session:</span> {selectedStudent.academic_session?.name}</p>
            </div>
          </div>
          
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-3">Performance Summary</h4>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Average Score:</span> {formatScore(selectedStudent.average_score)}</p>
              <p><span className="font-medium">Overall Grade:</span> <span className={getGradeColor(getOverallGrade(selectedStudent))}>{getOverallGrade(selectedStudent)}</span></p>
              <p><span className="font-medium">Position:</span> {selectedStudent.class_position ? `${selectedStudent.class_position}/${selectedStudent.total_students}` : 'N/A'}</p>
              <p><span className="font-medium">Status:</span> {getStatusBadge(selectedStudent.status)}</p>
            </div>
          </div>
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-medium text-gray-900">Subject Results</h4>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTermColor(selectedStudent.term)}`}>
              {formatTermDisplay(selectedStudent.term)} Results
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Subject</th>
                  
                  {/* Show headers based on education level */}
                  {(() => {
                    const eduLevel = (selectedStudent as any).education_level || selectedStudent.student?.education_level;
                    
                    if (eduLevel === 'NURSERY') {
                      return (
                        <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">Score</th>
                      );
                    } else if (eduLevel === 'PRIMARY' || eduLevel === 'JUNIOR_SECONDARY') {
                      return (
                        <>
                          <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">CA</th>
                          <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">Exam</th>
                        </>
                      );
                    } else if (eduLevel === 'SENIOR_SECONDARY') {
                      return (
                        <>
                          <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 bg-blue-100">1st Test</th>
                          <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 bg-blue-100">2nd Test</th>
                          <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 bg-blue-100">3rd Test</th>
                          <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 bg-green-100">Exam</th>
                        </>
                      );
                    }
                    return null;
                  })()}
                  
                  <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">Total</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">Grade</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {selectedStudent.subject_results?.length > 0 ? (
                  selectedStudent.subject_results.map((subject, index) => {
                    const eduLevel = (selectedStudent as any).education_level || selectedStudent.student?.education_level;
                    
                    return (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">
                          {subject.subject?.name || 'N/A'}
                          <div className="text-xs text-gray-500">{subject.subject?.code || ''}</div>
                        </td>
                        
                        {/* Show data based on education level */}
                        {(() => {
                          if (eduLevel === 'NURSERY') {
                            return (
                              <td className="px-4 py-2 text-center text-sm text-gray-900">
                                {subject.exam_score ?? 'N/A'}
                              </td>
                            );
                          } else if (eduLevel === 'PRIMARY' || eduLevel === 'JUNIOR_SECONDARY') {
                            return (
                              <>
                                <td className="px-4 py-2 text-center text-sm text-gray-900">
                                  {subject.ca_total ?? subject.total_ca_score ?? 'N/A'}
                                </td>
                                <td className="px-4 py-2 text-center text-sm text-gray-900">
                                  {subject.exam_score ?? 'N/A'}
                                </td>
                              </>
                            );
                          } else if (eduLevel === 'SENIOR_SECONDARY') {
                            return (
                              <>
                                <td className="px-4 py-2 text-center text-sm font-bold text-blue-900 bg-blue-50">
                                  {subject.first_test_score ?? 0}
                                </td>
                                <td className="px-4 py-2 text-center text-sm font-bold text-blue-900 bg-blue-50">
                                  {subject.second_test_score ?? 0}
                                </td>
                                <td className="px-4 py-2 text-center text-sm font-bold text-blue-900 bg-blue-50">
                                  {subject.third_test_score ?? 0}
                                </td>
                                <td className="px-4 py-2 text-center text-sm font-bold text-green-900 bg-green-50">
                                  {subject.exam_score ?? 0}
                                </td>
                              </>
                            );
                          }
                          return null;
                        })()}
                        
                        <td className="px-4 py-2 text-center text-sm font-medium text-gray-900">
                          {subject.total_score ?? 'N/A'}
                        </td>
                        <td className="px-4 py-2 text-center text-sm">
                          <span className={getGradeColor(subject.grade)}>
                            {subject.grade || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-sm">
                          {subject.is_passed ? (
                            <span className="text-green-600 font-medium">Pass</span>
                          ) : (
                            <span className="text-red-600 font-medium">Fail</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No subject results available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
)}

        {/* Edit Modal */}
        {showEditModal && editingResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <EditSubjectResultForm
                  result={editingResult as any}
                  onClose={() => {
                    setShowEditModal(false);
                    setEditingResult(null);
                  }}
                  onSuccess={() => {
                    setShowEditModal(false);
                    setEditingResult(null);
                    loadResults();
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && resultToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <AlertCircle className="w-6 h-6 text-red-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">Confirm Delete</h3>
                </div>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to delete the result for <strong>{resultToDelete.student?.full_name}</strong>? 
                  This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      setResultToDelete(null);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteResult(resultToDelete)}
                    disabled={actionLoading === 'delete'}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === 'delete' ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Result Modal */}
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <AddResultForm
                onClose={() => setShowAddForm(false)}
                onSuccess={handleResultAdded}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedResultsManagement;