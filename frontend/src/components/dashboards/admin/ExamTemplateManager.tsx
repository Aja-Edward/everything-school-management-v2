import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Copy,
  Share2,
  Lock,
  Search,
  FileCheck,
  Clock,
  Target,
} from 'lucide-react';
import {
  ExamTemplateService,
  ExamTemplate,
  ExamTemplateFilters,
} from '@/services/ExamTemplateService';
import { toast } from 'react-hot-toast';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import TemplateFormModal from './TemplateFormModal';
import TemplateApplyModal from './TemplateApplyModal';

interface ExamTemplateManagerProps {
  initialFilters?: ExamTemplateFilters;
}

const ExamTemplateManager: React.FC<ExamTemplateManagerProps> = ({ initialFilters = {} }) => {
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Backend data
  const [subjects, setSubjects] = useState<any[]>([]);
  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);

  // UI State
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ExamTemplate | null>(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ExamTemplate | null>(null);

  // Filters
  const [filters, setFilters] = useState<ExamTemplateFilters>({
    page_size: 20,
    ...initialFilters,
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Load backend data
  useEffect(() => {
    loadBackendData();
  }, []);

  // Load templates
  useEffect(() => {
    loadTemplates();
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

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await ExamTemplateService.getTemplates(filters);
      setTemplates(response.results || []);
      setTotalCount(response.count || 0);
    } catch (error: any) {
      console.error('Error loading templates:', error);
      setError(error.message || 'Failed to load templates');
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setShowForm(true);
  };

  const handleEditTemplate = (template: ExamTemplate) => {
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      await ExamTemplateService.deleteTemplate(id);
      toast.success('Template deleted successfully');
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  const handleDuplicateTemplate = async (id: number) => {
    try {
      await ExamTemplateService.duplicateTemplate(id);
      toast.success('Template duplicated successfully');
      loadTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast.error('Failed to duplicate template');
    }
  };

  const handleToggleShare = async (id: number) => {
    try {
      await ExamTemplateService.toggleShare(id);
      toast.success('Sharing status updated');
      loadTemplates();
    } catch (error) {
      console.error('Error toggling share status:', error);
      toast.error('Failed to update sharing status');
    }
  };

  const handleApplyTemplate = (template: ExamTemplate) => {
    setSelectedTemplate(template);
    setShowApplyModal(true);
  };

  const applyTemplateToExam = async (examId: number, overrideExisting: boolean) => {
    if (!selectedTemplate) return;

    try {
      const response = await ExamTemplateService.applyTemplate(
        selectedTemplate.id,
        examId,
        overrideExisting
      );
      toast.success('Template applied successfully');
      setShowApplyModal(false);
      setSelectedTemplate(null);
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error('Failed to apply template');
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setFilters((prev) => ({ ...prev, search: value, page: 1 }));
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  if (loading && templates.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Exam Templates</h1>
          <p className="text-gray-600 mt-1">
            Create and manage reusable exam structures
          </p>
        </div>
        <Button onClick={handleCreateTemplate}>
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Exam Type Filter */}
            <select
              value={filters.exam_type || ''}
              onChange={(e) => handleFilterChange('exam_type', e.target.value || undefined)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Exam Types</option>
              {ExamTemplateService.getExamTypes().map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            {/* Difficulty Filter */}
            <select
              value={filters.difficulty_level || ''}
              onChange={(e) => handleFilterChange('difficulty_level', e.target.value || undefined)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Difficulties</option>
              {ExamTemplateService.getDifficultyLevels().map((level) => (
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
              My Templates
            </Button>
            <Button
              variant={filters.show_shared ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange('show_shared', !filters.show_shared)}
            >
              Shared Templates
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <FileCheck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No templates found</p>
              <Button onClick={handleCreateTemplate} className="mt-4">
                Create your first template
              </Button>
            </CardContent>
          </Card>
        ) : (
          templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => handleEditTemplate(template)}
              onDelete={() => handleDeleteTemplate(template.id)}
              onDuplicate={() => handleDuplicateTemplate(template.id)}
              onToggleShare={() => handleToggleShare(template.id)}
              onApply={() => handleApplyTemplate(template)}
            />
          ))
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
        <TemplateFormModal
          template={editingTemplate}
          subjects={subjects}
          gradeLevels={gradeLevels}
          onClose={() => {
            setShowForm(false);
            setEditingTemplate(null);
          }}
          onSuccess={() => {
            loadTemplates();
            setShowForm(false);
            setEditingTemplate(null);
          }}
        />
      )}

      {showApplyModal && selectedTemplate && (
        <TemplateApplyModal
          template={selectedTemplate}
          subjects={subjects}
          gradeLevels={gradeLevels}
          onClose={() => {
            setShowApplyModal(false);
            setSelectedTemplate(null);
          }}
          onSuccess={() => {
            setShowApplyModal(false);
            setSelectedTemplate(null);
            loadTemplates();
          }}
        />
      )}
    </div>
  );
};

// Template Card Component
interface TemplateCardProps {
  template: ExamTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleShare: () => void;
  onApply: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleShare,
  onApply,
}) => {
  const usageBadge = ExamTemplateService.getUsageBadge(template.usage_count);
  const difficultyColor = ExamTemplateService.getDifficultyColor(template.difficulty_level);
  const sectionBreakdown = ExamTemplateService.getSectionBreakdown(template);
  const summary = ExamTemplateService.formatTemplateSummary(template);

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg">{template.name}</CardTitle>
            {template.description && (
              <p className="text-sm text-gray-600 mt-1">{template.description}</p>
            )}
          </div>
          {template.is_shared && (
            <Badge variant="outline" className="bg-green-50">
              <Share2 className="w-3 h-3 mr-1" />
              Shared
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Metadata */}
        <div className="flex flex-wrap gap-2">
          <Badge className={difficultyColor}>{template.difficulty_level_display}</Badge>
          <Badge className={usageBadge.color}>{usageBadge.text}</Badge>
          {template.exam_type_display && (
            <Badge variant="outline">{template.exam_type_display}</Badge>
          )}
        </div>

        {/* Summary */}
        {summary && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            <span>{summary}</span>
          </div>
        )}

        {/* Sections */}
        <div className="text-sm">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Target className="w-4 h-4" />
            <span className="font-medium">Sections:</span>
          </div>
          <p className="text-gray-700">{sectionBreakdown}</p>
        </div>

        {/* Subject and Grade */}
        {(template.subject_name || template.grade_level_name) && (
          <div className="text-xs text-gray-600 space-y-1">
            {template.subject_name && <div>Subject: {template.subject_name}</div>}
            {template.grade_level_name && <div>Grade: {template.grade_level_name}</div>}
          </div>
        )}

        {/* Tags */}
        {template.tags && template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {template.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 pt-4 border-t">
          <Button size="sm" onClick={onApply} className="w-full">
            <FileCheck className="w-4 h-4 mr-2" />
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit} className="w-full">
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" onClick={onDuplicate}>
            <Copy className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onToggleShare}>
            {template.is_shared ? <Lock className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>

        {/* Creator info */}
        <div className="text-xs text-gray-500 pt-2 border-t">
          Created by {template.created_by_name}
        </div>
      </CardContent>
    </Card>
  );
};

export default ExamTemplateManager;
