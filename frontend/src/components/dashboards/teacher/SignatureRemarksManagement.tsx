import React, { useState, useEffect } from 'react';
import { Upload, Save, User, FileText, CheckCircle, AlertCircle, X, Eye, Edit2, Search, Download, Trash2, Filter } from 'lucide-react';
import ProfessionalAssignmentService from '@/services/ProfessionalAssignmentService';
import type {
  AssignedStudent,
  AssignedStudentsResponse,
  EducationLevel,
  UpdateTeacherRemarkRequest,
  SignatureUploadResponse,
  ApplySignatureRequest,
  RemarkTemplates,
  RemarkTemplatesByEducation
} from '@/types/results';
import { mapEducationLevelToRemarkKey } from '@/utils/remarkTemplate';



interface SignatureRemarksManagementProps {
  teacherId: number;
  profileData: any;
}

const SignatureRemarksManagement: React.FC<SignatureRemarksManagementProps> = ({
  teacherId,
  profileData,
}) => {
  const [activeView, setActiveView] = useState<'signature' | 'remarks'>('signature');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Signature state
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [uploadedSignatureUrl, setUploadedSignatureUrl] = useState<string | null>(null);
  const [selectedReportsForSignature, setSelectedReportsForSignature] = useState<string[]>([]);

  // Students state
  const [studentsData, setStudentsData] = useState<AssignedStudentsResponse | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<AssignedStudent | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [selectedExamSession, setSelectedExamSession] = useState('');
  const [educationLevel, setEducationLevel] = useState<EducationLevel>('PRIMARY');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEducationLevelFilter, setSelectedEducationLevelFilter] = useState<EducationLevel | 'ALL'>('ALL');
  const [remarkTemplates, setRemarkTemplates] = useState<RemarkTemplatesByEducation | null>(null);
  const [showBulkSignatureModal, setShowBulkSignatureModal] = useState(false);

  useEffect(() => {
    // Load exam sessions first, then load students
    loadExamSessionsAndStudents();
    loadRemarkTemplates();
  }, []);

  useEffect(() => {
    // Reload students when exam session changes (but skip initial load)
    if (selectedExamSession) {
      loadStudents();
    }
  }, [selectedExamSession]);

  useEffect(() => {
    if (profileData?.education_level) {
      setEducationLevel(profileData.education_level as EducationLevel);
    }
  }, [profileData]);

  const loadExamSessionsAndStudents = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Import ResultService to get exam sessions
      const ResultService = (await import('@/services/ResultService')).default;

      // Fetch exam sessions and find the active one
      const sessions = await ResultService.getExamSessions({ is_active: true });
      console.log('Fetched exam sessions:', sessions);

      if (sessions && sessions.length > 0) {
        const activeSession = sessions[0]; // First session should be the active one
        console.log('Setting active exam session:', activeSession.id);
        setSelectedExamSession(activeSession.id);

        // Now load students with the active session
        await loadStudentsWithSession(activeSession.id);
      } else {
        setError('No active exam session found. Please contact your administrator to create an exam session.');
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('Error loading exam sessions:', err);
      setError(err.message || 'Failed to load exam sessions');
      setIsLoading(false);
    }
  };

  const loadStudentsWithSession = async (examSessionId: string) => {
    try {
      const data = await ProfessionalAssignmentService.getAssignedStudents({
        exam_session: examSessionId,
      });

      console.log('Loaded students data:', data);

      if (!data) {
        throw new Error('No data received from server');
      }

      setStudentsData(data);

      if (data.students && data.students.length > 0 && data.students[0]?.education_level) {
        setEducationLevel(data.students[0].education_level);
      }
    } catch (err: any) {
      console.error('Error loading students:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load students');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStudents = async () => {
    if (!selectedExamSession) {
      console.warn('No exam session selected');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await loadStudentsWithSession(selectedExamSession);
    } catch (err: any) {
      console.error('Error loading students:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load students');
      setIsLoading(false);
    }
  };

  const loadRemarkTemplates = async () => {
    try {
      const data = await ProfessionalAssignmentService.getRemarkTemplates();
      console.log('Loaded templates data:', data);

      if (data?.templates) {
        setRemarkTemplates(data.templates as RemarkTemplatesByEducation);
      } else {
        console.warn('No templates found in response');
      }
    } catch (err: any) {
      console.error('Error loading templates:', err);
    }
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Signature file must be less than 2MB');
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setError('Please upload a PNG or JPEG image');
      return;
    }

    setSignatureFile(file);
    setError(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      setSignaturePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureSubmit = async () => {
    if (!signatureFile) {
      setError('Please select a signature file');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await ProfessionalAssignmentService.uploadTeacherSignature(signatureFile);

      setUploadedSignatureUrl(response.signature_url);
      setSuccessMessage('Signature uploaded successfully!');
      setSignatureFile(null);
      setSignaturePreview(null);

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Error uploading signature:', err);
      setError(err.response?.data?.error || 'Failed to upload signature');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySignatureToSelected = async () => {
    if (!uploadedSignatureUrl) {
      setError('Please upload a signature first');
      return;
    }

    if (selectedReportsForSignature.length === 0) {
      setError('Please select at least one student report');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const selectedStudents = filteredStudents.filter(s => 
        s.term_report_id && selectedReportsForSignature.includes(String(s.term_report_id))
      );
      
      if (selectedStudents.length === 0) {
        setError('No valid students selected');
        setIsLoading(false);
        return;
      }

      const selectedEducationLevel = selectedStudents[0].education_level;
      const allSameLevel = selectedStudents.every(s => s.education_level === selectedEducationLevel);
      
      if (!allSameLevel) {
        setError('All selected students must be from the same education level');
        setIsLoading(false);
        return;
      }

      const requestData: ApplySignatureRequest = {
        signature_url: uploadedSignatureUrl,
        term_report_ids: selectedReportsForSignature.map(id => String(id)),
        education_level: selectedEducationLevel,
      };

      const response = await ProfessionalAssignmentService.applySignatureToReports(requestData);

      setSuccessMessage(`Signature applied to ${response.updated_count} report(s)`);
      setSelectedReportsForSignature([]);
      setShowBulkSignatureModal(false);
      loadStudents();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Error applying signature:', err);
      setError(err.message || 'Failed to apply signature');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySignatureToStudent = async () => {
    if (!selectedStudent?.term_report_id) {
      setError('No term report found for this student');
      return;
    }

    if (!uploadedSignatureUrl) {
      setError('Please upload a signature first');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const requestData: ApplySignatureRequest = {
        signature_url: uploadedSignatureUrl,
        term_report_ids: [selectedStudent.term_report_id],
        education_level: selectedStudent.education_level,
      };

      await ProfessionalAssignmentService.applySignatureToReports(requestData);

      setSuccessMessage(`Signature applied to ${selectedStudent.full_name}'s report`);
      loadStudents();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Error applying signature:', err);
      setError(err.response?.data?.error || 'Failed to apply signature');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemarkSubmit = async () => {
    if (!selectedStudent || !remarkText.trim()) {
      setError('Please select a student and enter a remark');
      return;
    }

    if (!selectedStudent.term_report_id) {
      setError('No term report found for this student');
      return;
    }

    if (remarkText.trim().length < 50) {
      setError('Remark must be at least 50 characters long');
      return;
    }

    if (remarkText.trim().length > 500) {
      setError('Remark must not exceed 500 characters');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const requestData: UpdateTeacherRemarkRequest = {
        term_report_id: selectedStudent.term_report_id,
        education_level: selectedStudent.education_level,
        class_teacher_remark: remarkText.trim(),
      };

      await ProfessionalAssignmentService.updateTeacherRemark(requestData);

      setSuccessMessage('Remark saved successfully!');
      setRemarkText('');
      setSelectedStudent(null);
      loadStudents();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Error saving remark:', err);
      setError(err.response?.data?.error || 'Failed to save remark');
    } finally {
      setIsLoading(false);
    }
  };

  const insertTemplate = (template: string) => {
    if (!selectedStudent) return;
    const filledTemplate = template.replace('{student_name}', selectedStudent.full_name);
    setRemarkText(filledTemplate);
  };

  const toggleReportSelection = (reportId: string) => {
    const reportIdStr = String(reportId);
    setSelectedReportsForSignature(prev => 
      prev.includes(reportIdStr) 
        ? prev.filter(id => id !== reportIdStr)
        : [...prev, reportIdStr]
    );
  };

  const selectAllReports = () => {
    const allReportIds = filteredStudents
      .filter(s => s.term_report_id)
      .map(s => String(s.term_report_id!));
    setSelectedReportsForSignature(allReportIds);
  };

  const deselectAllReports = () => {
    setSelectedReportsForSignature([]);
  };

  // Enhanced filtering with education level
  const filteredStudents = studentsData?.students.filter(student => {
    const matchesSearch = student.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         student.admission_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEducationLevel = selectedEducationLevelFilter === 'ALL' || student.education_level === selectedEducationLevelFilter;
    return matchesSearch && matchesEducationLevel;
  }) || [];

  // Get unique education levels from students
  const availableEducationLevels = Array.from(
    new Set(studentsData?.students.map(s => s.education_level) || [])
  );

  // Get filtered summary stats
  const filteredSummary = {
    total_students: filteredStudents.length,
    completed_remarks: filteredStudents.filter(s => s.remark_status === 'completed').length,
    completion_percentage: filteredStudents.length > 0 
      ? (filteredStudents.filter(s => s.remark_status === 'completed').length / filteredStudents.length) * 100 
      : 0
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Success/Error Messages */}
      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 sm:p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-green-800 dark:text-green-200 font-medium text-sm sm:text-base">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 sm:p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-800 dark:text-red-200 font-medium text-sm sm:text-base">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Stats */}
      {studentsData && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-4">
            {studentsData.exam_session.name} - Summary
            {selectedEducationLevelFilter !== 'ALL' && (
              <span className="ml-2 text-sm font-normal text-blue-600 dark:text-blue-400">
                ({selectedEducationLevelFilter.replace('_', ' ')})
              </span>
            )}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-4 shadow-sm">
              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Total Students</div>
              <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
                {filteredSummary.total_students}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-4 shadow-sm">
              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Completed Remarks</div>
              <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                {filteredSummary.completed_remarks}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-4 shadow-sm">
              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Completion Rate</div>
              <div className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400">
                {filteredSummary.completion_percentage.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Selector */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-2 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveView('signature')}
            className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl font-medium text-sm sm:text-base transition-all ${
              activeView === 'signature'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Signature Upload</span>
            <span className="sm:hidden">Signature</span>
          </button>
          <button
            onClick={() => setActiveView('remarks')}
            className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl font-medium text-sm sm:text-base transition-all ${
              activeView === 'remarks'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Student Remarks</span>
            <span className="sm:hidden">Remarks</span>
          </button>
        </div>
      </div>

      {/* Signature Upload Section */}
      {activeView === 'signature' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Upload Your Signature</h2>
            
            <div className="space-y-4 sm:space-y-6">
              {uploadedSignatureUrl && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Current Signature
                  </label>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border-2 border-slate-200 dark:border-slate-600">
                    <img 
                      src={uploadedSignatureUrl} 
                      alt="Current Signature" 
                      className="max-h-24 sm:max-h-32 mx-auto"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  {uploadedSignatureUrl ? 'Update Signature' : 'Upload Signature'}
                </label>
                <div className="border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-xl p-4 sm:p-6 text-center hover:border-blue-500 transition-colors bg-blue-50 dark:bg-blue-900/20">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleSignatureUpload}
                    className="hidden"
                    id="signature-upload"
                  />
                  <label htmlFor="signature-upload" className="cursor-pointer">
                    <Upload className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 dark:text-blue-400 mx-auto mb-2 sm:mb-3" />
                    <p className="text-slate-700 dark:text-slate-300 font-medium mb-1 text-sm sm:text-base">
                      Click to upload signature
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                      PNG or JPEG (max 2MB)
                    </p>
                  </label>
                </div>
              </div>

              {signaturePreview && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Preview
                  </label>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border-2 border-slate-200 dark:border-slate-600">
                    <img 
                      src={signaturePreview} 
                      alt="Signature Preview" 
                      className="max-h-24 sm:max-h-32 mx-auto"
                    />
                  </div>
                </div>
              )}

              {signatureFile && (
                <button
                  onClick={handleSignatureSubmit}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium text-sm sm:text-base shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{isLoading ? 'Uploading...' : 'Save Signature'}</span>
                </button>
              )}

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 sm:p-4">
                <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2 text-sm sm:text-base">Guidelines:</h3>
                <ul className="space-y-1 text-xs sm:text-sm text-blue-800 dark:text-blue-300">
                  <li>• Sign on white paper with black or blue ink</li>
                  <li>• Take a clear photo or scan</li>
                  <li>• Ensure signature is centered and visible</li>
                  <li>• Maximum file size: 2MB</li>
                  <li>• Accepted formats: PNG, JPEG</li>
                </ul>
              </div>
            </div>
          </div>

          {uploadedSignatureUrl && studentsData && studentsData.students.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">Apply Signature to Reports</h2>
                <button
                  onClick={() => setShowBulkSignatureModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Bulk Apply</span>
                </button>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Your signature has been uploaded. You can now apply it to student reports individually or in bulk.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Student Remarks Section */}
      {activeView === 'remarks' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Search and Filter */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 sm:w-5 sm:h-5" />
              <input
                type="text"
                placeholder="Search by name or admission number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-4 py-2 text-sm sm:text-base border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              />
            </div>

            {availableEducationLevels.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filter by Level:</span>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedEducationLevelFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedEducationLevelFilter === 'ALL'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    All ({studentsData?.students.length || 0})
                  </button>
                  {availableEducationLevels.map(level => (
                    <button
                      key={level}
                      onClick={() => setSelectedEducationLevelFilter(level)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedEducationLevelFilter === level
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {level.replace('_', ' ')} ({studentsData?.students.filter(s => s.education_level === level).length || 0})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Students List */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Enrolled Students ({filteredStudents.length})
                {selectedEducationLevelFilter !== 'ALL' && (
                  <span className="text-sm font-normal text-blue-600 dark:text-blue-400 ml-2">
                    - {selectedEducationLevelFilter.replace('_', ' ')}
                  </span>
                )}
              </h3>
            </div>
            
            <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="p-6 sm:p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                  Loading students...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-6 sm:p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                  No students found
                </div>
              ) : (
                filteredStudents.map(student => (
                  <div
                    key={student.id}
                    className={`p-3 sm:p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors ${
                      selectedStudent?.id === student.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                    onClick={() => {
                      setSelectedStudent(student);
                      setRemarkText(student.last_remark || '');
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0">
                          {student.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base truncate">
                            {student.full_name}
                          </h4>
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 truncate">
                            {student.admission_number} • {student.student_class}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        {student.average_score !== null && (
                          <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-medium">
                            {student.average_score.toFixed(1)}%
                          </span>
                        )}
                        {student.remark_status === 'completed' && (
                          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                        )}
                        <button className="text-blue-600 dark:text-blue-400 hover:text-blue-700 p-1">
                          <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Remark Form */}
          {selectedStudent && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Add Remark for {selectedStudent.full_name}
                </h3>
                {uploadedSignatureUrl && selectedStudent.term_report_id && (
                  <button
                    onClick={handleApplySignatureToStudent}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all text-xs sm:text-sm font-medium disabled:opacity-50"
                  >
                    <Upload className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>Apply Signature</span>
                  </button>
                )}
              </div>
              
              <div className="space-y-4">
                {remarkTemplates && (
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 sm:p-4">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Quick Templates
                    </label>
                    <div className="space-y-4">
                      {(() => {
                        const remarkKey = mapEducationLevelToRemarkKey(educationLevel);
                        const performanceGroups = remarkTemplates[remarkKey];

                        return Object.entries(performanceGroups).map(
                          ([performanceKey, templates]) =>
                            templates.map((template: string, idx: number) => (
                              <button
                                key={`${remarkKey}-${performanceKey}-${idx}`}
                                onClick={() => insertTemplate(template)}
                                className="px-2 sm:px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs sm:text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors capitalize text-left"
                              >
                                {performanceKey.replace(/_/g, " ")}
                              </button>
                            ))
                        );
                      })()}
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 sm:p-4">
                  <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Class:</span>
                      <span className="ml-2 font-semibold text-slate-900 dark:text-white">{selectedStudent.student_class}</span>
                    </div>
                    {selectedStudent.average_score !== null && (
                      <div>
                        <span className="text-slate-600 dark:text-slate-400">Average:</span>
                        <span className="ml-2 font-semibold text-slate-900 dark:text-white">{selectedStudent.average_score.toFixed(1)}%</span>
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="text-slate-600 dark:text-slate-400">Education Level:</span>
                      <span className="ml-2 font-semibold text-slate-900 dark:text-white capitalize">{selectedStudent.education_level.toLowerCase()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Teacher's Remark ({remarkText.length}/500 characters)
                  </label>
                  <textarea
                    value={remarkText}
                    onChange={(e) => setRemarkText(e.target.value)}
                    rows={6}
                    placeholder="Enter your remark for this student... (minimum 50 characters)"
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  />
                  {remarkText.length > 0 && remarkText.length < 50 && (
                    <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-400 mt-1">
                      Need {50 - remarkText.length} more characters
                    </p>
                  )}
                  {remarkText.length > 500 && (
                    <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 mt-1">
                      Exceeded by {remarkText.length - 500} characters
                    </p>
                  )}
                </div>

                <button
                  onClick={handleRemarkSubmit}
                  disabled={isLoading || remarkText.length < 50 || remarkText.length > 500}
                  className="w-full flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium text-sm sm:text-base shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{isLoading ? 'Saving...' : 'Save Remark'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Signature Modal */}
      {showBulkSignatureModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800">
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">Apply Signature to Multiple Reports</h2>
              <button
                onClick={() => {
                  setShowBulkSignatureModal(false);
                  setSelectedReportsForSignature([]);
                }}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-4 sm:p-6">
              {selectedReportsForSignature.length > 0 && (() => {
                const selectedStudents = filteredStudents.filter(s => 
                  s.term_report_id && selectedReportsForSignature.includes(String(s.term_report_id))
                );
                const levels = [...new Set(selectedStudents.map(s => s.education_level))];
                return (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Education Level: <span className="font-semibold">{levels.join(', ')}</span>
                    {levels.length > 1 && (
                      <span className="text-amber-600 ml-2">⚠️ Multiple levels selected</span>
                    )}
                  </p>
                );
              })()}

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
                <button
                  onClick={selectAllReports}
                  className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-xs sm:text-sm font-medium"
                >
                  Select All ({filteredStudents.filter(s => s.term_report_id).length})
                </button>
                <button
                  onClick={deselectAllReports}
                  className="flex-1 px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-all text-xs sm:text-sm font-medium"
                >
                  Deselect All
                </button>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 sm:p-4 mb-4 max-h-96 overflow-y-auto">
                <div className="space-y-2">
                  {filteredStudents
                    .filter(s => s.term_report_id)
                    .map(student => (
                      <label
                        key={student.id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedReportsForSignature.includes(String(student.term_report_id!))
                            ? 'bg-blue-100 dark:bg-blue-900/30'
                            : 'bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedReportsForSignature.includes(String(student.term_report_id!))}
                          onChange={() => toggleReportSelection(String(student.term_report_id!))}
                          className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base truncate">
                            {student.full_name}
                          </div>
                          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 truncate">
                            {student.admission_number} • {student.student_class} • {student.education_level.replace('_', ' ')}
                          </div>
                        </div>
                        {student.remark_status === 'completed' && (
                          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                        )}
                      </label>
                    ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={handleApplySignatureToSelected}
                  disabled={isLoading || selectedReportsForSignature.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium text-sm sm:text-base shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>
                    {isLoading 
                      ? 'Applying...' 
                      : `Apply to ${selectedReportsForSignature.length} Report${selectedReportsForSignature.length !== 1 ? 's' : ''}`
                    }
                  </span>
                </button>
                <button
                  onClick={() => {
                    setShowBulkSignatureModal(false);
                    setSelectedReportsForSignature([]);
                  }}
                  className="px-4 py-3 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-all font-medium text-sm sm:text-base"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignatureRemarksManagement;


