from django.db import transaction
from result.models import PrimaryResult, PrimaryTermReport

with transaction.atomic():
    term_report, created = PrimaryTermReport.objects.get_or_create(
        student_id=112,
        exam_session_id=1,
        defaults={'status': 'PUBLISHED', 'is_published': True,
                  'tenant_id': 'b81b1f40-fd8b-4874-966b-15faa4cc8a05'},
    )
    updated = PrimaryResult.objects.filter(
        student_id=112, exam_session_id=1, term_report__isnull=True,
    ).update(term_report=term_report)
    term_report.calculate_metrics()
    print(
        f'Created={created}, linked {updated} results, term_report_id={term_report.id}')
