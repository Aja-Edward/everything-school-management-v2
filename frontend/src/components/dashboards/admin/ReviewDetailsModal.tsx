import React, { useState } from 'react';
import { X, MessageCircle, CheckCircle, XCircle, AlertCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExamReviewService } from '@/services/ExamReviewService';
import { toast } from 'react-hot-toast';

interface ReviewDetailsModalProps {
  review: any;
  onClose: () => void;
  onSuccess: () => void;
}

const ReviewDetailsModal: React.FC<ReviewDetailsModalProps> = ({
  review,
  onClose,
  onSuccess,
}) => {
  const [comment, setComment] = useState('');
  const [decision, setDecision] = useState<'approve' | 'request_changes' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddComment = async () => {
    if (!comment.trim()) {
      toast.error('Comment cannot be empty');
      return;
    }

    setLoading(true);
    try {
      await ExamReviewService.addComment(review.id, {
        comment: comment.trim(),
        question_index: undefined,
        section: undefined,
      });
      toast.success('Comment added successfully');
      setComment('');
      onSuccess();
    } catch (error: any) {
      console.error('Error adding comment:', error);
      toast.error(error.message || 'Failed to add comment');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitDecision = async () => {
    if (!decision) {
      toast.error('Please select a decision');
      return;
    }

    setLoading(true);
    try {
      await ExamReviewService.submitDecision(review.id, {
        decision,
        notes: notes.trim(),
      });
      toast.success(
        decision === 'approve'
          ? 'Exam approved successfully'
          : decision === 'reject'
          ? 'Exam rejected'
          : 'Changes requested'
      );
      onSuccess();
    } catch (error: any) {
      console.error('Error submitting decision:', error);
      toast.error(error.message || 'Failed to submit decision');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; icon: any; label: string }> = {
      draft: { color: 'bg-gray-100 text-gray-800', icon: AlertCircle, label: 'Draft' },
      submitted: { color: 'bg-blue-100 text-blue-800', icon: Send, label: 'Submitted' },
      in_review: { color: 'bg-yellow-100 text-yellow-800', icon: MessageCircle, label: 'In Review' },
      changes_requested: {
        color: 'bg-orange-100 text-orange-800',
        icon: AlertCircle,
        label: 'Changes Requested',
      },
      approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Approved' },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Rejected' },
    };

    const badge = badges[status] || badges.draft;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        <Icon className="w-4 h-4" />
        {badge.label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Review Exam</h2>
            <p className="text-sm text-gray-600 mt-1">
              {review.exam_title || 'Exam'} - {getStatusBadge(review.status)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Exam Details */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold mb-3">Exam Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Submitted by:</span>{' '}
                <span className="font-medium">{review.submitted_by_name || 'Unknown'}</span>
              </div>
              <div>
                <span className="text-gray-600">Submitted at:</span>{' '}
                <span className="font-medium">
                  {review.submitted_at ? new Date(review.submitted_at).toLocaleString() : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Subject:</span>{' '}
                <span className="font-medium">{review.subject_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">Grade Level:</span>{' '}
                <span className="font-medium">{review.grade_level_name || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Reviewers */}
          {review.reviewers && review.reviewers.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Reviewers</h3>
              <div className="space-y-2">
                {review.reviewers.map((reviewer: any, index: number) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 rounded p-3">
                    <div>
                      <div className="font-medium">{reviewer.name}</div>
                      <div className="text-xs text-gray-600">{reviewer.role}</div>
                    </div>
                    <div className="text-sm">
                      {reviewer.reviewed_at ? (
                        <span className="text-green-600">
                          Reviewed {new Date(reviewer.reviewed_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-gray-500">Pending</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <h3 className="font-semibold mb-3">Comments & Discussion</h3>

            {review.comments && review.comments.length > 0 ? (
              <div className="space-y-3 mb-4">
                {review.comments.map((c: any) => (
                  <div key={c.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-medium">{c.author_name}</div>
                        <div className="text-xs text-gray-600">
                          {new Date(c.created_at).toLocaleString()}
                        </div>
                      </div>
                      {c.resolved && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Resolved
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700">{c.comment}</div>
                    {c.question_index !== undefined && (
                      <div className="text-xs text-gray-500 mt-1">
                        Question {c.question_index + 1} • {c.section}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4">No comments yet</p>
            )}

            {/* Add Comment */}
            <div className="flex gap-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
                rows={2}
              />
              <Button
                onClick={handleAddComment}
                disabled={loading || !comment.trim()}
                size="sm"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Comment
              </Button>
            </div>
          </div>

          {/* Decision Section (if not approved/rejected) */}
          {review.status !== 'approved' && review.status !== 'rejected' && (
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4">Submit Review Decision</h3>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setDecision('approve')}
                    className={`p-4 border-2 rounded-lg transition ${
                      decision === 'approve'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-green-300'
                    }`}
                  >
                    <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-2" />
                    <div className="text-sm font-medium">Approve</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecision('request_changes')}
                    className={`p-4 border-2 rounded-lg transition ${
                      decision === 'request_changes'
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-orange-300'
                    }`}
                  >
                    <AlertCircle className="w-6 h-6 text-orange-600 mx-auto mb-2" />
                    <div className="text-sm font-medium">Request Changes</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecision('reject')}
                    className={`p-4 border-2 rounded-lg transition ${
                      decision === 'reject'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-red-300'
                    }`}
                  >
                    <XCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
                    <div className="text-sm font-medium">Reject</div>
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Review Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes about your decision (optional)"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    rows={3}
                  />
                </div>

                <Button
                  onClick={handleSubmitDecision}
                  disabled={loading || !decision}
                  className="w-full"
                >
                  {loading ? 'Submitting...' : 'Submit Review Decision'}
                </Button>
              </div>
            </div>
          )}

          {/* Final Decision (if approved/rejected) */}
          {(review.status === 'approved' || review.status === 'rejected') && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">Final Decision</h3>
              <div className="text-sm space-y-1">
                <div>
                  <span className="text-gray-600">Status:</span> {getStatusBadge(review.status)}
                </div>
                {review.approved_by && (
                  <div>
                    <span className="text-gray-600">By:</span>{' '}
                    <span className="font-medium">{review.approved_by_name || review.approved_by}</span>
                  </div>
                )}
                {review.approved_at && (
                  <div>
                    <span className="text-gray-600">At:</span>{' '}
                    <span className="font-medium">{new Date(review.approved_at).toLocaleString()}</span>
                  </div>
                )}
                {review.rejection_reason && (
                  <div className="mt-2">
                    <span className="text-gray-600">Reason:</span>
                    <div className="mt-1 p-2 bg-white rounded text-sm">{review.rejection_reason}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

export default ReviewDetailsModal;
