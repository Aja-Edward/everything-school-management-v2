import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Copy,
  Share2,
  Lock,
  Search,
  Filter,
  X,
  FileText,
  Download,
  Upload,
  BarChart3,
} from 'lucide-react';
import {
  QuestionBankService,
  QuestionBank,
  QuestionBankCreateData,
  QuestionBankFilters,
  QuestionBankStatistics,
} from '@/services/QuestionBankService';
import { toast } from 'react-hot-toast';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import QuestionFormModal from './QuestionFormModal';
import ImportToExamModal from './ImportToExamModal';
import QuestionBankStatisticsModal from './QuestionBankStatisticsModal';

interface QuestionBankManagerProps {
  initialFilters?: QuestionBankFilters;
}

const QuestionBankManager: React.FC<QuestionBankManagerProps> = ({ initialFilters = {} }) => {
  const [questions, setQuestions] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Backend data
  const [subjects, setSubjects] = useState<any[]>([]);
  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);

  // UI State
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionBank | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showStatistics, setShowStatistics] = useState(false);
  const [statistics, setStatistics] = useState<QuestionBankStatistics | null>(null);

  // Filters
  const [filters, setFilters] = useState<QuestionBankFilters>({
    page_size: 20,
    ...initialFilters,
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Selection state
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);

  // Pagination
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Load backend data
  useEffect(() => {
    loadBackendData();
  }, []);

  // Load questions
  useEffect(() => {
    loadQuestions();
  }, [filters]);

  const loadBackendData = async () => {
    try {
      const [subjectsData, gradeLevelsData, examsData] = await Promise.all([
        api.get('subjects/'),
        api.get('classrooms/grades/'),
        api.get('exams/exams/'),
      ]);

      setSubjects(subjectsData.results || subjectsData || []);
      setGradeLevels(gradeLevelsData.results || gradeLevelsData || []);
      setExams(examsData.results || examsData || []);
    } catch (error) {
      console.error('Error loading backend data:', error);
      toast.error('Failed to load form data');
    }
  };

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const response = await QuestionBankService.getQuestions(filters);
      setQuestions(response.results || []);
      setTotalCount(response.count || 0);
    } catch (error: any) {
      console.error('Error loading questions:', error);
      setError(error.message || 'Failed to load questions');
      toast.error('Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const stats = await QuestionBankService.getStatistics();
      setStatistics(stats);
      setShowStatistics(true);
    } catch (error) {
      console.error('Error loading statistics:', error);
      toast.error('Failed to load statistics');
    }
  };

  const handleCreateQuestion = () => {
    setEditingQuestion(null);
    setShowForm(true);
  };

  const handleEditQuestion = (question: QuestionBank) => {
    setEditingQuestion(question);
    setShowForm(true);
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!confirm('Are you sure you want to delete this question?')) return;

    try {
      await QuestionBankService.deleteQuestion(id);
      toast.success('Question deleted successfully');
      loadQuestions();
    } catch (error) {
      console.error('Error deleting question:', error);
      toast.error('Failed to delete question');
    }
  };

  const handleDuplicateQuestion = async (id: number) => {
    try {
      await QuestionBankService.duplicateQuestion(id);
      toast.success('Question duplicated successfully');
      loadQuestions();
    } catch (error) {
      console.error('Error duplicating question:', error);
      toast.error('Failed to duplicate question');
    }
  };

  const handleToggleShare = async (id: number) => {
    try {
      await QuestionBankService.toggleShare(id);
      toast.success('Sharing status updated');
      loadQuestions();
    } catch (error) {
      console.error('Error toggling share status:', error);
      toast.error('Failed to update sharing status');
    }
  };

  const handleImportToExam = async (examId: number, sectionType: string) => {
    if (selectedQuestions.length === 0) {
      toast.error('Please select questions to import');
      return;
    }

    try {
      const response = await QuestionBankService.importToExam({
        exam_id: examId,
        question_ids: selectedQuestions,
        section_type: sectionType as any,
      });
      toast.success(`${response.imported_count} questions imported successfully`);
      setSelectedQuestions([]);
      setShowImportModal(false);
    } catch (error) {
      console.error('Error importing questions:', error);
      toast.error('Failed to import questions');
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setFilters((prev) => ({ ...prev, search: value, page: 1 }));
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const toggleQuestionSelection = (id: number) => {
    setSelectedQuestions((prev) =>
      prev.includes(id) ? prev.filter((qId) => qId !== id) : [...prev, id]
    );
  };

  const selectAllQuestions = () => {
    if (selectedQuestions.length === questions.length) {
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(questions.map((q) => q.id));
    }
  };

  // Filtered questions for display
  const filteredQuestions = useMemo(() => {
    return questions;
  }, [questions]);

  if (loading && questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading questions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Question Bank</h1>
          <p className="text-gray-600 mt-1">
            Manage reusable questions for your exams
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadStatistics} variant="outline">
            <BarChart3 className="w-4 h-4 mr-2" />
            Statistics
          </Button>
          <Button onClick={handleCreateQuestion}>
            <Plus className="w-4 h-4 mr-2" />
            Add Question
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search questions..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Question Type Filter */}
            <select
              value={filters.question_type || ''}
              onChange={(e) => handleFilterChange('question_type', e.target.value || undefined)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Types</option>
              {QuestionBankService.getQuestionTypes().map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            {/* Difficulty Filter */}
            <select
              value={filters.difficulty || ''}
              onChange={(e) => handleFilterChange('difficulty', e.target.value || undefined)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Difficulties</option>
              {QuestionBankService.getDifficultyLevels().map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>

            {/* Subject Filter */}
            <select
              value={filters.subject || ''}
              onChange={(e) =>
                handleFilterChange('subject', e.target.value ? Number(e.target.value) : undefined)
              }
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              variant={filters.only_mine ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange('only_mine', !filters.only_mine)}
            >
              My Questions
            </Button>
            <Button
              variant={filters.show_shared ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange('show_shared', !filters.show_shared)}
            >
              Shared Questions
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedQuestions.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">
                {selectedQuestions.length} question(s) selected
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowImportModal(true)}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import to Exam
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedQuestions([])}
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear Selection
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions List */}
      <div className="space-y-4">
        {filteredQuestions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No questions found</p>
              <Button onClick={handleCreateQuestion} className="mt-4">
                Create your first question
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4">
              <input
                type="checkbox"
                checked={
                  selectedQuestions.length === questions.length && questions.length > 0
                }
                onChange={selectAllQuestions}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-600">Select all</span>
            </div>

            {filteredQuestions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                isSelected={selectedQuestions.includes(question.id)}
                onSelect={() => toggleQuestionSelection(question.id)}
                onEdit={() => handleEditQuestion(question)}
                onDelete={() => handleDeleteQuestion(question.id)}
                onDuplicate={() => handleDuplicateQuestion(question.id)}
                onToggleShare={() => handleToggleShare(question.id)}
              />
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalCount > (filters.page_size || 20) && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => {
              setCurrentPage((prev) => prev - 1);
              handleFilterChange('page', currentPage - 1);
            }}
          >
            Previous
          </Button>
          <span className="px-4 py-2">
            Page {currentPage} of {Math.ceil(totalCount / (filters.page_size || 20))}
          </span>
          <Button
            variant="outline"
            disabled={currentPage >= Math.ceil(totalCount / (filters.page_size || 20))}
            onClick={() => {
              setCurrentPage((prev) => prev + 1);
              handleFilterChange('page', currentPage + 1);
            }}
          >
            Next
          </Button>
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <QuestionFormModal
          question={editingQuestion}
          subjects={subjects}
          gradeLevels={gradeLevels}
          onClose={() => {
            setShowForm(false);
            setEditingQuestion(null);
          }}
          onSuccess={() => {
            loadQuestions();
            setShowForm(false);
            setEditingQuestion(null);
          }}
        />
      )}

      {showImportModal && (
        <ImportToExamModal
          exams={exams}
          selectedCount={selectedQuestions.length}
          onImport={handleImportToExam}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showStatistics && statistics && (
        <QuestionBankStatisticsModal
          statistics={statistics}
          onClose={() => setShowStatistics(false)}
        />
      )}
    </div>
  );
};

// Question Card Component
interface QuestionCardProps {
  question: QuestionBank;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleShare: () => void;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleShare,
}) => {
  const usageBadge = QuestionBankService.getUsageBadge(question.usage_count);
  const difficultyColor = QuestionBankService.getDifficultyColor(question.difficulty);
  const questionIcon = QuestionBankService.getQuestionTypeIcon(question.question_type);

  return (
    <Card className={isSelected ? 'border-blue-500 bg-blue-50' : ''}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            className="w-4 h-4 mt-1"
          />

          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{questionIcon}</span>
                  <Badge variant="outline">{question.question_type_display}</Badge>
                  <Badge className={difficultyColor}>{question.difficulty_display}</Badge>
                  <Badge className={usageBadge.color}>{usageBadge.text}</Badge>
                  {question.is_shared && (
                    <Badge variant="outline" className="bg-green-50">
                      <Share2 className="w-3 h-3 mr-1" />
                      Shared
                    </Badge>
                  )}
                </div>

                <div
                  className="text-sm text-gray-700 mb-2"
                  dangerouslySetInnerHTML={{
                    __html: QuestionBankService.formatQuestionPreview(question.question, 200),
                  }}
                />

                <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                  <span>Subject: {question.subject_name}</span>
                  <span>•</span>
                  <span>Grade: {question.grade_level_name}</span>
                  <span>•</span>
                  <span>Marks: {question.marks}</span>
                  {question.topic && (
                    <>
                      <span>•</span>
                      <span>Topic: {question.topic}</span>
                    </>
                  )}
                </div>

                {question.tags && question.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {question.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={onEdit}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={onDuplicate}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={onToggleShare}>
                  {question.is_shared ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={onDelete}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default QuestionBankManager;
