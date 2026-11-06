"""
When results reach students' families.

A parent sees a result only once the admin has released the Academics tab
(TenantSettings.academics_tab_enabled, off by default), and then only results
the admin has published. Every endpoint that hands results to a parent goes
through here, so the parent page can't leak results through a side door.
"""
from .models import StudentResult

PUBLISHED = "PUBLISHED"


def academics_released(tenant):
    """True once the admin has released the Academics tab to families."""
    settings = getattr(tenant, "settings", None) if tenant else None
    return bool(settings and settings.academics_tab_enabled)


def family_visible_results(tenant, student):
    """The student's results a parent may see: published, and only once released."""
    if not academics_released(tenant):
        return StudentResult.objects.none()
    return StudentResult.objects.filter(
        tenant=tenant, student=student, status=PUBLISHED
    ).select_related(
        "subject",
        "exam_session__term__term_type",
        "exam_session__academic_session",
    )


def family_result_summary(result):
    """One result as the parent page shows it: subject, score, date, term, session."""
    exam_session = result.exam_session
    term = getattr(exam_session, "term", None) if exam_session else None
    term_type = getattr(term, "term_type", None) if term else None
    academic_session = (
        getattr(exam_session, "academic_session", None) if exam_session else None
    )
    # The exam session's end date is when the exam was sat. It used to send
    # str(exam_session) ("First Term Exam") here, which the page showed as
    # "Invalid Date".
    exam_date = getattr(exam_session, "end_date", None) or getattr(
        exam_session, "start_date", None
    )
    return {
        "subject": result.subject.name if result.subject else "N/A",
        "score": float(result.percentage or 0),
        "exam_date": exam_date.isoformat() if exam_date else None,
        "exam_name": exam_session.name if exam_session else None,
        "term": term_type.name if term_type else None,
        "session": academic_session.name if academic_session else None,
    }
