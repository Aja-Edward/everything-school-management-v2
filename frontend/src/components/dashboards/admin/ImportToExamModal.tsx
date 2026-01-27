import React, { useState } from 'react';
import { X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImportToExamModalProps {
  exams: any[];
  selectedCount: number;
  onImport: (examId: number, sectionType: string) => Promise<void>;
  onClose: () => void;
}

const ImportToExamModal: React.FC<ImportToExamModalProps> = ({
  exams,
  selectedCount,
  onImport,
  onClose,
}) => {
  const [selectedExam, setSelectedExam] = useState<number>(0);
  const [sectionType, setSectionType] = useState<string>('objective');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!selectedExam) {
      alert('Please select an exam');
      return;
    }

    setLoading(true);
    try {
      await onImport(selectedExam, sectionType);
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Import Questions to Exam</h2>
            <p className="text-sm text-gray-600 mt-1">
              Import {selectedCount} selected question{selectedCount !== 1 ? 's' : ''} into an exam
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Select Exam */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Exam *</label>
            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value={0}>Choose an exam...</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title} - {exam.subject_name} ({exam.grade_level_name})
                </option>
              ))}
            </select>
            {exams.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                No exams available. Create an exam first before importing questions.
              </p>
            )}
          </div>

          {/* Select Section Type */}
          <div>
            <label className="block text-sm font-medium mb-2">Import to Section *</label>
            <select
              value={sectionType}
              onChange={(e) => setSectionType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="objective">Objective Questions (Multiple Choice)</option>
              <option value="theory">Theory Questions (Essay)</option>
              <option value="practical">Practical Questions</option>
              <option value="custom">Custom Section</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Questions will be added to this section of the exam
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <Upload className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">Import Notes:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Questions will be appended to the selected section</li>
                  <li>• Existing questions in the exam will not be affected</li>
                  <li>• You can reorder or remove questions after import</li>
                  <li>• Question format will be preserved (text, images, tables)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2">Import Summary</h4>
            <div className="space-y-1 text-sm text-gray-700">
              <p>
                <span className="font-medium">Questions to import:</span> {selectedCount}
              </p>
              <p>
                <span className="font-medium">Destination section:</span>{' '}
                {sectionType.charAt(0).toUpperCase() + sectionType.slice(1)}
              </p>
              {selectedExam > 0 && (
                <p>
                  <span className="font-medium">Target exam:</span>{' '}
                  {exams.find((e) => e.id === selectedExam)?.title || 'Unknown'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading || !selectedExam || exams.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            {loading ? 'Importing...' : `Import ${selectedCount} Question${selectedCount !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImportToExamModal;
