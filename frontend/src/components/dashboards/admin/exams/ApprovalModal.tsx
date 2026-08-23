// components/ApprovalModal.tsx
import React, { useState } from "react";
import { Exam } from "@/services/ExamService";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";

interface Props {
  open: boolean;
  exam?: Exam | null;
  onApprove: (exam: Exam, notes?: string) => void;
  onReject: (exam: Exam, notes?: string) => void;
  onClose: () => void;
}

const ApprovalModal: React.FC<Props> = ({ open, exam, onApprove, onReject, onClose }) => {
  const [notes, setNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  if (!open || !exam) return null;

  /**
   * Exam status is a foreign key, serialized as { id, name, code, ... }.
   * Comparing or lower-casing it directly throws and takes the modal down.
   * Older exams may still carry a plain string.
   */
  const statusCode = (status: any): string =>
    typeof status === 'string'
      ? status.toLowerCase()
      : String(status?.code ?? status?.name ?? '').toLowerCase();

  const examStatus = statusCode(exam.status_display ?? exam.status);

  // The backend only approves exams sitting at pending_approval, so mirror that
  // exactly — offering the action for other states just fails at the server.
  const isPending =
    (exam as any).is_pending_approval === true || examStatus === 'pending_approval';

  // Get readable status
  const getStatusDisplay = () => {
    const label =
      typeof exam.status_display === 'string' && exam.status_display
        ? exam.status_display
        : (exam.status as any)?.name ?? examStatus ?? 'Unknown';
    return String(label)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Get status badge color
  const getStatusBadgeClass = () => {
    if (examStatus.includes('pending')) {
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    } else if (examStatus.includes('approved')) {
      return 'bg-green-100 text-green-800 border-green-300';
    } else if (examStatus.includes('rejected')) {
      return 'bg-red-100 text-red-800 border-red-300';
    }
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const handleApprove = async () => {
    if (!isPending) {
      alert('This exam cannot be approved. Only exams with "Pending Approval" status can be approved.');
      return;
    }
    
    setIsProcessing(true);
    try {
      await onApprove(exam, notes);
      setNotes("");
    } catch (error) {
      console.error('Error approving exam:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!isPending) {
      alert('This exam cannot be rejected. Only exams with "Pending Approval" status can be rejected.');
      return;
    }
    
    setIsProcessing(true);
    try {
      await onReject(exam, notes);
      setNotes("");
    } catch (error) {
      console.error('Error rejecting exam:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        
        {/* Modal Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Exam Approval</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-light transition-colors"
            disabled={isProcessing}
          >
            ×
          </button>
        </div>

        {/* Modal Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Status Warning if not pending */}
          {!isPending && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800">Cannot Process This Exam</p>
                <p className="text-xs text-yellow-700 mt-1">
                  Only exams with "Pending Approval" status can be approved or rejected. 
                  This exam's current status is "{getStatusDisplay()}".
                </p>
              </div>
            </div>
          )}

          {/* Exam Details */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Exam Title</label>
              <p className="text-sm font-semibold text-gray-900 mt-1">{exam.title}</p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</label>
              <p className="text-sm text-gray-900 mt-1">{exam.subject_name || exam.subject || 'N/A'}</p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Current Status</label>
              <div className="mt-1">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClass()}`}>
                  {examStatus.includes('approved') && <CheckCircle className="w-3.5 h-3.5" />}
                  {examStatus.includes('rejected') && <XCircle className="w-3.5 h-3.5" />}
                  {examStatus.includes('pending') && <AlertCircle className="w-3.5 h-3.5" />}
                  {getStatusDisplay()}
                </span>
              </div>
            </div>

            {exam.exam_date && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Exam Date</label>
                <p className="text-sm text-gray-900 mt-1">{new Date(exam.exam_date).toLocaleDateString()}</p>
              </div>
            )}

            {exam.start_time && exam.end_time && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Time</label>
                <p className="text-sm text-gray-900 mt-1">{exam.start_time} - {exam.end_time}</p>
              </div>
            )}

            {exam.duration_minutes && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</label>
                <p className="text-sm text-gray-900 mt-1">{exam.duration_minutes} minutes</p>
              </div>
            )}

            {exam.venue && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Venue</label>
                <p className="text-sm text-gray-900 mt-1">{exam.venue}</p>
              </div>
            )}

            {exam.total_marks && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Marks</label>
                <p className="text-sm text-gray-900 mt-1">{exam.total_marks} marks</p>
              </div>
            )}
          </div>

          {/* Notes Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes {!isPending && '(Read-only)'}
            </label>
            <textarea
              placeholder={isPending ? "Add approval or rejection notes..." : "Cannot add notes - exam status must be 'Pending Approval'"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!isPending || isProcessing}
              className={`w-full px-4 py-2 border rounded-lg resize-none transition-colors ${
                isPending && !isProcessing
                  ? 'border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                  : 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
              }`}
              rows={4}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Cancel' : 'Close'}
          </button>
          
          {isPending && (
            <>
              <button
                onClick={handleReject}
                disabled={isProcessing}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Reject
                  </>
                )}
              </button>
              <button
                onClick={handleApprove}
                disabled={isProcessing}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApprovalModal;