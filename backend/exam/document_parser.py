"""
Document Parser for Exam Uploads

Parses PDF, Word, and CSV documents containing exam questions and converts them
to the platform's exam format.

Supported formats:
- PDF (.pdf)
- Word (.docx)
- CSV (.csv)

Uses AI/pattern matching to extract:
- Exam title and metadata
- Questions and question types
- Sections (Objective, Theory, Practical, etc.)
- Instructions
- Formatting, images, and tables
"""

import re
import json
import csv
from typing import Dict, List, Any, Optional, Tuple
from io import BytesIO, StringIO

# PDF parsing
try:
    import PyPDF2
    import pdfplumber
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    print("PDF parsing libraries not available. Install: pip install PyPDF2 pdfplumber")

# Word parsing
try:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False
    print("Word parsing library not available. Install: pip install python-docx")


class ExamDocumentParser:
    """Parser for exam documents"""

    def __init__(self, file_content: bytes, file_name: str):
        self.file_content = file_content
        self.file_name = file_name
        self.warnings: List[str] = []

    def parse(self) -> Dict[str, Any]:
        """Parse document and return structured exam data"""
        file_extension = self.file_name.split('.')[-1].lower()

        if file_extension == 'pdf':
            return self._parse_pdf()
        elif file_extension in ['docx', 'doc']:
            return self._parse_word()
        elif file_extension == 'csv':
            return self._parse_csv()
        else:
            raise ValueError(f"Unsupported file format: {file_extension}. Supported formats: PDF, Word, CSV")

    def _parse_pdf(self) -> Dict[str, Any]:
        """Parse PDF document"""
        if not PDF_AVAILABLE:
            raise ImportError("PDF parsing libraries not installed. Please install: pip install PyPDF2 pdfplumber")

        text_content = []
        images = []

        # Extract text using pdfplumber (better formatting preservation)
        try:
            with pdfplumber.open(BytesIO(self.file_content)) as pdf:
                # Validate PDF has pages
                if not pdf.pages or len(pdf.pages) == 0:
                    raise ValueError("PDF document is empty or has no pages")

                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        text_content.append(text)

                    # Extract tables
                    tables = page.extract_tables()
                    if tables:
                        for table in tables:
                            if table and len(table) > 0:  # Validate table is not empty
                                # Convert table to HTML
                                table_html = self._convert_table_to_html(table)
                                if table_html:  # Only add if conversion succeeded
                                    text_content.append(f"\n[TABLE]\n{table_html}\n[/TABLE]\n")

        except ValueError as e:
            # Re-raise validation errors
            raise
        except Exception as e:
            self.warnings.append(f"Error extracting text from PDF: {str(e)}")
            raise ValueError(f"Failed to parse PDF document: {str(e)}")

        # Validate we extracted some content
        if not text_content:
            raise ValueError("PDF document contains no readable text content")

        # Combine all text
        full_text = "\n".join(text_content)

        # Validate full text is not empty
        if not full_text.strip():
            raise ValueError("PDF document contains no readable text after extraction")

        # Parse structured content from text
        return self._parse_text_content(full_text)

    def _parse_word(self) -> Dict[str, Any]:
        """Parse Word document"""
        if not DOCX_AVAILABLE:
            raise ImportError("Word parsing library not installed. Please install: pip install python-docx")

        try:
            doc = Document(BytesIO(self.file_content))

            if not doc.element.body:
                raise ValueError("Word document is empty or has no body content")

            # Collect all elements (paragraphs + tables) in document order
            elements = []
            for element in doc.element.body:
                try:
                    if element.tag.endswith('p'):
                        para = Paragraph(element, doc)
                        text = para.text.strip()
                        if text:
                            elements.append({'type': 'paragraph', 'text': text})
                    elif element.tag.endswith('tbl'):
                        table = Table(element, doc)
                        if table.rows:
                            rows = [[c.text.strip() for c in row.cells] for row in table.rows]
                            elements.append({'type': 'table', 'rows': rows})
                except Exception as e:
                    self.warnings.append(f"Error reading element: {str(e)}")
                    continue

            if not elements:
                raise ValueError("Word document contains no readable content")

            # Extract metadata and parse sections
            title, instructions, duration = self._extract_word_metadata(elements)
            sections = self._parse_word_sections(elements)

            if not sections:
                # Fallback: join all paragraph text and use generic text parser
                plain_text = '\n'.join(e['text'] for e in elements if e['type'] == 'paragraph')
                if not plain_text.strip():
                    raise ValueError("Word document contains no readable text content")
                return self._parse_text_content(plain_text)

            total_marks = self._calculate_total_marks(sections)
            confidence = self._determine_confidence(sections)

            return {
                'title': title,
                'instructions': instructions,
                'totalMarks': total_marks,
                'durationMinutes': duration,
                'sections': sections,
                'metadata': {
                    'originalFileName': self.file_name,
                    'parsedAt': None,
                    'confidence': confidence,
                    'warnings': self.warnings
                }
            }

        except ValueError:
            raise
        except Exception as e:
            self.warnings.append(f"Error parsing Word document: {str(e)}")
            raise ValueError(f"Failed to parse Word document: {str(e)}")

    def _extract_word_metadata(self, elements: List[Dict]) -> tuple:
        """Extract title, instructions and duration from header key:value paragraphs."""
        title = "Imported Exam"
        instructions = ""
        duration = None

        # Find first section header so we only look at header content
        section_start = len(elements)
        for i, elem in enumerate(elements):
            if elem['type'] == 'paragraph':
                if re.match(r'^section\s+[a-zA-Z]\s*(?:[:\-–—]|$)', elem['text'], re.IGNORECASE):
                    section_start = i
                    break

        skip_keywords = {'exam question template', 'fill in all sections', 'how to use',
                         'tip:', 'note:', '1.', '2.', '3.', '4.', '5.'}

        for elem in elements[:section_start]:
            if elem['type'] != 'paragraph':
                continue
            text = elem['text']
            lower = text.lower()

            if any(lower.startswith(kw) for kw in skip_keywords):
                continue

            if re.match(r'^title\s*:', text, re.IGNORECASE):
                val = text.split(':', 1)[-1].strip()
                if val:
                    title = val
            elif re.match(r'^duration\s*:', text, re.IGNORECASE):
                m = re.search(r'(\d+)', text)
                if m:
                    duration = int(m.group(1))
            elif re.match(r'^instructions?\s*:', text, re.IGNORECASE):
                val = text.split(':', 1)[-1].strip()
                if val:
                    instructions = val

        # Fallback title: first line containing exam-related keywords
        if title == "Imported Exam":
            for elem in elements[:section_start]:
                if elem['type'] == 'paragraph':
                    t = elem['text']
                    if any(kw in t.lower() for kw in ['exam', 'examination', 'test', 'assessment']):
                        if len(t) > 5 and ':' not in t[:15]:
                            title = t
                            break

        return title, instructions, duration

    def _parse_word_sections(self, elements: List[Dict]) -> List[Dict]:
        """Group document elements into sections, parsing each section's questions."""
        sections = []
        # Matches "SECTION A:", "SECTION A -", "SECTION A –", "SECTION A" (alone)
        header_re = re.compile(
            r'^section\s+([a-zA-Z])\s*(?:[:\-–—]\s*(.*))?$',
            re.IGNORECASE
        )

        current_letter = None
        current_type = 'custom'
        current_name = None
        current_elems: List[Dict] = []

        for elem in elements:
            if elem['type'] == 'paragraph':
                m = header_re.match(elem['text'])
                if m:
                    # Save previous section
                    if current_letter and current_elems:
                        parsed = self._parse_word_section_elements(current_name, current_type, current_elems)
                        if parsed:
                            sections.append(parsed)
                    # Start new section
                    current_letter = m.group(1).upper()
                    subtitle = (m.group(2) or '').strip().lower()
                    current_name = f'Section {current_letter}'
                    current_type = self._detect_section_type_from_subtitle(subtitle)
                    current_elems = []
                    continue

            if current_letter is not None:
                current_elems.append(elem)

        # Flush last section
        if current_letter and current_elems:
            parsed = self._parse_word_section_elements(current_name, current_type, current_elems)
            if parsed:
                sections.append(parsed)

        return sections

    def _detect_section_type_from_subtitle(self, subtitle: str) -> str:
        if any(kw in subtitle for kw in ['objective', 'multiple choice', 'mcq', 'choose']):
            return 'objective'
        if any(kw in subtitle for kw in ['theory', 'essay', 'short answer', 'long answer']):
            return 'theory'
        if any(kw in subtitle for kw in ['practical', 'experiment', 'lab']):
            return 'practical'
        return 'custom'

    def _parse_word_section_elements(self, name: str, section_type: str, elements: List[Dict]) -> Optional[Dict]:
        """Parse questions from a section's elements (tables and/or paragraphs)."""
        questions: List[Dict] = []
        instructions = ''
        plain_lines: List[str] = []

        instr_re = re.compile(
            r'^(?:section\s+[a-zA-Z]\s+)?instructions?\s*(?:\(optional\))?\s*:',
            re.IGNORECASE
        )

        for elem in elements:
            if elem['type'] == 'table':
                table_qs = self._parse_question_table(elem['rows'])
                if table_qs:
                    questions.extend(table_qs)
            elif elem['type'] == 'paragraph':
                text = elem['text']
                if instr_re.match(text):
                    instructions = text.split(':', 1)[-1].strip()
                else:
                    plain_lines.append(text)

        # If no table questions, parse plain text
        if not questions and plain_lines:
            plain_text = '\n'.join(plain_lines)
            if section_type == 'practical':
                questions = self._parse_practical_text(plain_text)
            else:
                questions = self._extract_questions(plain_text, section_type)

        if not questions:
            return None

        return {
            'type': section_type,
            'name': name,
            'instructions': instructions,
            'questions': questions
        }

    def _parse_question_table(self, rows: List[List[str]]) -> List[Dict]:
        """Parse a Word table where each row is a question.

        Expects a header row with columns like:
        #, Question, Option A, Option B, Option C, Option D, Correct, Marks
        """
        if not rows or len(rows) < 2:
            return []

        header = [h.lower().strip() for h in rows[0]]

        # Must have a Question column to be treated as a question table
        if not any('question' in h for h in header):
            return []

        def find_col(*patterns: str) -> int:
            # Exact match first
            for pat in patterns:
                for i, h in enumerate(header):
                    if h == pat:
                        return i
            # Contains match
            for pat in patterns:
                for i, h in enumerate(header):
                    if pat in h:
                        return i
            return -1

        q_col     = find_col('question')
        a_col     = find_col('option a', 'opta', 'opt a')
        b_col     = find_col('option b', 'optb', 'opt b')
        c_col     = find_col('option c', 'optc', 'opt c')
        d_col     = find_col('option d', 'optd', 'opt d')
        e_col     = find_col('option e', 'opte', 'opt e')
        correct_col = find_col('correct', 'answer', 'key')
        marks_col   = find_col('marks', 'mark', 'score', 'points')

        questions = []
        for row in rows[1:]:
            if q_col < 0 or q_col >= len(row):
                continue
            question_text = row[q_col].strip()
            if not question_text:
                continue

            options: Dict[str, str] = {}
            for col, key in [
                (a_col, 'optionA'), (b_col, 'optionB'),
                (c_col, 'optionC'), (d_col, 'optionD'), (e_col, 'optionE')
            ]:
                if col >= 0 and col < len(row) and row[col].strip():
                    options[key] = row[col].strip()

            correct = ''
            if correct_col >= 0 and correct_col < len(row):
                raw = row[correct_col].strip().upper()
                if raw in ('A', 'B', 'C', 'D', 'E'):
                    correct = raw
                elif raw and raw not in ('CORRECT', 'ANSWER', 'KEY'):
                    self.warnings.append(
                        f"Unrecognized correct answer '{raw}' for: {question_text[:50]}"
                    )

            marks = 1
            if marks_col >= 0 and marks_col < len(row) and row[marks_col].strip():
                try:
                    marks = max(1, int(row[marks_col].strip()))
                except (ValueError, TypeError):
                    marks = 1

            if len(options) >= 2:
                questions.append({
                    'question': self._clean_html(question_text),
                    'type': 'objective',
                    'options': options,
                    'correctAnswer': correct,
                    'marks': marks
                })
            else:
                questions.append({
                    'question': self._clean_html(question_text),
                    'type': 'theory',
                    'marks': marks
                })

        return questions

    def _parse_practical_text(self, text: str) -> List[Dict]:
        """Parse practical questions in the 'Practical N / Task: / Marks:' format."""
        questions: List[Dict] = []

        # Split on "Practical N" headers; block[0] is pre-header text (notes/instructions) — skip it
        blocks = re.split(r'(?im)^\s*practical\s+\d+\s*$', text)
        practical_blocks = blocks[1:] if len(blocks) > 1 else blocks

        for block in practical_blocks:
            block = block.strip()
            if not block:
                continue

            task_m = re.search(
                r'(?i)task\s*:\s*(.+?)(?=\n\s*(?:materials?|time\s+allowed|expected|marks?)\s*:|$)',
                block, re.DOTALL
            )
            marks_m = re.search(r'(?i)marks?\s*:\s*(\d+)', block)

            task = task_m.group(1).strip() if task_m else block
            marks = int(marks_m.group(1)) if marks_m else 1

            if task:
                questions.append({
                    'question': self._clean_html(task),
                    'type': 'practical',
                    'marks': marks
                })

        # Fallback to generic extraction
        if not questions and text.strip():
            questions = self._extract_questions(text, 'practical')

        return questions

    def _parse_csv(self) -> Dict[str, Any]:
        """Parse CSV document

        Expected CSV format:
        Section,Type,Question,OptionA,OptionB,OptionC,OptionD,OptionE,CorrectAnswer,Marks,ExpectedPoints,Instructions

        Where:
        - Section: Section name (Objective, Theory, Practical, or custom name)
        - Type: objective, theory, practical, or custom
        - Question: Question text
        - OptionA-E: Multiple choice options (for objective questions)
        - CorrectAnswer: Correct option letter (for objective questions)
        - Marks: Question marks/points
        - ExpectedPoints: Expected answer points (for theory/practical)
        - Instructions: Section-specific instructions (optional)

        First row with Section="EXAM_INFO" can contain exam metadata
        """
        try:
            # Decode bytes to string
            text_content = self.file_content.decode('utf-8')
        except UnicodeDecodeError:
            try:
                # Try with latin-1 encoding as fallback
                text_content = self.file_content.decode('latin-1')
                self.warnings.append("CSV file encoding is not UTF-8. Using latin-1 encoding.")
            except Exception as e:
                raise ValueError(f"Cannot decode CSV file. Please ensure it's saved as UTF-8 or latin-1 encoding: {str(e)}")

        # Validate CSV has content
        if not text_content or not text_content.strip():
            raise ValueError("CSV file is empty")

        try:
            # Parse CSV
            csv_reader = csv.DictReader(StringIO(text_content))

            # Validate CSV has required columns
            if not csv_reader.fieldnames:
                raise ValueError("CSV file has no headers. Please include column headers.")

            # Required columns (at least one of these must exist)
            if 'Question' not in csv_reader.fieldnames and 'question' not in csv_reader.fieldnames:
                raise ValueError("CSV file must have a 'Question' column")

            # Normalize field names to lowercase for case-insensitive matching
            rows = []
            for row in csv_reader:
                normalized_row = {k.lower().strip(): v for k, v in row.items() if k}
                rows.append(normalized_row)

            # Validate we have rows
            if not rows:
                raise ValueError("CSV file contains no data rows")

            # Extract exam metadata from first row if present
            exam_title = "Imported Exam"
            exam_instructions = ""
            exam_duration = None

            if rows[0].get('section', '').upper() == 'EXAM_INFO':
                metadata_row = rows.pop(0)
                exam_title = metadata_row.get('question', exam_title) or exam_title
                exam_instructions = metadata_row.get('instructions', exam_instructions) or exam_instructions
                try:
                    duration_str = metadata_row.get('marks', '') or metadata_row.get('duration', '')
                    if duration_str:
                        exam_duration = int(duration_str)
                except (ValueError, TypeError):
                    pass

            # Group rows by section
            sections_dict = {}
            for row in rows:
                # Get section name (default to 'Main Section')
                section_name = row.get('section', 'Main Section').strip() or 'Main Section'

                # Get question type (default to 'theory')
                question_type = row.get('type', 'theory').lower().strip() or 'theory'
                if question_type not in ['objective', 'theory', 'practical', 'custom']:
                    self.warnings.append(f"Unknown question type '{question_type}', treating as 'custom'")
                    question_type = 'custom'

                # Create section key
                section_key = f"{section_name}|{question_type}"

                if section_key not in sections_dict:
                    sections_dict[section_key] = {
                        'name': section_name,
                        'type': question_type,
                        'instructions': row.get('instructions', '').strip(),
                        'questions': []
                    }

                # Parse question based on type
                question_data = self._parse_csv_question(row, question_type)

                if question_data:
                    sections_dict[section_key]['questions'].append(question_data)

            # Convert sections dict to list
            sections = list(sections_dict.values())

            # Validate we have at least one section with questions
            if not sections:
                raise ValueError("No valid sections found in CSV file")

            # Calculate total marks
            total_marks = self._calculate_total_marks(sections)

            # Determine confidence (CSV parsing is always high confidence if successful)
            confidence = 'high' if all(len(s['questions']) > 0 for s in sections) else 'medium'

            return {
                'title': exam_title,
                'instructions': exam_instructions,
                'totalMarks': total_marks,
                'durationMinutes': exam_duration,
                'sections': sections,
                'metadata': {
                    'originalFileName': self.file_name,
                    'parsedAt': None,  # Set by view
                    'confidence': confidence,
                    'warnings': self.warnings
                }
            }

        except csv.Error as e:
            raise ValueError(f"Invalid CSV format: {str(e)}")
        except Exception as e:
            if isinstance(e, ValueError):
                raise
            raise ValueError(f"Failed to parse CSV file: {str(e)}")

    def _parse_csv_question(self, row: Dict[str, str], question_type: str) -> Optional[Dict[str, Any]]:
        """Parse a single CSV row into a question"""
        question_text = row.get('question', '').strip()

        # Validate question text exists
        if not question_text:
            self.warnings.append("Skipping row with empty question text")
            return None

        # Extract marks
        marks = 1
        marks_str = row.get('marks', '1').strip()
        if marks_str:
            try:
                marks = int(marks_str)
                if marks < 1 or marks > 100:
                    self.warnings.append(f"Unusual mark value: {marks}. Using default of 1.")
                    marks = 1
            except ValueError:
                self.warnings.append(f"Invalid marks value '{marks_str}'. Using default of 1.")
                marks = 1

        if question_type == 'objective':
            # Extract options
            options = {}
            for letter in ['a', 'b', 'c', 'd', 'e']:
                option_key = f'option{letter}'
                option_value = row.get(option_key, '').strip()
                if option_value:
                    options[option_key] = option_value

            # Validate at least 2 options
            if len(options) < 2:
                self.warnings.append(f"Objective question has fewer than 2 options: {question_text[:50]}...")

            # Get correct answer
            correct_answer = row.get('correctanswer', '').strip().upper() or row.get('answer', '').strip().upper()
            if correct_answer and correct_answer not in ['A', 'B', 'C', 'D', 'E']:
                self.warnings.append(f"Invalid correct answer '{correct_answer}'. Expected A, B, C, D, or E.")
                correct_answer = ''

            return {
                'question': f'<p>{self._escape_html(question_text)}</p>',
                'type': 'objective',
                'options': options,
                'correctAnswer': correct_answer,
                'marks': marks
            }

        elif question_type == 'theory':
            expected_points = row.get('expectedpoints', '').strip() or row.get('expected', '').strip()

            return {
                'question': f'<p>{self._escape_html(question_text)}</p>',
                'type': 'theory',
                'marks': marks,
                'expectedPoints': expected_points,
                'subQuestions': []  # CSV doesn't support nested sub-questions in simple format
            }

        elif question_type == 'practical':
            expected_outcome = row.get('expectedpoints', '').strip() or row.get('expected', '').strip()

            return {
                'question': f'<p>{self._escape_html(question_text)}</p>',
                'type': 'practical',
                'marks': marks,
                'expectedPoints': expected_outcome
            }

        else:  # custom
            return {
                'question': f'<p>{self._escape_html(question_text)}</p>',
                'type': 'custom',
                'marks': marks
            }

    def _escape_html(self, text: str) -> str:
        """Escape HTML special characters"""
        if not text:
            return ''
        return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    def _parse_text_content(self, text: str) -> Dict[str, Any]:
        """Parse text content and extract exam structure"""

        # Extract exam title (usually first non-empty line or line with "EXAM" keyword)
        title = self._extract_title(text)

        # Extract general instructions
        instructions = self._extract_instructions(text)

        # Detect sections
        sections = self._detect_sections(text)

        # Calculate total marks
        total_marks = self._calculate_total_marks(sections)

        # Determine confidence level
        confidence = self._determine_confidence(sections)

        return {
            'title': title,
            'instructions': instructions,
            'totalMarks': total_marks,
            'durationMinutes': None,  # Usually needs manual input
            'sections': sections,
            'metadata': {
                'originalFileName': self.file_name,
                'parsedAt': None,  # Set by view
                'confidence': confidence,
                'warnings': self.warnings
            }
        }

    def _extract_title(self, text: str) -> str:
        """Extract exam title from text"""
        lines = [l.strip() for l in text.split('\n') if l.strip()]

        # Look for lines containing exam-related keywords
        exam_keywords = ['exam', 'test', 'quiz', 'assessment', 'examination']

        for line in lines[:10]:  # Check first 10 lines
            lower_line = line.lower()
            if any(keyword in lower_line for keyword in exam_keywords):
                return line

        # Fallback: use first substantial line
        for line in lines:
            if len(line) > 10 and not line.isdigit():
                return line

        return "Imported Exam"

    def _extract_instructions(self, text: str) -> str:
        """Extract general instructions"""
        # Look for instruction patterns
        instruction_patterns = [
            r'instructions?:?\s*\n(.*?)(?:\n\n|section\s+[a-z]|question\s+\d)',
            r'general\s+instructions?:?\s*\n(.*?)(?:\n\n|section\s+[a-z])',
            r'read\s+the\s+following.*?:?\s*\n(.*?)(?:\n\n|section\s+[a-z])'
        ]

        for pattern in instruction_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            if match:
                return match.group(1).strip()

        return ""

    def _detect_sections(self, text: str) -> List[Dict[str, Any]]:
        """Detect exam sections and questions"""
        sections = []

        # Common section headers
        section_patterns = {
            'objective': r'section\s*[a-z]?:?\s*objective|multiple\s*choice|choose\s*the\s*correct',
            'theory': r'section\s*[b-z]?:?\s*theory|essay|short\s*answer|answer\s*the\s*following',
            'practical': r'section\s*[c-z]?:?\s*practical|experiment|practical\s*work'
        }

        # Split text by major section markers
        section_splits = re.split(
            r'\n\s*section\s*[a-z][\s:]+',
            text,
            flags=re.IGNORECASE
        )

        for i, section_text in enumerate(section_splits):
            if not section_text.strip() or i == 0:
                continue

            # Determine section type
            section_type = 'custom'
            section_name = f'Section {chr(64 + i)}'  # A, B, C...

            for stype, pattern in section_patterns.items():
                if re.search(pattern, section_text[:200], re.IGNORECASE):
                    section_type = stype
                    section_name = stype.capitalize()
                    break

            # Extract section instructions
            section_instructions = self._extract_section_instructions(section_text)

            # Extract questions
            questions = self._extract_questions(section_text, section_type)

            if questions:
                sections.append({
                    'type': section_type,
                    'name': section_name,
                    'instructions': section_instructions,
                    'questions': questions
                })

        # If no sections detected, treat entire document as one section
        if not sections:
            questions = self._extract_questions(text, 'theory')
            if questions:
                sections.append({
                    'type': 'theory',
                    'name': 'Main Section',
                    'instructions': '',
                    'questions': questions
                })
                self.warnings.append("No clear section divisions found. All questions grouped into one section.")

        return sections

    def _extract_section_instructions(self, section_text: str) -> str:
        """Extract instructions specific to a section"""
        lines = section_text.split('\n')
        instructions_lines = []

        # Instructions usually appear before first question
        for line in lines[:10]:
            line = line.strip()
            # Stop when we hit a question number
            if re.match(r'^\d+[\.\)]\s+', line):
                break
            if line and not line.isdigit():
                instructions_lines.append(line)

        return ' '.join(instructions_lines)

    def _extract_questions(self, text: str, section_type: str) -> List[Dict[str, Any]]:
        """Extract questions from section text"""
        questions = []

        # Question numbering patterns
        question_pattern = r'^\s*(\d+)[\.\)]\s+'

        # Split by question numbers
        question_blocks = re.split(question_pattern, text, flags=re.MULTILINE)

        # Process question blocks (odd indices are numbers, even indices are content)
        for i in range(1, len(question_blocks), 2):
            if i + 1 >= len(question_blocks):
                break

            question_number = question_blocks[i]
            question_content = question_blocks[i + 1].strip()

            if not question_content:
                continue

            # Parse based on section type
            if section_type == 'objective':
                question_data = self._parse_objective_question(question_content)
            elif section_type == 'theory':
                question_data = self._parse_theory_question(question_content)
            elif section_type == 'practical':
                question_data = self._parse_practical_question(question_content)
            else:
                question_data = self._parse_generic_question(question_content)

            if question_data:
                questions.append(question_data)

        return questions

    def _parse_objective_question(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse objective/multiple choice question"""
        if not content or not content.strip():
            return None

        # Extract question text (before options)
        option_pattern = r'\n\s*[A-E][\.\)]\s+'
        parts = re.split(option_pattern, content, maxsplit=1)

        question_text = parts[0].strip()

        # Validate we have question text
        if not question_text:
            self.warnings.append("Found objective question with no question text")
            return None

        # Extract options
        options_text = content[len(question_text):]
        option_matches = re.findall(
            r'\n\s*([A-E])[\.\)]\s+(.+?)(?=\n\s*[A-E][\.\)]|\n\n|$)',
            options_text,
            re.DOTALL
        )

        # Validate we have at least 2 options
        if len(option_matches) < 2:
            self.warnings.append(f"Objective question has fewer than 2 options: {question_text[:50]}...")
            # Still return it but warn the user

        options = {}
        for letter, text in option_matches:
            key = f'option{letter}'
            options[key] = text.strip()

        # Try to detect correct answer (sometimes marked with *)
        correct_answer = None
        for letter, text in option_matches:
            if '*' in text or '(correct)' in text.lower():
                correct_answer = letter

        return {
            'question': self._clean_html(question_text),
            'type': 'objective',
            'options': options,
            'correctAnswer': correct_answer,
            'marks': self._extract_marks(content)
        }

    def _parse_theory_question(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse theory/essay question"""
        if not content or not content.strip():
            return None

        # Check for sub-questions (a, b, c, etc.)
        sub_question_pattern = r'\n\s*([a-z]|[ivxIVX]+)[\.\)]\s+'
        sub_parts = re.split(sub_question_pattern, content)

        if len(sub_parts) > 2:
            # Has sub-questions
            main_question = sub_parts[0].strip()
            sub_questions = []

            for i in range(1, len(sub_parts), 2):
                if i + 1 >= len(sub_parts):
                    break
                sub_text = sub_parts[i + 1].strip()
                if sub_text:  # Only add non-empty sub-questions
                    sub_questions.append({
                        'question': self._clean_html(sub_text),
                        'marks': self._extract_marks(sub_text)
                    })

            # Validate we have both main question and sub-questions
            if not main_question and not sub_questions:
                self.warnings.append("Found theory question with no content")
                return None

            return {
                'question': self._clean_html(main_question) if main_question else '<p>See sub-questions</p>',
                'type': 'theory',
                'marks': self._extract_marks(content),
                'subQuestions': sub_questions
            }
        else:
            # Simple theory question
            return {
                'question': self._clean_html(content),
                'type': 'theory',
                'marks': self._extract_marks(content)
            }

    def _parse_practical_question(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse practical question"""
        if not content or not content.strip():
            return None

        return {
            'question': self._clean_html(content),
            'type': 'practical',
            'marks': self._extract_marks(content)
        }

    def _parse_generic_question(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse generic question"""
        if not content or not content.strip():
            return None

        return {
            'question': self._clean_html(content),
            'type': 'custom',
            'marks': self._extract_marks(content)
        }

    def _extract_marks(self, text: str) -> int:
        """Extract marks from question text"""
        if not text:
            return 1  # Default for empty text

        # Look for patterns like (5 marks), [3], (10m), etc.
        patterns = [
            r'\((\d+)\s*marks?\)',
            r'\[(\d+)\s*marks?\]',
            r'\((\d+)m\)',
            r'\[(\d+)m\]'
        ]

        for pattern in patterns:
            try:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    marks = int(match.group(1))
                    # Validate reasonable marks range (1-100)
                    if 1 <= marks <= 100:
                        return marks
                    else:
                        self.warnings.append(f"Unusual mark value found: {marks}. Using default of 1.")
                        return 1
            except (ValueError, IndexError):
                continue

        return 1  # Default

    def _calculate_total_marks(self, sections: List[Dict[str, Any]]) -> int:
        """Calculate total marks from all sections"""
        total = 0
        for section in sections:
            for question in section['questions']:
                total += question.get('marks', 1)
                # Add sub-question marks
                for sub_q in question.get('subQuestions', []):
                    total += sub_q.get('marks', 1)
        return total

    def _determine_confidence(self, sections: List[Dict[str, Any]]) -> str:
        """Determine parsing confidence level"""
        if not sections:
            return 'low'

        # Check if we found structured questions
        total_questions = sum(len(s['questions']) for s in sections)

        if total_questions == 0:
            return 'low'
        elif total_questions < 5:
            return 'medium'
        else:
            # Check if we found section types correctly
            identified_sections = sum(1 for s in sections if s['type'] != 'custom')
            if identified_sections >= 2:
                return 'high'
            else:
                return 'medium'

    def _clean_html(self, text: str) -> str:
        """Clean and convert text to HTML"""
        if not text:
            return '<p></p>'

        # Preserve line breaks
        text = text.strip()

        # Basic HTML escaping for safety (prevent script injection)
        text = text.replace('&', '&amp;')
        text = text.replace('<', '&lt;')
        text = text.replace('>', '&gt;')

        # Convert newlines to <br> for display (now safe since < and > are escaped)
        text = text.replace('\n', '<br>')

        # Wrap in paragraph
        return f'<p>{text}</p>'

    def _convert_table_to_html(self, table: List[List[str]]) -> str:
        """Convert extracted table to HTML"""
        if not table or len(table) == 0:
            return ""

        try:
            html = '<table style="border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #ddd;">'

            # First row as header
            html += '<thead><tr>'
            for cell in table[0]:
                # Escape cell content for safety
                safe_cell = str(cell or "").replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                html += f'<th style="border: 1px solid #ddd; padding: 8px; background-color: #f0f0f0;">{safe_cell}</th>'
            html += '</tr></thead>'

            # Remaining rows as body
            html += '<tbody>'
            for row in table[1:]:
                if row:  # Skip empty rows
                    html += '<tr>'
                    for cell in row:
                        # Escape cell content for safety
                        safe_cell = str(cell or "").replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                        html += f'<td style="border: 1px solid #ddd; padding: 8px;">{safe_cell}</td>'
                    html += '</tr>'
            html += '</tbody></table>'

            return html
        except Exception as e:
            self.warnings.append(f"Error converting table to HTML: {str(e)}")
            return ""

    def _word_table_to_html(self, table: 'Table') -> str:
        """Convert Word table to HTML"""
        if not table or not table.rows or len(table.rows) == 0:
            return ""

        try:
            html = '<table style="border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #ddd;">'

            for i, row in enumerate(table.rows):
                html += '<tr>'
                for cell in row.cells:
                    tag = 'th' if i == 0 else 'td'
                    style = 'border: 1px solid #ddd; padding: 8px;'
                    if i == 0:
                        style += ' background-color: #f0f0f0;'
                    # Escape cell content for safety
                    safe_cell = str(cell.text or "").replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    html += f'<{tag} style="{style}">{safe_cell}</{tag}>'
                html += '</tr>'

            html += '</table>'
            return html
        except Exception as e:
            self.warnings.append(f"Error converting Word table to HTML: {str(e)}")
            return ""

    def _paragraph_to_html(self, para: 'Paragraph') -> str:
        """Convert Word paragraph to HTML with formatting"""
        try:
            # Simple conversion - can be enhanced to preserve bold, italic, etc.
            text = para.text.strip()
            if not text:
                return ""

            # Escape text content for safety
            safe_text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

            # Check for heading styles
            if para.style and para.style.name and para.style.name.startswith('Heading'):
                level = para.style.name[-1] if para.style.name[-1].isdigit() else '3'
                # Validate level is between 1-6
                if level.isdigit() and 1 <= int(level) <= 6:
                    return f'<h{level}>{safe_text}</h{level}>'

            return f'<p>{safe_text}</p>'
        except Exception as e:
            self.warnings.append(f"Error converting paragraph to HTML: {str(e)}")
            return ""
