"""
The admin Results page lists term reports as summaries (?summary=1).

In full, a page of 20 reports carried every subject result with its student,
subject, session, grading system and component scores: about 600 KB read
from Postgres (Supabase egress) per level, reloaded after every approve and
publish. A row shows only the average and the number of subjects, so the
summary sends those, worked out in SQL, and opening a report fetches it in
full.
"""
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext

from . import tests_section_ranking as ranking
from .models import PrimaryResult, PrimaryTermReport
from subject.models import Subject

User = ranking.User
REPORTS = "/api/results/primary/term-reports/"


class TermReportSummaryListTest(ranking.SectionRankingTest):
    # Only the fixture is shared; SectionRankingTest's own tests run there.
    test_whole_class_by_default = None
    test_within_section_when_switched_on = None
    test_subject_position_and_highest_lowest_follow_the_section = None
    test_published_term_keeps_its_positions_when_the_switch_changes = None
    test_printed_report_counts_the_section = None
    test_school_switches_it_on_from_settings = None

    def setUp(self):
        super().setUp()
        self.term_reports(self.first_term, status="DRAFT")
        english = Subject.objects.create(tenant=self.tenant, name="English", code="ENG")
        for subject, total in ((self.maths, Decimal("60")), (english, Decimal("80"))):
            result = PrimaryResult.objects.create(
                tenant=self.tenant, student=self.pupils["ade"], subject=subject,
                exam_session=self.first_term, grading_system=self.grading, status="DRAFT")
            PrimaryResult.objects.filter(pk=result.pk).update(
                total_score=total, term_report=self.ade_report())
        admin = User.objects.create_user(
            username="summary_admin", email="admin@summary.example.com", role="admin",
            password=None, is_active=True, tenant=self.tenant)
        self.client.force_authenticate(user=admin)

    def ade_report(self):
        return PrimaryTermReport.objects.get(student=self.pupils["ade"], exam_session=self.first_term)

    def get(self, url):
        response = self.client.get(url, HTTP_X_TENANT_SLUG=self.tenant.slug)
        self.assertEqual(response.status_code, 200, response.content[:300])
        return response.data.get("results", response.data)

    def ade_row(self, rows):
        report_id = str(self.ade_report().id)
        return next(r for r in rows if str(r["id"]) == report_id)

    def test_a_summary_has_the_count_and_average_but_not_the_results(self):
        row = self.ade_row(self.get(f"{REPORTS}?summary=1&page_size=20"))

        self.assertNotIn("subject_results", row)
        self.assertEqual(row["subject_count"], 2)
        self.assertEqual(Decimal(row["list_average"]), Decimal("70.00"))

    def test_the_summary_reads_no_subject_result_rows(self):
        with CaptureQueriesContext(connection) as queries:
            self.get(f"{REPORTS}?summary=1&page_size=20")

        reads = [q["sql"] for q in queries.captured_queries
                 if q["sql"].startswith('SELECT "results_primary_result".')]
        self.assertEqual(reads, [])

    def test_without_summary_and_opened_alone_a_report_is_whole(self):
        listed = self.ade_row(self.get(f"{REPORTS}?page_size=20"))
        opened = self.get(f"{REPORTS}{self.ade_report().id}/")

        for report in (listed, opened):
            self.assertEqual(len(report["subject_results"]), 2)

    def test_every_level_answers_a_summary(self):
        for level in ("nursery", "primary", "junior-secondary", "senior-secondary"):
            with self.subTest(level=level):
                self.get(f"/api/results/{level}/term-reports/?summary=1&page_size=20")
