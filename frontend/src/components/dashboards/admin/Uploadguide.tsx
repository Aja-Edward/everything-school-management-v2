import React from 'react';
import { BookOpen, FileText } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface UploadGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onDownloadTemplate: () => void;
}

// ============================================================================
// DATA
// ============================================================================

const COLUMN_DEFINITIONS: { col: string; desc: string }[] = [
  { col: 'first_name / last_name', desc: "Student's full name" },
  { col: 'gender',                 desc: 'M or F' },
  { col: 'date_of_birth',          desc: 'YYYY-MM-DD format' },
  { col: 'education_level',        desc: 'NURSERY, PRIMARY, JUNIOR_SECONDARY, SENIOR_SECONDARY' },
  { col: 'student_class',          desc: 'Exact class name as in the system' },
  { col: 'registration_number',    desc: 'Unique ID (optional)' },
  { col: 'email',                  desc: 'Contact email (optional)' },
];

// ============================================================================
// COMPONENT
// ============================================================================

const UploadGuide: React.FC<UploadGuideProps> = ({ isOpen, onClose, onDownloadTemplate }) => {
  if (!isOpen) return null;

  const handleDownloadAndClose = () => {
    onDownloadTemplate();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-xl max-h-[85vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Bulk Upload Guide</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
            aria-label="Close guide"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-sm text-gray-600">

          {/* Step 1 */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">1. Download the template</h4>
            <p>
              Use <strong>Bulk Upload → Download Template</strong> to get the official CSV file
              with the correct column headers pre-filled.
            </p>
          </div>

          {/* Step 2 */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">2. Fill in student data</h4>
            <p>Complete each row — one student per row. Required columns:</p>
            <ul className="mt-2 space-y-1 list-none">
              {COLUMN_DEFINITIONS.map(({ col, desc }) => (
                <li key={col} className="flex gap-2 items-start">
                  <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono flex-shrink-0">
                    {col}
                  </code>
                  <span className="text-gray-500">{desc}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Step 3 */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">3. Upload the file</h4>
            <p>
              Go to <strong>Bulk Upload → Upload Students</strong>, select your completed file,
              preview the data, then confirm.
            </p>
          </div>

          {/* Tips */}
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <p className="text-amber-800 text-xs">
              <strong>Tips:</strong> Keep the header row intact. Don't merge cells. Save as .csv
              or .xlsx. Max 500 rows per upload.
            </p>
          </div>

          {/* CTA */}
          <div className="pt-2">
            <button
              onClick={handleDownloadAndClose}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Download Template Now
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default UploadGuide;