import React, { useState } from 'react';
import { X, CheckCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExamTemplateService } from '@/services/ExamTemplateService';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface TemplateApplyModalProps {
  template: any;
  subjects: any[];
  gradeLevels: any[];
  onClose: () => void;
  onSuccess: () => void;
}

const TemplateApplyModal: React.FC<TemplateApplyModalProps> = ({
  template,
  subjects,
  gradeLevels,
  onClose,
  onSuccess,
}) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    subject: template.subject_id || 0,
    grade_level: 0,
    exam_date: '',
    academic_session: 0,
    term: 0,
  });
  const [loading, setLoading] = useState(false);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Exam title is required');
      return;
    }

    if (!formData.subject || !formData.grade_level) {
      toast.error('Subject and grade level are required');
      return;
    }

    setLoading(true);
    try {
      const result = await ExamTemplateService.applyTemplate(template.id, formData);
      toast.success('Exam created from template successfully!');

      // Navigate to the new exam
      if (result.exam_id) {
        navigate(`/admin/exams/${result.exam_id}/edit`);
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error applying template:', error);
      toast.error(error.message || 'Failed to apply template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Apply Exam Template</h2>
            <p className="text-sm text-gray-600 mt-1">
              Create a new exam based on: <span className="font-medium">{template.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleApply} className="p-6 space-y-6">
          {/* Template Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-2">Template Structure</h3>
                <div className="space-y-2 text-sm text-blue-900">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-medium">Education Level:</span>{' '}
                      {template.education_level}
                    </div>
                    <div>
                      <span className="font-medium">Duration:</span>{' '}
                      {template.structure?.duration || 0} minutes
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium">Total Marks:</span>{' '}
                      {template.structure?.totalMarks || 0}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-blue-300">
                    <div className="font-medium mb-1">Sections:</div>
                    <ul className="space-y-1">
                      {template.structure?.sections?.map((section: any, index: number) => (
                        <li key={index} className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span>
                            {section.name} - {section.questionCount} questions ({section.totalMarks}{' '}
                            marks)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Exam Details */}
          <div>
            <label className="block text-sm font-medium mb-2">Exam Title *</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Mid-Term Mathematics Exam - Primary 3"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Subject *</label>
              <select
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value={0}>Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
              {template.subject_id && (
                <p className="text-xs text-gray-500 mt-1">
                  Template is specific to:{' '}
                  {subjects.find((s) => s.id === template.subject_id)?.name || 'Unknown'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Grade Level *</label>
              <select
                value={formData.grade_level}
                onChange={(e) => setFormData({ ...formData, grade_level: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value={0}>Select grade level</option>
                {gradeLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Exam Date</label>
            <Input
              type="date"
              value={formData.exam_date}
              onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
            />
          </div>

          {/* Info Box */}
          <div className="bg-gray-50 border rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2">What happens next?</h4>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• A new exam will be created with the template structure</li>
              <li>• Section structure and marks allocation will be pre-configured</li>
              <li>• Default instructions will be included</li>
              <li>• You can add questions and customize as needed</li>
              <li>• You'll be redirected to the exam editor after creation</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? 'Creating Exam...' : 'Apply Template & Create Exam'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TemplateApplyModal;
