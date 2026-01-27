import React, { useState, useEffect } from 'react';
import {
  Eye,
  MessageCircle,
  User,
} from 'lucide-react';
import {
  ExamReviewService,
  ExamReview,
} from '@/services/ExamReviewService';
import { toast } from 'react-hot-toast';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ReviewDetailsModal from './ReviewDetailsModal';

interface ExamReviewManagerProps {
  examId?: number; // If provided, show review for specific exam
  mode?: 'queue' | 'my-submissions' | 'all'; // Default to 'queue'
}

const ExamReviewManager: React.FC<ExamReviewManagerProps> = ({
  examId,
  mode = 'queue',
}) => {
  const [reviews, setReviews] = useState<ExamReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Backend data
  const [teachers, setTeachers] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);

  // UI State
  const [selectedReview, setSelectedReview] = useState<ExamReview | null>(null);

  useEffect(() => {
    loadCurrentUser();
    loadBackendData();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadReviews();
    }
  }, [mode, examId, currentUser]);

  const loadCurrentUser = async () => {
    try {
      const response = await api.get('auth/dj-rest-auth/user/');
      setCurrentUser(response);
    } catch (error) {
      console.error('Error loading current user:', error);
    }
  };

  const loadBackendData = async () => {
    try {
      const [teachersData, examsData] = await Promise.all([
        api.get('teachers/teachers/'),
        api.get('exams/exams/'),
      ]);

      setTeachers(teachersData.results || teachersData || []);
      setExams(examsData.results || examsData || []);
    } catch (error) {
      console.error('Error loading backend data:', error);
      toast.error('Failed to load data');
    }
  };

  const loadReviews = async () => {
    try {
      setLoading(true);

      let reviewsData: ExamReview[] = [];

      if (examId) {
        // Load review for specific exam
        const review = await ExamReviewService.getReviewByExam(examId);
        reviewsData = review ? [review] : [];
      } else if (mode === 'queue') {
        // Load review queue (pending reviews for current user)
        reviewsData = await ExamReviewService.getReviewQueue();
      } else if (mode === 'my-submissions') {
        // Load reviews submitted by current user
        const response = await ExamReviewService.getReviews({
          submitted_by: currentUser?.id,
        });
        reviewsData = response.results || [];
      } else {
        // Load all reviews
        const response = await ExamReviewService.getReviews({});
        reviewsData = response.results || [];
      }

      setReviews(reviewsData);
    } catch (error: any) {
      console.error('Error loading reviews:', error);
      setError(error.message || 'Failed to load reviews');
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };


  if (loading && reviews.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading reviews...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">
            {mode === 'queue' ? 'Review Queue' : mode === 'my-submissions' ? 'My Submissions' : 'All Reviews'}
          </h1>
          <p className="text-gray-600 mt-1">
            {mode === 'queue'
              ? 'Exams waiting for your review'
              : mode === 'my-submissions'
                ? 'Exams you submitted for review'
                : 'All exam reviews'}
          </p>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {mode === 'queue'
                  ? 'No pending reviews'
                  : mode === 'my-submissions'
                    ? 'You haven\'t submitted any exams for review yet'
                    : 'No reviews found'}
              </p>
            </CardContent>
          </Card>
        ) : (
          reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              currentUserId={currentUser?.id}
              onViewDetails={(r) => setSelectedReview(r)}
            />
          ))
        )}
      </div>

      {/* Review Details Modal */}
      {selectedReview && (
        <ReviewDetailsModal
          review={selectedReview}
          onClose={() => setSelectedReview(null)}
          onSuccess={() => {
            setSelectedReview(null);
            loadReviews();
          }}
        />
      )}
    </div>
  );
};

// Review Card Component
interface ReviewCardProps {
  review: ExamReview;
  currentUserId: number;
  onViewDetails: (review: ExamReview) => void;
}

const ReviewCard: React.FC<ReviewCardProps> = ({
  review,
  currentUserId,
  onViewDetails,
}) => {
  const statusColor = ExamReviewService.getStatusColor(review.status);
  const statusIcon = ExamReviewService.getStatusIcon(review.status);
  const timeline = ExamReviewService.formatReviewTimeline(review);
  const unresolvedCount = ExamReviewService.getUnresolvedCommentsCount(review);

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold mb-2">{review.exam_title}</h3>
            <p className="text-sm text-gray-600">{review.exam_code}</p>
          </div>
          <Badge className={statusColor}>
            <span className="mr-1">{statusIcon}</span>
            {review.status_display}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div>
            <span className="text-gray-600">Submitted by:</span>
            <div className="font-medium">{review.submitted_by_name}</div>
          </div>
          <div>
            <span className="text-gray-600">Timeline:</span>
            <div className="font-medium">{timeline}</div>
          </div>
        </div>

        {/* Reviewers */}
        {review.reviewers && review.reviewers.length > 0 && (
          <div className="mb-4">
            <span className="text-sm text-gray-600">Reviewers:</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {review.reviewers.map((reviewer) => (
                <Badge
                  key={reviewer.id}
                  variant="outline"
                  className={ExamReviewService.getRoleColor(reviewer.role)}
                >
                  <User className="w-3 h-3 mr-1" />
                  {reviewer.reviewer_name} ({reviewer.role_display})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Comments indicator */}
        {review.comments && review.comments.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <MessageCircle className="w-4 h-4" />
            <span>{review.comments.length} comment(s)</span>
            {unresolvedCount > 0 && (
              <Badge variant="outline" className="bg-yellow-50">
                {unresolvedCount} unresolved
              </Badge>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button size="sm" onClick={() => onViewDetails(review)} className="w-full">
            <Eye className="w-4 h-4 mr-2" />
            View & Review
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExamReviewManager;
