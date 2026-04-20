# result/report_generation.py
"""
PDF report generation after the hardcoded-field removal.

Key change: generate_term_report() for Senior/Junior/Primary no longer
reads result.first_test_score, result.continuous_assessment_score, etc.
Instead it calls _build_component_breakdown(result) which reads the
ComponentScore rows and returns a list of
    {"name": "First Test", "score": 8.5, "max": 10, "is_ca": True}
sorted by component.display_order.

This means the report template receives a dynamic list and renders
whatever components the school has configured — no template changes
needed for different school structures.

The rest of the file (WeasyPrint wrapper, school info, signatures,
age/next-term helpers) is unchanged from the previous version.
"""

import logging
import re
import tempfile
from datetime import datetime

from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string

from .models import (
    ExamSession,
    JuniorSecondaryTermReport,
    NurseryTermReport,
    PrimaryResult,
    PrimaryTermReport,
    SeniorSecondarySessionReport,
    SeniorSecondaryTermReport,
)
from students.models import Student
from tenants.models import Tenant, TenantSettings

logger = logging.getLogger(__name__)

try:
    from weasyprint import HTML as WeasyHTML

    WEASYPRINT_AVAILABLE = True
    logger.info("WeasyPrint loaded successfully")
except (ImportError, OSError) as e:
    WeasyHTML = None
    WEASYPRINT_AVAILABLE = False
    logger.warning(f"WeasyPrint not available: {e}")

TEMPLATE_MAPPING = {
    ("NURSERY", "term"): "results/nursery_term_report.html",
    ("PRIMARY", "term"): "results/primary_term_report.html",
    ("JUNIOR_SECONDARY", "term"): "results/junior_secondary_term_report.html",
    ("SENIOR_SECONDARY", "term"): "results/senior_secondary_term_report.html",
    ("SENIOR_SECONDARY", "session"): "results/senior_secondary_session_report.html",
}

_TERM_ORDER = ["FIRST", "SECOND", "THIRD"]
_DATE_FORMAT = "%B %d, %Y"


# ============================================================
# COMPONENT SCORE HELPER
# ============================================================


def _build_component_breakdown(result):
    """
    Return a list of component score dicts for one result row.

    Each entry:
        {
            "name":     "First Test",
            "code":     "first_test",
            "score":    8.5,
            "max":      10.0,
            "is_ca":    True,
            "type":     "CA",
        }

    Sorted by component.display_order so the report template sees
    components in the same order as the score-entry form.

    If a school has not configured AssessmentComponents, returns an
    empty list — templates should handle this gracefully with a fallback.
    """
    scores = result.component_scores.select_related("component").order_by(
        "component__display_order", "component__name"
    )
    return [
        {
            "name": cs.component.name,
            "code": cs.component.code,
            "score": float(cs.score),
            "max": float(cs.component.max_score),
            "is_ca": cs.component.contributes_to_ca,
            "type": cs.component.component_type,
        }
        for cs in scores
    ]


# ============================================================
# BASE GENERATOR
# ============================================================

class ReportGenerator:
    """
    Base class for all education-level PDF generators.
    Shared helpers live here; sub-generators are thin.
    """

    EDUCATION_LEVEL = None

    def __init__(self, request=None):
        self.request = request

    def get_template(self, report_type="term"):
        key = (self.EDUCATION_LEVEL, report_type)
        template = TEMPLATE_MAPPING.get(key)
        if not template:
            raise ValueError(
                f"No template for {self.EDUCATION_LEVEL!r} / {report_type!r}"
            )
        return template

    def get_school_info(self, student=None):
        """
        Fetch school name, address, logo from Tenant/TenantSettings.
        Uses tenant_settings as the local var to avoid shadowing Django's settings.
        """
        try:
            tenant = None
            if student and hasattr(student, "tenant"):
                tenant = student.tenant
            if not tenant and self.request and self.request.user.is_authenticated:
                tenant = getattr(self.request.user, "tenant", None)
            if not tenant:
                tenant = Tenant.objects.filter(is_active=True).first()
            if not tenant:
                return {}
            try:
                tenant_settings = tenant.settings
            except TenantSettings.DoesNotExist:
                tenant_settings = TenantSettings.objects.create(tenant=tenant)
            return {
                "name": tenant.name or "",
                "address": tenant_settings.address or "",
                "phone": tenant_settings.phone or "",
                "email": tenant_settings.email or "",
                "logo": tenant_settings.logo if tenant_settings.logo else None,
                "motto": tenant_settings.school_motto or "",
            }
        except Exception as e:
            logger.error(f"Error fetching school info: {e}", exc_info=True)
            return {}

    def get_signatures(self, report):
        sigs = {
            "class_teacher": {"url": None, "signed_at": None},
            "head_teacher": {"url": None, "signed_at": None},
        }
        try:
            if getattr(report, "class_teacher_signature", None):
                sigs["class_teacher"]["url"] = report.class_teacher_signature
                if getattr(report, "class_teacher_signed_at", None):
                    sigs["class_teacher"]["signed_at"] = (
                        report.class_teacher_signed_at.strftime(_DATE_FORMAT)
                    )
            if getattr(report, "head_teacher_signature", None):
                sigs["head_teacher"]["url"] = report.head_teacher_signature
                if getattr(report, "head_teacher_signed_at", None):
                    sigs["head_teacher"]["signed_at"] = (
                        report.head_teacher_signed_at.strftime(_DATE_FORMAT)
                    )
        except Exception as e:
            logger.error(f"Error fetching signatures: {e}", exc_info=True)
        return sigs

    def calculate_student_age(self, date_of_birth):
        if not date_of_birth:
            return "N/A"
        try:
            return relativedelta(datetime.now().date(), date_of_birth).years
        except Exception as e:
            logger.error(f"Error calculating student age: {e}")
            return "N/A"

    def get_class_average_age(self, student, exam_session):
        try:
            peers = Student.objects.filter(
                student_class=student.student_class,
                education_level=student.education_level,
                date_of_birth__isnull=False,
            )
            if not peers.exists():
                return "N/A"
            today = datetime.now().date()
            ages = [
                relativedelta(today, s.date_of_birth).years
                for s in peers
                if s.date_of_birth
            ]
            return round(sum(ages) / len(ages)) if ages else "N/A"
        except Exception as e:
            logger.error(f"Error calculating class average age: {e}")
            return "N/A"

    def get_next_term_begins(self, report):
        try:
            if getattr(report, "next_term_begins", None):
                return report.next_term_begins.strftime(_DATE_FORMAT)
            if getattr(report.exam_session, "next_term_begins", None):
                return report.exam_session.next_term_begins.strftime(_DATE_FORMAT)
            try:
                from academics.models import Term

                current_term = report.exam_session.term
                current_session = report.exam_session.academic_session
                if current_term and current_term.name in _TERM_ORDER:
                    idx = _TERM_ORDER.index(current_term.name)
                    if idx < len(_TERM_ORDER) - 1:
                        next_term = Term.objects.filter(
                            academic_session=current_session,
                            term_type__code=_TERM_ORDER[idx + 1].lower(),
                            is_active=True,
                        ).first()
                        if next_term and getattr(next_term, "start_date", None):
                            return next_term.start_date.strftime(_DATE_FORMAT)
            except Exception as e:
                logger.debug(f"Next-term DB lookup failed: {e}")
            return "To Be Announced"
        except Exception as e:
            logger.error(f"Error in get_next_term_begins: {e}")
            return "To Be Announced"

    def format_grade_suffix(self, position):
        if not position:
            return ""
        pos = int(position)
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(
            pos % 10 if not (10 <= pos % 100 <= 20) else 0, "th"
        )
        return f"{pos}{suffix}"

    def sanitize_filename(self, filename):
        s = re.sub(r"[^\w\s.-]", "", filename).strip().replace(" ", "_")
        return re.sub(r"_+", "_", s)

    def generate_pdf(self, html_string, filename):
        if not WEASYPRINT_AVAILABLE:
            return JsonResponse(
                {"error": "PDF generation unavailable (WeasyPrint not installed)"},
                status=503,
            )
        try:
            with tempfile.NamedTemporaryFile(delete=True, suffix=".pdf") as tmp:
                base_url = (
                    self.request.build_absolute_uri("/")
                    if self.request
                    else getattr(settings, "WEASYPRINT_BASEURL", "")
                )
                WeasyHTML(string=html_string, base_url=base_url).write_pdf(
                    target=tmp.name
                )
                tmp.seek(0)
                pdf = tmp.read()
            response = HttpResponse(pdf, content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            logger.error(f"Error generating PDF: {e}", exc_info=True)
            return JsonResponse(
                {"error": "Failed to generate PDF", "detail": str(e)}, status=500
            )


# ============================================================
# SENIOR SECONDARY
# ============================================================


class SeniorSecondaryReportGenerator(ReportGenerator):
    EDUCATION_LEVEL = "SENIOR_SECONDARY"

    def generate_term_report(self, report_id):
        try:
            report = (
                SeniorSecondaryTermReport.objects.select_related(
                    "student",
                    "student__user",
                    "exam_session",
                    "exam_session__academic_session",
                    "exam_session__term",
                    "stream",
                )
                .prefetch_related(
                    "subject_results__subject",
                    "subject_results__grading_system",
                    "subject_results__component_scores__component",
                )
                .get(id=report_id)
            )
        except SeniorSecondaryTermReport.DoesNotExist:
            return JsonResponse({"error": f"Report {report_id} not found"}, status=404)
        except Exception as e:
            logger.error(f"Error fetching report {report_id}: {e}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)

        try:
            subject_results = (
                report.subject_results.all()
                .select_related("subject", "grading_system")
                .prefetch_related("component_scores__component")
                .order_by("subject__name")
            )

            subjects_data = []
            for result in subject_results:
                component_breakdown = _build_component_breakdown(result)
                ca_components = [c for c in component_breakdown if c["is_ca"]]
                exam_components = [c for c in component_breakdown if not c["is_ca"]]

                subjects_data.append(
                    {
                        "name": result.subject.name,
                        "code": result.subject.code,
                        # Dynamic breakdown — templates iterate this list
                        "components": component_breakdown,
                        "ca_components": ca_components,
                        "exam_components": exam_components,
                        # Derived totals from BaseResult.calculate_scores()
                        "ca_total": float(result.ca_total or 0),
                        "total": float(result.total_score or 0),
                        "percentage": float(result.percentage or 0),
                        "grade": result.grade or "",
                        "position": self.format_grade_suffix(result.subject_position),
                        "remark": result.teacher_remark or "",
                        "is_passed": result.is_passed,
                    }
                )

            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(student=report.student),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": report.student.get_student_class_display(),
                    "stream": report.stream.name if report.stream else "",
                    "age": self.calculate_student_age(
                        getattr(report.student, "date_of_birth", None)
                    ),
                },
                "term": {
                    "name": (
                        report.exam_session.term.name
                        if report.exam_session.term
                        else ""
                    ),
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
                "grade_summary": self._grade_summary(subject_results),
                "attendance": {
                    "times_opened": report.times_opened or 0,
                    "times_present": report.times_present or 0,
                },
                "next_term_begins": self.get_next_term_begins(report),
                "remarks": {
                    "class_teacher": report.class_teacher_remark or "",
                    "head_teacher": report.head_teacher_remark or "",
                },
                "signatures": self.get_signatures(report),
                "generated_date": datetime.now().strftime(_DATE_FORMAT),
            }

            html = render_to_string(self.get_template("term"), context)
            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}"
                f"_term_report.pdf"
            )
            return self.generate_pdf(html, filename)

        except Exception as e:
            logger.error(f"Error generating SSS term report: {e}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)

    def generate_session_report(self, report_id):
        try:
            report = (
                SeniorSecondarySessionReport.objects.select_related(
                    "student", "student__user", "academic_session", "stream"
                )
                .prefetch_related("subject_results__subject")
                .get(id=report_id)
            )
        except SeniorSecondarySessionReport.DoesNotExist:
            return JsonResponse(
                {"error": f"Session report {report_id} not found"}, status=404
            )
        except Exception as e:
            logger.error(
                f"Error fetching session report {report_id}: {e}", exc_info=True
            )
            return JsonResponse({"error": str(e)}, status=500)

        try:
            subject_results = (
                report.subject_results.all()
                .select_related("subject")
                .order_by("subject__name")
            )
            subjects_data = [
                {
                    "name": r.subject.name,
                    "code": r.subject.code,
                    "first_term_score": float(r.first_term_score or 0),
                    "second_term_score": float(r.second_term_score or 0),
                    "third_term_score": float(r.third_term_score or 0),
                    "obtained": float(r.obtained or 0),
                    "obtainable": float(r.obtainable or 0),
                    "average_for_year": float(r.average_for_year or 0),
                    "position": self.format_grade_suffix(r.subject_position),
                    "remark": r.teacher_remark or "",
                }
                for r in subject_results
            ]

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
                    "start_date": report.academic_session.start_date.strftime(
                        _DATE_FORMAT
                    ),
                    "end_date": (
                        report.academic_session.end_date.strftime(_DATE_FORMAT)
                        if report.academic_session.end_date
                        else "In Progress"
                    ),
                },
                "subjects": subjects_data,
                "summary": {
                    "total_subjects": len(subjects_data),
                    "obtained": float(report.obtained or 0),
                    "obtainable": float(report.obtainable or 0),
                    "taa_score": float(report.taa_score or 0),
                    "average_for_year": float(report.average_for_year or 0),
                    "overall_grade": report.overall_grade or "",
                    "position": self.format_grade_suffix(report.class_position),
                    "total_students": report.total_students or 0,
                    "term1_total": float(report.term1_total or 0),
                    "term2_total": float(report.term2_total or 0),
                    "term3_total": float(report.term3_total or 0),
                },
                "remarks": {
                    "class_teacher": report.teacher_remark or "",
                    "head_teacher": report.head_teacher_remark or "",
                },
                "signatures": self.get_signatures(report),
                "generated_date": datetime.now().strftime(_DATE_FORMAT),
            }

            html = render_to_string(self.get_template("session"), context)
            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}"
                f"_session_report.pdf"
            )
            return self.generate_pdf(html, filename)

        except Exception as e:
            logger.error(f"Error generating SSS session report: {e}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)

    def _grade_summary(self, subject_results):
        counts = {}
        for r in subject_results:
            g = r.grade or "N/A"
            counts[g] = counts.get(g, 0) + 1
        return [{"grade": k, "count": v} for k, v in sorted(counts.items())]


# ============================================================
# JUNIOR SECONDARY
# ============================================================


class JuniorSecondaryReportGenerator(ReportGenerator):
    EDUCATION_LEVEL = "JUNIOR_SECONDARY"

    def generate_term_report(self, report_id):
        try:
            report = (
                JuniorSecondaryTermReport.objects.select_related(
                    "student",
                    "student__user",
                    "exam_session",
                    "exam_session__academic_session",
                    "exam_session__term",
                )
                .prefetch_related(
                    "subject_results__subject",
                    "subject_results__grading_system",
                    "subject_results__component_scores__component",
                )
                .get(id=report_id)
            )
        except JuniorSecondaryTermReport.DoesNotExist:
            return JsonResponse({"error": f"Report {report_id} not found"}, status=404)
        except Exception as e:
            logger.error(f"Error fetching JSS report {report_id}: {e}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)

        try:
            subject_results = (
                report.subject_results.all()
                .select_related("subject", "grading_system")
                .prefetch_related("component_scores__component")
                .order_by("subject__name")
            )

            subjects_data = []
            for result in subject_results:
                component_breakdown = _build_component_breakdown(result)
                ca_components = [c for c in component_breakdown if c["is_ca"]]
                exam_components = [c for c in component_breakdown if not c["is_ca"]]

                subjects_data.append(
                    {
                        "name": result.subject.name,
                        "code": result.subject.code,
                        "components": component_breakdown,
                        "ca_components": ca_components,
                        "exam_components": exam_components,
                        "ca_total": float(result.ca_total or 0),
                        "total": float(result.total_score or 0),
                        "percentage": float(result.percentage or 0),
                        "grade": result.grade or "",
                        "position": self.format_grade_suffix(result.subject_position),
                        "remark": result.teacher_remark or "",
                        "is_passed": result.is_passed,
                    }
                )

            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(student=report.student),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": report.student.get_student_class_display(),
                    "age": self.calculate_student_age(
                        getattr(report.student, "date_of_birth", None)
                    ),
                    "class_age": self.get_class_average_age(
                        report.student, report.exam_session
                    ),
                },
                "term": {
                    "name": (
                        report.exam_session.term.name
                        if report.exam_session.term
                        else ""
                    ),
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
                "next_term_begins": self.get_next_term_begins(report),
                "remarks": {
                    "class_teacher": report.class_teacher_remark or "",
                    "head_teacher": report.head_teacher_remark or "",
                },
                "signatures": self.get_signatures(report),
                "generated_date": datetime.now().strftime(_DATE_FORMAT),
            }

            html = render_to_string(self.get_template("term"), context)
            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}"
                f"_term_report.pdf"
            )
            return self.generate_pdf(html, filename)

        except Exception as e:
            logger.error(f"Error generating JSS term report: {e}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)


# ============================================================
# PRIMARY
# ============================================================


class PrimaryReportGenerator(ReportGenerator):
    EDUCATION_LEVEL = "PRIMARY"

    def _total_students_in_class(self, student, exam_session):
        try:
            return (
                PrimaryResult.objects.filter(
                    exam_session=exam_session,
                    student__student_class=student.student_class,
                    student__education_level=student.education_level,
                    status__in=("APPROVED", "PUBLISHED"),
                )
                .values("student")
                .distinct()
                .count()
            )
        except Exception as e:
            logger.error(f"Error counting students in class: {e}")
            return 0

    def generate_term_report(self, report_id):
        try:
            report = (
                PrimaryTermReport.objects.select_related(
                    "student",
                    "student__user",
                    "exam_session",
                    "exam_session__academic_session",
                    "exam_session__term",
                )
                .prefetch_related(
                    "subject_results__subject",
                    "subject_results__grading_system",
                    "subject_results__component_scores__component",
                )
                .get(id=report_id)
            )
        except PrimaryTermReport.DoesNotExist:
            return JsonResponse({"error": f"Report {report_id} not found"}, status=404)
        except Exception as e:
            logger.error(
                f"Error fetching primary report {report_id}: {e}", exc_info=True
            )
            return JsonResponse({"error": str(e)}, status=500)

        try:
            subject_results = (
                report.subject_results.all()
                .select_related("subject", "grading_system")
                .prefetch_related("component_scores__component")
                .order_by("subject__name")
            )

            subjects_data = []
            for result in subject_results:
                component_breakdown = _build_component_breakdown(result)
                ca_components = [c for c in component_breakdown if c["is_ca"]]
                exam_components = [c for c in component_breakdown if not c["is_ca"]]

                subjects_data.append(
                    {
                        "name": result.subject.name,
                        "code": result.subject.code,
                        "components": component_breakdown,
                        "ca_components": ca_components,
                        "exam_components": exam_components,
                        "ca_total": float(result.ca_total or 0),
                        "total": float(result.total_score or 0),
                        "percentage": float(result.percentage or 0),
                        "grade": result.grade or "",
                        "position": self.format_grade_suffix(result.subject_position),
                        "remark": result.teacher_remark or "",
                        "is_passed": result.is_passed,
                    }
                )

            total_students = self._total_students_in_class(
                report.student, report.exam_session
            )
            if not total_students:
                total_students = report.total_students or 0

            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(student=report.student),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": report.student.get_student_class_display(),
                    "age": self.calculate_student_age(
                        getattr(report.student, "date_of_birth", None)
                    ),
                    "class_age": self.get_class_average_age(
                        report.student, report.exam_session
                    ),
                },
                "term": {
                    "name": (
                        report.exam_session.term.name
                        if report.exam_session.term
                        else ""
                    ),
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
                    "total_students": total_students,
                },
                "attendance": {
                    "times_opened": report.times_opened or 0,
                    "times_present": report.times_present or 0,
                },
                "next_term_begins": self.get_next_term_begins(report),
                "remarks": {
                    "class_teacher": report.class_teacher_remark or "",
                    "head_teacher": report.head_teacher_remark or "",
                },
                "signatures": self.get_signatures(report),
                "generated_date": datetime.now().strftime(_DATE_FORMAT),
            }

            html = render_to_string(self.get_template("term"), context)
            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}"
                f"_term_report.pdf"
            )
            return self.generate_pdf(html, filename)

        except Exception as e:
            logger.error(f"Error generating primary term report: {e}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)


# ============================================================
# NURSERY  (unchanged — reads mark_obtained / max_marks_obtainable)
# ============================================================


class NurseryReportGenerator(ReportGenerator):
    EDUCATION_LEVEL = "NURSERY"

    def _overall_grade(self, report):
        try:
            if report.overall_percentage and hasattr(report, "grading_system"):
                grade_obj = report.grading_system.grades.filter(
                    min_score__lte=report.overall_percentage,
                    max_score__gte=report.overall_percentage,
                ).first()
                if grade_obj:
                    return grade_obj.grade
        except Exception:
            pass
        return "N/A"

    def generate_term_report(self, report_id):
        try:
            report = (
                NurseryTermReport.objects.select_related(
                    "student",
                    "student__user",
                    "exam_session",
                    "exam_session__academic_session",
                    "exam_session__term",
                )
                .prefetch_related(
                    "subject_results__subject", "subject_results__grading_system"
                )
                .get(id=report_id)
            )
        except NurseryTermReport.DoesNotExist:
            return JsonResponse({"error": f"Report {report_id} not found"}, status=404)
        except Exception as e:
            logger.error(
                f"Error fetching nursery report {report_id}: {e}", exc_info=True
            )
            return JsonResponse({"error": str(e)}, status=500)

        try:
            subject_results = (
                report.subject_results.all()
                .select_related("subject", "grading_system")
                .order_by("subject__name")
            )
            subjects_data = [
                {
                    "name": r.subject.name,
                    "max_obtainable": float(r.max_marks_obtainable or 0),
                    "mark_obtained": float(r.mark_obtained or 0),
                    "percentage": float(r.percentage or 0),
                    "grade": r.grade or "",
                    "position": (
                        self.format_grade_suffix(r.subject_position)
                        if r.subject_position
                        else "N/A"
                    ),
                    "remark": r.academic_comment or "",
                }
                for r in subject_results
            ]

            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(student=report.student),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": report.student.get_student_class_display(),
                    "age": self.calculate_student_age(
                        getattr(report.student, "date_of_birth", None)
                    ),
                    "class_age": self.get_class_average_age(
                        report.student, report.exam_session
                    ),
                },
                "term": {
                    "name": (
                        report.exam_session.term.name
                        if report.exam_session.term
                        else ""
                    ),
                    "session": report.exam_session.academic_session.name,
                    "year": report.exam_session.academic_session.start_date.year,
                },
                "subjects": subjects_data,
                "summary": {
                    "total_subjects": report.total_subjects or 0,
                    "total_max_marks": float(report.total_max_marks or 0),
                    "total_marks_obtained": float(report.total_marks_obtained or 0),
                    "overall_percentage": float(report.overall_percentage or 0),
                    "grade": self._overall_grade(report),
                    "position": self.format_grade_suffix(report.class_position),
                    "total_students": report.total_students_in_class or 0,
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
                    "comment": report.physical_development_comment or "",
                },
                "measurements": {
                    "height_beginning": report.height_beginning or "",
                    "height_end": report.height_end or "",
                    "weight_beginning": report.weight_beginning or "",
                    "weight_end": report.weight_end or "",
                },
                "next_term_begins": self.get_next_term_begins(report),
                "remarks": {
                    "class_teacher": report.class_teacher_remark or "",
                    "head_teacher": report.head_teacher_remark or "",
                },
                "signatures": self.get_signatures(report),
                "generated_date": datetime.now().strftime(_DATE_FORMAT),
            }

            html = render_to_string(self.get_template("term"), context)
            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}"
                f"_term_report.pdf"
            )
            return self.generate_pdf(html, filename)

        except Exception as e:
            logger.error(f"Error generating nursery term report: {e}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)


# ============================================================
# FACTORY
# ============================================================

_GENERATORS = {
    "SENIOR_SECONDARY": SeniorSecondaryReportGenerator,
    "JUNIOR_SECONDARY": JuniorSecondaryReportGenerator,
    "PRIMARY": PrimaryReportGenerator,
    "NURSERY": NurseryReportGenerator,
}


def get_report_generator(education_level, request=None):
    cls = _GENERATORS.get(education_level)
    if not cls:
        raise ValueError(f"Invalid education level: {education_level!r}")
    return cls(request)
