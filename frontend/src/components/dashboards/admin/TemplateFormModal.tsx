import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExamTemplateService } from '@/services/ExamTemplateService';
import { toast } from 'react-hot-toast';

interface TemplateFormModalProps {
  template: any | null;
  subjects: any[];
  gradeLevels: any[];
  onClose: () => void;
  onSuccess: () => void;
}

interface TemplateSection {
  type: 'objective' | 'theory' | 'practical' | 'custom';
  name: string;
  questionCount: number;
  marksPerQuestion: number;
  totalMarks: number;
  instructions: string;
}

const TemplateFormModal: React.FC<TemplateFormModalProps> = ({
  template,
  subjects,
  gradeLevels,
  onClose,
  onSuccess,
}) => {
  const isEditing = !!template;

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    education_level: '',
    subject_id: 0,
    duration: 120,
    is_shared: false,
  });

  const [sections, setSections] = useState<TemplateSection[]>([
    {
      type: 'objective',
      name: 'Objective Questions',
      questionCount: 20,
      marksPerQuestion: 2,
      totalMarks: 40,
      instructions: 'Answer all questions. Choose the best answer from the options provided.',
    },
  ]);

  const [defaultInstructions, setDefaultInstructions] = useState({
    general: 'Read all instructions carefully before answering.',
    objective: 'Answer all questions. Choose the best answer.',
    theory: 'Answer any 5 questions.',
    practical: 'Follow the instructions for each practical task.',
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        education_level: template.education_level,
        subject_id: template.subject_id || 0,
        duration: template.structure?.duration || 120,
        is_shared: template.is_shared,
      });
      if (template.structure?.sections) {
        setSections(template.structure.sections);
      }
      if (template.defaultInstructions) {
        setDefaultInstructions(template.defaultInstructions);
      }
    }
  }, [template]);

  const addSection = () => {
    setSections([
      ...sections,
      {
        type: 'theory',
        name: 'Theory Questions',
        questionCount: 5,
        marksPerQuestion: 10,
        totalMarks: 50,
        instructions: '',
      },
    ]);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const updateSection = (index: number, field: keyof TemplateSection, value: any) => {
    const newSections = [...sections];
    newSections[index] = { ...newSections[index], [field]: value };

    // Auto-calculate total marks
    if (field === 'questionCount' || field === 'marksPerQuestion') {
      newSections[index].totalMarks =
        newSections[index].questionCount * newSections[index].marksPerQuestion;
    }

    setSections(newSections);
  };

  const calculateTotalMarks = () => {
    return sections.reduce((sum, section) => sum + section.totalMarks, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    if (sections.length === 0) {
      toast.error('Add at least one section');
      return;
    }

    const templateData = {
      ...formData,
      subject_id: formData.subject_id || undefined,
      structure: {
        sections,
        totalMarks: calculateTotalMarks(),
        duration: formData.duration,
      },
      defaultInstructions,
    };

    setLoading(true);
    try {
      if (isEditing) {
        await ExamTemplateService.updateTemplate(template.id, templateData);
        toast.success('Template updated successfully');
      } else {
        await ExamTemplateService.createTemplate(templateData);
        toast.success('Template created successfully');
      }
      onSuccess();
    } catch (error: any) {
      console.error('Error saving template:', error);
      toast.error(error.message || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {isEditing ? 'Edit Template' : 'Create Exam Template'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Template Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Standard Primary Exam"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this template"
                className="w-full px-3 py-2 border rounded-lg"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Education Level *</label>
              <select
                value={formData.education_level}
                onChange={(e) => setFormData({ ...formData, education_level: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="">Select level</option>
                <option value="NURSERY">Nursery</option>
                <option value="PRIMARY">Primary</option>
                <option value="JUNIOR_SECONDARY">Junior Secondary</option>
                <option value="SENIOR_SECONDARY">Senior Secondary</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Subject (Optional)</label>
              <select
                value={formData.subject_id}
                onChange={(e) => setFormData({ ...formData, subject_id: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value={0}>All Subjects</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium mb-2">Exam Duration (minutes)</label>
            <Input
              type="number"
              min="30"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
            />
          </div>

          {/* Sections */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Sections</h3>
              <Button type="button" variant="outline" size="sm" onClick={addSection}>
                <Plus className="w-4 h-4 mr-2" />
                Add Section
              </Button>
            </div>

            <div className="space-y-4">
              {sections.map((section, index) => (
                <div key={index} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">Section {index + 1}</h4>
                    {sections.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeSection(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Section Type</label>
                      <select
                        value={section.type}
                        onChange={(e) => updateSection(index, 'type', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      >
                        <option value="objective">Objective</option>
                        <option value="theory">Theory</option>
                        <option value="practical">Practical</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Section Name</label>
                      <Input
                        value={section.name}
                        onChange={(e) => updateSection(index, 'name', e.target.value)}
                        className="text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Question Count</label>
                      <Input
                        type="number"
                        min="1"
                        value={section.questionCount}
                        onChange={(e) =>
                          updateSection(index, 'questionCount', Number(e.target.value))
                        }
                        className="text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Marks per Question</label>
                      <Input
                        type="number"
                        min="1"
                        value={section.marksPerQuestion}
                        onChange={(e) =>
                          updateSection(index, 'marksPerQuestion', Number(e.target.value))
                        }
                        className="text-sm"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1">
                        Total Marks: <span className="text-blue-600 font-bold">{section.totalMarks}</span>
                      </label>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1">Instructions</label>
                      <textarea
                        value={section.instructions}
                        onChange={(e) => updateSection(index, 'instructions', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                        rows={2}
                        placeholder="Instructions for this section"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <div className="text-sm font-semibold">
                Total Exam Marks: <span className="text-2xl text-blue-600">{calculateTotalMarks()}</span>
              </div>
            </div>
          </div>

          {/* Default Instructions */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Default Instructions</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">General Instructions</label>
                <textarea
                  value={defaultInstructions.general}
                  onChange={(e) =>
                    setDefaultInstructions({ ...defaultInstructions, general: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Share Template */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_shared"
              checked={formData.is_shared}
              onChange={(e) => setFormData({ ...formData, is_shared: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="is_shared" className="text-sm font-medium">
              Share this template with other teachers
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : isEditing ? 'Update Template' : 'Create Template'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TemplateFormModal;
