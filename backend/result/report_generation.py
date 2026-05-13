"""
result/report_generation.py

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

Session report generators added for Junior Secondary, Primary, and Nursery.
All three share the same BaseSessionReport shape:
    term_totals        — list of {term_name, term_order, total_score,
                                  average_score, class_position}
    overall_total / overall_average / overall_grade / overall_position
    total_students
There is no stream FK and no subject-level breakdown on session reports
for these levels — everything is aggregated from term reports via
compute_from_term_reports().
"""

import logging
import re
from datetime import datetime

from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string

from .models import (
    ExamSession,
    JuniorSecondaryResult,
    JuniorSecondarySessionReport,
    JuniorSecondaryTermReport,
    NurserySessionReport,
    NurseryTermReport,
    PrimaryResult,
    PrimarySessionReport,
    PrimaryTermReport,
    SeniorSecondaryResult,
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
    ("NURSERY", "session"): "results/nursery_session_report.html",
    ("PRIMARY", "term"): "results/primary_term_report.html",
    ("PRIMARY", "session"): "results/primary_session_report.html",
    ("JUNIOR_SECONDARY", "term"): "results/junior_secondary_term_report.html",
    ("JUNIOR_SECONDARY", "session"): "results/junior_secondary_session_report.html",
    ("SENIOR_SECONDARY", "term"): "results/senior_secondary_term_report.html",
    ("SENIOR_SECONDARY", "session"): "results/senior_secondary_session_report.html",
}

_TERM_ORDER = ["FIRST", "SECOND", "THIRD"]
_DATE_FORMAT = "%B %d, %Y"


# ============================================================
# COMPONENT SCORE HELPER
# ============================================================


def _abbreviate_component(name: str, code: str = '', max_len: int = 3) -> str:
    """
    Return a max_len-character abbreviation for a component name.

    Rules (in priority order):
      1. If code is already ≤ max_len chars, use it (uppercased).
      2. Multi-word name (split on _ / space / -): use initials, truncated to max_len.
      3. Single word: use first max_len chars.
    """
    if code and len(code) <= max_len:
        return code.upper()
    parts = re.split(r'[_\s\-]+', name.strip())
    if len(parts) > 1:
        abbrev = ''.join(p[0] for p in parts if p)
    else:
        abbrev = name
    return abbrev[:max_len].upper()


def _build_component_breakdown(result):
    """
    Return a list of component score dicts for one result row.

    Each entry:
        {
            "name":       "First Test",
            "short_name": "FT",          ← max-3-char abbreviation for table headers
            "code":       "first_test",
            "score":      8.5,
            "max":        10.0,
            "is_ca":      True,
            "type":       "CA",
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
            "name":       cs.component.name,
            "short_name": _abbreviate_component(cs.component.name, cs.component.code),
            "code":       cs.component.code,
            "score":      float(cs.score),
            "max":        float(cs.component.max_score),
            # Use component_type as the authoritative CA/Exam flag so that
            # an EXAM component misconfigured with contributes_to_ca=True
            # is still treated as an exam (not counted in CA Total).
            "is_ca":      cs.component.component_type != "EXAM",
            "type":       cs.component.component_type,
        }
        for cs in scores
    ]


def _student_class_name(student):
    """
    Safe accessor for a student's class name.
    Student.student_class is a FK to Class, not a CharField with choices,
    so get_student_class_display() does not exist.
    """
    try:
        return student.student_class.name if student.student_class else ""
    except Exception:
        return ""


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
            # Use term.next_term_begins directly (set by admin in Academic tab)
            term = getattr(report.exam_session, "term", None)
            if term and getattr(term, "next_term_begins", None):
                return term.next_term_begins.strftime(_DATE_FORMAT)
            if getattr(report.exam_session, "next_term_begins", None):
                return report.exam_session.next_term_begins.strftime(_DATE_FORMAT)
            return "To Be Announced"
        except Exception as e:
            logger.error(f"Error in get_next_term_begins: {e}")
            return "To Be Announced"

    def get_attendance(self, student, exam_session):
        """
        Return (times_opened, times_present).

        times_opened  = weeks_per_term × 5, read from TenantSettings.
                        Falls back to counting distinct attendance dates in the
                        term date range if the setting is missing.
        times_present = count of PRESENT attendance records for this student
                        within the term date range.
        """
        try:
            from attendance.models import Attendance
            from tenants.models import TenantSettings

            # ── times_opened: weeks_per_term × 5 days ────────────────────────
            times_opened = 0
            try:
                tenant = getattr(student, "tenant", None)
                if tenant:
                    ts = TenantSettings.objects.get(tenant=tenant)
                else:
                    ts = TenantSettings.objects.first()
                if ts and ts.weeks_per_term:
                    times_opened = ts.weeks_per_term * 5
            except Exception:
                pass

            # ── date range for times_present ─────────────────────────────────
            term = getattr(exam_session, "term", None)
            if term and term.start_date and term.end_date:
                start, end = term.start_date, term.end_date
            elif exam_session.start_date and exam_session.end_date:
                start, end = exam_session.start_date, exam_session.end_date
            else:
                return times_opened, 0

            # Fallback for times_opened when setting is absent
            if not times_opened:
                times_opened = (
                    Attendance.objects.filter(date__range=(start, end))
                    .values("date").distinct().count()
                )

            times_present = Attendance.objects.filter(
                student=student,
                date__range=(start, end),
                status="P",
            ).count()
            return times_opened, times_present
        except Exception as e:
            logger.debug(f"get_attendance: {e}")
            return 0, 0

    def get_student_picture(self, student):
        """Return the student's profile picture URL, or None if not set."""
        try:
            pic = getattr(student, "profile_picture", None)
            if pic:
                return str(pic)
            # Fallback: user profile
            pic = getattr(student.user, "profile_picture", None)
            if pic:
                return str(pic)
            profile = getattr(student.user, "profile", None)
            if profile:
                pic = getattr(profile, "profile_picture", None)
                if pic:
                    return str(pic)
        except Exception as e:
            logger.debug(f"get_student_picture: {e}")
        return None

    def get_student_section(self, student):
        """Return the student's classroom section name (e.g. 'Diamond'), or ''."""
        try:
            from classroom.models import StudentEnrollment
            enrollment = (
                StudentEnrollment.objects.filter(student=student, is_active=True)
                .select_related("classroom__section")
                .first()
            )
            if enrollment and enrollment.classroom and enrollment.classroom.section:
                return enrollment.classroom.section.name or ""
        except Exception as e:
            logger.debug(f"get_student_section: {e}")
        return ""

    def count_students_in_class(self, student):
        """Count all active students in the same class, regardless of result status."""
        try:
            from students.models import Student
            count = Student.objects.filter(
                student_class=student.student_class,
                tenant=student.tenant,
            ).count()
            return count or 0
        except Exception as e:
            logger.debug(f"count_students_in_class: {e}")
        return 0

    def compute_class_position(self, report, ResultModel, term_report_model):
        """
        Compute class position on-the-fly by ranking this student's average
        against peers in the same class/session.  Used when class_position is
        not yet stored (e.g. report is still DRAFT).
        """
        try:
            if report.class_position:
                return self.format_grade_suffix(report.class_position)
            avg = float(report.average_score or 0)
            if not avg:
                return ""
            better = term_report_model.objects.filter(
                exam_session=report.exam_session,
                student__student_class=report.student.student_class,
                average_score__gt=avg,
            ).count()
            return self.format_grade_suffix(better + 1)
        except Exception as e:
            logger.debug(f"compute_class_position: {e}")
            return self.format_grade_suffix(report.class_position)

    def compute_subject_position(self, result, ResultModel):
        """
        Compute subject position on-the-fly by ranking this student's percentage
        against peers in the same class/subject/session.  Used when subject_position
        is not yet stored.
        """
        try:
            if result.subject_position:
                return self.format_grade_suffix(result.subject_position)
            pct = float(result.percentage or 0)
            if not pct:
                return ""
            better = ResultModel.objects.filter(
                exam_session=result.exam_session,
                subject=result.subject,
                student__student_class=result.student.student_class,
                percentage__gt=pct,
            ).count()
            return self.format_grade_suffix(better + 1)
        except Exception as e:
            logger.debug(f"compute_subject_position: {e}")
            return self.format_grade_suffix(result.subject_position)

    def build_grade_scale(self, subject_results):
        """Return admin-configured grade scale from the grading system on subject results."""
        try:
            for sr in subject_results:
                gs = getattr(sr, "grading_system", None)
                if gs:
                    return [
                        {
                            "grade": g.grade,
                            "min": int(g.min_score),
                            "max": int(g.max_score),
                            "remark": getattr(g, "remark", ""),
                        }
                        for g in gs.grades.all().order_by("-min_score")
                    ]
        except Exception as e:
            logger.debug(f"build_grade_scale: {e}")
        return []

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
            base_url = (
                self.request.build_absolute_uri("/")
                if self.request
                else getattr(settings, "WEASYPRINT_BASEURL", "")
            )
            pdf = WeasyHTML(string=html_string, base_url=base_url).write_pdf()
            response = HttpResponse(pdf, content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            logger.error(f"Error generating PDF: {e}", exc_info=True)
            return JsonResponse(
                {"error": "Failed to generate PDF", "detail": str(e)}, status=500
            )

    def _build_session_context(self, report, report_type_label):
        """
        Shared context builder for Junior Secondary, Primary, and Nursery
        session reports. All three have the same BaseSessionReport shape.

        The 'stream' field is intentionally absent — only Senior Secondary
        session reports have a stream FK.
        """
        term_totals = report.term_totals or []
        return {
            "report_type": "SESSION_REPORT",
            "report_type_label": report_type_label,
            "school": self.get_school_info(student=report.student),
            "student": {
                "name": report.student.full_name,
                "admission_number": report.student.registration_number or "",
                "class": _student_class_name(report.student),
                "age": self.calculate_student_age(
                    getattr(report.student, "date_of_birth", None)
                ),
            },
            "session": {
                "name": report.academic_session.name,
                "year": report.academic_session.start_date.year,
                "start_date": report.academic_session.start_date.strftime(_DATE_FORMAT),
                "end_date": (
                    report.academic_session.end_date.strftime(_DATE_FORMAT)
                    if report.academic_session.end_date
                    else "In Progress"
                ),
            },
            # Each entry: {term_name, term_order, total_score,
            #               average_score, class_position}
            "term_totals": term_totals,
            "summary": {
                "overall_total": float(report.overall_total or 0),
                "overall_average": float(report.overall_average or 0),
                "overall_grade": report.overall_grade or "",
                "overall_position": self.format_grade_suffix(report.overall_position),
                "total_students": report.total_students or 0,
                "terms_completed": len(term_totals),
            },
            "remarks": {
                "class_teacher": report.class_teacher_remark or "",
                "head_teacher": report.head_teacher_remark or "",
            },
            "signatures": self.get_signatures(report),
            "generated_date": datetime.now().strftime(_DATE_FORMAT),
        }


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

            # Refresh metrics if stale (total/average/grade all zero)
            if not float(report.average_score or 0):
                report.calculate_metrics()
                report.refresh_from_db()

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
                        "ca_total": sum(c["score"] for c in ca_components),
                        "total": sum(c["score"] for c in component_breakdown),
                        "percentage": float(result.percentage or 0),
                        "grade": result.grade or "",
                        "position": self.compute_subject_position(result, SeniorSecondaryResult),
                        "remark": result.teacher_remark or "",
                        "is_passed": result.is_passed,
                    }
                )

            times_opened, times_present = self.get_attendance(
                report.student, report.exam_session
            )

            total_students = self.count_students_in_class(report.student) or report.total_students or 0
            class_position = self.compute_class_position(
                report, SeniorSecondaryResult, SeniorSecondaryTermReport
            )

            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(student=report.student),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": _student_class_name(report.student),
                    "stream": report.stream.name if report.stream else "",
                    "section": self.get_student_section(report.student),
                    "age": self.calculate_student_age(
                        getattr(report.student, "date_of_birth", None)
                    ),
                    "picture": self.get_student_picture(report.student),
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
                    "position": class_position,
                    "total_students": total_students,
                },
                "grade_scale": self.build_grade_scale(subject_results),
                "grade_summary": self._grade_summary(subject_results),
                "attendance": {
                    "times_opened": times_opened or report.times_opened or 0,
                    "times_present": times_present or report.times_present or 0,
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
        """
        Session reports are built from the term_totals JSONField on
        SeniorSecondarySessionReport (populated by compute_from_term_reports()).
        """
        try:
            report = SeniorSecondarySessionReport.objects.select_related(
                "student", "student__user", "academic_session", "stream"
            ).get(id=report_id)
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
            term_totals = report.term_totals or []

            context = {
                "report_type": "SESSION_REPORT",
                "school": self.get_school_info(student=report.student),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": _student_class_name(report.student),
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
                "term_totals": term_totals,
                "summary": {
                    "overall_total": float(report.overall_total or 0),
                    "overall_average": float(report.overall_average or 0),
                    "overall_grade": report.overall_grade or "",
                    "overall_position": self.format_grade_suffix(
                        report.overall_position
                    ),
                    "total_students": report.total_students or 0,
                    "terms_completed": len(term_totals),
                },
                "remarks": {
                    "class_teacher": report.class_teacher_remark or "",
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
                .prefetch_related("component_scores__component", "grading_system__grades")
                .order_by("subject__name")
            )

            # Refresh metrics if stale
            if not float(report.average_score or 0):
                report.calculate_metrics()
                report.refresh_from_db()

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
                        "ca_total": sum(c["score"] for c in ca_components),
                        "total": sum(c["score"] for c in component_breakdown),
                        "percentage": float(result.percentage or 0),
                        "grade": result.grade or "",
                        "position": self.compute_subject_position(result, JuniorSecondaryResult),
                        "remark": result.teacher_remark or "",
                        "is_passed": result.is_passed,
                    }
                )

            times_opened, times_present = self.get_attendance(
                report.student, report.exam_session
            )

            total_students = self.count_students_in_class(report.student) or report.total_students or 0
            class_position = self.compute_class_position(
                report, JuniorSecondaryResult, JuniorSecondaryTermReport
            )

            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(student=report.student),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": _student_class_name(report.student),
                    "section": self.get_student_section(report.student),
                    "age": self.calculate_student_age(
                        getattr(report.student, "date_of_birth", None)
                    ),
                    "class_age": self.get_class_average_age(
                        report.student, report.exam_session
                    ),
                    "picture": self.get_student_picture(report.student),
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
                    "position": class_position,
                    "total_students": total_students,
                },
                "grade_scale": self.build_grade_scale(subject_results),
                "attendance": {
                    "times_opened": times_opened or report.times_opened or 0,
                    "times_present": times_present or report.times_present or 0,
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

    def generate_session_report(self, report_id):
        """
        Build a JSS session report PDF from the term_totals JSONField.
        No stream field — JSS session reports aggregate across all terms only.
        """
        try:
            report = JuniorSecondarySessionReport.objects.select_related(
                "student", "student__user", "academic_session"
            ).get(id=report_id)
        except JuniorSecondarySessionReport.DoesNotExist:
            return JsonResponse(
                {"error": f"Session report {report_id} not found"}, status=404
            )
        except Exception as e:
            logger.error(
                f"Error fetching JSS session report {report_id}: {e}", exc_info=True
            )
            return JsonResponse({"error": str(e)}, status=500)

        try:
            context = self._build_session_context(report, "Junior Secondary")
            html = render_to_string(self.get_template("session"), context)
            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}"
                f"_session_report.pdf"
            )
            return self.generate_pdf(html, filename)
        except Exception as e:
            logger.error(f"Error generating JSS session report: {e}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)


# ============================================================
# PRIMARY
# ============================================================


class PrimaryReportGenerator(ReportGenerator):
    EDUCATION_LEVEL = "PRIMARY"

    def _total_students_in_class(self, student, exam_session):
        # Primary: count all active students in the class (regardless of result status)
        total = self.count_students_in_class(student)
        if total:
            return total
        # Fallback: count from approved results
        try:
            return (
                PrimaryResult.objects.filter(
                    exam_session=exam_session,
                    student__student_class=student.student_class,
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
                .prefetch_related("component_scores__component", "grading_system__grades")
                .order_by("subject__name")
            )

            # Refresh metrics if stale
            if not float(report.average_score or 0):
                report.calculate_metrics()
                report.refresh_from_db()

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
                        "ca_total": sum(c["score"] for c in ca_components),
                        "total": sum(c["score"] for c in component_breakdown),
                        "percentage": float(result.percentage or 0),
                        "grade": result.grade or "",
                        "position": self.compute_subject_position(result, PrimaryResult),
                        "remark": result.teacher_remark or "",
                        "is_passed": result.is_passed,
                    }
                )

            total_students = self._total_students_in_class(
                report.student, report.exam_session
            )

            times_opened, times_present = self.get_attendance(
                report.student, report.exam_session
            )

            class_position = self.compute_class_position(
                report, PrimaryResult, PrimaryTermReport
            )

            context = {
                "report_type": "TERM_REPORT",
                "school": self.get_school_info(student=report.student),
                "student": {
                    "name": report.student.full_name,
                    "admission_number": report.student.registration_number or "",
                    "class": _student_class_name(report.student),
                    "section": self.get_student_section(report.student),
                    "age": self.calculate_student_age(
                        getattr(report.student, "date_of_birth", None)
                    ),
                    "class_age": self.get_class_average_age(
                        report.student, report.exam_session
                    ),
                    "picture": self.get_student_picture(report.student),
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
                    "position": class_position,
                    "total_students": total_students,
                },
                "grade_scale": self.build_grade_scale(subject_results),
                "attendance": {
                    "times_opened": times_opened or report.times_opened or 0,
                    "times_present": times_present or report.times_present or 0,
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

    def generate_session_report(self, report_id):
        """
        Build a Primary session report PDF from the term_totals JSONField.
        No stream field — Primary session reports aggregate across terms only.
        """
        try:
            report = PrimarySessionReport.objects.select_related(
                "student", "student__user", "academic_session"
            ).get(id=report_id)
        except PrimarySessionReport.DoesNotExist:
            return JsonResponse(
                {"error": f"Session report {report_id} not found"}, status=404
            )
        except Exception as e:
            logger.error(
                f"Error fetching primary session report {report_id}: {e}",
                exc_info=True,
            )
            return JsonResponse({"error": str(e)}, status=500)

        try:
            context = self._build_session_context(report, "Primary")
            html = render_to_string(self.get_template("session"), context)
            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}"
                f"_session_report.pdf"
            )
            return self.generate_pdf(html, filename)
        except Exception as e:
            logger.error(f"Error generating primary session report: {e}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)


# ============================================================
# NURSERY  (reads mark_obtained / max_marks_obtainable directly)
# ============================================================


class NurseryReportGenerator(ReportGenerator):
    EDUCATION_LEVEL = "NURSERY"

    def _overall_grade(self, report):
        """
        Derive an overall grade from the report's overall_percentage.
        NurseryTermReport has no grading_system FK — grading systems live
        on NurseryResult rows. We sample the first subject result's grading
        system for the percentage→grade lookup. Falls back to "N/A".
        """
        try:
            pct = float(report.overall_percentage or 0)
            first_result = report.subject_results.select_related(
                "grading_system__grades"
            ).first()
            if first_result and first_result.grading_system:
                gs = first_result.grading_system
                grade_obj = gs.grades.filter(
                    min_score__lte=pct, max_score__gte=pct
                ).first()
                if grade_obj:
                    return grade_obj.grade
        except Exception as e:
            logger.debug(f"_overall_grade fallback: {e}")
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
                    "subject_results__subject",
                    "subject_results__grading_system__grades",
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
                    "class": _student_class_name(report.student),
                    "section": self.get_student_section(report.student),
                    "age": self.calculate_student_age(
                        getattr(report.student, "date_of_birth", None)
                    ),
                    "class_age": self.get_class_average_age(
                        report.student, report.exam_session
                    ),
                    "picture": self.get_student_picture(report.student),
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

    def generate_session_report(self, report_id):
        """
        Build a Nursery session report PDF from the term_totals JSONField.

        Nursery session reports carry the same BaseSessionReport shape as
        the other levels. In addition, the context includes the student's
        age — useful for nursery-level reports that typically display
        developmental information even at the session level.
        """
        try:
            report = NurserySessionReport.objects.select_related(
                "student", "student__user", "academic_session"
            ).get(id=report_id)
        except NurserySessionReport.DoesNotExist:
            return JsonResponse(
                {"error": f"Session report {report_id} not found"}, status=404
            )
        except Exception as e:
            logger.error(
                f"Error fetching nursery session report {report_id}: {e}",
                exc_info=True,
            )
            return JsonResponse({"error": str(e)}, status=500)

        try:
            context = self._build_session_context(report, "Nursery")
            html = render_to_string(self.get_template("session"), context)
            filename = self.sanitize_filename(
                f"{report.student.registration_number or report.student.user.username}"
                f"_session_report.pdf"
            )
            return self.generate_pdf(html, filename)
        except Exception as e:
            logger.error(f"Error generating nursery session report: {e}", exc_info=True)
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
