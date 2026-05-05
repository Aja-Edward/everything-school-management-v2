/**
 * Exam Template Generator
 *
 * Generates exam templates that teachers can fill offline and upload back.
 * Two formats available:
 *  1. Word (.docx) — simplified formatting compatible with Google Docs and MS Word
 *  2. CSV         — works with Google Sheets, Excel, LibreOffice Calc
 *
 * Both formats are accepted by the backend ExamDocumentParser.
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, HeadingLevel, AlignmentType, TableLayoutType,
  VerticalAlign,
} from 'docx';

// ─── Shared helpers ────────────────────────────────────────────────────────────

const b = (text: string, size = 22) => new TextRun({ text, bold: true, size });
const t = (text: string, size = 20) => new TextRun({ text, size });
const it = (text: string, size = 18) => new TextRun({ text, italics: true, size });

const p = (...runs: TextRun[]) =>
  new Paragraph({ children: runs, spacing: { after: 100 } });

const blank = () => new Paragraph({ spacing: { after: 80 } });

const simpleBorder = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 0 },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 0 },
  left:   { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 0 },
  right:  { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 0 },
};

const thickBorder = {
  top:    { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 0 },
  bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 0 },
  left:   { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 0 },
  right:  { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 0 },
};

/** A boxed "section header" using a thick-bordered paragraph — no shading needed */
const sectionHeader = (letter: string, title: string) =>
  new Paragraph({
    children: [b(`  SECTION ${letter}: ${title.toUpperCase()}  `, 24)],
    border: thickBorder,
    spacing: { before: 320, after: 200 },
    alignment: AlignmentType.LEFT,
  });

/** Italic instruction line inside a simple border box */
const instruction = (text: string) =>
  new Paragraph({
    children: [it(`Note: ${text}`, 18)],
    border: simpleBorder,
    spacing: { before: 80, after: 160 },
    indent: { left: 120, right: 120 },
  });

const hr = () =>
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 2 } },
    spacing: { before: 160, after: 160 },
  });

// ─── Cell helper ───────────────────────────────────────────────────────────────

function tc(text: string, bold_ = false, width?: number): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: bold_, size: 18 })],
      spacing: { before: 60, after: 60 },
    })],
    borders: simpleBorder,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    ...(width ? { width: { size: width, type: WidthType.DXA } } : {}),
  });
}

// ─── MCQ table ────────────────────────────────────────────────────────────────

function mcqTable(): Table {
  const headers = ['#', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct', 'Marks'];
  const widths  = [400, 2800, 1200, 1200, 1200, 1200, 900, 700];

  const headerRow = new TableRow({
    children: headers.map((h, i) => tc(h, true, widths[i])),
    tableHeader: true,
  });

  const rows = [
    ['1', 'Chemical symbol for water?', 'H₂O', 'CO₂', 'NaCl', 'O₂', 'A', '2'],
    ['2', 'Type your question here', 'Option A', 'Option B', 'Option C', 'Option D', 'A/B/C/D', '2'],
    ['3', 'Type your question here', 'Option A', 'Option B', 'Option C', 'Option D', '', ''],
    ['4', '', '', '', '', '', '', ''],
    ['5', '', '', '', '', '', '', ''],
    ['6', '', '', '', '', '', '', ''],
    ['7', '', '', '', '', '', '', ''],
    ['8', '', '', '', '', '', '', ''],
    ['9', '', '', '', '', '', '', ''],
    ['10', '', '', '', '', '', '', ''],
  ].map(row =>
    new TableRow({ children: row.map((val, i) => tc(val, false, widths[i])) })
  );

  return new Table({
    rows: [headerRow, ...rows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
  });
}

// ─── Word (.docx) generator ───────────────────────────────────────────────────

export async function generateExamWordTemplate(examTitle = 'Examination'): Promise<void> {
  const doc = new Document({
    creator: 'Nuventa Cloud',
    title: `Exam Template — ${examTitle}`,
    styles: {
      default: {
        document: { run: { size: 20, font: 'Calibri' } },
      },
    },
    sections: [{
      children: [

        // ── Title ──────────────────────────────────────────────────────────────
        new Paragraph({
          children: [b('EXAM QUESTION TEMPLATE', 36)],
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [it('Fill in all sections, save the file, then upload it to the platform', 20)],
          alignment: AlignmentType.CENTER,
          spacing: { after: 320 },
        }),

        // ── Details ────────────────────────────────────────────────────────────
        new Paragraph({ text: 'EXAM DETAILS', heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 120 } }),
        p(b('Title:           '), t(examTitle || '____________________')),
        p(b('Subject:         '), t('____________________')),
        p(b('Grade / Class:   '), t('____________________')),
        p(b('Exam Date:       '), t('____________________')),
        p(b('Duration:        '), t('_________ minutes')),
        p(b('Total Marks:     '), t('____________________')),
        p(b('Pass Marks:      '), t('____________________')),
        p(b('Venue:           '), t('____________________')),
        p(b('Instructions:    '), t('____________________')),
        hr(),

        // ── How to use ─────────────────────────────────────────────────────────
        new Paragraph({ text: 'HOW TO USE', heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 120 } }),
        p(t('1. Fill in the EXAM DETAILS section above.')),
        p(t('2. Add your questions in Sections A, B, C, D below.')),
        p(t('3. Delete any section you do not need.')),
        p(t('4. Copy rows to add more questions.')),
        p(t('5. Save the file as .docx, then upload via the Upload button in the platform.')),
        p(it('Tip: The platform parser reads this file automatically — keep the section labels intact.')),
        hr(),

        // ── SECTION A: MCQ ─────────────────────────────────────────────────────
        sectionHeader('A', 'Objective Questions (Multiple Choice)'),
        instruction(
          'One row per question. The "Correct" column must contain exactly: A, B, C, or D. ' +
          'Copy rows to add more questions.'
        ),
        blank(),
        mcqTable(),
        blank(),
        p(b('Section A Instructions (optional): '), t('____________________')),
        hr(),

        // ── SECTION B: THEORY ──────────────────────────────────────────────────
        sectionHeader('B', 'Theory / Essay Questions'),
        instruction(
          'Number each question (1, 2, 3…). Use lowercase letters for sub-questions (a, b, c). ' +
          'Write [X marks] at the end of each question.'
        ),
        blank(),
        p(b('1.  '), t('Explain the process of photosynthesis.  [10 marks]')),
        p(b('    a.  '), t('Define photosynthesis.  [3 marks]')),
        p(b('    b.  '), t('State three raw materials needed.  [3 marks]')),
        p(b('    c.  '), t('Write the balanced equation.  [4 marks]')),
        blank(),
        p(b('2.  '), t('Type your question here.  [___ marks]')),
        p(b('    a.  '), t('Sub-question here.  [___ marks]')),
        p(b('    b.  '), t('Sub-question here.  [___ marks]')),
        blank(),
        p(b('3.  '), t('Type your question here.  [___ marks]')),
        blank(),
        p(b('4.  '), t('Type your question here.  [___ marks]')),
        blank(),
        p(b('5.  '), t('Type your question here.  [___ marks]')),
        blank(),
        p(b('Section B Instructions (optional): '), t('____________________')),
        hr(),

        // ── SECTION C: PRACTICAL ───────────────────────────────────────────────
        sectionHeader('C', 'Practical Questions'),
        instruction(
          'For each practical, include: Task description, Materials needed, Time allowed, ' +
          'Expected outcome, and Marks.'
        ),
        blank(),
        p(b('Practical 1')),
        p(b('Task:              '), t('Perform a titration to find the concentration of HCl.')),
        p(b('Materials:         '), t('Burette, pipette, conical flask, NaOH, HCl solution.')),
        p(b('Time Allowed:      '), t('45 minutes')),
        p(b('Expected Outcome:  '), t('Accurate titre value with correct unit.')),
        p(b('Marks:             '), t('15')),
        blank(),
        p(b('Practical 2')),
        p(b('Task:              '), t('Type your practical task here.')),
        p(b('Materials:         '), t('List materials here.')),
        p(b('Time Allowed:      '), t('___ minutes')),
        p(b('Expected Outcome:  '), t('Describe expected result here.')),
        p(b('Marks:             '), t('___')),
        blank(),
        p(b('Section C Instructions (optional): '), t('____________________')),
        hr(),

        // ── SECTION D: CUSTOM ──────────────────────────────────────────────────
        sectionHeader('D', 'Custom Section (rename as needed)'),
        instruction(
          'Use for: comprehension, data interpretation, diagram labelling, map reading, etc. ' +
          'Change the section name to match your subject.'
        ),
        blank(),
        p(b('Section Name: '), t('_______________ (e.g. Comprehension, Data Analysis)')),
        blank(),
        p(b('1.  '), t('Type your question here.  [___ marks]')),
        blank(),
        p(b('2.  '), t('Type your question here.  [___ marks]')),
        blank(),
        p(b('3.  '), t('Type your question here.  [___ marks]')),
        blank(),
        p(b('Section D Instructions (optional): '), t('____________________')),
        hr(),

        // ── Footer ─────────────────────────────────────────────────────────────
        new Paragraph({
          children: [it('Generated by Nuventa Cloud  |  Upload at: Dashboard → Exams → Upload  |  Supported formats: .docx, .pdf, .csv', 16)],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `exam_template_${(examTitle || 'exam').replace(/\s+/g, '_').toLowerCase()}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV template generator ───────────────────────────────────────────────────

/**
 * Download a CSV template — works with Google Sheets, Excel, LibreOffice.
 * This format is also accepted by the backend document parser.
 *
 * Column layout matches what ExamDocumentParser expects:
 * Section | Type | Question | OptionA | OptionB | OptionC | OptionD | CorrectAnswer | Marks | ExpectedPoints | Instructions
 */
export function generateExamCsvTemplate(examTitle = 'Examination'): void {
  const rows: string[][] = [
    // Header comment rows (parsers skip lines starting with #)
    ['# EXAM TEMPLATE — Fill this file and upload to Nuventa Cloud'],
    [`# Title: ${examTitle}`],
    ['# Instructions: Fill the rows below. Delete example rows before uploading.'],
    ['#'],
    ['# COLUMN GUIDE:'],
    ['# Section     : A (Objective/MCQ), B (Theory), C (Practical), D (Custom)'],
    ['# Type        : objective, theory, practical, custom'],
    ['# CorrectAnswer: For MCQ only — A, B, C, or D'],
    ['# Marks       : Maximum marks for this question'],
    ['# ExpectedPoints: For theory/practical — key points for marking'],
    ['#'],

    // Column headers
    ['Section', 'Type', 'Question', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 'CorrectAnswer', 'Marks', 'ExpectedPoints', 'Instructions'],

    // Section A — Objective examples
    ['A', 'objective', 'What is the chemical symbol for water?', 'H2O', 'CO2', 'NaCl', 'O2', 'A', '2', '', 'Answer ALL questions in this section'],
    ['A', 'objective', 'Which planet is closest to the sun?', 'Earth', 'Venus', 'Mercury', 'Mars', 'C', '2', '', ''],
    ['A', 'objective', 'Type your question here', 'Option A', 'Option B', 'Option C', 'Option D', 'A', '2', '', ''],
    ['A', 'objective', 'Type your question here', 'Option A', 'Option B', 'Option C', 'Option D', 'A', '2', '', ''],
    ['A', 'objective', 'Type your question here', 'Option A', 'Option B', 'Option C', 'Option D', 'A', '2', '', ''],

    // Section B — Theory examples
    ['B', 'theory', 'Explain the process of photosynthesis.', '', '', '', '', '', '10', 'Definition; reactants; products; balanced equation', 'Answer any FIVE questions'],
    ['B', 'theory', 'Describe the water cycle.', '', '', '', '', '', '8', 'Evaporation; condensation; precipitation; collection', ''],
    ['B', 'theory', 'Type your theory question here.', '', '', '', '', '', '10', 'Key marking points here', ''],
    ['B', 'theory', 'Type your theory question here.', '', '', '', '', '', '10', '', ''],

    // Section C — Practical examples
    ['C', 'practical', 'Perform a titration to determine the concentration of HCl using NaOH.', '', '', '', '', '', '15', 'Correct titre value; unit; significant figures; method', 'Complete all practical tasks'],
    ['C', 'practical', 'Type your practical task here.', '', '', '', '', '', '10', 'Expected outcome here', ''],

    // Section D — Custom examples
    ['D', 'custom', 'Read the passage and answer the questions below. [Attach passage text above this row]', '', '', '', '', '', '20', '', 'Comprehension section'],
    ['D', 'custom', 'Type your custom question here.', '', '', '', '', '', '10', '', ''],
  ];

  // Convert to CSV string
  const csv = rows
    .map(row =>
      row.map(cell => {
        // Quote cells that contain commas, quotes, or newlines
        if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
        return cell;
      }).join(',')
    )
    .join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM for Excel/Sheets
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `exam_template_${(examTitle || 'exam').replace(/\s+/g, '_').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
