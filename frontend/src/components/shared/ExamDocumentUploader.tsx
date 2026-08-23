/**
 * Exam Document Uploader Component
 *
 * Allows teachers to upload existing exam documents (PDF, Word, or CSV) and
 * automatically parse them into the platform's exam format.
 *
 * Features:
 * - Drag & drop file upload
 * - PDF, Word, and CSV document support
 * - Real-time parsing progress
 * - Preview of parsed content before importing
 * - Confidence level indication
 * - Warning messages for parsing issues
 */

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import {
  parseExamDocument,
  convertParsedDataToExamFormat,
} from '../../services/DocumentParserService';

interface ExamDocumentUploaderProps {
  onImport: (examData: any) => void;
  onCancel: () => void;
}

export const ExamDocumentUploader: React.FC<ExamDocumentUploaderProps> = ({
  onImport,
  onCancel,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supportedFormats = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/csv', 'application/csv'];
  const supportedExtensions = ['.pdf', '.docx', '.doc', '.csv'];

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (file: File) => {
    setError(null);

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!supportedExtensions.includes(fileExtension)) {
      setError('Unsupported file format. Please upload a PDF, Word, or CSV file (.pdf, .docx, .doc, .csv).');
      return;
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds the 10MB limit.`);
      return;
    }

    setFile(file);
    parseDocument(file);
  };

  const parseDocument = async (file: File) => {
    setIsParsing(true);
    setError(null);

    try {
      console.log('📄 Starting document parsing...');
      const parsed = await parseExamDocument(file);
      console.log('✅ Document parsed successfully:', parsed);

      // Hand the questions straight to the form. A separate confirmation step
      // loses them silently — the parse succeeds, the uploader gets closed,
      // and saving then complains there are no questions. Everything stays
      // editable in the form, so previewing here buys nothing.
      onImport(convertParsedDataToExamFormat(parsed));
    } catch (err) {
      console.error('❌ Document parsing error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse document';

      // Extract helpful information from error if available
      const errorData = (err as any)?.response?.data;
      if (errorData) {
        // Build comprehensive error message with help text
        let fullError = errorData.detail || errorMessage;

        if (errorData.help) {
          fullError += '\n\n' + errorData.help;
        }

        if (errorData.example) {
          fullError += '\n\n' + errorData.example;
        }

        if (errorData.warnings && errorData.warnings.length > 0) {
          fullError += '\n\nIssues found:\n' + errorData.warnings.join('\n');
        }

        setError(fullError);
      } else {
        setError(errorMessage);
      }

      // Fall back to the drop zone, which is where the error box lives, and
      // clear the input too — otherwise re-picking the same file fires no
      // change event and the retry appears to do nothing.
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsParsing(false);
    }
  };

  const [showFormatGuide, setShowFormatGuide] = useState(false);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Upload Exam Document</h2>
        <p className="mt-2 text-sm text-gray-600">
          Upload a PDF, Word, or CSV file containing your exam questions, and we'll automatically
          convert it to the platform format.
        </p>
        <button
          onClick={() => setShowFormatGuide(!showFormatGuide)}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
        >
          {showFormatGuide ? 'Hide' : 'View'} document format guide
        </button>
      </div>

      {/* Format Guide */}
      {showFormatGuide && (
        <div className="rounded-lg bg-blue-50 p-4 border border-blue-200 text-left">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Document Format Guide</h3>
          <div className="text-xs text-blue-800 space-y-2">
            <p><strong>Your document should contain:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Numbered questions (1., 2., 3., etc.)</li>
              <li>For multiple choice: options labeled A., B., C., D., E.</li>
              <li>Optional: Section headers like "Section A" or "OBJECTIVE QUESTIONS"</li>
              <li>Optional: Marks indicated as (5 marks) or [10m]</li>
            </ul>
            <div className="mt-3 bg-white p-3 rounded border border-blue-300 font-mono text-xs">
              <p className="font-semibold mb-2">Example Format:</p>
              <pre className="whitespace-pre-wrap">
{`SECTION A: OBJECTIVE

1. What is 2 + 2?
   A. 2
   B. 3
   C. 4
   D. 5

SECTION B: THEORY

1. Explain photosynthesis. (10 marks)

2. Solve the following:
   a. 2x + 5 = 15
   b. 3x - 7 = 20`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {!file && (
        <>
          {/* Upload Area */}
          <div
            className={`
              relative border-2 border-dashed rounded-lg p-12 text-center
              transition-colors duration-200
              ${isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
              }
            `}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.csv"
              onChange={handleFileSelect}
            />

            <div className="space-y-4">
              <div className="text-6xl">📄</div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {isDragging ? 'Drop your file here' : 'Drag and drop your exam document'}
                </h3>
                <p className="mt-1 text-sm text-gray-500">or</p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2"
                  variant="outline"
                >
                  Browse Files
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Supported formats: PDF, Word, CSV (.pdf, .docx, .doc, .csv)
                <br />
                Maximum file size: 10MB
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 border border-red-200">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-red-800">Upload Error</h3>
                  <div className="mt-2 text-sm text-red-700 whitespace-pre-wrap">
                    {error}
                  </div>
                  {!showFormatGuide && (
                    <button
                      onClick={() => setShowFormatGuide(true)}
                      className="mt-3 text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      View document format guide
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={onCancel} variant="outline">
              Cancel
            </Button>
          </div>
        </>
      )}

      {/* Parsing Progress */}
      {isParsing && (
        <Card className="p-6">
          <div className="flex items-center justify-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <div>
              <h3 className="font-semibold text-gray-900">Parsing Document...</h3>
              <p className="text-sm text-gray-600">
                Analyzing {file?.name} and extracting questions
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ExamDocumentUploader;
