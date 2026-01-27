"""
Complete implementation for PDF report generation using WeasyPrint - WITH DEBUGGING
"""

from django.template.loader import render_to_string
from django.http import HttpResponse, JsonResponse
from django.conf import settings
from dateutil.relativedelta import relativedelta

import tempfile
import logging
from datetime import datetime
from decimal import Decimal
import re

from .models import (
    SeniorSecondaryTermReport,
    SeniorSecondarySessionReport,
    JuniorSecondaryTermReport,
    PrimaryTermReport,
    PrimaryResult,
    NurseryTermReport,
    ExamSession,
)
from students.models import Student
from tenants.models import Tenant, TenantSettings

try:
    from weasyprint import HTML

    WEASYPRINT_AVAILABLE = True
    print("goodWeasyPrint successfully loaded")
except (ImportError, OSError) as e:
    HTML = None
    WEASYPRINT_AVAILABLE = False
    print(f"⚠️  WeasyPrint not available: {e}")
    print("PDF generation will be disabled until dependencies are installed")

logger = logging.getLogger(__name__)


# ===== TEMPLATE MAPPING =====
TEMPLATE_MAPPING = {
    # Term Reports
    ("NURSERY", "term"): "results/nursery_term_report.html",
    ("PRIMARY", "term"): "results/primary_term_report.html",
    ("JUNIOR_SECONDARY", "term"): "results/junior_secondary_term_report.html",
    ("SENIOR_SECONDARY", "term"): "results/senior_secondary_term_report.html",
    # Session Reports
    ("SENIOR_SECONDARY", "session"): "results/senior_secondary_session_report.html",
}


class ReportGenerator:
    """Base class for generating PDF reports"""

    EDUCATION_LEVEL = None  # To be set by subclasses

    def __init__(self, request=None):
        self.request = request

    def get_template(self, report_type="term"):
        """Get template path based on education level and report type"""
        template = TEMPLATE_MAPPING.get((self.EDUCATION_LEVEL, report_type))
        if not template:
            raise ValueError(
                f"No template found for {self.EDUCATION_LEVEL} - {report_type}"
            )
        return template

    def get_school_info(self, student=None):
        """Get school information for the report header from Tenant/TenantSettings"""
        try:
            tenant = None

            # Try to get tenant from student
            if student and hasattr(student, 'tenant'):
                tenant = student.tenant

            # Try to get tenant from request user
            if not tenant and self.request and self.request.user.is_authenticated:
                tenant = getattr(self.request.user, 'tenant', None)

            # Fallback to first active tenant
            if not tenant:
                tenant = Tenant.objects.filter(is_active=True).first()

            if not tenant:
                return {}

            # Get tenant settings
            try:
                settings = tenant.settings
            except TenantSettings.DoesNotExist:
                settings = TenantSettings.objects.create(tenant=tenant)

            return {
                "name": tenant.name or "",
                "address": settings.address or "",
                "phone": settings.phone or "",
                "email": settings.email or "",
                "logo": settings.logo if settings.logo else None,
                "motto": settings.school_motto or "",
            }
        except Exception as e:
            print(f"Error fetching school info: {e}")
            import traceback

            traceback.print_exc()
            return {}
    # Add to the ReportGenerator base class (around line 60, after get_school_info)

    def get_signatures(self, report):
        """
        Get signature URLs from the term report.
        Returns dict with teacher and head teacher signatures.
        """
        try:
            signatures = {
                "class_teacher": {
                    "url": None,
                    "signed_at": None,
                },
                "head_teacher": {
                    "url": None,
                    "signed_at": None,
                },
            }

            # Get class teacher signature
            if (
                hasattr(report, "class_teacher_signature")
                and report.class_teacher_signature
            ):
                signatures["class_teacher"]["url"] = report.class_teacher_signature
                if (
                    hasattr(report, "class_teacher_signed_at")
                    and report.class_teacher_signed_at
                ):
                    signatures["class_teacher"]["signed_at"] = (
                        report.class_teacher_signed_at.strftime("%B %d, %Y")
                    )

            # Get head teacher signature
            if (
                hasattr(report, "head_teacher_signature")
                and report.head_teacher_signature
            ):
                signatures["head_teacher"]["url"] = report.head_teacher_signature
                if (
                    hasattr(report, "head_teacher_signed_at")
                    and report.head_teacher_signed_at
                ):
                    signatures["head_teacher"]["signed_at"] = (
                        report.head_teacher_signed_at.strftime("%B %d, %Y")
                    )

            logger.info(
                f"Signatures loaded - Teacher: {'✓' if signatures['class_teacher']['url'] else '✗'}, Head: {'✓' if signatures['head_teacher']['url'] else '✗'}"
            )

            return signatures

        except Exception as e:
            logger.error(f"Error fetching signatures: {e}")
            return {
                "class_teacher": {"url": None, "signed_at": None},
                "head_teacher": {"url": None, "signed_at": None},
            }

    def _default_school_info(self):
        """Return default school information"""
        return {
            "name": "School Name",
            "site": "Site Name",
            "address": "",
            "phone": "",
            "email": "",
            "logo": None,
            "favicon": None,
            "motto": "",
        }

    def format_grade_suffix(self, position):
        """Format position with ordinal suffix (1st, 2nd, 3rd, etc.)"""
        if not position:
            return ""

        position = int(position)
        if 10 <= position % 100 <= 20:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(position % 10, "th")

        return f"{position}{suffix}"

    def sanitize_filename(self, filename: str) -> str:
        """Sanitize filename by removing dangerous characters"""
        sanitized = re.sub(r"[^\w\s.-]", "", filename).strip()
        sanitized = sanitized.replace(" ", "_")
        sanitized = re.sub(r"_+", "_", sanitized)
        return sanitized

    def generate_pdf(self, html_string, filename):
        """Generate PDF from HTML string"""
        if not WEASYPRINT_AVAILABLE:
            return JsonResponse(
                {
                    "error": "PDF generation is currently unavailable",
                    "detail": "WeasyPrint system dependencies are not installed. Please contact the administrator.",
                },
                status=503,
            )

        try:
            with tempfile.NamedTemporaryFile(delete=True, suffix=".pdf") as output:
                base_url = (
                    self.request.build_absolute_uri("/")
                    if self.request
                    else getattr(settings, "WEASYPRINT_BASEURL", "")
                )

                HTML(string=html_string, base_url=base_url).write_pdf(
                    target=output.name
                )
                output.seek(0)
                pdf = output.read()

            response = HttpResponse(pdf, content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        except Exception as e:
            logger.error(f"Error generating PDF: {e}", exc_info=True)
            return JsonResponse(
                {"error": "Failed to generate PDF report", "detail": str(e)}, status=500
            )


class SeniorSecondaryReportGenerator(ReportGenerator):
    """Generate reports for Senior Secondary students"""

    EDUCATION_LEVEL = "SENIOR_SECONDARY"

    def generate_term_report(self, report_id):
        """Generate term report for Senior Secondary student"""
        try:
            # 🔍 DEBUG: Log the report_id being requested
            print(f"\n{'='*60}")
            print(f"🔍 GENERATING REPORT FOR ID: {report_id}")
            print(f"🚀 GENERATOR TYPE: {type(report_id)}")
            print(f"{'='*60}")

            report = (
                SeniorSecondaryTermReport.objects.select_related(
                    "student", "student__user", "exam_session", "stream"
                )
                .prefetch_related(
                    "subject_results__subject", "subject_results__grading_system"
                )
                .get(id=report_id)
            )

            subject_results = (
                report.subject_results.all()
                .select_related("subject", "grading_system")
                .order_by("subject__name")
            )

            subjects_data = []
            for idx, result in enumerate(subject_results, 1):
                subject_info = {
                    "name": result.subject.name,
                    "code": result.subject.code,
                    "first_test": float(result.first_test_score or 0),
                    "second_test": float(result.second_test_score or 0),
                    "third_test": float(result.third_test_score or 0),
                    "ca_total": float(result.total_ca_score or 0),
                    "exam": float(result.exam_score or 0),
                    "total": float(result.total_score or 0),
                    "grade": result.grade or "",
                    "position": self.format_grade_suffix(result.subject_position),
                    "remark": result.teacher_remark or "",
                }
                subjects_data.append(subject_info)

                # 🔍 DEBUG: Print first 3 subjects
                if idx <= 3:
                    print(
                        f"  {idx}. {result.subject.name}: {result.total_score} ({result.grade})"
                    )

            grade_summary = self._calculate_grade_summary(subject_results)

            # ✅ Get next term begins with multiple fallback methods
            next_term_begins_str = self._get_next_term_begins(report)

            DATE_FORMAT = "%B %d, %Y"
            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": report.student.get_student_class_display(),
                    "stream": report.stream.name if report.stream else "",
                },
                "term": {
                    "name": report.exam_session.get_term_display(),
                    "session": report.exam_session.academic_session.name,
                    "year": report.exam_session.academic_session.start_date.year,
                },
                "subjects": subjects_data,
                "summary": {
                    "total_subjects": len(subjects_data),
                    "total_score": float(report.total_score or 0),
                    "average": float(report.average_score or 0),
                    "grade": report.overall_grade or "",
                    "position": self.format_grade_suffix(report.class_position),
                    "total_students": report.total_students or 0,
                },
                "grade_summary": grade_summary,
                "attendance": {
                    "times_opened": report.times_opened or 0,
                    "times_present": report.times_present or 0,
                },
                "next_term_begins": next_term_begins_str,
                "remarks": {
                    "class_teacher": report.class_teacher_remark or "",
                    "head_teacher": report.head_teacher_remark or "",
                },
                "signatures": self.get_signatures(report),
                "generated_date": datetime.now().strftime(DATE_FORMAT),
            }

            # Use template mapping
            template = self.get_template("term")
            html_string = render_to_string(template, context)

            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}_term_report.pdf"
            )

            print(f"💾 Filename: {filename}\n")

            return self.generate_pdf(html_string, filename)

        except SeniorSecondaryTermReport.DoesNotExist:
            logger.error(f"❌ Report with ID {report_id} not found")
            return JsonResponse(
                {"error": f"Report with ID {report_id} not found"}, status=404
            )
        except Exception as e:
            logger.error(
                f"❌ Error generating Senior Secondary term report: {e}", exc_info=True
            )
            return JsonResponse(
                {"error": "Failed to generate report", "detail": str(e)}, status=500
            )

    def _calculate_grade_summary(self, subject_results):
        """Calculate grade distribution summary"""
        grade_counts = {}
        for result in subject_results:
            grade = result.grade or "N/A"
            grade_counts[grade] = grade_counts.get(grade, 0) + 1

        return [{"grade": k, "count": v} for k, v in sorted(grade_counts.items())]

    def _get_next_term_begins(self, report):
        """
        Get the next term's start date with multiple fallback methods
        ✅ IMPROVED METHOD
        """
        try:
            # Method 1: Check report's next_term_begins field directly
            if hasattr(report, "next_term_begins") and report.next_term_begins:
                print(f"✅ Next term begins from report: {report.next_term_begins}")
                return report.next_term_begins.strftime("%B %d, %Y")

            # Method 2: Check exam_session's next_term_begins
            if (
                hasattr(report.exam_session, "next_term_begins")
                and report.exam_session.next_term_begins
            ):
                print(
                    f"✅ Next term begins from exam_session: {report.exam_session.next_term_begins}"
                )
                return report.exam_session.next_term_begins.strftime("%B %d, %Y")

            # Method 3: Try to find next term in Term model
            try:
                from academics.models import Term

                current_term = report.exam_session.term  # "FIRST", "SECOND", or "THIRD"
                current_session = report.exam_session.academic_session

                # Map term order
                term_order = ["FIRST", "SECOND", "THIRD"]
                if current_term in term_order:
                    current_index = term_order.index(current_term)

                    # If we're not on the last term, get next term in same session
                    if current_index < len(term_order) - 1:
                        next_term_name = term_order[current_index + 1]
                        next_term = Term.objects.filter(
                            academic_session=current_session,
                            name=next_term_name,
                            is_active=True,
                        ).first()

                        if (
                            next_term
                            and hasattr(next_term, "start_date")
                            and next_term.start_date
                        ):
                            print(
                                f"✅ Next term begins from Term model: {next_term.start_date}"
                            )
                            return next_term.start_date.strftime("%B %d, %Y")
                    else:
                        # It's the last term, try to get first term of next session
                        print(
                            "ℹ️ Current term is THIRD, looking for next session's FIRST term"
                        )
                        # This would require finding the next academic session
                        # For now, return TBA
                        return "To Be Announced"

            except ImportError:
                print("⚠️ Term model not available for next term lookup")
            except Exception as term_error:
                print(f"⚠️ Error looking up next term: {term_error}")

            # Method 4: Default fallback
            print("⚠️ Could not determine next term begins date")
            return "To Be Announced"

        except Exception as e:
            logger.error(f"Error getting next term begins: {e}")
            return "To Be Announced"

    def generate_session_report(self, report_id):
        """Generate session report for Senior Secondary student"""
        try:
            report = (
                SeniorSecondarySessionReport.objects.select_related(
                    "student", "student__user", "academic_session", "stream"
                )
                .prefetch_related(
                    "subject_results__subject", "subject_results__grading_system"
                )
                .get(id=report_id)
            )

            subject_results = (
                report.subject_results.all()
                .select_related("subject", "grading_system")
                .order_by("subject__name")
            )

            # Build subjects data with term-by-term breakdown
            subjects_data = []
            for idx, result in enumerate(subject_results, 1):
                subject_info = {
                    "name": result.subject.name,
                    "code": result.subject.code,
                    # First term scores
                    "first_term_total": float(result.first_term_total or 0),
                    "first_term_grade": result.first_term_grade or "",
                    # Second term scores
                    "second_term_total": float(result.second_term_total or 0),
                    "second_term_grade": result.second_term_grade or "",
                    # Third term scores
                    "third_term_total": float(result.third_term_total or 0),
                    "third_term_grade": result.third_term_grade or "",
                    # Session cumulative
                    "cumulative_total": float(result.cumulative_total or 0),
                    "cumulative_average": float(result.cumulative_average or 0),
                    "final_grade": result.final_grade or "",
                    "position": self.format_grade_suffix(result.subject_position),
                    "remark": result.teacher_remark or "",
                }
                subjects_data.append(subject_info)

                # Debug: Print first 3 subjects
                if idx <= 3:
                    print(
                        f"  {idx}. {result.subject.name}: T1={result.first_term_total}, "
                        f"T2={result.second_term_total}, T3={result.third_term_total}, "
                        f"Avg={result.cumulative_average} ({result.final_grade})"
                    )

            # Calculate grade summary across all terms
            grade_summary = self._calculate_session_grade_summary(subject_results)

            DATE_FORMAT = "%B %d, %Y"
            context = {
                "report_type": "SESSION_REPORT",
                "school": self.get_school_info(student=report.student),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": report.student.get_student_class_display(),
                    "stream": report.stream.name if report.stream else "",
                },
                "session": {
                    "name": report.academic_session.name,
                    "year": report.academic_session.start_date.year,
                    "start_date": report.academic_session.start_date.strftime(DATE_FORMAT),
                    "end_date": report.academic_session.end_date.strftime(DATE_FORMAT) if report.academic_session.end_date else "In Progress",
                },
                "subjects": subjects_data,
                "summary": {
                    "total_subjects": len(subjects_data),
                    # First term summary
                    "first_term_total": float(report.first_term_total or 0),
                    "first_term_average": float(report.first_term_average or 0),
                    "first_term_position": self.format_grade_suffix(report.first_term_position),
                    # Second term summary
                    "second_term_total": float(report.second_term_total or 0),
                    "second_term_average": float(report.second_term_average or 0),
                    "second_term_position": self.format_grade_suffix(report.second_term_position),
                    # Third term summary
                    "third_term_total": float(report.third_term_total or 0),
                    "third_term_average": float(report.third_term_average or 0),
                    "third_term_position": self.format_grade_suffix(report.third_term_position),
                    # Cumulative session summary
                    "cumulative_total": float(report.cumulative_total or 0),
                    "cumulative_average": float(report.cumulative_average or 0),
                    "overall_grade": report.overall_grade or "",
                    "final_position": self.format_grade_suffix(report.final_position),
                    "total_students": report.total_students or 0,
                },
                "grade_summary": grade_summary,
                "attendance": {
                    # Aggregate attendance across all terms
                    "first_term_present": report.first_term_days_present or 0,
                    "first_term_opened": report.first_term_days_opened or 0,
                    "second_term_present": report.second_term_days_present or 0,
                    "second_term_opened": report.second_term_days_opened or 0,
                    "third_term_present": report.third_term_days_present or 0,
                    "third_term_opened": report.third_term_days_opened or 0,
                    "total_present": (report.first_term_days_present or 0) +
                                   (report.second_term_days_present or 0) +
                                   (report.third_term_days_present or 0),
                    "total_opened": (report.first_term_days_opened or 0) +
                                  (report.second_term_days_opened or 0) +
                                  (report.third_term_days_opened or 0),
                },
                "remarks": {
                    "class_teacher": report.class_teacher_remark or "",
                    "head_teacher": report.head_teacher_remark or "",
                },
                "signatures": self.get_signatures(report),
                "generated_date": datetime.now().strftime(DATE_FORMAT),
            }

            # Use template mapping
            template = self.get_template("session")
            html_string = render_to_string(template, context)

            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}_session_report.pdf"
            )

            print(f"💾 Session Report Filename: {filename}\n")

            return self.generate_pdf(html_string, filename)

        except SeniorSecondarySessionReport.DoesNotExist:
            logger.error(f"Session report with ID {report_id} not found")
            return JsonResponse(
                {"error": f"Session report with ID {report_id} not found"}, status=404
            )
        except Exception as e:
            logger.error(f"Error generating Senior Secondary session report: {e}", exc_info=True)
            return JsonResponse(
                {"error": "Failed to generate session report", "detail": str(e)}, status=500
            )

    def _calculate_session_grade_summary(self, subject_results):
        """Calculate grade distribution summary across all terms for session report"""
        grade_counts = {}

        # Count grades from all three terms
        for result in subject_results:
            # First term
            if result.first_term_grade:
                grade_counts[result.first_term_grade] = grade_counts.get(result.first_term_grade, 0) + 1
            # Second term
            if result.second_term_grade:
                grade_counts[result.second_term_grade] = grade_counts.get(result.second_term_grade, 0) + 1
            # Third term
            if result.third_term_grade:
                grade_counts[result.third_term_grade] = grade_counts.get(result.third_term_grade, 0) + 1

        return [{"grade": k, "count": v} for k, v in sorted(grade_counts.items())]


# class SeniorSecondaryReportGenerator(ReportGenerator):
#     """Generate reports for Senior Secondary students"""

#     EDUCATION_LEVEL = "SENIOR_SECONDARY"

#     def generate_term_report(self, report_id):
#         """Generate term report for Senior Secondary student"""
#         try:
#             # 🔍 DEBUG: Log the report_id being requested
#             print(f"\n{'='*60}")
#             print(f"🔍 GENERATING REPORT FOR ID: {report_id}")
#             print(f"🚀 GENERATOR TYPE: {type(report_id)}")
#             print(f"{'='*60}")

#             report = (
#                 SeniorSecondaryTermReport.objects.select_related(
#                     "student", "student__user", "exam_session", "stream"
#                 )
#                 .prefetch_related(
#                     "subject_results__subject", "subject_results__grading_system"
#                 )
#                 .get(id=report_id)
#             )

#             subject_results = (
#                 report.subject_results.all()
#                 .select_related("subject", "grading_system")
#                 .order_by("subject__name")
#             )

#             subjects_data = []
#             for idx, result in enumerate(subject_results, 1):
#                 subject_info = {
#                     "name": result.subject.name,
#                     "code": result.subject.code,
#                     "first_test": float(result.first_test_score or 0),
#                     "second_test": float(result.second_test_score or 0),
#                     "third_test": float(result.third_test_score or 0),
#                     "ca_total": float(result.total_ca_score or 0),
#                     "exam": float(result.exam_score or 0),
#                     "total": float(result.total_score or 0),
#                     "grade": result.grade or "",
#                     "position": self.format_grade_suffix(result.subject_position),
#                     "remark": result.teacher_remark or "",
#                 }
#                 subjects_data.append(subject_info)

#                 # 🔍 DEBUG: Print first 3 subjects
#                 if idx <= 3:
#                     print(
#                         f"  {idx}. {result.subject.name}: {result.total_score} ({result.grade})"
#                     )

#             grade_summary = self._calculate_grade_summary(subject_results)

#             # ✅ FIX 1: Calculate student age
#             student_age = self._calculate_student_age(report.student.date_of_birth)

#             # ✅ FIX 2: Get class average age (if needed)
#             class_age = self._get_class_average_age(report.student, report.exam_session)

#             # ✅ FIX 3: Get next term begins with multiple fallback methods
#             next_term_begins_str = self._get_next_term_begins(report)

#             DATE_FORMAT = "%B %d, %Y"
#             context = {
#                 "report_type": "TERM_REPORT",
#                 "school": self.get_school_info(),
#                 "student": {
#                     "name": report.student.full_name,
#                     "admission_number": report.student.registration_number or "",
#                     "class": report.student.get_student_class_display(),
#                     "stream": report.stream.name if report.stream else "",
#                     "age": student_age,
#                     "class_age": class_age,
#                 },
#                 "term": {
#                     "name": report.exam_session.get_term_display(),
#                     "session": report.exam_session.academic_session.name,
#                     "year": report.exam_session.academic_session.start_date.year,
#                 },
#                 "subjects": subjects_data,
#                 "summary": {
#                     "total_subjects": len(subjects_data),
#                     "total_score": float(report.total_score or 0),
#                     "average": float(report.average_score or 0),
#                     "grade": report.overall_grade or "",
#                     "position": self.format_grade_suffix(report.class_position),
#                     "total_students": report.total_students or 0,
#                 },
#                 "grade_summary": grade_summary,
#                 "attendance": {
#                     "times_opened": report.times_opened or 0,
#                     "times_present": report.times_present or 0,
#                 },
#                 "next_term_begins": next_term_begins_str,
#                 "remarks": {
#                     "class_teacher": report.class_teacher_remark or "",
#                     "head_teacher": report.head_teacher_remark or "",
#                 },
#                 "generated_date": datetime.now().strftime(DATE_FORMAT),
#                 "signatures": self.get_signatures(report),
#                 "generated_date": datetime.now().strftime(DATE_FORMAT),
#             }

#             # Use template mapping
#             template = self.get_template("term")
#             html_string = render_to_string(template, context)

#             filename = self.sanitize_filename(
#                 f"{report.student.registration_number or report.student.user.username}_term_report.pdf"
#             )

#             print(f"💾 Filename: {filename}\n")

#             return self.generate_pdf(html_string, filename)

#         except SeniorSecondaryTermReport.DoesNotExist:
#             logger.error(f"❌ Report with ID {report_id} not found")
#             return JsonResponse(
#                 {"error": f"Report with ID {report_id} not found"}, status=404
#             )
#         except Exception as e:
#             logger.error(
#                 f"❌ Error generating Senior Secondary term report: {e}", exc_info=True
#             )
#             return JsonResponse(
#                 {"error": "Failed to generate report", "detail": str(e)}, status=500
#             )

#     def _calculate_grade_summary(self, subject_results):
#         """Calculate grade distribution summary"""
#         grade_counts = {}
#         for result in subject_results:
#             grade = result.grade or "N/A"
#             grade_counts[grade] = grade_counts.get(grade, 0) + 1

#         return [{"grade": k, "count": v} for k, v in sorted(grade_counts.items())]

#     def _calculate_student_age(self, date_of_birth):
#         """
#         Calculate student age from date of birth
#         ✅ NEW METHOD - Copied from PrimaryReportGenerator
#         """
#         if not date_of_birth:
#             return "N/A"

#         try:
#             today = datetime.now().date()
#             age = relativedelta(today, date_of_birth).years
#             return age
#         except Exception as e:
#             logger.error(f"Error calculating age: {e}")
#             return "N/A"

#     def _get_class_average_age(self, student, exam_session):
#         """
#         Calculate average age of students in the same class
#         ✅ NEW METHOD
#         """
#         try:
#             from django.db.models import Avg
#             from students.models import Student

#             # Get all students in the same class with valid birthdates
#             same_class_students = Student.objects.filter(
#                 student_class=student.student_class,
#                 education_level=student.education_level,
#                 date_of_birth__isnull=False,
#             )

#             if not same_class_students.exists():
#                 return "N/A"

#             # Calculate ages and get average
#             today = datetime.now().date()
#             ages = []
#             for s in same_class_students:
#                 if s.date_of_birth:
#                     from dateutil.relativedelta import relativedelta

#                     age = relativedelta(today, s.date_of_birth).years
#                     ages.append(age)

#             if ages:
#                 avg_age = sum(ages) / len(ages)
#                 return round(avg_age)

#             return "N/A"
#         except Exception as e:
#             logger.error(f"Error calculating class average age: {e}")
#             return "N/A"

#     def _get_next_term_begins(self, report):
#         """
#         Get the next term's start date with multiple fallback methods
#         ✅ IMPROVED METHOD
#         """
#         try:
#             # Method 1: Check report's next_term_begins field directly
#             if hasattr(report, "next_term_begins") and report.next_term_begins:
#                 print(f"✅ Next term begins from report: {report.next_term_begins}")
#                 return report.next_term_begins.strftime("%B %d, %Y")

#             # Method 2: Check exam_session's next_term_begins
#             if (
#                 hasattr(report.exam_session, "next_term_begins")
#                 and report.exam_session.next_term_begins
#             ):
#                 print(
#                     f"✅ Next term begins from exam_session: {report.exam_session.next_term_begins}"
#                 )
#                 return report.exam_session.next_term_begins.strftime("%B %d, %Y")

#             # Method 3: Try to find next term in Term model
#             try:
#                 from academics.models import Term

#                 current_term = report.exam_session.term  # "FIRST", "SECOND", or "THIRD"
#                 current_session = report.exam_session.academic_session

#                 # Map term order
#                 term_order = ["FIRST", "SECOND", "THIRD"]
#                 if current_term in term_order:
#                     current_index = term_order.index(current_term)

#                     # If we're not on the last term, get next term in same session
#                     if current_index < len(term_order) - 1:
#                         next_term_name = term_order[current_index + 1]
#                         next_term = Term.objects.filter(
#                             academic_session=current_session,
#                             name=next_term_name,
#                             is_active=True,
#                         ).first()

#                         if (
#                             next_term
#                             and hasattr(next_term, "start_date")
#                             and next_term.start_date
#                         ):
#                             print(
#                                 f"✅ Next term begins from Term model: {next_term.start_date}"
#                             )
#                             return next_term.start_date.strftime("%B %d, %Y")
#                     else:
#                         # It's the last term, try to get first term of next session
#                         print(
#                             "ℹ️ Current term is THIRD, looking for next session's FIRST term"
#                         )
#                         # This would require finding the next academic session
#                         # For now, return TBA
#                         return "To Be Announced"

#             except ImportError:
#                 print("⚠️ Term model not available for next term lookup")
#             except Exception as term_error:
#                 print(f"⚠️ Error looking up next term: {term_error}")

#             # Method 4: Default fallback
#             print("⚠️ Could not determine next term begins date")
#             return "To Be Announced"

#         except Exception as e:
#             logger.error(f"Error getting next term begins: {e}")
#             return "To Be Announced"

#     def generate_session_report(self, report_id):
#         """Generate session report for Senior Secondary student"""
#         try:
#             report = (
#                 SeniorSecondarySessionReport.objects.select_related(
#                     "student", "student__user", "academic_session", "stream"
#                 )
#                 .prefetch_related(
#                     "subject_results__subject", "subject_results__grading_system"
#                 )
#                 .get(id=report_id)
#             )

#             # TODO: Implement session report context and generation
#             # For now, use similar structure to term report

#             template = self.get_template("session")
#             # ... build context for session report ...

#             return JsonResponse(
#                 {"message": "Session report generation not fully implemented"},
#                 status=501,
#             )

#         except SeniorSecondarySessionReport.DoesNotExist:
#             logger.error(f"Session report with ID {report_id} not found")
#             return JsonResponse(
#                 {"error": f"Session report with ID {report_id} not found"}, status=404
#             )


class JuniorSecondaryReportGenerator(ReportGenerator):
    """Generate reports for Junior Secondary students"""

    EDUCATION_LEVEL = "JUNIOR_SECONDARY"

    def generate_term_report(self, report_id):
        """Generate term report for Junior Secondary student"""
        try:
            report = (
                JuniorSecondaryTermReport.objects.select_related(
                    "student", "student__user", "exam_session"
                )
                .prefetch_related(
                    "subject_results__subject", "subject_results__grading_system"
                )
                .get(id=report_id)
            )

            subject_results = (
                report.subject_results.all()
                .select_related("subject", "grading_system")
                .order_by("subject__name")
            )

            subjects_data = []
            for result in subject_results:
                subjects_data.append(
                    {
                        "name": result.subject.name,
                        "code": result.subject.code,
                        "ca": float(result.continuous_assessment_score or 0),
                        "take_home": float(result.take_home_test_score or 0),
                        "practical": float(result.practical_score or 0),
                        "appearance": float(result.appearance_score or 0),
                        "project": float(result.project_score or 0),
                        "note_copying": float(result.note_copying_score or 0),
                        "ca_total": float(result.ca_total or 0),
                        "exam": float(result.exam_score or 0),
                        "total": float(result.total_score or 0),
                        "grade": result.grade or "",
                        "position": self.format_grade_suffix(result.subject_position),
                        "remark": result.teacher_remark or "",
                    }
                )

            # ✅ FIX 1: Calculate student age
            student_age = self._calculate_student_age(report.student.date_of_birth)

            # ✅ FIX 2: Get class average age (if needed)
            class_age = self._get_class_average_age(report.student, report.exam_session)

            # ✅ FIX 3: Get next term begins with multiple fallback methods
            next_term_begins_str = self._get_next_term_begins(report)

            DATE_FORMAT = "%B %d, %Y"
            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": report.student.get_student_class_display(),
                    "age": student_age,
                    "class_age": class_age,
                },
                "term": {
                    "name": report.exam_session.get_term_display(),
                    "session": report.exam_session.academic_session.name,
                    "year": report.exam_session.academic_session.start_date.year,
                },
                "subjects": subjects_data,
                "summary": {
                    "total_subjects": len(subjects_data),
                    "total_score": float(report.total_score or 0),
                    "average": float(report.average_score or 0),
                    "grade": report.overall_grade or "",
                    "position": self.format_grade_suffix(report.class_position),
                    "total_students": report.total_students or 0,
                },
                "attendance": {
                    "times_opened": report.times_opened or 0,
                    "times_present": report.times_present or 0,
                },
                "next_term_begins": next_term_begins_str,
                "remarks": {
                    "class_teacher": report.class_teacher_remark or "",
                    "head_teacher": report.head_teacher_remark or "",
                },
                "generated_date": datetime.now().strftime(DATE_FORMAT),
                "signatures": self.get_signatures(report),
                "generated_date": datetime.now().strftime(DATE_FORMAT),
            }

            template = self.get_template("term")
            html_string = render_to_string(template, context)

            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}_term_report.pdf"
            )

            return self.generate_pdf(html_string, filename)

        except JuniorSecondaryTermReport.DoesNotExist:
            logger.error(f"Report with ID {report_id} not found")
            return JsonResponse(
                {"error": f"Report with ID {report_id} not found"}, status=404
            )
        except Exception as e:
            logger.error(
                f"Error generating Junior Secondary term report: {e}", exc_info=True
            )
            return JsonResponse(
                {"error": "Failed to generate report", "detail": str(e)}, status=500
            )

    def _calculate_student_age(self, date_of_birth):
        """
        Calculate student age from date of birth
        ✅ NEW METHOD - Copied from PrimaryReportGenerator
        """
        if not date_of_birth:
            return "N/A"

        try:
            today = datetime.now().date()
            age = relativedelta(today, date_of_birth).years
            return age
        except Exception as e:
            logger.error(f"Error calculating age: {e}")
            return "N/A"

    def _get_class_average_age(self, student, exam_session):
        """
        Calculate average age of students in the same class
        ✅ NEW METHOD
        """
        try:
            from django.db.models import Avg
            from students.models import Student

            # Get all students in the same class with valid birthdates
            same_class_students = Student.objects.filter(
                student_class=student.student_class,
                education_level=student.education_level,
                date_of_birth__isnull=False,
            )

            if not same_class_students.exists():
                return "N/A"

            # Calculate ages and get average
            today = datetime.now().date()
            ages = []
            for s in same_class_students:
                if s.date_of_birth:
                    from dateutil.relativedelta import relativedelta

                    age = relativedelta(today, s.date_of_birth).years
                    ages.append(age)

            if ages:
                avg_age = sum(ages) / len(ages)
                return round(avg_age)

            return "N/A"
        except Exception as e:
            logger.error(f"Error calculating class average age: {e}")
            return "N/A"

    def _get_next_term_begins(self, report):
        """
        Get the next term's start date with multiple fallback methods
        ✅ IMPROVED METHOD
        """
        try:
            # Method 1: Check report's next_term_begins field directly
            if hasattr(report, "next_term_begins") and report.next_term_begins:
                print(f"✅ Next term begins from report: {report.next_term_begins}")
                return report.next_term_begins.strftime("%B %d, %Y")

            # Method 2: Check exam_session's next_term_begins
            if (
                hasattr(report.exam_session, "next_term_begins")
                and report.exam_session.next_term_begins
            ):
                print(
                    f"✅ Next term begins from exam_session: {report.exam_session.next_term_begins}"
                )
                return report.exam_session.next_term_begins.strftime("%B %d, %Y")

            # Method 3: Try to find next term in Term model
            try:
                from academics.models import Term

                current_term = report.exam_session.term  # "FIRST", "SECOND", or "THIRD"
                current_session = report.exam_session.academic_session

                # Map term order
                term_order = ["FIRST", "SECOND", "THIRD"]
                if current_term in term_order:
                    current_index = term_order.index(current_term)

                    # If we're not on the last term, get next term in same session
                    if current_index < len(term_order) - 1:
                        next_term_name = term_order[current_index + 1]
                        next_term = Term.objects.filter(
                            academic_session=current_session,
                            name=next_term_name,
                            is_active=True,
                        ).first()

                        if (
                            next_term
                            and hasattr(next_term, "start_date")
                            and next_term.start_date
                        ):
                            print(
                                f"✅ Next term begins from Term model: {next_term.start_date}"
                            )
                            return next_term.start_date.strftime("%B %d, %Y")
                    else:
                        # It's the last term, try to get first term of next session
                        print(
                            "ℹ️ Current term is THIRD, looking for next session's FIRST term"
                        )
                        # This would require finding the next academic session
                        # For now, return TBA
                        return "To Be Announced"

            except ImportError:
                print("⚠️ Term model not available for next term lookup")
            except Exception as term_error:
                print(f"⚠️ Error looking up next term: {term_error}")

            # Method 4: Default fallback
            print("⚠️ Could not determine next term begins date")
            return "To Be Announced"

        except Exception as e:
            logger.error(f"Error getting next term begins: {e}")
            return "To Be Announced"

class PrimaryReportGenerator(ReportGenerator):
    """Generate reports for Primary students"""

    EDUCATION_LEVEL = "PRIMARY"

    def calculate_student_age(self, date_of_birth):
        """Calculate student age from date of birth"""
        if not date_of_birth:
            return "N/A"  # ✅ Return string instead of None

        try:
            today = datetime.now().date()
            age = relativedelta(today, date_of_birth).years
            return age
        except Exception as e:
            logger.error(f"Error calculating age: {e}")
            return "N/A"

    def get_class_average_age(self, student, exam_session):
        """Calculate average age of students in the same class"""
        try:
            from students.models import Student

            same_class_students = Student.objects.filter(
                student_class=student.student_class,
                education_level=student.education_level,
                date_of_birth__isnull=False,
            )

            if not same_class_students.exists():
                return "N/A"

            today = datetime.now().date()
            ages = []
            for s in same_class_students:
                if s.date_of_birth:
                    age = relativedelta(today, s.date_of_birth).years
                    ages.append(age)

            if ages:
                avg_age = sum(ages) / len(ages)
                return round(avg_age)

            return "N/A"
        except Exception as e:
            logger.error(f"Error calculating class average age: {e}")
            return "N/A"

    def get_total_students_in_class(self, student, exam_session):
        """Get total number of students in the same class for this exam session"""
        try:
            # Count distinct students in same class with results in this exam session
            total_students = (
                PrimaryResult.objects.filter(
                    exam_session=exam_session,
                    student__student_class=student.student_class,
                    student__education_level=student.education_level,
                    status__in=["APPROVED", "PUBLISHED"],
                )
                .values("student")
                .distinct()
                .count()
            )

            return total_students if total_students > 0 else 0
        except Exception as e:
            logger.error(f"Error getting total students in class: {e}")
            return 0

    def get_next_term_begins(self, report):
        """Get the next term's start date with multiple fallback methods"""
        try:
            # Method 1: Check report's next_term_begins field directly
            if hasattr(report, "next_term_begins") and report.next_term_begins:
                print(f"✅ Next term begins from report: {report.next_term_begins}")
                return report.next_term_begins.strftime("%B %d, %Y")

            # Method 2: Check exam_session's next_term_begins
            if (
                hasattr(report.exam_session, "next_term_begins")
                and report.exam_session.next_term_begins
            ):
                print(
                    f"✅ Next term begins from exam_session: {report.exam_session.next_term_begins}"
                )
                return report.exam_session.next_term_begins.strftime("%B %d, %Y")

            # Method 3: Try to find next term in Term model
            try:
                from academics.models import Term

                current_term = report.exam_session.term
                current_session = report.exam_session.academic_session

                term_order = ["FIRST", "SECOND", "THIRD"]
                if current_term in term_order:
                    current_index = term_order.index(current_term)

                    if current_index < len(term_order) - 1:
                        next_term_name = term_order[current_index + 1]
                        next_term = Term.objects.filter(
                            academic_session=current_session,
                            name=next_term_name,
                            is_active=True,
                        ).first()

                        if (
                            next_term
                            and hasattr(next_term, "start_date")
                            and next_term.start_date
                        ):
                            print(
                                f"✅ Next term begins from Term model: {next_term.start_date}"
                            )
                            return next_term.start_date.strftime("%B %d, %Y")

            except ImportError:
                print("⚠️ Term model not available for next term lookup")
            except Exception as term_error:
                print(f"⚠️ Error looking up next term: {term_error}")

            # Method 4: Default fallback
            print("⚠️ Could not determine next term begins date")
            return "To Be Announced"

        except Exception as e:
            logger.error(f"Error getting next term begins: {e}")
            return "To Be Announced"

    def generate_term_report(self, report_id):
        """Generate term report for Primary student"""
        try:
            report = (
                PrimaryTermReport.objects.select_related(
                    "student", "student__user", "exam_session"
                )
                .prefetch_related(
                    "subject_results__subject", "subject_results__grading_system"
                )
                .get(id=report_id)
            )

            subject_results = (
                report.subject_results.all()
                .select_related("subject", "grading_system")
                .order_by("subject__name")
            )

            subjects_data = []
            for result in subject_results:
                subjects_data.append(
                    {
                        "name": result.subject.name,
                        "code": result.subject.code,
                        "ca": float(result.continuous_assessment_score or 0),
                        "take_home": float(result.take_home_test_score or 0),
                        "practical": float(result.practical_score or 0),
                        "appearance": float(result.appearance_score or 0),
                        "project": float(result.project_score or 0),
                        "note_copying": float(result.note_copying_score or 0),
                        "ca_total": float(result.ca_total or 0),
                        "exam": float(result.exam_score or 0),
                        "total": float(result.total_score or 0),
                        "grade": result.grade or "",
                        "position": self.format_grade_suffix(result.subject_position),
                        "remark": result.teacher_remark or "",
                    }
                )

            # ✅ FIX 1: Calculate student age
            student_age = self.calculate_student_age(report.student.date_of_birth)

            # ✅ FIX 2: Get class average age
            class_age = self.get_class_average_age(report.student, report.exam_session)

            # ✅ FIX 3: Get total students - use the method, not report field
            total_students = self.get_total_students_in_class(
                report.student, report.exam_session
            )
            # If method returns 0, try report field as fallback
            if total_students == 0 and report.total_students:
                total_students = report.total_students

            # ✅ FIX 4: Get next term begins with fallback methods
            next_term_begins_str = self.get_next_term_begins(report)

            DATE_FORMAT = "%B %d, %Y"
            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": report.student.get_student_class_display(),
                    "age": student_age,  # ✅ ADDED
                    "class_age": class_age,  # ✅ ADDED
                },
                "term": {
                    "name": report.exam_session.get_term_display(),
                    "session": report.exam_session.academic_session.name,
                    "year": report.exam_session.academic_session.start_date.year,
                },
                "subjects": subjects_data,
                "summary": {
                    "total_subjects": len(subjects_data),
                    "total_score": float(report.total_score or 0),
                    "average": float(report.average_score or 0),
                    "grade": report.overall_grade or "",
                    "position": self.format_grade_suffix(report.class_position),
                    "total_students": total_students,  # ✅ FIXED
                },
                "attendance": {
                    "times_opened": report.times_opened or 0,
                    "times_present": report.times_present or 0,
                },
                "next_term_begins": next_term_begins_str,  # ✅ FIXED
                "remarks": {
                    "class_teacher": report.class_teacher_remark or "",
                    "head_teacher": report.head_teacher_remark or "",
                },
                "generated_date": datetime.now().strftime(DATE_FORMAT),
                "signatures": self.get_signatures(report),
                "generated_date": datetime.now().strftime(DATE_FORMAT),
            }

            template = self.get_template("term")
            html_string = render_to_string(template, context)

            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}_term_report.pdf"
            )

            return self.generate_pdf(html_string, filename)

        except PrimaryTermReport.DoesNotExist:
            logger.error(f"Report with ID {report_id} not found")
            return JsonResponse(
                {"error": f"Report with ID {report_id} not found"}, status=404
            )
        except Exception as e:
            logger.error(f"Error generating Primary term report: {e}", exc_info=True)
            return JsonResponse(
                {"error": "Failed to generate report", "detail": str(e)}, status=500
            )

class NurseryReportGenerator(ReportGenerator):
    """Generate reports for Nursery students"""

    EDUCATION_LEVEL = "NURSERY"

    def calculate_student_age(self, date_of_birth):
        """Calculate student age from date of birth"""
        if not date_of_birth:
            return "N/A"

        try:
            today = datetime.now().date()
            age = relativedelta(today, date_of_birth).years
            return age
        except Exception as e:
            logger.error(f"Error calculating age: {e}")
            return "N/A"

    def get_class_average_age(self, student, exam_session):
        """Calculate average age of students in the same class"""
        try:
            from students.models import Student

            same_class_students = Student.objects.filter(
                student_class=student.student_class,
                education_level=student.education_level,
                date_of_birth__isnull=False,
            )

            if not same_class_students.exists():
                return "N/A"

            today = datetime.now().date()
            ages = []
            for s in same_class_students:
                if s.date_of_birth:
                    age = relativedelta(today, s.date_of_birth).years
                    ages.append(age)

            if ages:
                avg_age = sum(ages) / len(ages)
                return round(avg_age)

            return "N/A"
        except Exception as e:
            logger.error(f"Error calculating class average age: {e}")
            return "N/A"

    def get_next_term_begins(self, report):
        """Get the next term's start date with multiple fallback methods"""
        try:
            # Method 1: Check report's next_term_begins field directly
            if hasattr(report, "next_term_begins") and report.next_term_begins:
                print(f"✅ Next term begins from report: {report.next_term_begins}")
                return report.next_term_begins.strftime("%B %d, %Y")

            # Method 2: Check exam_session's next_term_begins
            if (
                hasattr(report.exam_session, "next_term_begins")
                and report.exam_session.next_term_begins
            ):
                print(
                    f"✅ Next term begins from exam_session: {report.exam_session.next_term_begins}"
                )
                return report.exam_session.next_term_begins.strftime("%B %d, %Y")

            # Method 3: Try to find next term in Term model
            try:
                from academics.models import Term

                current_term = report.exam_session.term
                current_session = report.exam_session.academic_session

                term_order = ["FIRST", "SECOND", "THIRD"]
                if current_term in term_order:
                    current_index = term_order.index(current_term)

                    if current_index < len(term_order) - 1:
                        next_term_name = term_order[current_index + 1]
                        next_term = Term.objects.filter(
                            academic_session=current_session,
                            name=next_term_name,
                            is_active=True,
                        ).first()

                        if (
                            next_term
                            and hasattr(next_term, "start_date")
                            and next_term.start_date
                        ):
                            print(
                                f"✅ Next term begins from Term model: {next_term.start_date}"
                            )
                            return next_term.start_date.strftime("%B %d, %Y")

            except ImportError:
                print("⚠️ Term model not available for next term lookup")
            except Exception as term_error:
                print(f"⚠️ Error looking up next term: {term_error}")

            # Method 4: Default fallback
            print("⚠️ Could not determine next term begins date")
            return "To Be Announced"

        except Exception as e:
            logger.error(f"Error getting next term begins: {e}")
            return "To Be Announced"

    def get_overall_grade(self, report):
        """Calculate overall grade from percentage"""
        try:
            if report.overall_percentage > 0 and hasattr(report, "grading_system"):
                grade_obj = report.grading_system.grades.filter(
                    min_score__lte=report.overall_percentage,
                    max_score__gte=report.overall_percentage,
                ).first()

                if grade_obj:
                    return grade_obj.grade
            return "N/A"
        except Exception as e:
            logger.error(f"Error calculating overall grade: {e}")
            return "N/A"

    def generate_term_report(self, report_id):
        """Generate term report for Nursery student"""
        try:
            report = (
                NurseryTermReport.objects.select_related(
                    "student", "student__user", "exam_session"
                )
                .prefetch_related(
                    "subject_results__subject", "subject_results__grading_system"
                )
                .get(id=report_id)
            )

            subject_results = (
                report.subject_results.all()
                .select_related("subject", "grading_system")
                .order_by("subject__name")
            )

            subjects_data = []
            for result in subject_results:
                subjects_data.append(
                    {
                        "name": result.subject.name,
                        "max_obtainable": float(result.max_marks_obtainable or 0),
                        "mark_obtained": float(result.mark_obtained or 0),
                        "percentage": float(result.percentage or 0),
                        "grade": result.grade or "",
                        "position": (
                            self.format_grade_suffix(result.subject_position)
                            if result.subject_position
                            else "N/A"
                        ),
                        "remark": result.academic_comment or "",
                    }
                )

            student_age = self.calculate_student_age(report.student.date_of_birth)
            class_age = self.get_class_average_age(report.student, report.exam_session)
            next_term_begins_str = self.get_next_term_begins(report)

            DATE_FORMAT = "%B %d, %Y"
            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": report.student.get_student_class_display(),
                    "age": student_age,
                    "class_age": class_age,
                },
                "term": {
                    "name": report.exam_session.get_term_display(),
                    "session": report.exam_session.academic_session.name,
                    "year": report.exam_session.academic_session.start_date.year,
                },
                "subjects": subjects_data,
                "summary": {
                    "total_subjects": report.total_subjects or 0,
                    "total_max_marks": float(report.total_max_marks or 0),
                    "total_marks_obtained": float(report.total_marks_obtained or 0),
                    "overall_percentage": float(report.overall_percentage or 0),
                    "position": self.format_grade_suffix(report.class_position),
                    "total_students": report.total_students_in_class or 0,
                    "grade": self.get_overall_grade(report),  # ✅ Calculate dynamically
                },
                "attendance": {
                    "times_opened": report.times_school_opened or 0,
                    "times_present": report.times_student_present or 0,
                },
                "development": {
                    "physical": (
                        report.get_physical_development_display()
                        if report.physical_development
                        else "Good"
                    ),
                    "health": report.get_health_display() if report.health else "Good",
                    "cleanliness": (
                        report.get_cleanliness_display()
                        if report.cleanliness
                        else "Good"
                    ),
                    "conduct": (
                        report.get_general_conduct_display()
                        if report.general_conduct
                        else "Good"
                    ),
                    "punctuality": "Very Good",
                    "comment": report.physical_development_comment or "",
                },
                "measurements": {
                    "height_beginning": report.height_beginning or "",
                    "height_end": report.height_end or "",
                    "weight_beginning": report.weight_beginning or "",
                    "weight_end": report.weight_end or "",
                },
                "next_term_begins": next_term_begins_str,
                "remarks": {
                    "class_teacher": report.class_teacher_remark or "",
                    "head_teacher": report.head_teacher_remark or "",
                },
                "generated_date": datetime.now().strftime(DATE_FORMAT),
                "signatures": self.get_signatures(report),
            }

            template = self.get_template("term")
            html_string = render_to_string(template, context)

            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}_term_report.pdf"
            )

            return self.generate_pdf(html_string, filename)

        except NurseryTermReport.DoesNotExist:
            logger.error(f"Report with ID {report_id} not found")
            return JsonResponse(
                {"error": f"Report with ID {report_id} not found"}, status=404
            )
        except Exception as e:
            logger.error(f"Error generating Nursery term report: {e}", exc_info=True)
            return JsonResponse(
                {"error": "Failed to generate report", "detail": str(e)}, status=500
            )

def get_report_generator(education_level, request=None):
    """Factory function to get appropriate report generator"""
    generators = {
        "SENIOR_SECONDARY": SeniorSecondaryReportGenerator,
        "JUNIOR_SECONDARY": JuniorSecondaryReportGenerator,
        "PRIMARY": PrimaryReportGenerator,
        "NURSERY": NurseryReportGenerator,
    }

    generator_class = generators.get(education_level)
    if not generator_class:
        raise ValueError(f"Invalid education level: {education_level}")

    return generator_class(request)
