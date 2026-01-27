import api from './api';

// Exam Review Types (CORRECTED to match backend models)
export interface ExamReview {
  id: number;
  exam: number;
  exam_title?: string;
  status: 'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected';
  status_display: string;
  submitted_by: number;
  submitted_by_name?: string;
  submitted_at: string | null;
  submission_note?: string; // Note to reviewers
  approved_by?: number | null;
  approved_by_name?: string;
  approved_at?: string | null;
  rejection_reason?: string;
  reviewers: ExamReviewer[];
  comments: ExamReviewComment[];
  created_at: string;
  updated_at: string;
}

export interface ExamReviewer {
  id: number;
  review: number;
  reviewer: number;
  reviewer_name?: string;
  reviewer_email?: string;
  assigned_at: string;
  reviewed_at?: string | null;
  decision?: 'approve' | 'request_changes' | 'reject';
  decision_display?: string;
}

export interface ExamReviewComment {
  id: number;
  review: number;
  author: number; // Changed from 'commenter' to match backend
  author_name?: string; // Helper field
  comment: string; // Changed from 'comment_text' to match backend
  question_index?: number | null; // 0-indexed question number
  section?: string; // Changed from 'section_reference' to match backend
  is_resolved: boolean;
  resolved_by?: number | null;
  resolved_by_name?: string;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitForReviewPayload {
  exam_id: number;
  reviewer_ids: number[];
  submission_note?: string; // Changed from 'notes' to match backend
}

export interface ReviewDecisionPayload {
  decision: 'approve' | 'reject' | 'request_changes';
  notes?: string;
  reason?: string; // For rejection
}

export interface AddCommentPayload {
  comment: string; // Changed from 'comment_text' to match backend
  question_index?: number | null;
  section?: string; // Changed from 'section_reference' to match backend
}

export interface ExamReviewFilters {
  status?: string;
  submitted_by?: number;
  exam?: number;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface ExamReviewStatistics {
  total_reviews: number;
  reviews_by_status: Record<string, number>;
  pending_reviews_count: number;
  approved_this_week: number;
  rejected_this_week: number;
  average_review_time_hours: number;
  my_pending_reviews: number;
  reviews_i_submitted: number;
}

export class ExamReviewService {
  private static baseUrl = '/api/exams/exam-reviews';

  /**
   * Get all exam reviews with optional filtering
   */
  static async getReviews(filters: ExamReviewFilters = {}): Promise<{ results: ExamReview[]; count: number; next: string | null; previous: string | null }> {
    try {
      const params = new URLSearchParams();

      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });

      const queryString = params.toString();
      const endpoint = `${this.baseUrl}/${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(endpoint);
      return response;
    } catch (error) {
      console.error('ExamReviewService: Error fetching reviews:', error);
      throw error;
    }
  }

  /**
   * Get a single review by ID
   */
  static async getReview(id: number): Promise<ExamReview> {
    try {
      const response = await api.get(`${this.baseUrl}/${id}/`);
      return response;
    } catch (error) {
      console.error('ExamReviewService: Error fetching review:', error);
      throw error;
    }
  }

  /**
   * Get review by exam ID
   */
  static async getReviewByExam(examId: number): Promise<ExamReview | null> {
    try {
      const response = await this.getReviews({ exam: examId });
      return response.results.length > 0 ? response.results[0] : null;
    } catch (error) {
      console.error('ExamReviewService: Error fetching review by exam:', error);
      throw error;
    }
  }

  /**
   * Submit an exam for review
   */
  static async submitForReview(payload: SubmitForReviewPayload): Promise<ExamReview> {
    try {
      const response = await api.post(`${this.baseUrl}/submit_for_review/`, {
        exam_id: payload.exam_id,
        reviewer_ids: payload.reviewer_ids,
        submission_note: payload.submission_note,
      });
      return response;
    } catch (error) {
      console.error('ExamReviewService: Error submitting for review:', error);
      throw error;
    }
  }

  /**
   * Make a review decision (approve, reject, request changes)
   */
  static async makeDecision(reviewId: number, payload: ReviewDecisionPayload): Promise<ExamReview> {
    try {
      const response = await api.post(`${this.baseUrl}/${reviewId}/make_decision/`, {
        decision: payload.decision,
        notes: payload.notes,
        reason: payload.reason,
      });
      return response;
    } catch (error) {
      console.error('ExamReviewService: Error making review decision:', error);
      throw error;
    }
  }

  /**
   * Add a comment to a review
   */
  static async addComment(reviewId: number, payload: AddCommentPayload): Promise<ExamReviewComment> {
    try {
      const response = await api.post(`${this.baseUrl}/${reviewId}/add_comment/`, {
        comment: payload.comment,
        question_index: payload.question_index,
        section: payload.section,
      });
      return response;
    } catch (error) {
      console.error('ExamReviewService: Error adding comment:', error);
      throw error;
    }
  }

  /**
   * Resolve a comment
   */
  static async resolveComment(reviewId: number, commentId: number): Promise<ExamReviewComment> {
    try {
      const response = await api.post(`${this.baseUrl}/${reviewId}/resolve_comment/`, {
        comment_id: commentId,
      });
      return response;
    } catch (error) {
      console.error('ExamReviewService: Error resolving comment:', error);
      throw error;
    }
  }

  /**
   * Get review queue (exams pending review for current user)
   */
  static async getReviewQueue(): Promise<ExamReview[]> {
    try {
      const response = await api.get(`${this.baseUrl}/queue/`);
      return response.results || response || [];
    } catch (error) {
      console.error('ExamReviewService: Error fetching review queue:', error);
      throw error;
    }
  }

  /**
   * Get review statistics
   */
  static async getStatistics(): Promise<ExamReviewStatistics> {
    try {
      const response = await api.get(`${this.baseUrl}/statistics/`);
      return response;
    } catch (error) {
      console.error('ExamReviewService: Error fetching statistics:', error);
      throw error;
    }
  }

  /**
   * Get review statuses for dropdown
   */
  static getReviewStatuses() {
    return [
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'in_review', label: 'In Review' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'changes_requested', label: 'Changes Requested' },
    ];
  }

  /**
   * Get decision choices for dropdown
   */
  static getDecisionChoices() {
    return [
      { value: 'approve', label: 'Approve' },
      { value: 'request_changes', label: 'Request Changes' },
      { value: 'reject', label: 'Reject' },
    ];
  }

  /**
   * Get status color for UI
   */
  static getStatusColor(status: string): string {
    const colors = {
      draft: 'bg-gray-100 text-gray-800 border-gray-200',
      submitted: 'bg-blue-100 text-blue-800 border-blue-200',
      in_review: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      approved: 'bg-green-100 text-green-800 border-green-200',
      rejected: 'bg-red-100 text-red-800 border-red-200',
      changes_requested: 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200';
  }

  /**
   * Get status icon for UI
   */
  static getStatusIcon(status: string): string {
    const icons = {
      draft: '📝',
      submitted: '📤',
      in_review: '👀',
      approved: '✅',
      rejected: '❌',
      changes_requested: '🔄',
    };
    return icons[status as keyof typeof icons] || '❓';
  }

  /**
   * Check if user can make decision on review
   */
  static canMakeDecision(review: ExamReview, userId: number): boolean {
    // User must be a reviewer and review must be in correct status
    if (review.status !== 'submitted' && review.status !== 'in_review') {
      return false;
    }

    // Check if user is assigned as a reviewer
    return review.reviewers.some(
      (reviewer) => reviewer.reviewer === userId && !reviewer.reviewed_at
    );
  }

  /**
   * Check if user can add comments
   */
  static canAddComments(review: ExamReview, userId: number): boolean {
    // User can comment if they're the submitter or a reviewer
    if (review.submitted_by === userId) {
      return true;
    }

    return review.reviewers.some((reviewer) => reviewer.reviewer === userId);
  }

  /**
   * Get unresolved comments count
   */
  static getUnresolvedCommentsCount(review: ExamReview): number {
    return review.comments.filter((comment) => !comment.is_resolved).length;
  }

  /**
   * Format review timeline text
   */
  static formatReviewTimeline(review: ExamReview): string {
    if (review.status === 'draft') {
      return 'Not yet submitted';
    }

    if (!review.submitted_at) {
      return 'Submitted (no date)';
    }

    const submittedDate = new Date(review.submitted_at);
    const now = new Date();
    const diffMs = now.getTime() - submittedDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 0) {
      if (diffHours === 0) {
        return 'Submitted just now';
      }
      return `Submitted ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays === 1) {
      return 'Submitted 1 day ago';
    } else if (diffDays < 7) {
      return `Submitted ${diffDays} days ago`;
    } else {
      const weeks = Math.floor(diffDays / 7);
      return `Submitted ${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
  }

  /**
   * Validate submit for review payload
   */
  static validateSubmitPayload(payload: SubmitForReviewPayload): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!payload.exam_id) {
      errors.push('Exam ID is required');
    }

    if (!payload.reviewer_ids || payload.reviewer_ids.length === 0) {
      errors.push('At least one reviewer must be assigned');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate decision payload
   */
  static validateDecisionPayload(payload: ReviewDecisionPayload): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!payload.decision) {
      errors.push('Decision is required');
    } else if (!['approve', 'reject', 'request_changes'].includes(payload.decision)) {
      errors.push('Invalid decision value');
    }

    if ((payload.decision === 'reject' || payload.decision === 'request_changes') && !payload.reason && !payload.notes) {
      errors.push('Notes or reason are required for rejection or change requests');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get section display name
   */
  static getSectionDisplayName(sectionRef: string): string {
    const sectionNames: Record<string, string> = {
      objective: 'Objective Questions',
      theory: 'Theory Questions',
      practical: 'Practical Questions',
      custom: 'Custom Sections',
      general: 'General',
    };

    return sectionNames[sectionRef] || sectionRef;
  }

  /**
   * Group comments by section
   */
  static groupCommentsBySection(comments: ExamReviewComment[]): Record<string, ExamReviewComment[]> {
    const grouped: Record<string, ExamReviewComment[]> = {
      general: [],
    };

    comments.forEach((comment) => {
      const section = comment.section || 'general';
      if (!grouped[section]) {
        grouped[section] = [];
      }
      grouped[section].push(comment);
    });

    return grouped;
  }
}
