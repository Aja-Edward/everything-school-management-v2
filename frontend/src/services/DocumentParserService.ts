/**
 * Document Parser Service
 *
 * Parses uploaded exam documents (PDF, Word, CSV) and converts them to the platform's exam format.
 * Supports:
 * - PDF files (.pdf)
 * - Word documents (.docx, .doc)
 * - CSV files (.csv)
 *
 * Uses AI-assisted parsing to:
 * - Extract questions and structure
 * - Identify question types (objective, theory, practical)
 * - Detect sections and instructions
 * - Preserve formatting, images, and tables
 */

export interface ParsedQuestion {
  question: string; // HTML content
  type: 'objective' | 'theory' | 'practical' | 'custom';
  options?: {
    optionA?: string;
    optionB?: string;
    optionC?: string;
    optionD?: string;
    optionE?: string;
  };
  correctAnswer?: string;
  marks?: number;
  expectedPoints?: string;
  subQuestions?: ParsedQuestion[];
}

export interface ParsedSection {
  type: 'objective' | 'theory' | 'practical' | 'custom';
  name: string;
  instructions?: string;
  questions: ParsedQuestion[];
}

export interface ParsedExamData {
  title: string;
  instructions?: string;
  totalMarks?: number;
  durationMinutes?: number;
  sections: ParsedSection[];
  metadata: {
    originalFileName: string;
    parsedAt: string;
    confidence: 'high' | 'medium' | 'low';
    warnings: string[];
  };
}

/**
 * Parse an uploaded document and convert to exam format
 */
export async function parseExamDocument(file: File): Promise<ParsedExamData> {
  const fileExtension = file.name.split('.').pop()?.toLowerCase();

  console.log('📄 Parsing exam document:', {
    name: file.name,
    size: file.size,
    type: fileExtension
  });

  // Validate file type
  if (!['pdf', 'docx', 'doc', 'csv'].includes(fileExtension || '')) {
    throw new Error(
      'Unsupported file format. Please upload a PDF (.pdf), Word (.docx, .doc), or CSV (.csv) file.'
    );
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error('File size exceeds 10MB limit. Please upload a smaller file.');
  }

  try {
    if (fileExtension === 'pdf') {
      return await parsePDFDocument(file);
    } else if (fileExtension === 'csv') {
      return await parseCSVDocument(file);
    } else {
      return await parseWordDocument(file);
    }
  } catch (error) {
    console.error('❌ Error parsing document:', error);
    throw new Error(
      `Failed to parse document: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse PDF document
 */
async function parsePDFDocument(file: File): Promise<ParsedExamData> {
  // For PDF parsing, we'll use a backend endpoint
  // The backend will use libraries like PyPDF2 or pdfplumber
  return await parseDocumentViaBackend(file, 'pdf');
}

/**
 * Parse Word document
 */
async function parseWordDocument(file: File): Promise<ParsedExamData> {
  // For Word parsing, we'll use a backend endpoint
  // The backend will use libraries like python-docx or mammoth
  return await parseDocumentViaBackend(file, 'word');
}

/**
 * Parse CSV document
 */
async function parseCSVDocument(file: File): Promise<ParsedExamData> {
  // For CSV parsing, we'll use a backend endpoint
  // The backend will parse the CSV using Python's csv module
  return await parseDocumentViaBackend(file, 'csv');
}

/**
 * Send document to backend for parsing
 */
async function parseDocumentViaBackend(
  file: File,
  documentType: 'pdf' | 'word' | 'csv'
): Promise<ParsedExamData> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_type', documentType);

  try {
    // Create abort controller for timeout (30 seconds for large documents)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // Build authentication headers (matching api.ts)
    const headers: Record<string, string> = {
      // Don't set Content-Type, browser will set it with boundary for FormData
      Accept: 'application/json',
    };

    // Add tenant header for multi-tenant API calls
    const tenantSlug = localStorage.getItem('tenantSlug');
    if (tenantSlug) {
      headers['X-Tenant-Slug'] = tenantSlug;
    }

    // Add Authorization header (for development cross-origin)
    const authToken = localStorage.getItem('authToken');
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Add CSRF token for POST requests
    const csrfToken = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrftoken='))
      ?.split('=')[1];
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }

    const response = await fetch('/api/exams/parse-document/', {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = 'Failed to parse document';
      let errorData: any = null;

      try {
        errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch (e) {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }

      // Create error with additional data attached
      const error: any = new Error(errorMessage);
      error.response = {
        status: response.status,
        data: errorData
      };

      // Provide more specific error messages based on status
      if (response.status === 400) {
        error.message = `Invalid document: ${errorMessage}`;
        throw error;
      } else if (response.status === 413) {
        error.message = 'Document is too large. Maximum size is 10MB.';
        throw error;
      } else if (response.status === 415) {
        error.message = 'Unsupported file format. Please upload a PDF or Word document.';
        throw error;
      } else if (response.status === 500) {
        error.message = `Server error while parsing document: ${errorMessage}`;
        throw error;
      } else {
        throw error;
      }
    }

    const parsedData: ParsedExamData = await response.json();

    // Validate the parsed data structure
    if (!parsedData || typeof parsedData !== 'object') {
      throw new Error('Invalid response from server: expected parsed exam data');
    }

    if (!parsedData.sections || !Array.isArray(parsedData.sections)) {
      throw new Error('Invalid response from server: missing or invalid sections');
    }

    if (!parsedData.metadata) {
      throw new Error('Invalid response from server: missing metadata');
    }

    console.log('✅ Document parsed successfully:', {
      title: parsedData.title,
      sections: parsedData.sections.length,
      confidence: parsedData.metadata.confidence,
      warnings: parsedData.metadata?.warnings?.length || 0
    });

    return parsedData;
  } catch (error) {
    if (error instanceof Error) {
      // Handle timeout error
      if (error.name === 'AbortError') {
        throw new Error('Document parsing timed out. The file may be too large or complex.');
      }
      // Re-throw other errors
      throw error;
    }
    throw new Error('An unexpected error occurred while parsing the document');
  }
}

/**
 * Convert parsed exam data to platform exam format
 */
export function convertParsedDataToExamFormat(parsedData: ParsedExamData) {
  // Validate input
  if (!parsedData) {
    throw new Error('Cannot convert: parsed data is null or undefined');
  }

  if (!parsedData.sections || !Array.isArray(parsedData.sections)) {
    throw new Error('Cannot convert: parsed data has no valid sections');
  }

  const examData: any = {
    title: parsedData.title || 'Imported Exam',
    instructions: parsedData.instructions || '',
    total_marks: parsedData.totalMarks || 100,
    duration_minutes: parsedData.durationMinutes || 120,
    objective_questions: [],
    theory_questions: [],
    practical_questions: [],
    custom_sections: [],
    objective_instructions: '',
    theory_instructions: '',
    practical_instructions: '',
  };

  // Process each section
  for (const section of parsedData.sections) {
    // Validate section structure
    if (!section || !section.questions || !Array.isArray(section.questions)) {
      console.warn('Skipping invalid section:', section);
      continue;
    }

    try {
      if (section.type === 'objective') {
        examData.objective_questions = section.questions
          .filter(q => q && q.question) // Only include valid questions
          .map((q) => ({
            question: q.question,
            optionA: q.options?.optionA || '',
            optionB: q.options?.optionB || '',
            optionC: q.options?.optionC || '',
            optionD: q.options?.optionD || '',
            optionE: q.options?.optionE || '',
            correctAnswer: q.correctAnswer || '',
            marks: typeof q.marks === 'number' && q.marks > 0 ? q.marks : 1,
          }));
        examData.objective_instructions = section.instructions || '';
      } else if (section.type === 'theory') {
        examData.theory_questions = section.questions
          .filter(q => q && q.question) // Only include valid questions
          .map((q) => ({
            question: q.question,
            expectedPoints: q.expectedPoints || '',
            marks: typeof q.marks === 'number' && q.marks > 0 ? q.marks : 1,
            subQuestions: (q.subQuestions || [])
              .filter(sq => sq && sq.question) // Only include valid sub-questions
              .map((sq) => ({
                question: sq.question,
                expectedPoints: sq.expectedPoints || '',
                marks: typeof sq.marks === 'number' && sq.marks > 0 ? sq.marks : 1,
              })),
          }));
        examData.theory_instructions = section.instructions || '';
      } else if (section.type === 'practical') {
        examData.practical_questions = section.questions
          .filter(q => q && q.question) // Only include valid questions
          .map((q) => ({
            task: q.question,
            expectedOutcome: q.expectedPoints || '',
            marks: typeof q.marks === 'number' && q.marks > 0 ? q.marks : 1,
          }));
        examData.practical_instructions = section.instructions || '';
      } else {
        // Custom section
        const validQuestions = section.questions.filter(q => q && q.question);
        if (validQuestions.length > 0) {
          examData.custom_sections.push({
            name: section.name || 'Custom Section',
            instructions: section.instructions || '',
            questions: validQuestions.map((q) => ({
              question: q.question,
              marks: typeof q.marks === 'number' && q.marks > 0 ? q.marks : 1,
            })),
          });
        }
      }
    } catch (error) {
      console.error('Error processing section:', section.name, error);
      // Continue with other sections
      continue;
    }
  }

  // Validate we have at least some content
  const totalQuestions =
    examData.objective_questions.length +
    examData.theory_questions.length +
    examData.practical_questions.length +
    examData.custom_sections.reduce((sum: number, s: any) => sum + (s.questions?.length || 0), 0);

  if (totalQuestions === 0) {
    throw new Error('No valid questions found in the document. Please check the document format and try again.');
  }

  console.log('✅ Converted parsed data to exam format:', {
    objective: examData.objective_questions.length,
    theory: examData.theory_questions.length,
    practical: examData.practical_questions.length,
    custom: examData.custom_sections.length,
    totalQuestions
  });

  return examData;
}

/**
 * Check document parser library status
 */
export interface ParserLibraryStatus {
  pdf_parsing: {
    available: boolean;
    version: string | null;
  };
  word_parsing: {
    available: boolean;
    version: string | null;
  };
  csv_parsing: {
    available: boolean;
    version: string;
  };
  max_file_size_mb: number;
  supported_formats: string[];
}

export async function getDocumentParserStatus(): Promise<ParserLibraryStatus> {
  try {
    // Build authentication headers (matching api.ts)
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    // Add tenant header for multi-tenant API calls
    const tenantSlug = localStorage.getItem('tenantSlug');
    if (tenantSlug) {
      headers['X-Tenant-Slug'] = tenantSlug;
    }

    // Add Authorization header (for development cross-origin)
    const authToken = localStorage.getItem('authToken');
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch('/api/exams/parser-status/', {
      method: 'GET',
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
      throw new Error('Failed to fetch parser status');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching document parser status:', error);
    throw error;
  }
}

/**
 * Preview parsed exam data before importing
 */
export function generateExamPreviewHTML(parsedData: ParsedExamData): string {
  let html = `
    <div class="exam-preview">
      <div class="preview-header">
        <h2>${parsedData.title}</h2>
        <div class="metadata">
          <span class="badge ${parsedData.metadata.confidence}">${parsedData.metadata.confidence.toUpperCase()} CONFIDENCE</span>
          <span class="info">Total Sections: ${parsedData.sections.length}</span>
          ${parsedData.totalMarks ? `<span class="info">Total Marks: ${parsedData.totalMarks}</span>` : ''}
          ${parsedData.durationMinutes ? `<span class="info">Duration: ${parsedData.durationMinutes} min</span>` : ''}
        </div>
      </div>
  `;

  if (parsedData.metadata.warnings.length > 0) {
    html += `
      <div class="warnings">
        <h3>⚠️ Warnings</h3>
        <ul>
          ${parsedData.metadata.warnings.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (parsedData.instructions) {
    html += `
      <div class="instructions">
        <h3>Instructions</h3>
        <div>${parsedData.instructions}</div>
      </div>
    `;
  }

  for (const section of parsedData.sections) {
    html += `
      <div class="section">
        <h3>${section.name}</h3>
        ${section.instructions ? `<p class="section-instructions">${section.instructions}</p>` : ''}
        <p class="question-count">${section.questions.length} questions</p>

        <div class="questions-preview">
          ${section.questions.slice(0, 3).map((q, i) => `
            <div class="question-preview">
              <strong>${i + 1}.</strong> ${q.question.substring(0, 150)}...
              ${q.marks ? `<span class="marks">(${q.marks} marks)</span>` : ''}
            </div>
          `).join('')}
          ${section.questions.length > 3 ? `<p class="more">... and ${section.questions.length - 3} more questions</p>` : ''}
        </div>
      </div>
    `;
  }

  html += `</div>`;

  return html;
}
