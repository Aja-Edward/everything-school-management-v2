/**
 * Shared types for ExamEditor components
 */

export interface RichTextEditorProps {
  /** The HTML content value */
  value: string;
  /** Callback when content changes */
  onChange: (content: string) => void;
  /** Placeholder text shown when editor is empty */
  placeholder?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Enable direct file upload for images (uses Cloudinary) */
  enableImageUpload?: boolean;
  /** Enable table editing features */
  enableTables?: boolean;
  /** Minimum height of the editor in pixels */
  minHeight?: number;
  /** Maximum height of the editor in pixels */
  maxHeight?: number;
  /** Additional CSS class names */
  className?: string;
  /** Simplified mode - fewer toolbar options */
  simplified?: boolean;
}

export interface ImageUploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

export interface ImageUploaderProps {
  onUpload: (url: string) => void;
  onError?: (error: string) => void;
  accept?: string;
  maxSizeMB?: number;
}

export interface TableData {
  rows: number;
  cols: number;
  data: string[][];
}

// Question types for exam sections
export interface ObjectiveQuestion {
  id: string | number;
  question: string; // HTML content
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  marks: number;
  imageUrl?: string; // Deprecated - use embedded images in question HTML
  imageAlt?: string; // Deprecated
}

export interface TheoryQuestion {
  id: string | number;
  question: string; // HTML content
  marks: number;
  subQuestions?: TheorySubQuestion[];
  table?: TableData;
  imageUrl?: string; // Deprecated - use embedded images in question HTML
  imageAlt?: string; // Deprecated
}

export interface TheorySubQuestion {
  id: string | number;
  question: string; // HTML content
  marks: number;
  subSubQuestions?: TheorySubSubQuestion[];
}

export interface TheorySubSubQuestion {
  id: string | number;
  question: string; // HTML content
  marks: number;
}

export interface PracticalQuestion {
  id: string | number;
  question: string; // HTML content
  marks: number;
  materials?: string;
  procedure?: string;
  expectedOutcome?: string;
}

export interface CustomSection {
  id: number;
  name: string;
  instructions: string;
  questions: CustomQuestion[];
}

export interface CustomQuestion {
  id: string | number;
  question: string; // HTML content
  marks: number;
  table?: TableData;
}
