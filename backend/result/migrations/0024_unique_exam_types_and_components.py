"""
Put the uniqueness the models declare into the database.

0014 declared unique_together on ExamType ("tenant", "code") and
AssessmentComponent ("tenant", "education_level", "code"), so Django's state
has believed since then that both exist. Production had neither: only the
primary keys were there. Nothing refused a duplicate, and one school ended up
with 280 exam types and 238 components after a seeding routine was re-run --
`get_or_create` raced with itself, and the IntegrityError handler written for
exactly that race never fired, because no constraint raised it.

The state already holds the constraints, so this is a database-only repair:
duplicates are folded into the row everything already references, then a unique
index enforces what the models always said. IF NOT EXISTS keeps the index step
a no-op on any database that does have the constraint.

Folding moves whatever points at a duplicate onto the survivor. Two rows can
collide there, because ComponentScore is unique per result and ExamSession per
(academic_session, term, exam_type). Where a collision is empty of meaning --
a zero score, or the same score twice -- the redundant row goes. Where two
different marks disagree, or two exam sessions would merge, the migration
stops and names what to resolve by hand: neither is a choice to make silently.
"""

from django.db import migrations
from django.db.models import Count, Min

RESULT_FKS = ["senior_result_id", "junior_result_id", "primary_result_id", "nursery_result_id"]


def _fold_scores(ComponentScore, doomed, keeper, conflicts):
    """Move each doomed component's scores onto the keeper, or resolve a clash."""
    for score in ComponentScore.objects.filter(component_id__in=doomed):
        owner = next((fk for fk in RESULT_FKS if getattr(score, fk) is not None), None)
        if owner is None:
            score.delete()
            continue
        existing = ComponentScore.objects.filter(
            component_id=keeper, **{owner: getattr(score, owner)}).first()
        if existing is None:
            score.component_id = keeper
            score.save(update_fields=["component"])
        elif not score.score or score.score == existing.score:
            score.delete()                      # nothing lost: 0, or the same mark twice
        elif not existing.score:
            existing.score = score.score        # the real mark was on the duplicate
            existing.save(update_fields=["score"])
            score.delete()
        else:
            conflicts.append(
                f"component {keeper} vs {score.component_id} on {owner}="
                f"{getattr(score, owner)}: {existing.score} vs {score.score}")


def _fold_sessions(ExamSession, doomed, keeper, conflicts):
    """Point exam sessions at the keeper, unless that would merge two sessions."""
    for session in ExamSession.objects.filter(exam_type_id__in=doomed):
        clash = ExamSession.objects.filter(
            exam_type_id=keeper,
            academic_session_id=session.academic_session_id,
            term_id=session.term_id,
        ).exclude(pk=session.pk).exists()
        if clash:
            conflicts.append(
                f"exam session {session.pk} would merge with an existing session "
                f"on exam type {keeper}")
        else:
            session.exam_type_id = keeper
            session.save(update_fields=["exam_type"])


def fold_duplicates(apps, schema_editor):
    AssessmentComponent = apps.get_model("result", "AssessmentComponent")
    ComponentScore = apps.get_model("result", "ComponentScore")
    ExamType = apps.get_model("result", "ExamType")
    ExamSession = apps.get_model("result", "ExamSession")

    conflicts = []

    for model, keys, fold in (
        (AssessmentComponent, ["tenant_id", "education_level_id", "code"],
         lambda doomed, keeper: _fold_scores(ComponentScore, doomed, keeper, conflicts)),
        (ExamType, ["tenant_id", "code"],
         lambda doomed, keeper: _fold_sessions(ExamSession, doomed, keeper, conflicts)),
    ):
        groups = (model.objects.values(*keys)
                  .annotate(keep=Min("id"), n=Count("id")).filter(n__gt=1))
        for group in groups:
            keeper = group["keep"]
            doomed = list(model.objects.filter(**{k: group[k] for k in keys})
                          .exclude(pk=keeper).values_list("id", flat=True))
            if not doomed:
                continue
            fold(doomed, keeper)
            if conflicts:
                continue
            model.objects.filter(pk__in=doomed).delete()

    if conflicts:
        raise RuntimeError(
            "Duplicate reference data holds conflicting values, so nothing was changed. "
            "Resolve these, then run the migration again:\n  " + "\n  ".join(conflicts))


def noop(apps, schema_editor):
    """Folded duplicates are not restored; the surviving row carries the data."""


INDEXES = [
    ("results_exam_type_tenant_code_uniq", "results_exam_type", "(tenant_id, code)"),
    ("results_assessment_component_tenant_level_code_uniq",
     "results_assessment_component", "(tenant_id, education_level_id, code)"),
]


class Migration(migrations.Migration):

    atomic = True

    dependencies = [("result", "0023_traitfield_traitrating_and_more")]

    operations = [
        migrations.RunPython(fold_duplicates, noop),
        # Deleting rows leaves the foreign keys' deferred checks pending, and
        # Postgres refuses to build an index on a table that has them. Firing
        # them here keeps the whole migration in one transaction.
        migrations.RunSQL(
            sql="SET CONSTRAINTS ALL IMMEDIATE;",
            reverse_sql=migrations.RunSQL.noop,
        ),
        *[
            migrations.RunSQL(
                sql=f"CREATE UNIQUE INDEX IF NOT EXISTS {name} ON {table} {columns};",
                reverse_sql=f"DROP INDEX IF EXISTS {name};",
            )
            for name, table, columns in INDEXES
        ],
    ]
