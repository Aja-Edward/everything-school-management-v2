/**
 * Exam HTML Generator - HTML-First Approach
 *
 * UPDATED: 2025-01-22
 * Generates print-ready HTML for exam PDFs with embedded rich content.
 *
 * Works with normalized exam data from examDataNormalizer.ts where:
 * - Question content contains embedded images, tables, and formatting from RichTextEditor
 * - All rich content is stored in the question HTML (HTML-first approach)
 * - Backward compatibility maintained for legacy separate image/table fields
 *
 * Features:
 * - Student copy (questions only)
 * - Teacher copy (questions + answers/marking guide)
 * - Proper CSS styling for embedded images, tables, and formatted text
 * - Print-optimized layout with page break control
 * - Renders HTML content from Tiptap RichTextEditor as-is
 *
 * @see examDataNormalizer.ts for data normalization before PDF generation
 */

import { Exam } from "../services/ExamService";
import { normalizeForPdfGeneration } from "./examDataNormalizer";

// ===========================
// HELPER FUNCTIONS
// ===========================

/**
 * Safely convert any value to string
 */
function safeString(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Convert numbers to Roman numerals (for sub-sub-questions)
 */
function toRomanNumeral(num: number): string {
  const romanNumerals: [number, string][] = [
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
  ];
  let result = '';
  for (const [value, numeral] of romanNumerals) {
    while (num >= value) {
      result += numeral;
      num -= value;
    }
  }
  return result;
}

/**
 * Process and render rich content (images, tables, formatted text)
 *
 * UPDATED: HTML-First Approach
 * Handles HTML content from RichTextEditor (Tiptap) which embeds:
 * - Images as <img> tags
 * - Tables as <table> elements
 * - Text formatting as HTML tags
 *
 * @param content - HTML content from RichTextEditor or plain text
 * @returns Styled HTML string ready for PDF rendering
 */
function renderRichContent(content: any): string {
  const contentStr = safeString(content);

  if (!contentStr) return '';

  let processedContent = contentStr;

  // BACKWARD COMPATIBILITY: Handle plain image URLs (legacy approach)
  // Modern exams have images embedded in HTML from RichTextEditor
  if (processedContent.match(/^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i)) {
    console.log('⚠️ Legacy: Plain image URL found:', processedContent.substring(0, 100));
    processedContent = `<img src="${processedContent}" alt="Question Image" style="max-width: 100%; height: auto; margin: 10px 0; display: block; border: 1px solid #ddd; border-radius: 4px; padding: 4px;" />`;
  }

  // HTML content from RichTextEditor is returned as-is
  // The CSS styles in the PDF template will handle all formatting:
  // - .question-content img { ... } styles images
  // - .question-content table { ... } styles tables
  // - Other HTML tags (p, strong, em, ul, ol, etc.) are styled by base CSS
  return processedContent;
}

// ===========================
// MAIN PDF GENERATION FUNCTION
// ===========================

/**
 * Generate complete HTML document for exam printing
 *
 * @param exam - Exam data (will be normalized internally)
 * @param copyType - "student" (questions only) or "teacher" (with answers)
 * @param settings - School settings for branding
 * @returns Complete HTML document string
 */
export function generateExamHtml(
  exam: Exam,
  copyType: "student" | "teacher" = "student",
  settings?: any
): string {
  console.log('📄 Generating exam HTML...', {
    copyType,
    hasObjective: !!exam.objective_questions?.length,
    hasTheory: !!exam.theory_questions?.length,
    hasPractical: !!exam.practical_questions?.length,
    hasCustom: !!exam.custom_sections?.length
  });

  // CRITICAL: Normalize exam data for PDF generation
  // This ensures:
  // - Plain text is converted to HTML
  // - Images from both Admin (inline) and Teacher (separate fields) work
  // - Tables in all formats are converted to HTML
  // - Content is optimized for PDF output
  const normalized = normalizeForPdfGeneration(exam);

  if (!normalized) {
    console.error('❌ Failed to normalize exam data');
    return '<html><body><h1>Error: Failed to generate exam</h1></body></html>';
  }

  // Use dynamic school information from settings
  const schoolName = safeString(settings?.school_name || 'School Name');
  const schoolAddress = safeString(settings?.address || 'School Address');
  const academicSession = safeString(settings?.academicYear || 'Academic Year');
  const currentTerm = safeString(settings?.currentTerm || 'Current Term');

  // Get grade level name (handle both flat and nested structures)
  const gradeLevelName = safeString(normalized.grade_level_name || normalized.grade_level?.name || 'Class');

  // Get subject name (handle both flat and nested structures)
  const subjectName = safeString(normalized.subject_name || normalized.subject?.name || 'Subject');

  // Format date
  const examDate = normalized.exam_date ? new Date(normalized.exam_date).toLocaleDateString() : 'TBA';

  if (copyType === "teacher") {
    return generateTeacherCopy(normalized, schoolName, schoolAddress, academicSession, currentTerm, gradeLevelName, subjectName, examDate);
  }

  return generateStudentCopy(normalized, schoolName, schoolAddress, academicSession, currentTerm, gradeLevelName, subjectName, examDate);
}

// ===========================
// STUDENT COPY (QUESTIONS ONLY)
// ===========================

function generateStudentCopy(
  exam: Exam,
  schoolName: string,
  schoolAddress: string,
  academicSession: string,
  currentTerm: string,
  gradeLevelName: string,
  subjectName: string,
  examDate: string
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${safeString(exam.title)} - STUDENT COPY</title>
  <style>
    /* ===== BASE STYLES ===== */
    body {
      font-family: 'Times New Roman', Times, serif;
      margin: 0;
      padding: 15mm;
      line-height: 1.5;
      font-size: 14px;
      position: relative;
      color: #000;
    }

    /* ===== WATERMARK ===== */
    body::before {
      content: "${schoolName}";
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80px;
      font-weight: bold;
      color: #000;
      opacity: 0.08;
      z-index: -1;
      white-space: nowrap;
      pointer-events: none;
    }

    /* ===== HEADER ===== */
    .header {
      text-align: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 2px solid #000;
      page-break-after: avoid;
    }
    .school-name {
      font-size: 22px;
      font-weight: bold;
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .school-address {
      font-size: 13px;
      margin-bottom: 2px;
      color: #333;
    }
    .exam-title {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 2px;
      color: #d32f2f;
      text-transform: uppercase;
    }

    /* ===== EXAM DETAILS TABLE ===== */
    .exam-details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 2px 0 12px 0;
      font-size: 14px;
      border-bottom: 1.5px solid #000;
      page-break-after: avoid;
    }
    .exam-details-table td {
      padding: 3px 8px;
      vertical-align: top;
    }
    .exam-details-table .label {
      font-weight: bold;
      width: 120px;
    }
    .exam-details-table .value {
      width: auto;
    }

    /* ===== STUDENT INFO ===== */
    .student-info {
      margin: 12px 0 16px 0;
      padding: 8px 0;
      font-size: 14px;
      border-bottom: 1.5px solid #000;
      border-top: 1.5px solid #000;
    }

    /* ===== SECTIONS ===== */
    .section {
      margin: 12px 0;
      page-break-inside: avoid;
    }
    .section h3 {
      background-color: #f0f0f0;
      padding: 6px 10px;
      margin: 8px 0 6px 0;
      border-left: 4px solid #333;
      font-size: 16px;
      font-weight: bold;
      page-break-after: avoid;
    }
    .section-instruction {
      margin: 6px 0 8px 0;
      font-weight: bold;
      font-size: 13px;
      padding: 4px 0;
    }

    /* ===== QUESTIONS ===== */
    .question {
      margin: 8px 0;
      padding-left: 10px;
      page-break-inside: avoid;
    }
    .question-content {
      display: inline;
    }

    /* Images in questions */
    .question-content img, img {
      max-width: 100%;
      height: auto;
      margin: 10px 0;
      display: block;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 4px;
      background: #fff;
    }

    /* Tables in questions */
    .question-content table, table {
      border-collapse: collapse;
      width: 100%;
      margin: 10px 0;
      border: 1px solid #333;
    }
    .question-content th, th {
      border: 1px solid #333;
      padding: 8px;
      background-color: #f0f0f0;
      text-align: left;
      font-weight: bold;
    }
    .question-content td, td {
      border: 1px solid #333;
      padding: 8px;
      text-align: left;
    }

    /* Options for objective questions */
    .options {
      margin-left: 20px;
      margin-top: 6px;
      font-size: 13px;
    }
    .options > div {
      margin: 3px 0;
    }
    .label {
      font-weight: bold;
      margin-right: 4px;
    }

    /* Sub-questions */
    .sub-questions {
      margin-left: 20px;
      margin-top: 6px;
    }

    /* ===== PRINT-SPECIFIC STYLES ===== */
    @media print {
      body {
        margin: 10mm;
        font-size: 14px;
      }
      .section {
        page-break-inside: avoid;
      }
      .question {
        page-break-inside: avoid;
      }
      .header, .exam-details-table, .student-info {
        page-break-after: avoid;
      }
      .question-content img, img {
        max-width: 90%;
        page-break-inside: avoid;
      }
      table {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div class="header">
    <div class="school-name">${schoolName}</div>
    <div class="school-address">${schoolAddress}</div>
    <div class="exam-title">${currentTerm} EXAMINATION ${academicSession} ACADEMIC SESSION</div>
  </div>

  <!-- EXAM DETAILS -->
  <table class="exam-details-table">
    <tr>
      <td class="label">Subject:</td>
      <td class="value">${subjectName}</td>
      <td class="label">Class:</td>
      <td class="value">${gradeLevelName}</td>
    </tr>
    <tr>
      <td class="label">Date:</td>
      <td class="value">${examDate}</td>
      <td class="label">Time Allowed:</td>
      <td class="value">${safeString(exam.duration_minutes || 'N/A')} minutes</td>
    </tr>
    <tr>
      <td class="label">Total Marks:</td>
      <td class="value">${safeString(exam.total_marks || 100)}</td>
      <td class="label">Pass Marks:</td>
      <td class="value">${safeString(exam.pass_marks || 'N/A')}</td>
    </tr>
  </table>

  <!-- STUDENT INFO -->
  <div class="student-info">
    <strong>Name:</strong> _____________________________________ &nbsp;&nbsp;&nbsp;
    <strong>Admission No:</strong> ___________________
  </div>

  <!-- GENERAL INSTRUCTIONS -->
  ${exam.instructions ? `
  <div class="section">
    <h3>INSTRUCTIONS</h3>
    <div class="section-instruction">${renderRichContent(exam.instructions)}</div>
  </div>
  ` : ''}

  <!-- OBJECTIVE QUESTIONS -->
  ${exam.objective_questions?.length ? `
  <div class="section">
    <h3>SECTION A: OBJECTIVE QUESTIONS</h3>
    ${exam.objective_instructions ? `<div class="section-instruction">${renderRichContent(exam.objective_instructions)}</div>` : ''}
    ${exam.objective_questions.map((q: any, index: number) => `
    <div class="question">
      <strong>${index + 1}.</strong>
      <span class="question-content">${renderRichContent(q.question || q.question_text)}</span>
      ${q.image ? `<div class="question-content">${renderRichContent(q.image)}</div>` : ''}
      ${q.table ? `<div class="question-content">${renderRichContent(q.table)}</div>` : ''}
      <div class="options">
        ${q.optionA || q.option_a ? `<div><span class="label">A)</span> ${renderRichContent(q.optionA || q.option_a)}</div>` : ''}
        ${q.optionB || q.option_b ? `<div><span class="label">B)</span> ${renderRichContent(q.optionB || q.option_b)}</div>` : ''}
        ${q.optionC || q.option_c ? `<div><span class="label">C)</span> ${renderRichContent(q.optionC || q.option_c)}</div>` : ''}
        ${q.optionD || q.option_d ? `<div><span class="label">D)</span> ${renderRichContent(q.optionD || q.option_d)}</div>` : ''}
      </div>
    </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- THEORY QUESTIONS -->
  ${exam.theory_questions?.length ? `
  <div class="section">
    <h3>SECTION B: THEORY QUESTIONS</h3>
    ${exam.theory_instructions ? `<div class="section-instruction">${renderRichContent(exam.theory_instructions)}</div>` : ''}
    ${exam.theory_questions.map((q: any, index: number) => `
    <div class="question">
      <strong>${index + 1}.</strong>
      <span class="question-content">${renderRichContent(q.question || q.question_text)}</span>
      ${q.image ? `<div class="question-content">${renderRichContent(q.image)}</div>` : ''}
      ${q.table ? `<div class="question-content">${renderRichContent(q.table)}</div>` : ''}
      ${q.subQuestions && q.subQuestions.length ? `
      <div class="sub-questions">
        ${q.subQuestions.map((sq: any, sqIndex: number) => `
        <div class="question">
          <strong>${index + 1}${String.fromCharCode(97 + sqIndex)}.</strong>
          <span class="question-content">${renderRichContent(sq.question || sq.question_text)}</span>
          ${sq.image ? `<div class="question-content">${renderRichContent(sq.image)}</div>` : ''}
          ${sq.table ? `<div class="question-content">${renderRichContent(sq.table)}</div>` : ''}
          ${sq.subSubQuestions && sq.subSubQuestions.length ? `
          <div class="sub-questions">
            ${sq.subSubQuestions.map((ssq: any, ssqIndex: number) => `
            <div class="question">
              <strong>${index + 1}${String.fromCharCode(97 + sqIndex)}${toRomanNumeral(ssqIndex + 1)}.</strong>
              <span class="question-content">${renderRichContent(ssq.question || ssq.question_text)}</span>
              ${ssq.image ? `<div class="question-content">${renderRichContent(ssq.image)}</div>` : ''}
              ${ssq.table ? `<div class="question-content">${renderRichContent(ssq.table)}</div>` : ''}
            </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        `).join('')}
      </div>
      ` : ''}
    </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- PRACTICAL QUESTIONS -->
  ${exam.practical_questions?.length ? `
  <div class="section">
    <h3>SECTION C: PRACTICAL QUESTIONS</h3>
    ${exam.practical_instructions ? `<div class="section-instruction">${renderRichContent(exam.practical_instructions)}</div>` : ''}
    ${exam.practical_questions.map((q: any, index: number) => `
    <div class="question">
      <strong>${index + 1}.</strong>
      <span class="question-content">${renderRichContent(q.task || q.question || q.question_text)}</span>
      ${q.image ? `<div class="question-content">${renderRichContent(q.image)}</div>` : ''}
      ${q.table ? `<div class="question-content">${renderRichContent(q.table)}</div>` : ''}
      ${q.materials ? `<div style="margin-left: 20px; margin-top: 4px;"><strong>Materials:</strong> ${renderRichContent(q.materials)}</div>` : ''}
      ${q.timeLimit || q.time_limit ? `<div style="margin-left: 20px;"><strong>Time Limit:</strong> ${safeString(q.timeLimit || q.time_limit)}</div>` : ''}
    </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- CUSTOM SECTIONS -->
  ${exam.custom_sections?.length ? exam.custom_sections.map((section: any, sectionIndex: number) => `
  <div class="section">
    <h3>SECTION ${String.fromCharCode(68 + sectionIndex)}: ${safeString(section.name).toUpperCase()}</h3>
    ${section.instructions ? `<div class="section-instruction">${renderRichContent(section.instructions)}</div>` : ''}
    ${section.questions && section.questions.length ? section.questions.map((q: any, qIndex: number) => `
    <div class="question">
      <strong>${qIndex + 1}.</strong>
      <span class="question-content">${renderRichContent(q.question || q.question_text)}</span>
      ${q.image ? `<div class="question-content">${renderRichContent(q.image)}</div>` : ''}
      ${q.table ? `<div class="question-content">${renderRichContent(q.table)}</div>` : ''}
    </div>
    `).join('') : ''}
  </div>
  `).join('') : ''}

  <!-- FOOTER -->
  <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #666; font-size: 12px;">
    <p>Generated on ${new Date().toLocaleString()}</p>
    <p><strong>STUDENT COPY</strong></p>
  </div>
</body>
</html>`;
}

// ===========================
// TEACHER COPY (WITH MARKING GUIDE)
// ===========================

function generateTeacherCopy(
  exam: Exam,
  schoolName: string,
  schoolAddress: string,
  academicSession: string,
  currentTerm: string,
  gradeLevelName: string,
  subjectName: string,
  examDate: string
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${safeString(exam.title)} - TEACHER COPY</title>
  <style>
    /* BASE STYLES (same as student copy) */
    body {
      font-family: 'Times New Roman', Times, serif;
      margin: 0;
      padding: 15mm;
      line-height: 1.5;
      font-size: 14px;
      position: relative;
      color: #000;
    }

    body::before {
      content: "${schoolName} - MARKING GUIDE";
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 60px;
      font-weight: bold;
      color: #000;
      opacity: 0.06;
      z-index: -1;
      white-space: nowrap;
      pointer-events: none;
    }

    .header { text-align: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 2px solid #000; page-break-after: avoid; }
    .school-name { font-size: 22px; font-weight: bold; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 1px; }
    .school-address { font-size: 13px; margin-bottom: 2px; color: #333; }
    .exam-title { font-size: 14px; font-weight: bold; margin-bottom: 2px; color: #d32f2f; text-transform: uppercase; }

    .exam-details-table { width: 100%; border-collapse: collapse; margin: 2px 0 12px 0; font-size: 14px; border-bottom: 1.5px solid #000; page-break-after: avoid; }
    .exam-details-table td { padding: 3px 8px; vertical-align: top; }
    .exam-details-table .label { font-weight: bold; width: 120px; }
    .exam-details-table .value { width: auto; }

    .section { margin: 12px 0; page-break-inside: avoid; }
    .section h3 { background-color: #f0f0f0; padding: 6px 10px; margin: 8px 0 6px 0; border-left: 4px solid #333; font-size: 16px; font-weight: bold; page-break-after: avoid; }
    .section-instruction { margin: 6px 0 8px 0; font-weight: bold; font-size: 13px; padding: 4px 0; }

    .question { margin: 8px 0; padding-left: 10px; page-break-inside: avoid; }
    .question-content { display: inline; }

    .question-content img, img { max-width: 100%; height: auto; margin: 10px 0; display: block; border: 1px solid #ddd; border-radius: 4px; padding: 4px; background: #fff; }
    .question-content table, table { border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #333; }
    .question-content th, th { border: 1px solid #333; padding: 8px; background-color: #f0f0f0; text-align: left; font-weight: bold; }
    .question-content td, td { border: 1px solid #333; padding: 8px; text-align: left; }

    .options { margin-left: 20px; margin-top: 6px; font-size: 13px; }
    .options > div { margin: 3px 0; }
    .label { font-weight: bold; margin-right: 4px; }
    .sub-questions { margin-left: 20px; margin-top: 6px; }

    /* TEACHER-SPECIFIC STYLES */
    .answer {
      background-color: #e8f5e9;
      padding: 6px 10px;
      margin: 6px 0;
      border-left: 4px solid #4caf50;
      font-weight: bold;
      border-radius: 3px;
    }
    .expected-points {
      background-color: #fff3e0;
      padding: 6px 10px;
      margin: 6px 0;
      border-left: 4px solid #ff9800;
      font-style: italic;
      border-radius: 3px;
    }

    @media print {
      body { margin: 10mm; font-size: 14px; }
      .section { page-break-inside: avoid; }
      .question { page-break-inside: avoid; }
      .header, .exam-details-table { page-break-after: avoid; }
      .question-content img, img { max-width: 90%; page-break-inside: avoid; }
      table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="school-name">${schoolName}</div>
    <div class="school-address">${schoolAddress}</div>
    <div class="exam-title">${currentTerm} EXAMINATION ${academicSession} ACADEMIC SESSION - MARKING GUIDE</div>
  </div>

  <table class="exam-details-table">
    <tr>
      <td class="label">Subject:</td>
      <td class="value">${subjectName}</td>
      <td class="label">Class:</td>
      <td class="value">${gradeLevelName}</td>
    </tr>
    <tr>
      <td class="label">Date:</td>
      <td class="value">${examDate}</td>
      <td class="label">Time Allowed:</td>
      <td class="value">${safeString(exam.duration_minutes || 'N/A')} minutes</td>
    </tr>
    <tr>
      <td class="label">Total Marks:</td>
      <td class="value">${safeString(exam.total_marks || 100)}</td>
      <td class="label">Pass Marks:</td>
      <td class="value">${safeString(exam.pass_marks || 'N/A')}</td>
    </tr>
  </table>

  ${exam.instructions ? `
  <div class="section">
    <h3>GENERAL INSTRUCTIONS</h3>
    <div class="section-instruction">${renderRichContent(exam.instructions)}</div>
  </div>
  ` : ''}

  ${exam.objective_questions?.length ? `
  <div class="section">
    <h3>SECTION A: OBJECTIVE QUESTIONS - ANSWER KEY</h3>
    ${exam.objective_instructions ? `<div class="section-instruction">${renderRichContent(exam.objective_instructions)}</div>` : ''}
    ${exam.objective_questions.map((q: any, index: number) => `
    <div class="question">
      <strong>${index + 1}.</strong>
      <span class="question-content">${renderRichContent(q.question || q.question_text)}</span>
      ${q.image ? `<div class="question-content">${renderRichContent(q.image)}</div>` : ''}
      ${q.table ? `<div class="question-content">${renderRichContent(q.table)}</div>` : ''}
      <div class="options">
        ${q.optionA || q.option_a ? `<div><span class="label">A)</span> ${renderRichContent(q.optionA || q.option_a)}</div>` : ''}
        ${q.optionB || q.option_b ? `<div><span class="label">B)</span> ${renderRichContent(q.optionB || q.option_b)}</div>` : ''}
        ${q.optionC || q.option_c ? `<div><span class="label">C)</span> ${renderRichContent(q.optionC || q.option_c)}</div>` : ''}
        ${q.optionD || q.option_d ? `<div><span class="label">D)</span> ${renderRichContent(q.optionD || q.option_d)}</div>` : ''}
      </div>
      <div class="answer"><strong>Correct Answer:</strong> ${safeString(q.correctAnswer || q.correct_answer)}</div>
      <div class="expected-points"><strong>Marks:</strong> ${safeString(q.marks || 1)}</div>
    </div>
    `).join('')}
  </div>
  ` : ''}

  ${exam.theory_questions?.length ? `
  <div class="section">
    <h3>SECTION B: THEORY QUESTIONS - MARKING GUIDE</h3>
    ${exam.theory_instructions ? `<div class="section-instruction">${renderRichContent(exam.theory_instructions)}</div>` : ''}
    ${exam.theory_questions.map((q: any, index: number) => `
    <div class="question">
      <strong>${index + 1}.</strong>
      <span class="question-content">${renderRichContent(q.question || q.question_text)}</span>
      ${q.image ? `<div class="question-content">${renderRichContent(q.image)}</div>` : ''}
      ${q.table ? `<div class="question-content">${renderRichContent(q.table)}</div>` : ''}
      ${q.expectedPoints || q.expected_points ? `<div class="expected-points"><strong>Expected Points:</strong> ${renderRichContent(q.expectedPoints || q.expected_points)}</div>` : ''}
      ${q.wordLimit || q.word_limit ? `<div class="section-instruction"><strong>Word Limit:</strong> ${safeString(q.wordLimit || q.word_limit)} words</div>` : ''}
      <div class="expected-points"><strong>Marks:</strong> ${safeString(q.marks || 1)}</div>
      ${q.subQuestions && q.subQuestions.length ? `
      <div class="sub-questions">
        ${q.subQuestions.map((sq: any, sqIndex: number) => `
        <div class="question">
          <strong>${index + 1}${String.fromCharCode(97 + sqIndex)}.</strong>
          <span class="question-content">${renderRichContent(sq.question || sq.question_text)}</span>
          ${sq.image ? `<div class="question-content">${renderRichContent(sq.image)}</div>` : ''}
          ${sq.table ? `<div class="question-content">${renderRichContent(sq.table)}</div>` : ''}
          ${sq.expectedPoints || sq.expected_points ? `<div class="expected-points"><strong>Expected Points:</strong> ${renderRichContent(sq.expectedPoints || sq.expected_points)}</div>` : ''}
          ${sq.wordLimit || sq.word_limit ? `<div class="section-instruction"><strong>Word Limit:</strong> ${safeString(sq.wordLimit || sq.word_limit)} words</div>` : ''}
          <div class="expected-points"><strong>Marks:</strong> ${safeString(sq.marks || 1)}</div>
          ${sq.subSubQuestions && sq.subSubQuestions.length ? `
          <div class="sub-questions">
            ${sq.subSubQuestions.map((ssq: any, ssqIndex: number) => `
            <div class="question">
              <strong>${index + 1}${String.fromCharCode(97 + sqIndex)}${toRomanNumeral(ssqIndex + 1)}.</strong>
              <span class="question-content">${renderRichContent(ssq.question || ssq.question_text)}</span>
              ${ssq.image ? `<div class="question-content">${renderRichContent(ssq.image)}</div>` : ''}
              ${ssq.table ? `<div class="question-content">${renderRichContent(ssq.table)}</div>` : ''}
              ${ssq.expectedPoints || ssq.expected_points ? `<div class="expected-points"><strong>Expected Points:</strong> ${renderRichContent(ssq.expectedPoints || ssq.expected_points)}</div>` : ''}
              ${ssq.wordLimit || ssq.word_limit ? `<div class="section-instruction"><strong>Word Limit:</strong> ${safeString(ssq.wordLimit || ssq.word_limit)} words</div>` : ''}
              <div class="expected-points"><strong>Marks:</strong> ${safeString(ssq.marks || 1)}</div>
            </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        `).join('')}
      </div>
      ` : ''}
    </div>
    `).join('')}
  </div>
  ` : ''}

  ${exam.practical_questions?.length ? `
  <div class="section">
    <h3>SECTION C: PRACTICAL QUESTIONS - MARKING GUIDE</h3>
    ${exam.practical_instructions ? `<div class="section-instruction">${renderRichContent(exam.practical_instructions)}</div>` : ''}
    ${exam.practical_questions.map((q: any, index: number) => `
    <div class="question">
      <strong>${index + 1}.</strong>
      <span class="question-content">${renderRichContent(q.task || q.question || q.question_text)}</span>
      ${q.image ? `<div class="question-content">${renderRichContent(q.image)}</div>` : ''}
      ${q.table ? `<div class="question-content">${renderRichContent(q.table)}</div>` : ''}
      ${q.materials ? `<div class="section-instruction"><strong>Materials:</strong> ${renderRichContent(q.materials)}</div>` : ''}
      ${q.expectedOutcome || q.expected_outcome ? `<div class="expected-points"><strong>Expected Outcome:</strong> ${renderRichContent(q.expectedOutcome || q.expected_outcome)}</div>` : ''}
      ${q.timeLimit || q.time_limit ? `<div class="section-instruction"><strong>Time Limit:</strong> ${safeString(q.timeLimit || q.time_limit)}</div>` : ''}
      <div class="expected-points"><strong>Marks:</strong> ${safeString(q.marks || 1)}</div>
    </div>
    `).join('')}
  </div>
  ` : ''}

  ${exam.custom_sections?.length ? exam.custom_sections.map((section: any, sectionIndex: number) => `
  <div class="section">
    <h3>SECTION ${String.fromCharCode(68 + sectionIndex)}: ${safeString(section.name).toUpperCase()} - MARKING GUIDE</h3>
    ${section.instructions ? `<div class="section-instruction">${renderRichContent(section.instructions)}</div>` : ''}
    ${section.questions && section.questions.length ? section.questions.map((q: any, qIndex: number) => `
    <div class="question">
      <strong>${qIndex + 1}.</strong>
      <span class="question-content">${renderRichContent(q.question || q.question_text)}</span>
      ${q.image ? `<div class="question-content">${renderRichContent(q.image)}</div>` : ''}
      ${q.table ? `<div class="question-content">${renderRichContent(q.table)}</div>` : ''}
      ${q.wordLimit || q.word_limit ? `<div class="section-instruction"><strong>Word Limit:</strong> ${safeString(q.wordLimit || q.word_limit)} words</div>` : ''}
      <div class="expected-points"><strong>Marks:</strong> ${safeString(q.marks || 1)}</div>
    </div>
    `).join('') : ''}
  </div>
  `).join('') : ''}

  <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #666; font-size: 12px;">
    <p>Generated on ${new Date().toLocaleString()}</p>
    <p><strong>TEACHER'S COPY WITH MARKING SCHEME</strong></p>
  </div>
</body>
</html>`;
}
