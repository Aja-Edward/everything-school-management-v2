import React, { useState, useEffect } from 'react';

import {
  FileText,
  Upload,
  Save,
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  Download,
  Edit,
  X,
  Eye,
  ChevronDown,
  ChevronUp,
  Stamp,
  PenTool,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import ProfessionalAssignmentService from '@/services/ProfessionalAssignmentService';
import api, {API_BASE_URL} from '@/services/api'


// Types
type EducationLevel = 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';

interface ExamSession {
  id: string;
  name: string;
  term: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface Student {
  id: string;
  full_name: string;
  registration_number: string;
  student_class: string;
  education_level: EducationLevel;
}

interface TermReport {
  id: string;
  student: Student;
  exam_session: ExamSession;
  education_level: EducationLevel;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED';
  average_score: number;
  class_position: number;
  total_students: number;
  class_teacher_remark: string;
  head_teacher_remark: string;
  class_teacher_signature: string | null;
  head_teacher_signature: string | null;
  school_stamp: string | null;
  class_teacher_signed_at: string | null;
  head_teacher_signed_at: string | null;
  updated_at: string;
}

interface PaginationInfo {
  count: number;
  next: string | null;
  previous: string | null;
  current_page: number;
  total_pages: number;
  page_size: number;
}

interface FilterOptions {
  education_level: string;
  status: string;
  has_head_remark: string;
  search: string;
}

interface AdminRemarksManagerProps {
  onClose?: () => void;
}


const AdminRemarksManager: React.FC<AdminRemarksManagerProps> = () => {
  // State Management
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [reports, setReports] = useState<TermReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<TermReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<TermReport | null>(null);
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [showSignatureUpload, setShowSignatureUpload] = useState(false);
  const [showStampUpload, setShowStampUpload] = useState(false);
  
  // Pagination State
  const [pagination, setPagination] = useState<PaginationInfo>({
    count: 0,
    next: null,
    previous: null,
    current_page: 1,
    total_pages: 1,
    page_size: 20
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // Form States
  const [headTeacherRemark, setHeadTeacherRemark] = useState('');
  const [headSignatureFile, setHeadSignatureFile] = useState<File | null>(null);
  const [headSignaturePreview, setHeadSignaturePreview] = useState<string | null>(null);
  const [headSignatureUrl, setHeadSignatureUrl] = useState('');
  // Persisted signature fetched from tenant settings
  const [existingHeadSignatureUrl, setExistingHeadSignatureUrl] = useState('');
  const [headSignatureMode, setHeadSignatureMode] = useState<'existing' | 'new'>('new');
  const [schoolStampFile, setSchoolStampFile] = useState<File | null>(null);
  const [schoolStampPreview, setSchoolStampPreview] = useState<string | null>(null);
  const [schoolStampUrl, setSchoolStampUrl] = useState('');
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  
  // Filter States
  const [filters, setFilters] = useState<FilterOptions>({
    education_level: '',
    status: '',
    has_head_remark: '',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // Statistics
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    completed: 0,
    published: 0
  });

  // Helper function to get auth headers
  
  useEffect(() => {
    fetchExamSessions();
    // Fetch the school's stored head teacher signature
    ProfessionalAssignmentService.getHeadSignature().then(res => {
      if (res.signature_url) {
        setExistingHeadSignatureUrl(res.signature_url);
        setHeadSignatureMode('existing');
      }
    });
  }, []);

  useEffect(() => {
    if (selectedSession) {
      setCurrentPage(1); // Reset to page 1 when session changes
      fetchReports(1);
    }
  }, [selectedSession]);

  useEffect(() => {
    if (selectedSession) {
      fetchReports(currentPage);
    }
  }, [currentPage, pageSize, filters]);

  useEffect(() => {
    calculateStats();
  }, [filteredReports]);

  const fetchExamSessions = async () => {
    try {
      const data = await api.get('/api/results/exam-sessions/');
      
  
      setExamSessions(data.results || data || []);
      
      const activeSession = (data.results || data || []).find((s: ExamSession) => s.is_active);
      if (activeSession) {
        setSelectedSession(activeSession.id);
      }
    } catch (error) {
      console.error('Error fetching exam sessions:', error);
    }
  };

  const fetchReports = async (page: number = 1) => {
    setLoading(true);
    try {
      const levels: EducationLevel[] = ['NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'];
      const allReports: TermReport[] = [];
      let totalCount = 0;

      for (const level of levels) {
        const endpoint = `${API_BASE_URL}/results/${level.toLowerCase().replace('_', '-')}/term-reports/`;
        
        // Build query parameters
        const params = new URLSearchParams({
          exam_session: selectedSession,
          page: page.toString(),
          page_size: pageSize.toString()
        });

        // Add filters to query params
        if (filters.status) {
          params.append('status', filters.status);
        }
        if (filters.search) {
          params.append('search', filters.search);
        }

        const response = await fetch(`${endpoint}?${params.toString()}`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Handle paginated response
          if (data.results) {
            const reportsWithLevel = data.results.map((report: any) => ({
              ...report,
              education_level: level as EducationLevel
            }));
            allReports.push(...reportsWithLevel);
            totalCount += data.count || data.results.length;
          } else if (Array.isArray(data)) {
            // Handle non-paginated response
            const reportsWithLevel = data.map((report: any) => ({
              ...report,
              education_level: level as EducationLevel
            }));
            allReports.push(...reportsWithLevel);
            totalCount += data.length;
          }
        }
      }

      setReports(allReports);
      setFilteredReports(allReports);

      // Update pagination info
      setPagination({
        count: totalCount,
        next: page * pageSize < totalCount ? 'next' : null,
        previous: page > 1 ? 'prev' : null,
        current_page: page,
        total_pages: Math.ceil(totalCount / pageSize),
        page_size: pageSize
      });

    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const total = filteredReports.length;
    
    const pending = filteredReports.filter(r => 
      !r.head_teacher_remark || r.head_teacher_remark.trim() === ''
    ).length;
    
    const completed = filteredReports.filter(r => 
      r.head_teacher_remark && 
      r.head_teacher_remark.trim() !== '' && 
      !r.head_teacher_signature
    ).length;
    
    const published = filteredReports.filter(r => 
      r.status === 'PUBLISHED'
    ).length;
    
    setStats({
      total,
      pending,
      completed,
      published
    });
  };

  // Pagination handlers
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const handleUpdateHeadRemark = async () => {
    if (!selectedReport || !headTeacherRemark.trim()) {
      alert('Please enter a remark');
      return;
    }

    if (headTeacherRemark.length < 50) {
      alert('Remark must be at least 50 characters long');
      return;
    }

    setUploading(true);
    try {
      await ProfessionalAssignmentService.updateHeadTeacherRemark({
        term_report_id: selectedReport.id,
        education_level: selectedReport.education_level,
        head_teacher_remark: headTeacherRemark
      });

      alert('Head teacher remark updated successfully');
      setShowRemarkModal(false);
      setHeadTeacherRemark('');
      setSelectedReport(null);
      fetchReports(currentPage);
    } catch (error: any) {
      console.error('Error updating remark:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadHeadSignature = async () => {
    if (!headSignatureFile) {
      alert('Please select a signature image');
      return;
    }

    if (headSignatureFile.size > 2 * 1024 * 1024) {
      alert('Signature file must be less than 2MB');
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(headSignatureFile.type)) {
      alert('Please upload a PNG or JPEG image');
      return;
    }

    setUploading(true);
    try {
      const result = await ProfessionalAssignmentService.uploadHeadTeacherSignature(headSignatureFile);
      setHeadSignatureUrl(result.signature_url);
      // Also persist as the school's saved signature and switch to it
      setExistingHeadSignatureUrl(result.signature_url);
      setHeadSignatureMode('existing');
      setHeadSignatureFile(null);
      setHeadSignaturePreview(null);
      alert('Signature uploaded and saved to school settings! It will be available for future sessions.');
    } catch (error: any) {
      console.error('Error uploading signature:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSignatureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Signature file must be less than 2MB');
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      alert('Please upload a PNG or JPEG image');
      return;
    }

    setHeadSignatureFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setHeadSignaturePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleApplyHeadSignature = async () => {
    const activeHeadUrl = headSignatureMode === 'existing' ? existingHeadSignatureUrl : headSignatureUrl;
    if (!activeHeadUrl) {
      alert('Please upload a signature first');
      return;
    }

    if (selectedReports.length === 0) {
      alert('Please select at least one report');
      return;
    }

    setUploading(true);
    try {
      const reportsByLevel: Record<EducationLevel, string[]> = {} as Record<EducationLevel, string[]>;
      selectedReports.forEach(reportId => {
        const report = filteredReports.find(r => r.id === reportId);
        if (report) {
          if (!reportsByLevel[report.education_level]) {
            reportsByLevel[report.education_level] = [];
          }
          reportsByLevel[report.education_level].push(reportId);
        }
      });

      let totalApplied = 0;
      for (const [level, reportIds] of Object.entries(reportsByLevel) as [EducationLevel, string[]][]) {
        const result = await ProfessionalAssignmentService.applyHeadSignature({
          signature_url: activeHeadUrl,
          education_level: level,
          term_report_ids: reportIds
        });
        totalApplied += result.updated_count;
      }

      alert(`Signature applied to ${totalApplied} report(s) successfully`);
      setShowSignatureUpload(false);
      setSelectedReports([]);
      setHeadSignatureUrl('');
      setHeadSignatureFile(null);
      fetchReports(currentPage);
    } catch (error: any) {
      console.error('Error applying signature:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadSchoolStamp = async () => {
    if (!schoolStampFile) {
      alert('Please select a stamp image');
      return;
    }

    if (schoolStampFile.size > 2 * 1024 * 1024) {
      alert('Stamp file must be less than 2MB');
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(schoolStampFile.type)) {
      alert('Please upload a PNG or JPEG image');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('stamp_image', schoolStampFile);

      const response = await fetch(`${API_BASE_URL}/results/admin-remarks/upload-school-stamp/`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const uploadData = await response.json();
      setSchoolStampUrl(uploadData.stamp_url);
      setSchoolStampFile(null);
      setSchoolStampPreview(null);
      alert('School stamp uploaded successfully! You can now apply it to reports.');
    } catch (error: any) {
      console.error('Error uploading stamp:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleStampFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Stamp file must be less than 2MB');
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      alert('Please upload a PNG or JPEG image');
      return;
    }

    setSchoolStampFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setSchoolStampPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleApplySchoolStamp = async () => {
    if (!schoolStampUrl) {
      alert('Please upload a stamp first');
      return;
    }

    if (selectedReports.length === 0) {
      alert('Please select at least one report');
      return;
    }

    setUploading(true);
    try {
      const reportsByLevel: Record<EducationLevel, string[]> = {} as Record<EducationLevel, string[]>;
      selectedReports.forEach(reportId => {
        const report = filteredReports.find(r => r.id === reportId);
        if (report) {
          if (!reportsByLevel[report.education_level]) {
            reportsByLevel[report.education_level] = [];
          }
          reportsByLevel[report.education_level].push(reportId);
        }
      });

      let totalApplied = 0;
      for (const [level, reportIds] of Object.entries(reportsByLevel) as [EducationLevel, string[]][]) {
        const formData = new FormData();
        formData.append('stamp_url', schoolStampUrl);
        formData.append('education_level', level);
        formData.append('term_report_ids', JSON.stringify(reportIds));

        const response = await fetch(`${API_BASE_URL}/results/admin-remarks/apply-school-stamp/`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

        if (response.ok) {
          const data = await response.json();
          totalApplied += data.updated_count;
        }
      }

      alert(`School stamp applied to ${totalApplied} report(s) successfully`);
      setShowStampUpload(false);
      setSelectedReports([]);
      setSchoolStampUrl('');
      setSchoolStampFile(null);
      fetchReports(currentPage);
    } catch (error: any) {
      console.error('Error applying stamp:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const toggleReportSelection = (reportId: string) => {
    setSelectedReports(prev =>
      prev.includes(reportId)
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedReports.length === filteredReports.length) {
      setSelectedReports([]);
    } else {
      setSelectedReports(filteredReports.map(r => r.id));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
      case 'SUBMITTED': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'APPROVED': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'PUBLISHED': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Pagination component
  const PaginationControls = () => (
    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-600 dark:text-slate-400">
          Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, pagination.count)} of {pagination.count} results
        </span>
        
        <select
          value={pageSize}
          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
        >
          <option value={10}>10 per page</option>
          <option value={20}>20 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={!pagination.previous || loading}
          className="p-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
            let pageNum;
            if (pagination.total_pages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= pagination.total_pages - 2) {
              pageNum = pagination.total_pages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }

            return (
              <button
                key={i}
                onClick={() => handlePageChange(pageNum)}
                disabled={loading}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  pageNum === currentPage
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={!pagination.next || loading}
          className="p-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              Remarks & Signatures Management
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Manage head teacher remarks, signatures, and school stamps for term reports
            </p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Reports</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{pagination.count}</p>
            </div>
            <FileText className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Pending Remarks</p>
              <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Published</p>
              <p className="text-2xl font-bold text-purple-600">{stats.published}</p>
            </div>
            <Download className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-700 mb-6">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          {/* Session Selector */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Exam Session
            </label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Session</option>
              {examSessions.map(session => (
                <option key={session.id} value={session.id}>
                  {session.name} {session.is_active && '(Active)'}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                placeholder="Search by name, number, or class..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Filter Toggle */}
          <div className="flex items-end">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <Filter className="w-5 h-5" />
              Filters
              {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Education Level
              </label>
              <select
                value={filters.education_level}
                onChange={(e) => setFilters(prev => ({ ...prev, education_level: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Levels</option>
                <option value="NURSERY">Nursery</option>
                <option value="PRIMARY">Primary</option>
                <option value="JUNIOR_SECONDARY">Junior Secondary</option>
                <option value="SENIOR_SECONDARY">Senior Secondary</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="PUBLISHED">Published</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Head Remark
              </label>
              <select
                value={filters.has_head_remark}
                onChange={(e) => setFilters(prev => ({ ...prev, has_head_remark: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="yes">With Remark</option>
                <option value="no">Without Remark</option>
              </select>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
          <button
            onClick={() => setShowSignatureUpload(true)}
            disabled={selectedReports.length === 0}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <PenTool className="w-4 h-4" />
            Apply Head Signature ({selectedReports.length})
          </button>

          <button
            onClick={() => setShowStampUpload(true)}
            disabled={selectedReports.length === 0}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Stamp className="w-4 h-4" />
            Apply School Stamp ({selectedReports.length})
          </button>

          <button
            onClick={toggleSelectAll}
            className="px-4 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-700 transition-colors flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            {selectedReports.length === filteredReports.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400">
            <FileText className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No reports found</p>
            <p className="text-sm">Try adjusting your filters or select a different session</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedReports.length === filteredReports.length && filteredReports.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-300">Student</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-300">Class</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-300">Level</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-300">Score</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-300">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-300">Head Remark</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-300">Signatures</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filteredReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedReports.includes(report.id)}
                          onChange={() => toggleReportSelection(report.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{report.student.full_name}</p>
                          <p className="text-xs text-slate-500">{report.student.registration_number}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                        {report.student.student_class}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                        {report.education_level.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                        {report.average_score != null
                          ? `${Number(report.average_score).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(report.status)}`}>
                          {report.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {report.head_teacher_remark ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-orange-500" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {report.head_teacher_signature && (
                            <div title="Head Signature">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            </div>
                          )}
                          {report.school_stamp && (
                            <div title="School Stamp">
                              <Stamp className="w-4 h-4 text-purple-500" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setSelectedReport(report);
                            setHeadTeacherRemark(report.head_teacher_remark || '');
                            setShowRemarkModal(true);
                          }}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 transition-colors"
                          title="Edit Remark"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            <PaginationControls />
          </>
        )}
      </div>

      {/* Remark Modal */}
      {showRemarkModal && selectedReport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Edit Head Teacher Remark
              </h2>
              <button
                onClick={() => {
                  setShowRemarkModal(false);
                  setSelectedReport(null);
                  setHeadTeacherRemark('');
                }}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Student</p>
                <p className="text-lg font-medium text-slate-900 dark:text-white">
                  {selectedReport.student.full_name}
                </p>
                <p className="text-sm text-slate-500">{selectedReport.student.registration_number}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Class</p>
                  <p className="font-medium text-slate-900 dark:text-white">{selectedReport.student.student_class}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Average Score</p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {selectedReport.average_score != null 
                      ? `${Number(selectedReport.average_score).toFixed(1)}%`
                      : "—"}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Head Teacher Remark (minimum 50 characters)
                </label>
                <textarea
                  value={headTeacherRemark}
                  onChange={(e) => setHeadTeacherRemark(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Enter head teacher's remark..."
                />
                <p className="text-sm text-slate-500 mt-1">
                  {headTeacherRemark.length} / 50 characters
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleUpdateHeadRemark}
                  disabled={uploading || headTeacherRemark.length < 50}
                  className="flex-1 px-6 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Save Remark
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowRemarkModal(false);
                    setSelectedReport(null);
                    setHeadTeacherRemark('');
                  }}
                  className="px-6 py-3 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {showSignatureUpload && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Apply Head Teacher Signature
              </h2>
              <button
                onClick={() => {
                  setShowSignatureUpload(false);
                  setHeadSignatureFile(null);
                  setHeadSignaturePreview(null);
                }}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {selectedReports.length} report{selectedReports.length !== 1 ? 's' : ''} selected
              </p>

              {/* Mode toggle — shown only when a saved signature exists */}
              {existingHeadSignatureUrl && (
                <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
                  <button
                    onClick={() => setHeadSignatureMode('existing')}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                      headSignatureMode === 'existing'
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Use Saved Signature
                  </button>
                  <button
                    onClick={() => setHeadSignatureMode('new')}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                      headSignatureMode === 'new'
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Upload New
                  </button>
                </div>
              )}

              {/* ── USE EXISTING ── */}
              {headSignatureMode === 'existing' && existingHeadSignatureUrl && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Saved Signature
                      </label>
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Ready to apply
                      </span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border-2 border-green-200 dark:border-green-800">
                      <img src={existingHeadSignatureUrl} alt="Saved Head Teacher Signature" className="max-h-32 mx-auto" />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 text-center">
                      This signature is saved to your school settings. Switch to "Upload New" to replace it.
                    </p>
                  </div>
                  <button
                    onClick={handleApplyHeadSignature}
                    disabled={uploading}
                    className="w-full px-6 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-semibold"
                  >
                    {uploading
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> Applying…</>
                      : <><CheckCircle className="w-5 h-5" /> Apply to {selectedReports.length} Report(s)</>
                    }
                  </button>
                </div>
              )}

              {/* ── UPLOAD NEW ── */}
              {(headSignatureMode === 'new' || !existingHeadSignatureUrl) && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center">
                    <Upload className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleSignatureFileChange}
                      className="hidden"
                      id="head-signature-upload"
                    />
                    <label htmlFor="head-signature-upload" className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline font-medium">
                      Choose signature image
                    </label>
                    <p className="text-xs text-slate-500 mt-1.5">PNG or JPEG · max 2MB</p>
                    {headSignatureFile && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{headSignatureFile.name}</p>
                    )}
                  </div>

                  {headSignaturePreview && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Preview</label>
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border-2 border-slate-200 dark:border-slate-600">
                        <img src={headSignaturePreview} alt="Signature Preview" className="max-h-32 mx-auto" />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleUploadHeadSignature}
                    disabled={!headSignatureFile || uploading}
                    className="w-full px-6 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-semibold"
                  >
                    {uploading
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> Uploading…</>
                      : <><Upload className="w-5 h-5" /> Save & Apply Signature</>
                    }
                  </button>
                  <p className="text-xs text-center text-slate-400">
                    The signature will be saved to your school settings for future use.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stamp Upload Modal - same structure as signature modal */}
      {showStampUpload && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Apply School Stamp
              </h2>
              <button
                onClick={() => {
                  setShowStampUpload(false);
                  setSchoolStampFile(null);
                  setSchoolStampUrl('');
                }}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Selected Reports: {selectedReports.length}
              </p>

              {schoolStampUrl && !schoolStampPreview ? (
                <div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 mb-4">
                    <p className="text-sm text-green-600 dark:text-green-400 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Stamp uploaded successfully!
                    </p>
                    <img src={schoolStampUrl} alt="School Stamp" className="max-h-32 mx-auto" />
                  </div>
                  <button
                    onClick={handleApplySchoolStamp}
                    disabled={uploading}
                    className="w-full px-6 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Apply to {selectedReports.length} Report(s)
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center">
                    <Stamp className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleStampFileChange}
                      className="hidden"
                      id="stamp-upload"
                    />
                    <label htmlFor="stamp-upload" className="cursor-pointer text-purple-600 dark:text-purple-400 hover:underline">
                      Choose stamp image
                    </label>
                    <p className="text-xs text-slate-500 mt-2">PNG or JPEG (max 2MB)</p>
                  </div>

                  {schoolStampPreview && (
                    <div className="mt-4 bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                      <img src={schoolStampPreview} alt="Preview" className="max-h-32 mx-auto" />
                    </div>
                  )}

                  <button
                    onClick={handleUploadSchoolStamp}
                    disabled={!schoolStampFile || uploading}
                    className="w-full mt-4 px-6 py-3 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Upload Stamp
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRemarksManager;