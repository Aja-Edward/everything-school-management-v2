/**
 * Document Parser Service
 *
 * Parses uploaded exam documents (PDF, Word, CSV) and converts them to the platform's exam format.
 *
 * Supported formats:
 *   - PDF  (.pdf)
 *   - Word (.docx, .doc)
 *   - CSV  (.csv)
 *
 * Auth strategy: httpOnly cookies via `credentials: 'include'`.
 * CSRF token is read from the readable `csrftoken` cookie and sent as `X-CSRFToken`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface ParserLibraryStatus {
  pdf_parsing: { available: boolean; version: string | null };
  word_parsing: { available: boolean; version: string | null };
  csv_parsing: { available: boolean; version: string };
  max_file_size_mb: number;
  supported_formats: string[];
}

type DocumentType = 'pdf' | 'word' | 'csv';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'doc', 'csv'] as const;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const PARSE_TIMEOUT_MS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the CSRF token from the readable `csrftoken` cookie.
 * This cookie is intentionally not httpOnly so the client can send it back
 * as a header, protecting against CSRF attacks on mutating requests.
 */
function getCsrfToken(): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrftoken='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/**
 * Build shared request headers.
 * Auth is handled automatically by httpOnly cookies via `credentials: 'include'`.
 */
function buildHeaders(options: { includeCsrf?: boolean } = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const tenantSlug = localStorage.getItem('tenantSlug');
  if (tenantSlug) {
    headers['X-Tenant-Slug'] = tenantSlug;
  }

  if (options.includeCsrf) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }
  }

  return headers;
}

/**
 * Resolve a file extension to the document type expected by the backend.
 */
function resolveDocumentType(extension: string): DocumentType {
  if (extension === 'pdf') return 'pdf';
  if (extension === 'csv') return 'csv';
  return 'word';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an uploaded document and convert it to the platform's exam format.
 */
export async function parseExamDocument(file: File): Promise<ParsedExamData> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new Error(
      'Unsupported file format. Please upload a PDF (.pdf), Word (.docx, .doc), or CSV (.csv) file.'
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('File size exceeds 10 MB. Please upload a smaller file.');
  }

  console.log('📄 Parsing exam document:', { name: file.name, size: file.size, extension });

  try {
    return await parseDocumentViaBackend(file, resolveDocumentType(extension));
  } catch (error) {
    console.error('❌ Error parsing document:', error);
    throw error instanceof Error
      ? error
      : new Error('An unexpected error occurred while parsing the document.');
  }
}

/**
 * Fetch the backend's document parser library availability status.
 */
export async function getDocumentParserStatus(): Promise<ParserLibraryStatus> {
  const response = await fetch('/api/exams/parser-status/', {
    method: 'GET',
    credentials: 'include',
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch parser status (HTTP ${response.status}).`);
  }

  return response.json();
}

/**
 * Convert parsed exam data into the platform's internal exam format.
 */
export function convertParsedDataToExamFormat(parsedData: ParsedExamData) {
  if (!parsedData?.sections || !Array.isArray(parsedData.sections)) {
    throw new Error('Cannot convert: parsed data has no valid sections.');
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

  for (const section of parsedData.sections) {
    if (!section?.questions || !Array.isArray(section.questions)) {
      console.warn('Skipping invalid section:', section);
      continue;
    }

    try {
      processSection(section, examData);
    } catch (error) {
      console.error('Error processing section:', section.name, error);
    }
  }

  const totalQuestions =
    examData.objective_questions.length +
    examData.theory_questions.length +
    examData.practical_questions.length +
    examData.custom_sections.reduce((sum: number, s: any) => sum + (s.questions?.length ?? 0), 0);

  if (totalQuestions === 0) {
    throw new Error(
      'No valid questions found in the document. Please check the document format and try again.'
    );
  }

  console.log('✅ Converted parsed data to exam format:', {
    objective: examData.objective_questions.length,
    theory: examData.theory_questions.length,
    practical: examData.practical_questions.length,
    custom: examData.custom_sections.length,
    totalQuestions,
  });

  return examData;
}

/**
 * Generate an HTML preview of parsed exam data (for display before importing).
 */
export function generateExamPreviewHTML(parsedData: ParsedExamData): string {
  const { title, metadata, sections, totalMarks, durationMinutes, instructions } = parsedData;

  const warningsHTML =
    metadata.warnings.length > 0
      ? `<div class="warnings">
           <h3>⚠️ Warnings</h3>
           <ul>${metadata.warnings.map((w) => `<li>${w}</li>`).join('')}</ul>
         </div>`
      : '';

  const instructionsHTML = instructions
    ? `<div class="instructions"><h3>Instructions</h3><div>${instructions}</div></div>`
    : '';

  const sectionsHTML = sections
    .map((section) => {
      const previewQuestions = section.questions
        .slice(0, 3)
        .map(
          (q, i) => `
          <div class="question-preview">
            <strong>${i + 1}.</strong> ${q.question.substring(0, 150)}…
            ${q.marks ? `<span class="marks">(${q.marks} marks)</span>` : ''}
          </div>`
        )
        .join('');

      const moreHTML =
        section.questions.length > 3
          ? `<p class="more">… and ${section.questions.length - 3} more questions</p>`
          : '';

      return `
        <div class="section">
          <h3>${section.name}</h3>
          ${section.instructions ? `<p class="section-instructions">${section.instructions}</p>` : ''}
          <p class="question-count">${section.questions.length} questions</p>
          <div class="questions-preview">${previewQuestions}${moreHTML}</div>
        </div>`;
    })
    .join('');

  return `
    <div class="exam-preview">
      <div class="preview-header">
        <h2>${title}</h2>
        <div class="metadata">
          <span class="badge ${metadata.confidence}">${metadata.confidence.toUpperCase()} CONFIDENCE</span>
          <span class="info">Total Sections: ${sections.length}</span>
          ${totalMarks ? `<span class="info">Total Marks: ${totalMarks}</span>` : ''}
          ${durationMinutes ? `<span class="info">Duration: ${durationMinutes} min</span>` : ''}
        </div>
      </div>
      ${warningsHTML}
      ${instructionsHTML}
      ${sectionsHTML}
    </div>`;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function parseDocumentViaBackend(file: File, documentType: DocumentType): Promise<ParsedExamData> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_type', documentType);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch('/api/exams/parse-document/', {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: buildHeaders({ includeCsrf: true }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Document parsing timed out. The file may be too large or complex.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  const parsedData: ParsedExamData = await response.json();
  validateParsedData(parsedData);

  console.log('✅ Document parsed successfully:', {
    title: parsedData.title,
    sections: parsedData.sections.length,
    confidence: parsedData.metadata.confidence,
    warnings: parsedData.metadata.warnings.length,
  });

  return parsedData;
}

/** Throw a descriptive error based on the HTTP error response. */
async function handleErrorResponse(response: Response): Promise<never> {
  let detail = response.statusText || 'Failed to parse document';

  try {
    const errorData = await response.json();
    detail = errorData.detail || errorData.message || detail;
  } catch {
    // Response body wasn't JSON — keep statusText fallback
  }

  const messages: Record<number, string> = {
    400: `Invalid document: ${detail}`,
    413: 'Document is too large. Maximum size is 10 MB.',
    415: 'Unsupported file format. Please upload a PDF, Word, or CSV document.',
    500: `Server error while parsing document: ${detail}`,
  };

  throw new Error(messages[response.status] ?? detail);
}

/** Throw if the parsed response is structurally invalid. */
function validateParsedData(data: unknown): asserts data is ParsedExamData {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response from server: expected parsed exam data.');
  }

  const d = data as Partial<ParsedExamData>;

  if (!Array.isArray(d.sections)) {
    throw new Error('Invalid response from server: missing or invalid sections.');
  }

  if (!d.metadata) {
    throw new Error('Invalid response from server: missing metadata.');
  }
}

/** Map marks value to a valid positive number, falling back to `fallback`. */
function normalizeMarks(marks: unknown, fallback = 1): number {
  return typeof marks === 'number' && marks > 0 ? marks : fallback;
}

/** Mutate `examData` with the content of one parsed section. */
function processSection(section: ParsedSection, examData: any): void {
  const validQuestions = section.questions.filter((q) => q?.question);

  switch (section.type) {
    case 'objective':
      examData.objective_questions = validQuestions.map((q) => ({
        question: q.question,
        optionA: q.options?.optionA ?? '',
        optionB: q.options?.optionB ?? '',
        optionC: q.options?.optionC ?? '',
        optionD: q.options?.optionD ?? '',
        optionE: q.options?.optionE ?? '',
        correctAnswer: q.correctAnswer ?? '',
        marks: normalizeMarks(q.marks),
      }));
      examData.objective_instructions = section.instructions ?? '';
      break;

    case 'theory':
      examData.theory_questions = validQuestions.map((q) => ({
        question: q.question,
        expectedPoints: q.expectedPoints ?? '',
        marks: normalizeMarks(q.marks),
        subQuestions: (q.subQuestions ?? [])
          .filter((sq) => sq?.question)
          .map((sq) => ({
            question: sq.question,
            expectedPoints: sq.expectedPoints ?? '',
            marks: normalizeMarks(sq.marks),
          })),
      }));
      examData.theory_instructions = section.instructions ?? '';
      break;

    case 'practical':
      examData.practical_questions = validQuestions.map((q) => ({
        task: q.question,
        expectedOutcome: q.expectedPoints ?? '',
        marks: normalizeMarks(q.marks),
      }));
      examData.practical_instructions = section.instructions ?? '';
      break;

    default:
      if (validQuestions.length > 0) {
        examData.custom_sections.push({
          name: section.name || 'Custom Section',
          instructions: section.instructions ?? '',
          questions: validQuestions.map((q) => ({
            question: q.question,
            marks: normalizeMarks(q.marks),
          })),
        });
      }
  }
}