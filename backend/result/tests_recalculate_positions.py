"""
Recalculating positions ranks each subject in each class once, and each class
once.

The groups were found with values_list(...).distinct() on models ordered by
-created_at. Django adds the ordering column to SELECT DISTINCT, so every
result came back as its own "group": a class of 40 with 10 subjects was
ranked 400 times per subject pass and 40 times per class pass. After
approving a class that was 3,600 queries and about 2.4 MB read from Postgres
for one click, all of it Supabase egress.
"""
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext

from .models import PrimaryResult, PrimaryTermReport
from . import tests_section_ranking as ranking

User = ranking.User

RECALCULATE = "/api/results/primary/term-reports/recalculate-positions/"


class RecalculatingPositionsRanksEachGroupOnceTest(ranking.SectionRankingTest):
    # Only the fixture is shared; SectionRankingTest's own tests run there.
    test_whole_class_by_default = None
    test_within_section_when_switched_on = None
    test_subject_position_and_highest_lowest_follow_the_section = None
    test_published_term_keeps_its_positions_when_the_switch_changes = None
    test_printed_report_counts_the_section = None
    test_school_switches_it_on_from_settings = None

    def setUp(self):
        super().setUp()
        self.term_reports(self.first_term)
        for name, pupil in self.pupils.items():
            result = PrimaryResult.objects.create(
                tenant=self.tenant, student=pupil, subject=self.maths,
                exam_session=self.first_term, grading_system=self.grading, status="APPROVED")
            PrimaryResult.objects.filter(pk=result.pk).update(percentage=Decimal(self.scores[name]))
        self.admin = User.objects.create_user(
            username="rank_admin", email="admin@rank.example.com", role="admin",
            password=None, is_active=True, tenant=self.tenant)
        self.client.force_authenticate(user=self.admin)

    def recalculate(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.post(
                RECALCULATE, {"exam_session": str(self.first_term.id)}, format="json",
                HTTP_X_TENANT_SLUG=self.tenant.slug)
        self.assertEqual(response.status_code, 200, response.content)
        return [q["sql"] for q in queries.captured_queries]

    def test_one_subject_in_one_class_is_ranked_once_and_the_class_once(self):
        sql = self.recalculate()

        rankings = [s for s in sql if "DENSE_RANK" in s]
        subject_rankings = [s for s in rankings if '"results_primary_result"' in s]
        class_rankings = [s for s in rankings if '"results_primary_term_report"' in s]
        self.assertEqual((len(subject_rankings), len(class_rankings)), (1, 1))

    def test_the_positions_are_still_right(self):
        self.recalculate()

        subject = {r.student.user.first_name.lower(): r.subject_position
                   for r in PrimaryResult.objects.select_related("student__user")}
        self.assertEqual(subject, {"ade": 1, "dayo": 2, "bisi": 3, "chidi": 4, "ebun": 5})
        self.assertEqual(self.positions(self.first_term)["ade"], (1, 5))
