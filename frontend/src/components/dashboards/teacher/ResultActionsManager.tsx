// ResultActionsManager.tsx
import React, { useState } from 'react';
import ResultRecordingForm from '@/components/dashboards/teacher/ResultRecordingForm';
import ViewResultModal from '@/components/dashboards/teacher/ViewResultModal';
import ResultService from '@/services/ResultService';
import { toast } from 'react-toastify';
import { StudentResult } from '@/types/types';
import { X } from 'lucide-react';

interface ResultActionsManagerProps {
  onDataRefresh: () => void;
}

interface ResultActionsManager {
  handleEditResult: (result: StudentResult) => void;
  handleViewResult: (result: StudentResult) => void;
  handleDeleteResult: (result: StudentResult) => void;
  ResultModalsComponent: React.FC;
}

const useResultActionsManager = (onDataRefresh: () => void): ResultActionsManager => {
  const [selectedResult, setSelectedResult] = useState<StudentResult | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit');

  const handleEditResult = (result: StudentResult) => {
    const transformedResult = {
      ...result,
      student_id: result.student.id,
      subject_id: result.subject.id,
      exam_session_id: result.exam_session.id,
      // student.education_level is the most reliable source
      education_level: result.student?.education_level || result.education_level || '',
    };
    setSelectedResult(transformedResult);
    setModalMode('edit');
    setShowEditModal(true);
  };

  const handleViewResult = (result: StudentResult) => {
    setSelectedResult(result);
    setShowViewModal(true);
  };

  const handleDeleteResult = async (result: StudentResult) => {
    if (!window.confirm('Are you sure you want to delete this result?')) return;
    try {
      console.log('Delete result object:', result);
      
      // Try to use provided id if present and non-empty
      let resultId: string | null = null;
      const candidates: Array<string | number | undefined> = [
        (result as any)?.id,
        (result as any)?.pk,
      ];
      for (const c of candidates) {
        if (c !== undefined && c !== null && String(c).trim() !== '' && String(c) !== '0' && String(c) !== 'NaN') {
          resultId = String(c);
          break;
        }
      }

      const educationLevel = (result as any)?.education_level as string | undefined;
      const studentId = (result as any)?.student?.id ?? (result as any)?.student_id;
      const subjectId = (result as any)?.subject?.id ?? (result as any)?.subject_id;
      const examSessionId = (result as any)?.exam_session?.id ?? (result as any)?.exam_session_id;

      console.log('Delete lookup values:', { studentId, subjectId, examSessionId, educationLevel });

      if (!resultId) {
        // Only try composite lookup if we have valid values
        if (studentId && subjectId && examSessionId && educationLevel) {
          const resolvedId = await ResultService.findResultIdByComposite({
            student: String(studentId),
            subject: String(subjectId),
            exam_session: String(examSessionId),
            education_level: String(educationLevel),
          });
          resultId = resolvedId;
        }
      }

      if (!resultId) {
        throw new Error('Missing result id for delete');
      }

      const effectiveEducationLevel = educationLevel ?? (result as any)?.student?.education_level;
      if (!effectiveEducationLevel) {
        throw new Error('Missing education level for delete');
      }

      await ResultService.deleteStudentResult(resultId, effectiveEducationLevel);
      toast.success('Result deleted successfully');
      await onDataRefresh();
    } catch (err) {
      console.error('Error deleting result:', err);
      toast.error('Failed to delete result');
    }
  };

  const handleCloseModals = () => {
    setShowEditModal(false);
    setShowViewModal(false);
    setSelectedResult(null);
    setModalMode('edit');
  };

  const handleResultSuccess = async (): Promise<void> => {
    try {
      await onDataRefresh(); // Reload the data
      handleCloseModals(); // Close the modal
      toast.success('Result saved successfully');
    } catch (error) {
      console.error('Error handling result success:', error);
      toast.error('Failed to reload data');
    }
  };

  const ResultModalsComponent: React.FC = () => (
    <>
      {/* View Modal */}
      {showViewModal && selectedResult && (
        <ViewResultModal
          result={selectedResult}
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && selectedResult && modalMode === 'edit' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Edit Result</h2>
                <button onClick={handleCloseModals} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {/* Debug info - remove in production */}
              {/* <div className="mb-4 p-2 bg-gray-100 text-xs">
                <strong>Debug - Selected Result:</strong>
                <pre>{JSON.stringify(selectedResult, null, 2)}</pre>
              </div> */}
              
              <ResultRecordingForm
                isOpen={true}
                onClose={handleCloseModals}
                onResultCreated={onDataRefresh}
                onSuccess={handleResultSuccess}
                editResult={selectedResult}
                mode="edit"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );

  return {
    handleEditResult,
    handleViewResult,
    handleDeleteResult,
    ResultModalsComponent
  };
};

export default useResultActionsManager;