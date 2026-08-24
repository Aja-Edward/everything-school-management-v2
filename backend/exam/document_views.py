"""
Document Upload and Parsing Views

Handles uploading and parsing of exam documents (PDF, Word).
"""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
import logging

from .document_parser import ExamDocumentParser

logger = logging.getLogger(__name__)

# Generous for a full exam paper pasted as plain text; guards against abuse.
MAX_PASTE_CHARS = 50_000


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parse_exam_document(request):
    """
    Parse uploaded exam document (PDF or Word) and return structured data.

    Expected request:
    - file: File upload (PDF or Word document)
    - document_type: 'pdf' or 'word'

    Returns:
    - Parsed exam data in JSON format
    """

    # Validate file upload
    if 'file' not in request.FILES:
        return Response(
            {'detail': 'No file uploaded. Please upload a PDF or Word document.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    uploaded_file = request.FILES['file']
    document_type = request.data.get('document_type', '')

    # Validate file extension
    file_name = uploaded_file.name
    file_extension = file_name.split('.')[-1].lower()

    if file_extension not in ['pdf', 'docx', 'doc', 'csv']:
        return Response(
            {
                'detail': f'Unsupported file format: {file_extension}. '
                         'Please upload a PDF (.pdf), Word (.docx, .doc), or CSV (.csv) file.'
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    if uploaded_file.size > max_size:
        return Response(
            {
                'detail': f'File size ({uploaded_file.size / 1024 / 1024:.2f}MB) exceeds '
                         'the 10MB limit. Please upload a smaller file.'
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    logger.info(f"Parsing exam document: {file_name} ({file_extension}, {uploaded_file.size} bytes)")

    try:
        # Read file content
        file_content = uploaded_file.read()

        # Validate file content is not empty
        if not file_content or len(file_content) == 0:
            return Response(
                {'detail': 'Uploaded file is empty. Please upload a valid document.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Parse document
        parser = ExamDocumentParser(file_content, file_name)
        parsed_data = parser.parse()

        # Validate parsed data structure
        if not parsed_data:
            raise ValueError("Parser returned empty data")

        if 'sections' not in parsed_data or not isinstance(parsed_data['sections'], list):
            raise ValueError("Parser returned invalid data: missing or invalid sections")

        if 'metadata' not in parsed_data:
            raise ValueError("Parser returned invalid data: missing metadata")

        # Validate we have at least some content
        total_questions = sum(len(section.get('questions', [])) for section in parsed_data['sections'])
        if total_questions == 0:
            return Response(
                {
                    'detail': 'No questions found in the document.',
                    'help': 'The document should contain numbered questions (1., 2., 3., etc.). For multiple choice questions, options should be labeled A., B., C., D., E.',
                    'example': 'Example format:\n\n1. What is 2 + 2?\n   A. 3\n   B. 4\n   C. 5\n   D. 6\n\n2. Explain photosynthesis. (10 marks)',
                    'warnings': parsed_data.get('metadata', {}).get('warnings', []),
                    'sections_found': len(parsed_data.get('sections', [])),
                    'format_guide_url': '/docs/exam-upload-format'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Add timestamp
        parsed_data['metadata']['parsedAt'] = timezone.now().isoformat()

        logger.info(
            f"Successfully parsed {file_name}: "
            f"{len(parsed_data['sections'])} sections, "
            f"{total_questions} questions, "
            f"{parsed_data['metadata']['confidence']} confidence"
        )

        # Log warnings if any
        if parsed_data['metadata']['warnings']:
            logger.warning(f"Parsing warnings for {file_name}: {parsed_data['metadata']['warnings']}")

        return Response(parsed_data, status=status.HTTP_200_OK)

    except ValueError as e:
        # Validation errors from parser or our validation
        logger.warning(f"Validation error parsing document {file_name}: {e}")
        return Response(
            {
                'detail': str(e),
                'error_type': 'validation_error'
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    except ImportError as e:
        logger.error(f"Missing required library for document parsing: {e}")
        return Response(
            {
                'detail': 'Document parsing library not available. '
                         'Please contact the system administrator.',
                'error': str(e),
                'error_type': 'library_error'
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    except Exception as e:
        logger.error(f"Error parsing document {file_name}: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to parse document: {str(e)}',
                'error': str(e),
                'error_type': 'parsing_error'
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def document_parser_status(request):
    """
    Check if document parsing libraries are available.

    Returns status of PDF and Word parsing capabilities.
    """

    try:
        import PyPDF2
        import pdfplumber
        pdf_available = True
        pdf_version = f"PyPDF2 {PyPDF2.__version__}, pdfplumber {pdfplumber.__version__}"
    except ImportError:
        pdf_available = False
        pdf_version = None

    try:
        import docx
        word_available = True
        word_version = f"python-docx {docx.__version__}"
    except ImportError:
        word_available = False
        word_version = None

    return Response({
        'pdf_parsing': {
            'available': pdf_available,
            'version': pdf_version
        },
        'word_parsing': {
            'available': word_available,
            'version': word_version
        },
        'csv_parsing': {
            'available': True,  # CSV parsing is always available (built-in Python module)
            'version': 'Built-in'
        },
        'max_file_size_mb': 10,
        'supported_formats': ['pdf', 'docx', 'doc', 'csv']
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parse_pasted_exam_text(request):
    """
    Parse exam questions pasted as raw text and return structured data.

    Lets a teacher copy an exam straight out of a Word/Google doc into a
    textarea instead of uploading a file. Objective questions don't need to
    be numbered - a question line followed by two or more "A./B./C./D."
    lines is enough. A trailing "Marking Guide" answer key, if present, is
    matched back onto the objective questions by position.

    Expected request body (JSON):
    - text: the raw pasted exam text

    Returns the same structured shape as parse_exam_document.
    """
    text = (request.data.get('text') or '').strip()

    if not text:
        return Response(
            {'detail': 'No text provided. Paste your exam questions and try again.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if len(text) > MAX_PASTE_CHARS:
        return Response(
            {
                'detail': f'Pasted text is too long ({len(text):,} characters). '
                         f'The limit is {MAX_PASTE_CHARS:,} characters.'
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    logger.info(f"Parsing pasted exam text ({len(text)} chars)")

    try:
        parser = ExamDocumentParser(text.encode('utf-8'), 'pasted-exam.txt')
        parsed_data = parser.parse()

        if not parsed_data:
            raise ValueError("Parser returned empty data")

        if 'sections' not in parsed_data or not isinstance(parsed_data['sections'], list):
            raise ValueError("Parser returned invalid data: missing or invalid sections")

        if 'metadata' not in parsed_data:
            raise ValueError("Parser returned invalid data: missing metadata")

        total_questions = sum(len(section.get('questions', [])) for section in parsed_data['sections'])
        if total_questions == 0:
            return Response(
                {
                    'detail': 'No questions found in the pasted text.',
                    'help': 'Put each question on its own line. For multiple-choice '
                            'questions, list the options as A., B., C., D. each on their '
                            'own line right after the question - the question itself does '
                            'not need a number. Number theory questions (1., 2., 3., ...).',
                    'example': (
                        'Example format:\n\n'
                        'Section A - Objective\n\n'
                        'What is 2 + 2?\n'
                        'A. 3\n'
                        'B. 4\n'
                        'C. 5\n'
                        'D. 6\n\n'
                        'Section B - Theory\n\n'
                        '1. Explain photosynthesis. (10 marks)'
                    ),
                    'warnings': parsed_data.get('metadata', {}).get('warnings', []),
                    'sections_found': len(parsed_data.get('sections', [])),
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        parsed_data['metadata']['parsedAt'] = timezone.now().isoformat()

        logger.info(
            f"Successfully parsed pasted exam text: "
            f"{len(parsed_data['sections'])} sections, "
            f"{total_questions} questions, "
            f"{parsed_data['metadata']['confidence']} confidence"
        )

        if parsed_data['metadata']['warnings']:
            logger.warning(f"Parsing warnings for pasted text: {parsed_data['metadata']['warnings']}")

        return Response(parsed_data, status=status.HTTP_200_OK)

    except ValueError as e:
        logger.warning(f"Validation error parsing pasted text: {e}")
        return Response(
            {
                'detail': str(e),
                'error_type': 'validation_error'
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    except Exception as e:
        logger.error(f"Error parsing pasted text: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to parse pasted text: {str(e)}',
                'error': str(e),
                'error_type': 'parsing_error'
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
