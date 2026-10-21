"""
Who a pupil is ranked against.

A class can have several sections (Primary 3 Gold, Primary 3 Silver). A
school chooses whether positions, "number in class", and a subject's class
average / highest / lowest are worked out across the whole class (4th of 45)
or within the pupil's own section (4th of 25): TenantSettings.rank_within_section.

Every ranking method in result.models asks `ranks_within_section` and splits
its class group with `section_groups`, so the choice holds wherever positions
are recalculated (result entry, approval, bulk upload, deletes, repairs).

Report cards parents have already seen must not change position when a school
flips the switch. So at that moment every term and session that has a
published report is frozen at the scope it was ranked with
(TenantSettings.ranking_scope_frozen), and later recalculations of it keep
that scope.
"""
from django.db.models import Q


def _key(exam_session_id=None, academic_session_id=None):
    if exam_session_id is not None:
        return f"exam_session:{exam_session_id}"
    return f"academic_session:{academic_session_id}"


def ranks_within_section(tenant_id, exam_session_id=None, academic_session_id=None):
    """
    True when this school ranks pupils within their section for this term
    (exam_session_id) or session (academic_session_id).
    """
    if tenant_id is None:
        return False
    from tenants.models import TenantSettings

    settings = (
        TenantSettings.objects.filter(tenant_id=tenant_id)
        .only("rank_within_section", "ranking_scope_frozen")
        .first()
    )
    if settings is None:
        return False
    frozen = settings.ranking_scope_frozen or {}
    key = _key(exam_session_id, academic_session_id)
    if key in frozen:
        return bool(frozen[key])
    return settings.rank_within_section


def section_groups(queryset, by_section):
    """
    `queryset` (rows with a `student`) split into one queryset per section, or
    `[queryset]` when ranking across the whole class. Pupils with no section
    are ranked together.
    """
    if not by_section:
        return [queryset]
    # By primary key, so a FOR UPDATE queryset still works: PostgreSQL
    # refuses FOR UPDATE alongside DISTINCT or a window function.
    rows = queryset.model.objects.filter(pk__in=list(queryset.values_list("pk", flat=True)))
    section_ids = set(rows.values_list("student__section_id", flat=True))
    return [
        rows.filter(
            Q(student__section_id=sid) if sid is not None else Q(student__section__isnull=True)
        )
        for sid in section_ids
    ]


def published_scopes(tenant_id):
    """Keys of every term and session that has a report published to parents."""
    from .models import (
        JuniorSecondarySessionReport, JuniorSecondaryTermReport,
        NurserySessionReport, NurseryTermReport,
        PrimarySessionReport, PrimaryTermReport,
        SeniorSecondarySessionReport, SeniorSecondaryTermReport,
    )

    keys = set()
    for model in (SeniorSecondaryTermReport, JuniorSecondaryTermReport,
                  PrimaryTermReport, NurseryTermReport):
        ids = (model.objects.filter(tenant_id=tenant_id, status="PUBLISHED")
               .order_by().values_list("exam_session_id", flat=True).distinct())
        keys.update(_key(exam_session_id=i) for i in ids)
    for model in (SeniorSecondarySessionReport, JuniorSecondarySessionReport,
                  PrimarySessionReport, NurserySessionReport):
        ids = (model.objects.filter(tenant_id=tenant_id, status="PUBLISHED")
               .order_by().values_list("academic_session_id", flat=True).distinct())
        keys.update(_key(academic_session_id=i) for i in ids)
    return keys


def freeze_published_scopes(settings, ranked_within_section):
    """
    Keep every published term and session at the scope it was ranked with
    (`ranked_within_section`, the value before the switch changed). Returns
    the updated mapping; already-frozen entries are left as they are.
    """
    frozen = dict(settings.ranking_scope_frozen or {})
    for key in published_scopes(settings.tenant_id):
        frozen.setdefault(key, ranked_within_section)
    return frozen


def locked_groups(model, base_filter, scope_field):
    """
    Lock the rows matching `base_filter` and return them as ranking groups,
    split by section when this term (scope_field "exam_session_id") or
    session ("academic_session_id") ranks within sections. Call inside a
    transaction. The groups are fresh querysets: PostgreSQL refuses FOR UPDATE
    in the same query as the window function that ranks them.
    """
    pks = list(model.objects.filter(**base_filter).select_for_update().values_list("pk", flat=True))
    if not pks:
        return []
    first = model.objects.filter(pk=pks[0]).values("tenant_id", scope_field).first()
    by_section = ranks_within_section(first["tenant_id"], **{scope_field: first[scope_field]})
    rows = model.objects.filter(pk__in=pks)
    return section_groups(rows, by_section) if by_section else [rows]


def assign_positions(model, group, score_field, position_field, total_field):
    """Dense-rank `group` by `score_field`, highest first, and record each row's position and the group's size."""
    from django.db.models import F, Window
    from django.db.models.functions import DenseRank

    ranked = group.annotate(
        rank=Window(expression=DenseRank(), order_by=F(score_field).desc())
    ).values("pk", "rank")
    rank_map = {row["pk"]: row["rank"] for row in ranked}
    rows = list(group.only("pk", position_field, total_field))
    for row in rows:
        setattr(row, position_field, rank_map.get(row.pk))
        setattr(row, total_field, len(rows))
    model.objects.bulk_update(rows, [position_field, total_field], batch_size=200)
