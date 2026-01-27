import React, { useState, useCallback, useEffect } from "react";
import { Search, Plus, X, Filter, Edit2, Printer, CheckCircle, Trash2, Calendar, BookOpen, GraduationCap, FileText, ChevronDown, Upload } from "lucide-react";
import { Exam, ExamCreateData, ExamUpdateData, ExamFilters, ExamService } from "@/services/ExamService";
import ExamFormModal from "./ExamFormModal";
import PrintPreviewModal from "./PrintPreviewModal";
import ApprovalModal from "./ApprovalModal";
import { normalizeExamDataForDisplay, normalizeExamDataForEdit } from "@/utils/examDataNormalizer";
import { ExamDocumentUploader } from "@/components/shared/ExamDocumentUploader";

interface ExamsPageProps {
  searchTerm?: string;
  selectedExamType?: string;
  selectedStatus?: string;
  selectedGrade?: number;
  selectedSubject?: number;
}

const ExamsPage: React.FC<ExamsPageProps> = ({
  searchTerm = "",
  selectedExamType = "",
  selectedStatus = "",
  selectedGrade = 0,
  selectedSubject = 0,
}) => {
  // Data States
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modal and selected objects
  const [showExamModal, setShowExamModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [selectedExamForPrint, setSelectedExamForPrint] = useState<Exam | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [examForApproval, setExamForApproval] = useState<Exam | null>(null);

  // Local filter states
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);
  const [localExamType, setLocalExamType] = useState(selectedExamType);
  const [localStatus, setLocalStatus] = useState(selectedStatus);
  const [localGrade, setLocalGrade] = useState(selectedGrade);
  const [localSubject, setLocalSubject] = useState(selectedSubject);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch Exams on mount and when filters change
  useEffect(() => {
    fetchExams();
  }, [localSearchTerm, localExamType, localStatus, localGrade, localSubject]);

  const fetchExams = async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: ExamFilters = {};
      
      if (localSearchTerm) filters.search = localSearchTerm;
      if (localExamType) filters.exam_type = localExamType;
      if (localStatus) filters.status = localStatus;
      if (localGrade) filters.grade_level = localGrade;
      if (localSubject) filters.subject = localSubject;

      const data = await ExamService.getExams(filters);
      
      // CRITICAL: Normalize all exams for display
      const normalizedExams = (data || []).map(exam => {
        const examWithId = {
          ...exam,
          id: exam.id || (exam as any).pk || (exam as any).exam_id || (exam as any).examId
        };
        
        const normalized = normalizeExamDataForDisplay(examWithId);
        return normalized ? { ...normalized, id: examWithId.id } : examWithId;
      });
      
      console.log("📚 Loaded and normalized exams:", normalizedExams);
      console.log(`✅ Total exams: ${normalizedExams.length}`);
      
      setExams(normalizedExams);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load exams");
      console.error("❌ Fetch exams error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Create or Update Exam
  const handleCreateExam = useCallback(
    async (examData: ExamCreateData) => {
      setSubmitting(true);
      try {
        let savedExam: Exam;
        
        if (editingExam && editingExam.id) {
          console.log("🔄 Updating exam with ID:", editingExam.id);
          const updateData: ExamUpdateData = examData;
          savedExam = await ExamService.updateExam(editingExam.id, updateData);
          
          if (!savedExam.id) {
            savedExam = { ...savedExam, id: editingExam.id };
          }
          
          const normalizedSaved = normalizeExamDataForDisplay(savedExam);
          
          setExams((prev) =>
            prev.map((e) => (e.id === editingExam.id ? normalizedSaved || savedExam : e))
          );
          
          console.log("✅ Exam updated successfully!");
        } else {
          console.log("➕ Creating new exam");
          savedExam = await ExamService.createExam(examData);
          const normalizedSaved = normalizeExamDataForDisplay(savedExam);
          
          setExams((prev) => [normalizedSaved || savedExam, ...prev]);
          console.log("✅ Exam created successfully!");
        }

        setShowExamModal(false);
        setEditingExam(null);
      } catch (err) {
        console.error("❌ Save exam error:", err);
        setError(err instanceof Error ? err.message : "Failed to save exam");
      } finally {
        setSubmitting(false);
      }
    },
    [editingExam]
  );

  // Delete Exam
  const handleDeleteExam = useCallback(async (exam: Exam) => {
    if (!window.confirm(`Are you sure you want to delete "${exam.title}"?`)) return;

    try {
      await ExamService.deleteExam(exam.id);
      setExams((prev) => prev.filter((e) => e.id !== exam.id));
      console.log("✅ Exam deleted!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete exam");
      console.error("❌ Delete exam error:", err);
    }
  }, []);

  // Edit Exam
  // const handleEditExam = useCallback((exam: Exam) => {
  //   console.log("📝 Editing exam:", exam);
    
  //   if (!exam.id) {
  //     console.error("❌ Cannot edit exam: Missing ID");
  //     setError("Cannot edit exam: Missing ID. Please refresh and try again.");
  //     fetchExams();
  //     return;
  //   }

  // Update the handleEditExam function in ExamsPage.tsx

const handleEditExam = useCallback((exam: Exam) => {
  console.log("📝 Editing exam:", exam);
  
  if (!exam.id) {
    console.error("❌ Cannot edit exam: Missing ID");
    setError("Cannot edit exam: Missing ID. Please refresh and try again.");
    fetchExams();
    return;
  }
  
  const normalizedForEdit = normalizeExamDataForEdit(exam);
  
  // CRITICAL FIX: Ensure all required fields are properly mapped
  const examWithAllFields = {
    ...normalizedForEdit,
    // Ensure grade_level is set (using correct snake_case field names)
    grade_level: normalizedForEdit.grade_level || 
                 exam.grade_level ||
                 null,
    
    // Ensure subject is set (using correct snake_case field names)
    subject: normalizedForEdit.subject || 
             exam.subject ||
             null,
    
    // Ensure max_students is set (using correct snake_case field names)
    max_students: normalizedForEdit.max_students || 
                  exam.max_students ||
                  null,
    
    // Keep display names for reference
    grade_level_name: exam.grade_level_name || '',
    subject_name: exam.subject_name || '',
  };
  
  console.log("✅ Normalized exam for editing with all fields:", examWithAllFields);
  console.log("Field values:", {
    grade_level: examWithAllFields.grade_level,
    subject: examWithAllFields.subject,
    max_students: examWithAllFields.max_students
  });
  
  setEditingExam(examWithAllFields);
  setShowExamModal(true);
}, []);

  // Print Exam
  const handlePrintExam = useCallback((exam: Exam) => {
    console.log("🖨️ Preparing exam for print:", exam.title);
    const normalizedForPrint = normalizeExamDataForDisplay(exam);
    
    setSelectedExamForPrint(normalizedForPrint);
    setShowPrintPreview(true);
  }, []);

  // Approve Exam
  const handleApproveExam = useCallback((exam: Exam) => {
    setExamForApproval(exam);
    setShowApprovalModal(true);
  }, []);

  // Submit Approval
  const handleSubmitApproval = useCallback(
    async (exam: Exam, notes?: string) => {
      try {
        const updatedExam = await ExamService.approveExam(exam.id, notes || "");
        const normalizedUpdated = normalizeExamDataForDisplay(updatedExam);
        
        setExams((prev) =>
          prev.map((e) => (e.id === exam.id ? normalizedUpdated || updatedExam : e))
        );

        setShowApprovalModal(false);
        setExamForApproval(null);
        console.log("✅ Exam approved!");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve exam");
        console.error("❌ Approve exam error:", err);
      }
    },
    []
  );

  // Submit Rejection
  const handleRejectExam = useCallback(
    async (exam: Exam, reason?: string) => {
      try {
        const updatedExam = await ExamService.rejectExam(exam.id, reason || "");
        const normalizedUpdated = normalizeExamDataForDisplay(updatedExam);
        
        setExams((prev) =>
          prev.map((e) => (e.id === exam.id ? normalizedUpdated || updatedExam : e))
        );

        setShowApprovalModal(false);
        setExamForApproval(null);
        console.log("✅ Exam rejected!");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reject exam");
        console.error("❌ Reject exam error:", err);
      }
    },
    []
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
      pending: "bg-amber-100 text-amber-700 border-amber-200",
      draft: "bg-slate-100 text-slate-700 border-slate-200",
      rejected: "bg-rose-100 text-rose-700 border-rose-200"
    };
    return colors[status?.toLowerCase()] || colors.draft;
  };

  const getStatusIcon = (status: string) => {
    if (status?.toLowerCase() === 'approved') return <CheckCircle className="w-3 h-3" />;
    if (status?.toLowerCase() === 'pending') return <Calendar className="w-3 h-3" />;
    return <FileText className="w-3 h-3" />;
  };

  const approvedCount = exams.filter(e => e.status?.toLowerCase() === 'approved').length;
  const pendingCount = exams.filter(e => e.status?.toLowerCase() === 'pending').length;
  const draftCount = exams.filter(e => e.status?.toLowerCase() === 'draft').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Exam Management</h1>
                <p className="text-sm text-slate-600 mt-0.5">Create, manage, and track assessments</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl font-medium"
              >
                <Upload className="w-5 h-5" />
                <span>Upload Exam</span>
              </button>
              <button
                onClick={() => {
                  setEditingExam(null);
                  setShowExamModal(true);
                }}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl font-medium"
              >
                <Plus className="w-5 h-5" />
                <span>New Exam</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex justify-between items-center shadow-sm">
            <span className="font-medium">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-rose-700 hover:text-rose-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search exams by title or code..."
                value={localSearchTerm}
                onChange={(e) => setLocalSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Filter Toggle (Mobile) */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="lg:hidden flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-all font-medium"
            >
              <Filter className="w-5 h-5" />
              <span>Filters</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {/* Filters (Desktop) */}
            <div className="hidden lg:flex gap-3">
              <select
                value={localExamType}
                onChange={(e) => setLocalExamType(e.target.value)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all min-w-[140px]"
              >
                <option value="">All Types</option>
                {ExamService.getExamTypes().map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>

              <select
                value={localStatus}
                onChange={(e) => setLocalStatus(e.target.value)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all min-w-[140px]"
              >
                <option value="">All Status</option>
                {ExamService.getExamStatuses().map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Grade"
                value={localGrade || ""}
                onChange={(e) => setLocalGrade(e.target.value ? parseInt(e.target.value) : 0)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all w-[100px]"
              />

              <input
                type="number"
                placeholder="Subject"
                value={localSubject || ""}
                onChange={(e) => setLocalSubject(e.target.value ? parseInt(e.target.value) : 0)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all w-[100px]"
              />
            </div>
          </div>

          {/* Mobile Filters */}
          {showFilters && (
            <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-200">
              <select
                value={localExamType}
                onChange={(e) => setLocalExamType(e.target.value)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                {ExamService.getExamTypes().map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>

              <select
                value={localStatus}
                onChange={(e) => setLocalStatus(e.target.value)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                {ExamService.getExamStatuses().map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Grade Level"
                value={localGrade || ""}
                onChange={(e) => setLocalGrade(e.target.value ? parseInt(e.target.value) : 0)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="number"
                placeholder="Subject ID"
                value={localSubject || ""}
                onChange={(e) => setLocalSubject(e.target.value ? parseInt(e.target.value) : 0)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Total Exams</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{exams.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Approved</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">{approvedCount}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Pending</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{pendingCount}</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Drafts</p>
                <p className="text-3xl font-bold text-slate-600 mt-1">{draftCount}</p>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <Edit2 className="w-6 h-6 text-slate-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-blue-600 mb-4"></div>
            <p className="text-slate-600 font-medium">Loading exams...</p>
          </div>
        )}

        {/* Exam Cards - Mobile View */}
        {!loading && exams.length > 0 && (
          <div className="lg:hidden space-y-4">
            {exams.map((exam) => (
              <div key={exam.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 text-lg mb-1">{exam.title}</h3>
                    <p className="text-sm text-slate-500">{exam.code || "--"}</p>
                  </div>
                  <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getStatusColor(exam.status)}`}>
                    {getStatusIcon(exam.status)}
                    {exam.status_display || exam.status || "Unknown"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    <span>{exam.subject_name || exam.subject || "--"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <GraduationCap className="w-4 h-4 text-slate-400" />
                    <span>{exam.grade_level_name || exam.grade_level || "--"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>{exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : "--"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span>{exam.total_marks} marks</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleEditExam(exam)}
                    className="flex-1 min-w-[80px] px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-1.5"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handlePrintExam(exam)}
                    className="flex-1 min-w-[80px] px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    Print
                  </button>
                  <button
                    onClick={() => handleApproveExam(exam)}
                    className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors text-sm font-medium"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteExam(exam)}
                    className="px-3 py-2 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 transition-colors text-sm font-medium"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Exam Table - Desktop View */}
        {!loading && exams.length > 0 && (
          <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Exam Details</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Subject & Grade</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Type & Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Marks</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {exams.map((exam) => (
                    <tr key={exam.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-semibold text-slate-900">{exam.title}</div>
                          <div className="text-sm text-slate-500 mt-0.5">{exam.code || "--"}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <BookOpen className="w-4 h-4 text-slate-400" />
                          {exam.subject_name || exam.subject || "--"}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                          <GraduationCap className="w-4 h-4 text-slate-400" />
                          {exam.grade_level_name || exam.grade_level || "--"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-700">{exam.exam_type_display || exam.exam_type || "--"}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : "--"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getStatusColor(exam.status)}`}>
                          {getStatusIcon(exam.status)}
                          {exam.status_display || exam.status || "Unknown"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900">{exam.total_marks}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditExam(exam)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handlePrintExam(exam)}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Print"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleApproveExam(exam)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Approve"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteExam(exam)}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && exams.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No exams found</h3>
            <p className="text-slate-600 mb-6">Try adjusting your filters or create a new exam</p>
            <button
              onClick={() => {
                setEditingExam(null);
                setShowExamModal(true);
              }}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg font-medium"
            >
              Create Your First Exam
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <ExamFormModal
        open={showExamModal}
        exam={editingExam}
        onClose={() => {
          setShowExamModal(false);
          setEditingExam(null);
        }}
        onSubmit={handleCreateExam}
      />

      {/* Upload Exam Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <ExamDocumentUploader
                onImport={(examData) => {
                  // Populate the exam form with uploaded data
                  setEditingExam({
                    ...examData,
                    id: 0, // New exam
                  } as Exam);
                  setShowUploadModal(false);
                  setShowExamModal(true);
                }}
                onCancel={() => setShowUploadModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      <PrintPreviewModal
        open={showPrintPreview}
        exam={selectedExamForPrint}
        onClose={() => setShowPrintPreview(false)}
      />

      <ApprovalModal
        open={showApprovalModal}
        exam={examForApproval}
        onApprove={handleSubmitApproval}
        onReject={handleRejectExam}
        onClose={() => setShowApprovalModal(false)}
      />
    </div>
  );
};

export default ExamsPage;