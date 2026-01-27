import React from 'react';
import { X, BarChart3, PieChart, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QuestionBankStatistics, QuestionBankService } from '@/services/QuestionBankService';

interface QuestionBankStatisticsModalProps {
  statistics: QuestionBankStatistics;
  onClose: () => void;
}

const QuestionBankStatisticsModal: React.FC<QuestionBankStatisticsModalProps> = ({
  statistics,
  onClose,
}) => {
  const formatQuestionPreview = (question: any) => {
    return QuestionBankService.formatQuestionPreview(question.question, 80);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold">Question Bank Statistics</h2>
              <p className="text-sm text-gray-600">Overview of your question bank</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Total Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{statistics.total_questions}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Shared Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {statistics.shared_questions_count}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {((statistics.shared_questions_count / statistics.total_questions) * 100).toFixed(1)}%
                  of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Private Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {statistics.private_questions_count}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {((statistics.private_questions_count / statistics.total_questions) * 100).toFixed(1)}%
                  of total
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Questions by Type */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="w-5 h-5" />
                Questions by Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(statistics.questions_by_type).map(([type, count]) => (
                  <div key={type} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">
                        {QuestionBankService.getQuestionTypeIcon(type)}
                      </span>
                      <span className="text-sm font-medium capitalize">{type}</span>
                    </div>
                    <div className="text-2xl font-bold">{count}</div>
                    <p className="text-xs text-gray-500">
                      {((count / statistics.total_questions) * 100).toFixed(1)}%
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Questions by Difficulty */}
          <Card>
            <CardHeader>
              <CardTitle>Questions by Difficulty</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(statistics.questions_by_difficulty).map(([difficulty, count]) => {
                  const colorClass = QuestionBankService.getDifficultyColor(difficulty);
                  return (
                    <div key={difficulty} className={`rounded-lg p-4 border ${colorClass}`}>
                      <div className="text-sm font-medium capitalize mb-1">{difficulty}</div>
                      <div className="text-2xl font-bold">{count}</div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className="h-2 rounded-full bg-current"
                          style={{
                            width: `${(count / statistics.total_questions) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs mt-1">
                        {((count / statistics.total_questions) * 100).toFixed(1)}%
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Questions by Subject */}
          <Card>
            <CardHeader>
              <CardTitle>Questions by Subject</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {statistics.questions_by_subject.map(({ subject, count }) => (
                  <div key={subject} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="font-medium">{subject}</div>
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{
                            width: `${(count / statistics.total_questions) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-sm font-bold w-16 text-right">{count}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Most Used Questions */}
          {statistics.most_used_questions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Most Used Questions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {statistics.most_used_questions.slice(0, 5).map((question, index) => {
                    const usageBadge = QuestionBankService.getUsageBadge(question.usage_count);
                    return (
                      <div
                        key={question.id}
                        className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm font-medium mb-1 line-clamp-2"
                            dangerouslySetInnerHTML={{
                              __html: formatQuestionPreview(question),
                            }}
                          />
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <span>{question.subject_name}</span>
                            <span>•</span>
                            <span>{question.grade_level_name}</span>
                            <span>•</span>
                            <span className={usageBadge.color + ' px-2 py-0.5 rounded'}>
                              {usageBadge.text}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recently Added */}
          {statistics.recently_added.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recently Added Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {statistics.recently_added.slice(0, 5).map((question) => (
                    <div key={question.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-medium mb-1 line-clamp-2"
                          dangerouslySetInnerHTML={{
                            __html: formatQuestionPreview(question),
                          }}
                        />
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span>{question.subject_name}</span>
                          <span>•</span>
                          <span>{question.grade_level_name}</span>
                          <span>•</span>
                          <span>{new Date(question.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
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

export default QuestionBankStatisticsModal;
