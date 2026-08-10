"""
result/models.py

Design principles
──────────────────
1. No hardcoded score fields.  AssessmentComponent + ComponentScore replace
   first_test_score, continuous_assessment_score, exam_score, etc.

2. No hardcoded exam type choices.  ExamType FK replaces EXAM_TYPES CharField.

3. Session reports exist for ALL four education levels.
   Totals are computed from existing TermReport records — no manual entry,
   always in sync, handles any number of terms.

4. BaseResult / TermReportFields / BaseSessionReport abstract the shared
   logic so each education-level subclass stays thin.

5. Permission model
   ─────────────────
   • DRAFT      → teacher (who entered it) may edit/delete.
   • APPROVED   → only _ADMIN_ROLES may edit/delete.
   • PUBLISHED  → only _ADMIN_ROLES may edit/delete.
   _ADMIN_ROLES = HEAD_TEACHER, HEADMASTER, PROPRIETRESS, PRINCIPAL,
                  admin, superadmin.
   FORM_TEACHER has NO global edit rights on approved/published records.

6. Bulk operations
   ─────────────────
   Every concrete result/report model exposes:
     • bulk_approve(queryset, user)   — single UPDATE, no per-row save()
     • bulk_publish(queryset, user)   — single UPDATE, no per-row save()
     • bulk_delete(queryset, user)    — permission-checked then bulk delete
     • bulk_record(entries, user)     — bulk_create ComponentScore rows then
                                        recalculate in one pass
   Position recalculation uses SQL RANK() window functions — no Python sort.

7. NurseryResult inherits BaseResult (fixed from original).
   All four education levels share identical save() / grade / permission logic.
"""

import logging
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError, PermissionDenied
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.db.models import (
    Avg,
    CheckConstraint,
    Count,
    F,
    Max,
    Min,
    Q,
    Sum,
    Window,
)
from django.utils import timezone

from django.db.models.functions import DenseRank

from academics.models import AcademicSession, EducationLevel, Term
from classroom.models import Class as StudentClass, Stream
from students.models import Student
from subject.models import Subject
from tenants.models import TenantMixin


logger = logging.getLogger(__name__)


# ── Shared constants ──────────────────────────────────────────────────────────

_RESULT_STATUS = [
    ("DRAFT", "Draft"),
    ("APPROVED", "Approved"),
    ("PUBLISHED", "Published"),
]

# Single source of truth for privileged roles.
# Update this set to grant/revoke bulk-action rights everywhere at once.
_ADMIN_ROLES: frozenset[str] = frozenset(
    {
        "HEAD_TEACHER",
        "HEADMASTER",
        "PROPRIETRESS",
        "PRINCIPAL",
        "ADMIN",
        "SUPERADMIN",
    }
)

_DEFAULT_GRADE_THRESHOLDS = (
    (70, "A"), (60, "B"), (50, "C"), (45, "D"), (39, "E"))


def _default_grade(percentage: float) -> str:
    for threshold, grade in _DEFAULT_GRADE_THRESHOLDS:
        if percentage >= threshold:
            return grade
    return "F"


def _user_role(user) -> str:
    """Safe accessor for user.role — always returns uppercase."""

    return (getattr(user, "role", "") or "").upper()


def _is_admin(user) -> bool:
    return _user_role(user) in _ADMIN_ROLES


# ============================================================
# GRADING SYSTEM
# ============================================================


class GradingSystem(TenantMixin, models.Model):
    GRADING_TYPES = [
        ("PERCENTAGE", "Percentage (0-100)"),
        ("POINTS", "Points (0-4.0, 0-5.0, etc.)"),
        ("LETTER", "Letter Grades (A, B, C, etc.)"),
        ("PASS_FAIL", "Pass/Fail"),
    ]

    name = models.CharField(max_length=100)
    grading_type = models.CharField(max_length=20, choices=GRADING_TYPES)
    description = models.TextField(blank=True)
    min_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    max_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=100)
    pass_mark = models.DecimalField(max_digits=5, decimal_places=2, default=40)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_grading_system"
        unique_together = ["tenant", "name"]
        indexes = [models.Index(fields=["tenant", "is_active"])]

    def __str__(self):
        return self.name

    def get_grade(self, percentage):
        """
        Return the grade label for *percentage*, using the highest band
        whose min_score the percentage qualifies for.

        Bands are entered as whole-number ranges (e.g. 70-79, 80-89) but
        percentages are decimals. Requiring min_score <= percentage <=
        max_score leaves gaps a decimal score can fall into (79.7 matches
        neither 70-79 nor 80-89) and silently produces no grade. Matching
        on min_score alone treats bands as contiguous downward from the
        top, which is how these scales are meant to work — no gaps.
        """
        if percentage is None:
            return None
        try:
            grade_obj = (
                self.grades.filter(min_score__lte=percentage)
                .order_by("-min_score")
                .first()
            )
            if grade_obj:
                return grade_obj.grade
            # Percentage below every band's min_score (e.g. negative or
            # below the lowest tier's floor) — fall back to the lowest tier.
            lowest = self.grades.order_by("min_score").first()
            return lowest.grade if lowest else None
        except Exception as exc:
            logger.error("Error getting grade for %s: %s", self.name, exc)
            return None


class Grade(TenantMixin, models.Model):
    grading_system = models.ForeignKey(
        GradingSystem, on_delete=models.CASCADE, related_name="grades"
    )
    grade = models.CharField(max_length=5)
    min_score = models.DecimalField(max_digits=5, decimal_places=2)
    max_score = models.DecimalField(max_digits=5, decimal_places=2)
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )
    description = models.CharField(max_length=100, blank=True)
    remark = models.CharField(
        max_length=200, blank=True,
        help_text="Default teacher remark auto-applied when a student achieves this grade.",
    )
    is_passing = models.BooleanField(default=True)

    class Meta:
        db_table = "results_grade"
        unique_together = ["tenant", "grading_system", "grade"]
        ordering = ["-min_score"]
        indexes = [models.Index(fields=["tenant", "grading_system"])]

    def __str__(self):
        return f"{self.grade} ({self.min_score}-{self.max_score})"

    def clean(self):
        if self.min_score >= self.max_score:
            raise ValidationError(
                "Minimum score must be less than maximum score")


# ============================================================
# ASSESSMENT COMPONENT — replaces hardcoded score columns
# ============================================================


class AssessmentComponent(TenantMixin, models.Model):
    """
    Tenant-configurable assessment components per education level.
    Schools define their own breakdown (e.g. Test 1 + Test 2 + Exam,
    or CA + Practical + Theory) without any code changes.
    """

    COMPONENT_TYPES = [
        ("CA", "Continuous Assessment"),
        ("EXAM", "Examination"),
        ("PRACTICAL", "Practical"),
        ("PROJECT", "Project"),
        ("ORAL", "Oral Assessment"),
        ("OTHER", "Other"),
    ]

    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.CASCADE,
        related_name="assessment_components",
    )
    name = models.CharField(max_length=80)
    code = models.SlugField(max_length=30)
    component_type = models.CharField(
        max_length=20, choices=COMPONENT_TYPES, default="CA"
    )
    max_score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    contributes_to_ca = models.BooleanField(
        default=True,
        help_text="True = counted in CA sub-total; False = standalone (e.g. final Exam)",
    )
    show_in_printed_report = models.BooleanField(
        default=True,
        help_text=(
            "If False, teachers still enter this component score (and it is "
            "included in the CA/Exam total), but it does NOT appear as its own "
            "column in the printed result sheet. "
            "Use this when individual CA tests should be entered separately but "
            "only the aggregate CA total should print (e.g. CA1+CA2+CA3 → CA 60%)."
        ),
    )
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_assessment_component"
        unique_together = [["tenant", "education_level", "code"]]
        ordering = ["display_order", "name"]
        indexes = [models.Index(
            fields=["tenant", "education_level", "is_active"])]

    def __str__(self):
        return f"{self.name} (max {self.max_score}) — {self.education_level.name}"

    def clean(self):
        if self.max_score is not None and self.max_score <= 0:
            raise ValidationError("max_score must be greater than zero")

    def save(self, *args, **kwargs):
        if self.tenant_id is None:
            raise ValueError("tenant is required")
        super().save(*args, **kwargs)


# ============================================================
# TRAIT CATEGORY
# ============================================================

class TraitCategory(models.TextChoices):
    AFFECTIVE = "AFFECTIVE", "Affective Domain"
    PSYCHOMOTOR = "PSYCHOMOTOR", "Psychomotor Skills"


# The exact list your current hardcoded report shows today.
# This is the fallback ONLY — never written to the DB automatically.
# A tenant that configures nothing gets exactly this, in this order.
DEFAULT_TRAIT_FIELDS = {
    TraitCategory.AFFECTIVE: [
        "Attentiveness",
        "Honesty",
        "Neatness",
        "Politeness",
        "Punctuality/ Assembly",
        "Self Control/ Calmness",
        "Obedience",
        "Reliability",
        "Sense Of Responsibility",
        "Relationship With Others",
    ],
    TraitCategory.PSYCHOMOTOR: [
        "Handling Of Tools",
        "Drawing/ Painting",
        "Handwriting",
        "Public Speaking",
        "Speech Fluency",
        "Sports & Games",
    ],
}

# value -> label, matches the current 5..1 tick-grid rating scale.
DEFAULT_RATING_SCALE = {5: "Excellent", 4: "Very Good",
                        3: "Good", 2: "Fair", 1: "Poor"}


# ============================================================
# TRAIT FIELD — tenant-configurable "column"
# ============================================================

class TraitField(TenantMixin, models.Model):
    """
    A single tenant-defined Affective Domain / Psychomotor Skills trait
    (i.e. one column/row label on the printed report), analogous to
    AssessmentComponent for score columns.

    education_level = None  -> applies to ALL education levels for this
                                tenant (most schools want one shared list).
    education_level = <FK>  -> overrides / adds a level-specific trait
                                (e.g. a Senior Secondary "Leadership" trait
                                that Nursery doesn't have).
    """

    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.CASCADE,
        related_name="trait_fields",
        null=True,
        blank=True,
        help_text="Leave blank to apply to every education level.",
    )
    category = models.CharField(max_length=20, choices=TraitCategory.choices)
    name = models.CharField(max_length=100)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_trait_field"
        unique_together = ["tenant", "category", "education_level", "name"]
        ordering = ["category", "display_order", "name"]
        indexes = [
            models.Index(fields=["tenant", "category", "is_active"]),
            models.Index(fields=["tenant", "education_level"]),
        ]

    def __str__(self):
        level = self.education_level.name if self.education_level else "All Levels"
        return f"{self.get_category_display()}: {self.name} ({level})"

    def save(self, *args, **kwargs):
        if self.tenant_id is None:
            raise ValueError("tenant is required")
        super().save(*args, **kwargs)


def seed_default_trait_fields_for_tenant(tenant):
    """
    OPTIONAL convenience for schools that want to start from the current
    defaults and then tweak them (rename/reorder/delete a few), instead of
    typing a whole new list from scratch. NOT called automatically anywhere
    — purely an opt-in "start from defaults" action exposed via an API
    endpoint / admin button. Safe to call multiple times (get_or_create).
    """
    for category, names in DEFAULT_TRAIT_FIELDS.items():
        for order, name in enumerate(names, start=10):
            TraitField.objects.get_or_create(
                tenant=tenant,
                category=category,
                education_level=None,
                name=name,
                defaults={"display_order": order, "is_active": True},
            )


def get_trait_fields(tenant, category, education_level=None):
    """
    Resolve the ordered list of trait fields a report should display for
    (tenant, category, education_level).

    Priority:
      1. Tenant-configured TraitField rows for this category — level-specific
         ones (education_level=<level>) first, then level-agnostic ones
         (education_level=None), in display_order.
      2. If the tenant has configured NOTHING for this category (no active
         rows at all, for any level) -> DEFAULT_TRAIT_FIELDS.

    Returns: list of dicts [{"id": int|None, "name": str, "is_default": bool}, ...]
    "id" is None for default (non-tenant) traits.
    """
    qs = TraitField.objects.filter(
        tenant=tenant, category=category, is_active=True
    ).filter(Q(education_level=education_level) | Q(education_level__isnull=True))

    configured = list(qs.order_by("display_order", "name"))
    if configured:
        # de-dupe by name, preferring the level-specific row over the
        # level-agnostic one if both exist for the same name
        by_name = {}
        for f in configured:
            if f.name not in by_name or f.education_level_id is not None:
                by_name[f.name] = f
        ordered = sorted(by_name.values(), key=lambda f: (
            f.display_order, f.name))
        return [{"id": f.id, "name": f.name, "is_default": False} for f in ordered]

    return [
        {"id": None, "name": name, "is_default": True}
        for name in DEFAULT_TRAIT_FIELDS.get(category, [])
    ]


# ============================================================
# TRAIT RATING — per-student value for one TraitField on one term report
# ============================================================

class TraitRating(TenantMixin, models.Model):
    """
    One rating value (1-5) for one student, one trait, one term report.

    Uses the SAME "exactly one report FK set" pattern as ComponentScore —
    exactly one of the four *_term_report FKs must be non-null.

    trait_field is null when rating a DEFAULT (non-tenant-configured) trait;
    in that case default_trait_name carries the trait's name instead. This
    lets teachers record ratings for schools that never bothered configuring
    TraitField rows, without ever writing DEFAULT_TRAIT_FIELDS into the DB.
    """

    senior_term_report = models.ForeignKey(
        "SeniorSecondaryTermReport", null=True, blank=True,
        on_delete=models.CASCADE, related_name="trait_ratings",
    )
    junior_term_report = models.ForeignKey(
        "JuniorSecondaryTermReport", null=True, blank=True,
        on_delete=models.CASCADE, related_name="trait_ratings",
    )
    primary_term_report = models.ForeignKey(
        "PrimaryTermReport", null=True, blank=True,
        on_delete=models.CASCADE, related_name="trait_ratings",
    )
    nursery_term_report = models.ForeignKey(
        "NurseryTermReport", null=True, blank=True,
        on_delete=models.CASCADE, related_name="trait_ratings",
    )

    category = models.CharField(max_length=20, choices=TraitCategory.choices)
    trait_field = models.ForeignKey(
        TraitField, null=True, blank=True,
        on_delete=models.CASCADE, related_name="ratings",
    )
    default_trait_name = models.CharField(
        max_length=100, blank=True, default="",
        help_text="Set only when trait_field is null.",
    )
    value = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_trait_rating"
        constraints = [
            CheckConstraint(
                check=(
                    Q(senior_term_report__isnull=False, junior_term_report__isnull=True,
                      primary_term_report__isnull=True, nursery_term_report__isnull=True)
                    | Q(senior_term_report__isnull=True, junior_term_report__isnull=False,
                        primary_term_report__isnull=True, nursery_term_report__isnull=True)
                    | Q(senior_term_report__isnull=True, junior_term_report__isnull=True,
                        primary_term_report__isnull=False, nursery_term_report__isnull=True)
                    | Q(senior_term_report__isnull=True, junior_term_report__isnull=True,
                        primary_term_report__isnull=True, nursery_term_report__isnull=False)
                ),
                name="chk_trait_rating_exactly_one_report_fk",
            ),
            CheckConstraint(
                check=(
                    Q(trait_field__isnull=False, default_trait_name="")
                    | (Q(trait_field__isnull=True) & ~Q(default_trait_name=""))
                ),
                name="chk_trait_rating_field_xor_default_name",
            ),
            models.UniqueConstraint(
                fields=["senior_term_report",
                        "trait_field", "default_trait_name"],
                condition=Q(senior_term_report__isnull=False),
                name="uq_trait_rating_senior",
            ),
            models.UniqueConstraint(
                fields=["junior_term_report",
                        "trait_field", "default_trait_name"],
                condition=Q(junior_term_report__isnull=False),
                name="uq_trait_rating_junior",
            ),
            models.UniqueConstraint(
                fields=["primary_term_report",
                        "trait_field", "default_trait_name"],
                condition=Q(primary_term_report__isnull=False),
                name="uq_trait_rating_primary",
            ),
            models.UniqueConstraint(
                fields=["nursery_term_report",
                        "trait_field", "default_trait_name"],
                condition=Q(nursery_term_report__isnull=False),
                name="uq_trait_rating_nursery",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "category"]),
        ]

    def __str__(self):
        name = self.trait_field.name if self.trait_field_id else self.default_trait_name
        return f"{name}: {self.value}"

    def clean(self):
        set_count = sum(
            1 for fk in [
                self.senior_term_report_id, self.junior_term_report_id,
                self.primary_term_report_id, self.nursery_term_report_id,
            ] if fk is not None
        )
        if set_count != 1:
            raise ValidationError(
                "Exactly one of senior/junior/primary/nursery term_report FK must be set."
            )
        if bool(self.trait_field_id) == bool(self.default_trait_name):
            raise ValidationError(
                "Set exactly one of trait_field or default_trait_name, not both/neither."
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


# Maps a concrete TermReport class -> the TraitRating FK field name that
# points at it. Extend this dict if you ever add a 5th report type.
_REPORT_FK_MAP = {}  # populated below, after the term report classes exist:
#
#   _REPORT_FK_MAP = {
#       SeniorSecondaryTermReport: "senior_term_report",
#       JuniorSecondaryTermReport: "junior_term_report",
#       PrimaryTermReport: "primary_term_report",
#       NurseryTermReport: "nursery_term_report",
#   }
#
# Paste that assignment right after NurseryTermReport's class body in the
# real results/models.py (same place NurserySessionReport.TERM_REPORT_MODEL
# is assigned).


def get_report_trait_section(term_report, category):
    tenant = term_report.tenant
    tsettings = getattr(tenant, "settings", None)
    student = getattr(term_report, "student", None)

    # String level_type code, e.g. "NURSERY" — used for toggle/scope checks
    level_code = getattr(student, "education_level", None)

    # Actual EducationLevel FK instance — required by get_trait_fields(),
    # since TraitField.education_level is a ForeignKey, not a string.
    student_class = getattr(student, "student_class", None)
    education_level_obj = getattr(student_class, "education_level", None)

    if tsettings is None:
        return []

    if category == TraitCategory.AFFECTIVE:
        enabled = tsettings.show_affective_domain
        scope = tsettings.affective_domain_applies_to or []
        mode = tsettings.affective_domain_rating_mode
    else:
        enabled = tsettings.show_psychomotor
        scope = tsettings.psychomotor_applies_to or []
        mode = tsettings.psychomotor_rating_mode

    if not enabled:
        return []
    if scope and level_code not in scope:
        return []

    fields = get_trait_fields(tenant, category, education_level_obj)

    fk_name = _REPORT_FK_MAP[type(term_report)]
    ratings = TraitRating.objects.filter(
        **{fk_name: term_report}, category=category)
    by_field_id = {r.trait_field_id: r for r in ratings if r.trait_field_id}
    by_default_name = {
        r.default_trait_name: r for r in ratings if not r.trait_field_id}

    out = []

    for f in fields:
        rating = by_field_id.get(f["id"]) if f["id"] else None
        if rating is None:
            # Fall back to a name match even when the field is now tenant-configured —
            # older ratings may have been saved against the default (name-only) list
            # before this TraitField existed.
            rating = by_default_name.get(f["name"])
        value = rating.value if rating else None
        out.append({
            "name": f["name"],
            "value": value,
            "label": DEFAULT_RATING_SCALE.get(value) if value else None,
            "display_mode": mode,
        })
    return out


def is_physical_development_visible(tenant_settings, education_level_code):
    """
    Determines whether the Physical Development / Growth Measurements
    section should appear on a term report for the given education level.

    Rule:
      - Nursery reports using the DEVELOPMENTAL style ALWAYS include this
        section — it's baked into that report style and is not gated by
        show_physical_development or physical_development_applies_to.
      - For every other case (including Nursery on the STANDARD style),
        the section only appears if show_physical_development is True AND
        education_level_code is explicitly listed in
        physical_development_applies_to. An empty list means no levels
        have been selected — the section will not show anywhere via this
        setting.
    """
    is_nursery_developmental = (
        education_level_code == "NURSERY"
        and tenant_settings.nursery_report_style == "DEVELOPMENTAL"
    )
    if is_nursery_developmental:
        return True

    if not tenant_settings.show_physical_development:
        return False

    scope = tenant_settings.physical_development_applies_to or []
    return education_level_code in scope


# ============================================================
# SCORING CONFIGURATION
# ============================================================


class ScoringConfiguration(TenantMixin, models.Model):
    RESULT_TYPE_CHOICES = [
        ("TERMLY", "Termly Result"),
        ("SESSION", "Session Result"),
    ]

    id = models.AutoField(primary_key=True)
    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.PROTECT,
        related_name="scoring_configurations",
    )
    result_type = models.CharField(max_length=20, choices=RESULT_TYPE_CHOICES)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    total_max_score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=100,
        validators=[MinValueValidator(0)],
        help_text="Must equal sum of all active AssessmentComponent.max_score for this level",
    )
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_scoring_configs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_scoring_configuration"
        unique_together = ["tenant", "education_level", "result_type", "name"]
        ordering = ["result_type", "name"]
        indexes = [
            models.Index(fields=["tenant", "education_level", "result_type"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "is_default"]),
        ]

    def __str__(self):
        return (
            f"{self.education_level.name} — "
            f"{self.get_result_type_display()} — {self.name}"
        )

    def clean(self):
        # NOTE: This DB query is intentional for single-record admin saves only.
        # Do NOT call clean() inside bulk operations.
        component_total = AssessmentComponent.objects.filter(
            tenant=self.tenant,
            education_level=self.education_level,
            is_active=True,
        ).aggregate(total=Sum("max_score"))["total"] or Decimal(0)
        if component_total and component_total != self.total_max_score:
            raise ValidationError(
                f"Active component max_scores sum to {component_total}, "
                f"but total_max_score is {self.total_max_score}."
            )


# ============================================================
# ASSESSMENT TYPE (legacy)
# ============================================================


class AssessmentType(TenantMixin, models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=10)
    description = models.TextField(blank=True)
    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.PROTECT,
        related_name="assessment_types",
        null=True,
        blank=True,
    )
    max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=10,
        validators=[MinValueValidator(0)],
    )
    weight_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "results_assessment_type"
        ordering = ["name"]
        unique_together = [["tenant", "name"], ["tenant", "code"]]

    def __str__(self):
        level = self.education_level.name if self.education_level else "All Levels"
        return f"{self.name} — {level} ({self.weight_percentage}%)"


# ============================================================
# EXAM TYPE — replaces hardcoded EXAM_TYPES CharField
# ============================================================


class ExamType(TenantMixin, models.Model):
    """
    Tenant-configurable exam session type.
    Seeded with defaults on tenant creation; schools can rename/add freely.
    """

    CATEGORY_CHOICES = [
        ("CA", "Continuous Assessment"),
        ("EXAM", "Examination"),
        ("PRACTICAL", "Practical"),
        ("PROJECT", "Project"),
        ("OTHER", "Other"),
    ]

    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=50)
    category = models.CharField(
        max_length=20, choices=CATEGORY_CHOICES, default="OTHER"
    )
    description = models.TextField(blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_exam_type"
        unique_together = [["tenant", "code"]]
        ordering = ["display_order", "name"]
        indexes = [
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "code"]),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.tenant_id is None:
            raise ValueError("tenant is required")
        super().save(*args, **kwargs)


DEFAULT_EXAM_TYPES = [
    {
        "name": "First Continuous Assessment",
        "code": "first_ca",
        "category": "CA",
        "display_order": 10,
    },
    {
        "name": "Second Continuous Assessment",
        "code": "second_ca",
        "category": "CA",
        "display_order": 20,
    },
    {
        "name": "Third Continuous Assessment",
        "code": "third_ca",
        "category": "CA",
        "display_order": 30,
    },
    {
        "name": "Mid-Term Examination",
        "code": "mid_term",
        "category": "EXAM",
        "display_order": 40,
    },
    {
        "name": "Final Examination",
        "code": "final_exam",
        "category": "EXAM",
        "display_order": 50,
    },
    {
        "name": "Mock Examination",
        "code": "mock_exam",
        "category": "EXAM",
        "display_order": 60,
    },
    {
        "name": "Practical Examination",
        "code": "practical",
        "category": "PRACTICAL",
        "display_order": 70,
    },
    {
        "name": "Project Assessment",
        "code": "project",
        "category": "PROJECT",
        "display_order": 80,
    },
    {"name": "Other", "code": "other", "category": "OTHER", "display_order": 90},
]


def seed_exam_types_for_tenant(tenant):
    """Seed default ExamType rows for a new tenant. Safe to call multiple times."""
    for d in DEFAULT_EXAM_TYPES:
        ExamType.objects.get_or_create(
            tenant=tenant,
            code=d["code"],
            defaults={
                "name": d["name"],
                "category": d["category"],
                "display_order": d["display_order"],
                "is_active": True,
            },
        )


# ============================================================
# EXAM SESSION
# ============================================================


class ExamSession(TenantMixin, models.Model):
    name = models.CharField(max_length=100)
    exam_type = models.ForeignKey(
        ExamType,
        on_delete=models.PROTECT,
        related_name="exam_sessions",
        help_text="Configured per school",
    )
    academic_session = models.ForeignKey(
        AcademicSession, on_delete=models.CASCADE, related_name="exam_sessions"
    )
    term = models.ForeignKey(
        Term,
        on_delete=models.PROTECT,
        related_name="exam_sessions",
        null=True,
        blank=True,
    )
    start_date = models.DateField()
    end_date = models.DateField()
    result_release_date = models.DateField(null=True, blank=True)
    is_published = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_exam_session"
        unique_together = ["tenant", "academic_session", "term", "exam_type"]
        ordering = ["-start_date"]
        indexes = [
            models.Index(fields=["tenant", "academic_session"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "academic_session", "term"]),
            models.Index(fields=["tenant", "exam_type"]),
        ]

    def __str__(self):
        term_name = self.term.name if self.term else "No Term"
        return f"{self.name} — {self.academic_session.name} ({term_name})"

    def clean(self):
        if self.start_date >= self.end_date:
            raise ValidationError("Start date must be before end date")

    @property
    def exam_type_name(self):
        return self.exam_type.name if self.exam_type else ""

    @property
    def exam_type_category(self):
        return self.exam_type.category if self.exam_type else ""


# ============================================================
# COMPONENT SCORE
# ============================================================


class ComponentScore(TenantMixin, models.Model):
    """
    One row per AssessmentComponent per result.
    Exactly one of the four result FKs is set — enforced at both Python
    and DB level via UniqueConstraints + CheckConstraint.
    """

    senior_result = models.ForeignKey(
        "SeniorSecondaryResult",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="component_scores",
    )
    junior_result = models.ForeignKey(
        "JuniorSecondaryResult",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="component_scores",
    )
    primary_result = models.ForeignKey(
        "PrimaryResult",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="component_scores",
    )
    nursery_result = models.ForeignKey(
        "NurseryResult",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="component_scores",
    )
    component = models.ForeignKey(
        AssessmentComponent, on_delete=models.PROTECT, related_name="scores"
    )
    score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )

    class Meta:
        db_table = "results_component_score"
        constraints = [
            # Unique per result-level FK (partial indexes, DB-enforced)
            models.UniqueConstraint(
                fields=["senior_result", "component"],
                condition=Q(senior_result__isnull=False),
                name="uq_component_score_senior",
            ),
            models.UniqueConstraint(
                fields=["junior_result", "component"],
                condition=Q(junior_result__isnull=False),
                name="uq_component_score_junior",
            ),
            models.UniqueConstraint(
                fields=["primary_result", "component"],
                condition=Q(primary_result__isnull=False),
                name="uq_component_score_primary",
            ),
            models.UniqueConstraint(
                fields=["nursery_result", "component"],
                condition=Q(nursery_result__isnull=False),
                name="uq_component_score_nursery",
            ),
            # DB-level guard: exactly one FK must be set.
            # Expressed as: exactly one of the four columns is NOT NULL.
            CheckConstraint(
                check=(
                    Q(
                        senior_result__isnull=False,
                        junior_result__isnull=True,
                        primary_result__isnull=True,
                        nursery_result__isnull=True,
                    )
                    | Q(
                        senior_result__isnull=True,
                        junior_result__isnull=False,
                        primary_result__isnull=True,
                        nursery_result__isnull=True,
                    )
                    | Q(
                        senior_result__isnull=True,
                        junior_result__isnull=True,
                        primary_result__isnull=False,
                        nursery_result__isnull=True,
                    )
                    | Q(
                        senior_result__isnull=True,
                        junior_result__isnull=True,
                        primary_result__isnull=True,
                        nursery_result__isnull=False,
                    )
                ),
                name="chk_component_score_exactly_one_result_fk",
            ),
        ]
        indexes = [
            models.Index(fields=["component", "senior_result"]),
            models.Index(fields=["component", "junior_result"]),
            models.Index(fields=["component", "primary_result"]),
            models.Index(fields=["component", "nursery_result"]),
        ]

    def __str__(self):
        return f"{self.component.name}: {self.score}/{self.component.max_score}"

    def clean(self):
        set_count = sum(
            1
            for fk in [
                self.senior_result_id,
                self.junior_result_id,
                self.primary_result_id,
                self.nursery_result_id,
            ]
            if fk is not None
        )
        if set_count != 1:
            raise ValidationError(
                "Exactly one of senior/junior/primary/nursery result FK must be set."
            )
        if self.score > self.component.max_score:
            raise ValidationError(
                f"Score {self.score} exceeds component max {self.component.max_score}."
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


# ============================================================
# BASE RESULT
# ============================================================


class BaseResult(models.Model):
    """
    Abstract base for the four education-level result models.

    save() flow (single write after pk exists):
        1. First super().save() — obtains pk if new row.
        2. calculate_scores() — aggregates ComponentScore rows (no DB write).
        3. determine_grade()  — derives grade/is_passed (no DB write).
        4. Second super().save(update_fields=[...]) — one targeted UPDATE.

    Bulk operations bypass save() entirely and use QuerySet.update() /
    bulk_create() / bulk_update() for O(1) DB round-trips.
    """

    # Subclasses set this to their ComponentScore FK name, e.g. "senior_result"
    RESULT_FK_NAME: str = ""

    total_score = models.DecimalField(
        max_digits=7, decimal_places=2, default=0)
    ca_total = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        db_index=True,
    )
    grade = models.CharField(max_length=5, blank=True, db_index=True)
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )
    is_passed = models.BooleanField(default=False, db_index=True)
    class_average = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, null=True, blank=True
    )
    highest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, null=True, blank=True
    )
    lowest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, null=True, blank=True
    )
    subject_position = models.PositiveIntegerField(
        null=True, blank=True, db_index=True)
    status = models.CharField(
        max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    # ── Score calculation ─────────────────────────────────────────────────

    def calculate_scores(self):
        """
        Aggregate ComponentScore rows for this result.
        Pure in-memory — does NOT call save().
        """
        if not self.RESULT_FK_NAME or not self.pk:
            return
        scores = ComponentScore.objects.filter(
            **{self.RESULT_FK_NAME: self}
        ).select_related("component")
        ca_sum = total_sum = Decimal(0)
        for cs in scores:
            total_sum += cs.score
            if cs.component.contributes_to_ca:
                ca_sum += cs.score
        self.ca_total = ca_sum
        self.total_score = total_sum
        gs = getattr(self, "grading_system", None)
        max_score = Decimal(
            gs.max_score) if gs and gs.max_score else Decimal(100)
        self.percentage = (total_sum / max_score *
                           100) if max_score > 0 else Decimal(0)

    def determine_grade(self):
        """
        Derive grade / grade_point / is_passed from self.percentage.
        Pure in-memory — does NOT call save().
        """
        gs = getattr(self, "grading_system", None)
        pct = float(self.percentage or 0)
        if not gs:
            self.grade = _default_grade(pct)
            self.is_passed = pct >= 40
            return
        if gs.grading_type == "PASS_FAIL":
            self.is_passed = pct >= float(gs.pass_mark or 40)
            self.grade = "PASS" if self.is_passed else "FAIL"
            self.grade_point = None
            return
        grade_obj = (
            gs.grades.filter(min_score__lte=pct)
            .order_by("-min_score")
            .first()
        )
        if grade_obj:
            self.grade = grade_obj.grade
            self.grade_point = grade_obj.grade_point
            self.is_passed = bool(grade_obj.is_passing)
        else:
            self.grade = _default_grade(pct)
            self.grade_point = None
            self.is_passed = pct >= float(gs.pass_mark or 40)

    def save(self, *args, **kwargs):
        # 1. Persist (creates pk for new rows).
        super().save(*args, **kwargs)
        # 2. Compute scores and grade in memory.
        self.calculate_scores()
        self.determine_grade()
        # 3. One targeted UPDATE — avoids a full second save.
        super().save(
            update_fields=[
                "total_score",
                "ca_total",
                "percentage",
                "grade",
                "grade_point",
                "is_passed",
                "updated_at",
            ]
        )

    # ── Permission helpers ────────────────────────────────────────────────

    def can_edit(self, user) -> bool:
        """
        Admin roles may edit at any status.
        Teachers may only edit while DRAFT.
        """
        if _is_admin(user):
            return True
        if self.status != "DRAFT":
            return False
        return _user_role(user).upper() == "TEACHER"

    def can_delete(self, user) -> bool:
        return self.can_edit(user)

    # ── Bulk operations (class-level, O(1) DB round-trips) ────────────────

    @classmethod
    def bulk_approve(cls, queryset, user):
        """
        Approve all DRAFT results in *queryset* in a single UPDATE.
        Only admin roles may call this.
        Raises PermissionDenied if user is not authorised.
        """
        if not _is_admin(user):
            raise PermissionDenied(
                "Only admin-level users can bulk-approve results.")
        now = timezone.now()
        with transaction.atomic():
            return queryset.filter(status="DRAFT").update(
                status="APPROVED",
                approved_by=user,
                approved_date=now,
                updated_at=now,
            )

    @classmethod
    def bulk_publish(cls, queryset, user):
        """
        Publish all APPROVED results in *queryset* in a single UPDATE.
        Only admin roles may call this.
        """
        if not _is_admin(user):
            raise PermissionDenied(
                "Only admin-level users can bulk-publish results.")
        now = timezone.now()
        with transaction.atomic():
            return queryset.filter(status="APPROVED").update(
                status="PUBLISHED",
                published_by=user,
                published_date=now,
                updated_at=now,
            )

    @classmethod
    def bulk_delete(cls, queryset, user):
        """
        Delete results the user is allowed to delete.

        Admin roles  → may delete DRAFT, APPROVED, or PUBLISHED.
        Teachers     → may only delete DRAFT rows.

        Returns (deleted_count, detail_dict).
        """
        with transaction.atomic():
            if _is_admin(user):
                return queryset.delete()
            # Non-admin: restrict to DRAFT only.
            return queryset.filter(status="DRAFT").delete()

    @classmethod
    def bulk_record(cls, entries, user, result_fk_field: str):
        """
        High-performance bulk entry of ComponentScore rows.

        Parameters
        ──────────
        entries : list[dict]
            Each dict must have:
              "result_id"    : pk of the parent result row
              "component_id" : pk of AssessmentComponent
              "score"        : Decimal or float
        user          : the requesting user (for permission check)
        result_fk_field : e.g. "senior_result_id"

        Behaviour
        ─────────
        1. bulk_create ComponentScore rows (skipping clean() — validated
           by the DB CheckConstraint).
        2. Recalculate total_score / ca_total / percentage / grade /
           is_passed for all affected result rows in two SQL statements
           (aggregation + bulk_update).

        Returns number of ComponentScore rows created.
        """
        if not entries:
            return 0

        tenant = getattr(user, "tenant", None)
        cs_rows = [
            ComponentScore(
                tenant=tenant,
                component_id=e["component_id"],
                score=Decimal(str(e["score"])),
                **{result_fk_field: e["result_id"]},
            )
            for e in entries
        ]
        with transaction.atomic():
            ComponentScore.objects.bulk_create(
                cs_rows,
                update_conflicts=True,
                update_fields=["score"],
                unique_fields=[result_fk_field.replace(
                    "_id", ""), "component"],
            )
            # Recalculate all affected result rows.
            affected_ids = {e["result_id"] for e in entries}
            cls._bulk_recalculate_scores(
                cls.objects.filter(pk__in=affected_ids))
        return len(cs_rows)

    @classmethod
    def _bulk_recalculate_scores(cls, queryset):
        """
        Mirrors calculate_scores(): if ComponentScore rows exist, sum them
        into mark_obtained/max_marks_obtainable (component-based scoring,
        same as every other level); otherwise leave the directly-entered
        marks alone. Keeps NurseryTermReport.calculate_metrics() correct
        regardless of which mode the tenant uses.
        """
        fk_name = cls.RESULT_FK_NAME  # "nursery_result"
        agg_qs = (
            ComponentScore.objects.filter(**{f"{fk_name}__in": queryset})
            .values(fk_name)
            .annotate(total=Sum("score"), max_total=Sum("component__max_score"))
        )
        agg_map = {
            row[fk_name]: (row["total"] or Decimal(
                0), row["max_total"] or Decimal(0))
            for row in agg_qs
        }

        results = list(queryset.select_related("grading_system"))
        updates = []
        for result in results:
            obtained, max_total = agg_map.get(result.pk, (None, None))
            if obtained is not None:
                result.mark_obtained = obtained
                result.max_marks_obtainable = max_total
            result.ca_total = Decimal(0)
            result.total_score = result.mark_obtained
            result.percentage = (
                (result.mark_obtained / result.max_marks_obtainable * 100)
                if result.max_marks_obtainable and result.max_marks_obtainable > 0
                else Decimal(0)
            )
            result.determine_grade()
            updates.append(result)

        cls.objects.bulk_update(
            updates,
            ["mark_obtained", "max_marks_obtainable", "total_score",
             "ca_total", "percentage", "grade", "grade_point",
             "is_passed", "updated_at"],
            batch_size=200,
        )

    # ── Class-level position recalculation (SQL RANK) ─────────────────────

    @classmethod
    def bulk_recalculate_positions(cls, queryset):
        """
        Assign subject_position, class_average, highest_in_class,
        lowest_in_class for all results in *queryset*.

        Uses a single SQL Window RANK() — no Python-side sorting.
        All work done in two SQL statements (annotate + bulk_update).
        """
        if not queryset.exists():
            return

        stats = queryset.aggregate(
            avg=Avg("percentage"),
            highest=Max("percentage"),
            lowest=Min("percentage"),
        )
        avg_val = stats["avg"] or Decimal(0)
        high_val = stats["highest"] or Decimal(0)
        low_val = stats["lowest"] or Decimal(0)

        # Use a fresh filter by PK for the window function —
        # PostgreSQL does not allow FOR UPDATE with window functions.
        pks = list(queryset.values_list("pk", flat=True))
        ranked = (
            cls.objects.filter(pk__in=pks)
            .annotate(
                rank=Window(
                    expression=DenseRank(),
                    order_by=F("percentage").desc(),
                )
            )
            .values("pk", "rank")
        )

        rank_map = {row["pk"]: row["rank"] for row in ranked}

        results = list(
            queryset.only(
                "pk",
                "subject_position",
                "class_average",
                "highest_in_class",
                "lowest_in_class",
            )
        )
        for result in results:
            result.subject_position = rank_map.get(result.pk)
            result.class_average = avg_val
            result.highest_in_class = high_val
            result.lowest_in_class = low_val

        cls.objects.bulk_update(
            results,
            [
                "subject_position",
                "class_average",
                "highest_in_class",
                "lowest_in_class",
            ],
            batch_size=200,
        )

    @property
    def position_formatted(self) -> str:
        if not self.subject_position:
            return ""
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(
            (
                self.subject_position
                if self.subject_position <= 20
                else self.subject_position % 10
            ),
            "th",
        )
        return f"{self.subject_position}{suffix}"


# ============================================================
# BASE TERM REPORT — permission helpers
# ============================================================


class BaseTermReport(models.Model):
    """Permission helpers shared by all term and session report models."""

    class Meta:
        abstract = True

    def _first_signatory_role(self):
        student = getattr(self, "student", None)
        if not student:
            return None
        return (
            "CLASS_TEACHER"
            if student.education_level in ("NURSERY", "PRIMARY")
            else "SUBJECT_TEACHER"
        )

    # ── Teacher remark editing ────────────────────────────────────────────

    def can_edit_teacher_remark(self, user) -> bool:
        """
        Only the relevant class/subject teacher may edit, and only while DRAFT.
        Performs DB queries — do not call in list loops. Use prefetch in views.
        """
        if self.status != "DRAFT":
            return False
        if _user_role(user).upper() != "TEACHER":
            return False

        from teacher.models import Teacher
        from classroom.models import ClassroomTeacherAssignment, StudentEnrollment

        try:
            teacher = Teacher.objects.select_related("user").get(user=user)
            enrollment = (
                StudentEnrollment.objects.filter(
                    student=self.student, is_active=True)
                .select_related("classroom__class_teacher")
                .first()
            )
            if not enrollment:
                return False
            classroom = enrollment.classroom
            if self._first_signatory_role() == "CLASS_TEACHER":
                return classroom.class_teacher_id == teacher.pk
            return ClassroomTeacherAssignment.objects.filter(
                teacher=teacher, classroom=classroom
            ).exists()
        except Exception as exc:
            logger.error(
                "Error checking teacher remark permission: %s", exc, exc_info=True
            )
            return False

    def can_edit_head_teacher_remark(self, user) -> bool:
        return _is_admin(user)

    # ── Report-level edit / delete ────────────────────────────────────────

    def can_edit(self, user) -> bool:
        """Admin roles may edit at any status. Teachers only while DRAFT."""
        if _is_admin(user):
            return True
        if self.status != "DRAFT":
            return False
        return _user_role(user).upper() == "TEACHER"

    def can_delete(self, user) -> bool:
        return self.can_edit(user)

    # ── Approval / publication workflow ───────────────────────────────────

    def approve(self, user):
        """Advance a DRAFT report to APPROVED (single-record)."""
        if not self.can_edit_head_teacher_remark(user):
            raise PermissionDenied(
                "Only admin-level users may approve reports.")
        if self.status == "DRAFT":
            now = timezone.now()
            self.status = "APPROVED"
            self.approved_by = user  # subclasses must have this field
            self.approved_date = now
            self.save(
                update_fields=["status", "approved_by",
                               "approved_date", "updated_at"]
            )

    def publish(self, user=None):
        """Advance an APPROVED report to PUBLISHED (single-record)."""
        if self.status == "APPROVED":
            self.status = "PUBLISHED"
            self.is_published = True
            self.save(update_fields=["status", "is_published", "updated_at"])

    # ── Bulk operations (class-level) ─────────────────────────────────────

    @classmethod
    def bulk_approve(cls, queryset, user):
        """Approve all DRAFT reports in *queryset* in a single UPDATE."""
        if not _is_admin(user):
            raise PermissionDenied(
                "Only admin-level users can bulk-approve reports.")
        now = timezone.now()
        with transaction.atomic():
            return queryset.filter(status="DRAFT").update(
                status="APPROVED",
                approved_by=user,
                approved_date=now,
                updated_at=now,
            )

    @classmethod
    def bulk_publish(cls, queryset, user):
        """Publish all APPROVED reports in *queryset* in a single UPDATE."""
        if not _is_admin(user):
            raise PermissionDenied(
                "Only admin-level users can bulk-publish reports.")
        now = timezone.now()
        with transaction.atomic():
            return queryset.filter(status="APPROVED").update(
                status="PUBLISHED",
                is_published=True,
                published_date=now,
                updated_at=now,
            )

    @classmethod
    def bulk_delete(cls, queryset, user):
        """
        Admin roles → delete any status.
        Teachers    → delete DRAFT only.
        """
        with transaction.atomic():
            if _is_admin(user):
                return queryset.delete()
            return queryset.filter(status="DRAFT").delete()

    # ── Position recalculation (SQL RANK) ─────────────────────────────────

    @classmethod
    def bulk_recalculate_positions(
        cls, exam_session, student_class,
        statuses=("APPROVED", "PUBLISHED"), **_
    ):
        """
        Rank term reports for a class using SQL RANK().
        One annotate query + one bulk_update.
        Pass statuses=("DRAFT","APPROVED","PUBLISHED") to include all records.
        """
        base_filter = dict(
            exam_session=exam_session,
            student__student_class=student_class,
            status__in=statuses,
        )
        with transaction.atomic():
            qs = cls.objects.filter(**base_filter).select_for_update()
            total = qs.count()
            if not total:
                return

            # Use a separate queryset for the window function —
            # PostgreSQL does not allow FOR UPDATE with window functions.
            ranked = (
                cls.objects.filter(**base_filter)
                .annotate(
                    rank=Window(
                        expression=DenseRank(),
                        order_by=F("average_score").desc(),
                    )
                )
                .values("pk", "rank")
            )
            rank_map = {row["pk"]: row["rank"] for row in ranked}
            reports = list(qs.only("pk", "class_position", "total_students"))
            for r in reports:
                r.class_position = rank_map.get(r.pk)
                r.total_students = total
            cls.objects.bulk_update(
                reports, ["class_position", "total_students"], batch_size=200
            )


# ============================================================
# TERM REPORT SHARED FIELDS
# ============================================================
class PhysicalDevelopmentFields(models.Model):
    """
    Optional physical-development / conduct tracking, shared by all four
    term report models. Blank/null everywhere — a report shows this section
    only when a teacher has actually filled it in (see has_physical_development_data
    on the serializers).
    """

    PHYSICAL_DEVELOPMENT_CHOICES = [
        ("Excellent", "Excellent"),
        ("Very Good", "Very Good"),
        ("Good", "Good"),
        ("Fair", "Fair"),
        ("Poor", "Poor"),
    ]

    physical_development = models.CharField(
        max_length=20, choices=PHYSICAL_DEVELOPMENT_CHOICES, blank=True
    )
    health = models.CharField(
        max_length=20, choices=PHYSICAL_DEVELOPMENT_CHOICES, blank=True
    )
    cleanliness = models.CharField(
        max_length=20, choices=PHYSICAL_DEVELOPMENT_CHOICES, blank=True
    )
    general_conduct = models.CharField(
        max_length=20, choices=PHYSICAL_DEVELOPMENT_CHOICES, blank=True
    )
    physical_development_comment = models.TextField(blank=True)
    height_beginning = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True)
    height_end = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True)
    weight_beginning = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True)
    weight_end = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        abstract = True


class TermReportFields(PhysicalDevelopmentFields, models.Model):
    """Shared fields on all four term report models (except Nursery)."""

    total_score = models.DecimalField(
        max_digits=8, decimal_places=2, default=0)
    average_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0)
    overall_grade = models.CharField(max_length=5, blank=True)
    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(default=0)
    times_opened = models.PositiveIntegerField(default=0)
    times_present = models.PositiveIntegerField(default=0)
    next_term_begins = models.DateField(null=True, blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature = models.URLField(blank=True, null=True)
    class_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    head_teacher_signature = models.URLField(blank=True, null=True)
    head_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    # Approval tracking (mirrors BaseResult for consistency)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",  # each concrete model overrides via explicit FK
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    published_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def _grade_for_percentage(self, percentage, grading_system=None):
        """
        Resolve a grade string for *percentage*.
        Pass the grading_system directly to avoid an extra query.

        Matches the highest band whose min_score the percentage qualifies
        for, rather than requiring min_score <= percentage <= max_score.
        Bands are entered as whole-number ranges (70-79, 80-89, ...) but
        percentages are decimals, so an exact-range match leaves gaps
        (79.7 matches neither 70-79 nor 80-89) that silently fall through
        to _default_grade below and produce the wrong letter.
        """
        if grading_system:
            try:
                grade_obj = (
                    grading_system.grades.filter(min_score__lte=percentage)
                    .order_by("-min_score")
                    .first()
                )
                if grade_obj:
                    return grade_obj.grade
            except Exception:
                pass
        return _default_grade(float(percentage))

    def calculate_metrics(self):
        """
        Aggregate subject results for this term report.
        Fetches grading system in one query via select_related on the
        first subject result — avoids the original per-call query.
        """
        agg = self.subject_results.filter(
            status__in=("APPROVED", "PUBLISHED")
        ).aggregate(
            total=Sum("total_score"),
            count=Count("id"),
            avg_pct=Avg("percentage"),
        )
        if agg["count"]:
            self.total_score = agg["total"] or 0
            self.average_score = agg["avg_pct"] or 0
            # Resolve grade using the first result's grading system.
            first = (
                self.subject_results.select_related("grading_system")
                .only("grading_system")
                .first()
            )
            gs = first.grading_system if first else None
            self.overall_grade = self._grade_for_percentage(
                self.average_score, gs)

        self.save(
            update_fields=[
                "total_score",
                "average_score",
                "overall_grade",
                "updated_at",
            ]
        )

    @classmethod
    def bulk_calculate_metrics(cls, queryset):
        """
        Recalculate total_score, average_score, overall_grade for every
        report in *queryset* using two SQL statements (aggregation + bulk_update).
        Called after bulk_approve to keep reports in sync without per-row saves.
        """
        from django.db.models import OuterRef, Subquery

        # Aggregate per report in one query.
        agg_qs = (
            cls.objects.filter(pk__in=queryset)
            .annotate(
                _total=Sum(
                    "subject_results__total_score",
                    filter=Q(subject_results__status__in=(
                        "APPROVED", "PUBLISHED")),
                ),
                _avg=Avg(
                    "subject_results__percentage",
                    filter=Q(subject_results__status__in=(
                        "APPROVED", "PUBLISHED")),
                ),
                _count=Count(
                    "subject_results__id",
                    filter=Q(subject_results__status__in=(
                        "APPROVED", "PUBLISHED")),
                ),
            )
            .values("pk", "_total", "_avg", "_count")
        )
        agg_map = {row["pk"]: row for row in agg_qs}

        ResultModel = cls._meta.get_field("subject_results").related_model

        # First (approved/published) subject result's grading system per
        # report — same "sample one" convention calculate_metrics() uses,
        # just done in bulk instead of one query per report.
        gs_rows = (
            ResultModel.objects.filter(
                term_report__in=queryset, status__in=("APPROVED", "PUBLISHED")
            )
            .order_by("term_report_id", "id")
            .values("term_report_id", "grading_system_id")
        )
        first_gs_id = {}
        for row in gs_rows:
            first_gs_id.setdefault(
                row["term_report_id"], row["grading_system_id"])

        gs_ids = set(first_gs_id.values())
        gs_map = {
            gs.id: gs
            for gs in GradingSystem.objects.filter(id__in=gs_ids).prefetch_related("grades")
        }
        reports = list(
            queryset.only("pk", "total_score",
                          "average_score", "overall_grade")
        )
        for r in reports:
            row = agg_map.get(r.pk, {})
            if row.get("_count"):
                r.total_score = row["_total"] or 0
                r.average_score = row["_avg"] or 0
                # Use the school's actual GradingSystem bands for this
                # report's percentage, same as calculate_metrics() —
                # falls back to _default_grade only when no grading
                # system could be resolved (e.g. no approved subjects).
                gs_id = first_gs_id.get(r.pk)
                gs = gs_map.get(gs_id) if gs_id else None
                r.overall_grade = r._grade_for_percentage(
                    r.average_score, gs)

        cls.objects.bulk_update(
            reports,
            ["total_score", "average_score", "overall_grade", "updated_at"],
            batch_size=200,
        )


# ============================================================
# BASE SESSION REPORT — shared by all four levels
# ============================================================


class BaseSessionReport(BaseTermReport, models.Model):
    """
    Abstract base for all four session report models.

    Session totals are COMPUTED from existing TermReport records, not
    entered manually.  compute_from_term_reports() fetches all term
    reports for this student × academic_session, ordered by the term's
    display_order, and aggregates them — two DB queries total.

    Subclasses must define:
        TERM_REPORT_MODEL  — the concrete TermReport class to query
        student FK + academic_session FK + status + is_published + approved_by
    """

    TERM_REPORT_MODEL = None  # set by each subclass after class definition

    term_totals = models.JSONField(
        default=list,
        help_text=(
            "List of {term_name, term_order, total_score, average_score, "
            "class_position} dicts, one per completed term, ordered by term."
        ),
    )
    overall_total = models.DecimalField(
        max_digits=8, decimal_places=2, default=0)
    overall_average = models.DecimalField(
        max_digits=5, decimal_places=2, default=0)
    overall_grade = models.CharField(max_length=5, blank=True)
    overall_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(default=0)

    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature = models.URLField(blank=True, null=True)
    class_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    head_teacher_signature = models.URLField(blank=True, null=True)
    head_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    published_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def compute_from_term_reports(self):
        """
        Pull data from all approved/published TermReports for this
        student × academic_session and populate term_totals + overall_*.
        Two DB queries: one for term reports, one save.
        """
        TermReportModel = self.__class__.TERM_REPORT_MODEL
        if TermReportModel is None:
            raise NotImplementedError(
                f"{self.__class__.__name__} must set TERM_REPORT_MODEL"
            )

        term_reports = (
            TermReportModel.objects.filter(
                student=self.student,
                exam_session__academic_session=self.academic_session,
                status__in=("APPROVED", "PUBLISHED"),
            )
            .select_related("exam_session__term__term_type")
            .order_by("exam_session__term__term_type__display_order")
        )

        totals = []
        overall_sum = Decimal(0)
        term_count = 0
        # Sample a GradingSystem from the term reports' own subject results,
        # the same way calculate_metrics()/bulk_calculate_metrics() do for
        # term reports, so the session report's overall_grade matches the
        # school's configured scale instead of the fixed default bands.
        sampled_grading_system = None

        for report in term_reports:
            term = report.exam_session.term
            term_name = term.name if term else f"Term {term_count + 1}"
            term_order = (
                term.term_type.display_order if term and term.term_type else term_count
            )
            # NurseryTermReport uses overall_percentage / total_marks_obtained.
            if hasattr(report, "overall_percentage"):
                avg = float(report.overall_percentage or 0)
                total = float(report.total_marks_obtained or 0)
            else:
                avg = float(report.average_score or 0)
                total = float(report.total_score or 0)

            if sampled_grading_system is None:
                first_result = (
                    report.subject_results.filter(grading_system__isnull=False)
                    .select_related("grading_system")
                    .first()
                )
                if first_result:
                    sampled_grading_system = first_result.grading_system

            totals.append(
                {
                    "term_name": term_name,
                    "term_order": term_order,
                    "total_score": total,
                    "average_score": avg,
                    "class_position": report.class_position,
                }
            )
            overall_sum += Decimal(str(avg))
            term_count += 1

        self.term_totals = totals
        self.overall_total = sum(
            Decimal(str(t["total_score"])) for t in totals)
        self.overall_average = overall_sum / \
            term_count if term_count else Decimal(0)

        if sampled_grading_system:
            # Highest band whose min_score qualifies — see _grade_for_percentage
            # for why an exact min<=score<=max match leaves gaps a decimal
            # average can fall into.
            grade_obj = (
                sampled_grading_system.grades.filter(
                    min_score__lte=self.overall_average,
                )
                .order_by("-min_score")
                .first()
            )
            self.overall_grade = (
                grade_obj.grade if grade_obj else _default_grade(
                    float(self.overall_average))
            )
        else:
            self.overall_grade = _default_grade(float(self.overall_average))

        self.save(
            update_fields=[
                "term_totals",
                "overall_total",
                "overall_average",
                "overall_grade",
                "updated_at",
            ]
        )

    def calculate_overall_position(self):
        """Rank this session report against peers in the same class."""
        SessionReportModel = self.__class__
        peers = SessionReportModel.objects.filter(
            academic_session=self.academic_session,
            student__student_class=self.student.student_class,
            student__education_level=self.student.education_level,
            status__in=("APPROVED", "PUBLISHED"),
        ).exclude(pk=self.pk)
        self.overall_position = (
            peers.filter(overall_average__gt=self.overall_average).count() + 1
        )
        self.total_students = peers.count() + 1
        self.save(update_fields=["overall_position",
                  "total_students", "updated_at"])

    @classmethod
    def bulk_recalculate_positions(
        cls, academic_session, student_class, education_level
    ):
        """SQL RANK() — no Python sort, no per-row save."""
        with transaction.atomic():
            qs = cls.objects.filter(
                academic_session=academic_session,
                student__student_class=student_class,
                student__student_class__education_level__level_type=education_level,
                status__in=("APPROVED", "PUBLISHED"),
            ).select_for_update()

            total = qs.count()
            if not total:
                return

            ranked = qs.annotate(
                rank=Window(
                    expression=DenseRank(),
                    order_by=F("overall_average").desc(),
                )
            ).values("pk", "rank")

            rank_map = {row["pk"]: row["rank"] for row in ranked}
            reports = list(qs.only("pk", "overall_position", "total_students"))
            for r in reports:
                r.overall_position = rank_map.get(r.pk)
                r.total_students = total
            cls.objects.bulk_update(
                reports,
                ["overall_position", "total_students"],
                batch_size=200,
            )


# ============================================================
# SENIOR SECONDARY — TERM REPORT + RESULT + SESSION REPORT
# ============================================================


class SeniorSecondaryTermReport(
    TenantMixin, BaseTermReport, TermReportFields, models.Model
):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="senior_secondary_term_reports",
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="senior_secondary_term_reports",
    )
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="senior_secondary_term_reports",
    )
    # Explicit FK (overrides abstract approved_by with correct related_name).
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_senior_secondary_term_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_senior_secondary_term_reports",
    )

    class Meta:
        db_table = "results_senior_secondary_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "is_published"]),
            models.Index(fields=["tenant", "created_at"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.exam_session.name} (SSS Term)"


class SeniorSecondaryResult(TenantMixin, BaseResult, models.Model):
    RESULT_FK_NAME = "senior_result"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="senior_secondary_results",
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name="senior_secondary_results",
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="senior_secondary_results",
    )
    grading_system = models.ForeignKey(
        GradingSystem,
        on_delete=models.PROTECT,
        related_name="senior_secondary_results",
    )
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="senior_secondary_results",
    )
    term_report = models.ForeignKey(
        SeniorSecondaryTermReport,
        on_delete=models.SET_NULL,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    teacher_remark = models.TextField(blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="entered_senior_results",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_senior_results",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_senior_secondary_results",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_senior_secondary_results",
    )
    last_edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_senior_secondary_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.subject.name} ({self.total_score})"

    @classmethod
    def bulk_record(cls, entries, user):
        return super().bulk_record(entries, user, result_fk_field="senior_result_id")

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        with transaction.atomic():
            qs = cls.objects.filter(
                exam_session=exam_session,
                subject=subject,
                student__student_class=student_class,
                student__student_class__education_level__level_type=education_level,
                status__in=("APPROVED", "PUBLISHED"),
            ).select_for_update()
            cls.bulk_recalculate_positions(qs)


class SeniorSecondarySessionReport(TenantMixin, BaseSessionReport, models.Model):
    TERM_REPORT_MODEL = None  # set after class definition

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="senior_secondary_session_reports",
    )
    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="senior_secondary_session_reports",
    )
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="senior_secondary_session_reports",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_senior_secondary_session_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_senior_secondary_session_reports",
    )

    class Meta:
        db_table = "results_senior_secondary_session_report"
        unique_together = ["tenant", "student", "academic_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "is_published"]),
        ]

    def __str__(self):
        return (
            f"{self.student.full_name} — " f"{self.academic_session.name} (SSS Session)"
        )


SeniorSecondarySessionReport.TERM_REPORT_MODEL = SeniorSecondaryTermReport


# ============================================================
# JUNIOR SECONDARY — TERM REPORT + RESULT + SESSION REPORT
# ============================================================


class JuniorSecondaryTermReport(
    TenantMixin, BaseTermReport, TermReportFields, models.Model
):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="junior_secondary_term_reports",
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="junior_secondary_term_reports",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_junior_secondary_term_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_junior_secondary_term_reports",
    )

    class Meta:
        db_table = "results_junior_secondary_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "created_at"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.exam_session.name} (JSS Term)"


class JuniorSecondaryResult(TenantMixin, BaseResult, models.Model):
    RESULT_FK_NAME = "junior_result"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="junior_secondary_results",
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name="junior_secondary_results",
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="junior_secondary_results",
    )
    grading_system = models.ForeignKey(
        GradingSystem,
        on_delete=models.PROTECT,
        related_name="junior_secondary_results",
    )
    term_report = models.ForeignKey(
        JuniorSecondaryTermReport,
        on_delete=models.SET_NULL,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    teacher_remark = models.TextField(blank=True)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="entered_junior_results",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_junior_results",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_junior_results",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_junior_results",
    )
    last_edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_junior_secondary_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.subject.name} ({self.total_score})"

    @classmethod
    def bulk_record(cls, entries, user):
        return super().bulk_record(entries, user, result_fk_field="junior_result_id")

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        with transaction.atomic():
            qs = cls.objects.filter(
                exam_session=exam_session,
                subject=subject,
                student__student_class=student_class,
                student__student_class__education_level__level_type=education_level,
                status__in=("APPROVED", "PUBLISHED"),
            ).select_for_update()
            cls.bulk_recalculate_positions(qs)


class JuniorSecondarySessionReport(TenantMixin, BaseSessionReport, models.Model):
    TERM_REPORT_MODEL = None

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="junior_secondary_session_reports",
    )
    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="junior_secondary_session_reports",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_junior_secondary_session_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_junior_secondary_session_reports",
    )

    class Meta:
        db_table = "results_junior_secondary_session_report"
        unique_together = ["tenant", "student", "academic_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return (
            f"{self.student.full_name} — " f"{self.academic_session.name} (JSS Session)"
        )


JuniorSecondarySessionReport.TERM_REPORT_MODEL = JuniorSecondaryTermReport


# ============================================================
# PRIMARY — TERM REPORT + RESULT + SESSION REPORT
# ============================================================


class PrimaryTermReport(TenantMixin, BaseTermReport, TermReportFields, models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="primary_term_reports",
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="primary_term_reports",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_primary_term_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_primary_term_reports",
    )

    class Meta:
        db_table = "results_primary_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "created_at"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.exam_session.name} (Primary Term)"


class PrimaryResult(TenantMixin, BaseResult, models.Model):
    RESULT_FK_NAME = "primary_result"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="primary_results",
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name="primary_results",
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="primary_results",
    )
    grading_system = models.ForeignKey(
        GradingSystem,
        on_delete=models.PROTECT,
        related_name="primary_results",
    )
    term_report = models.ForeignKey(
        PrimaryTermReport,
        on_delete=models.SET_NULL,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    teacher_remark = models.TextField(blank=True)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="entered_primary_results",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_primary_results",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_primary_results",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_primary_results",
    )
    last_edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_primary_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.subject.name} ({self.total_score})"

    @classmethod
    def bulk_record(cls, entries, user):
        return super().bulk_record(entries, user, result_fk_field="primary_result_id")

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        with transaction.atomic():
            qs = cls.objects.filter(
                exam_session=exam_session,
                subject=subject,
                student__student_class=student_class,
                student__student_class__education_level__level_type=education_level,
                status__in=("APPROVED", "PUBLISHED"),
            ).select_for_update()
            cls.bulk_recalculate_positions(qs)


class PrimarySessionReport(TenantMixin, BaseSessionReport, models.Model):
    TERM_REPORT_MODEL = None

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="primary_session_reports",
    )
    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="primary_session_reports",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_primary_session_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_primary_session_reports",
    )

    class Meta:
        db_table = "results_primary_session_report"
        unique_together = ["tenant", "student", "academic_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return (
            f"{self.student.full_name} — "
            f"{self.academic_session.name} (Primary Session)"
        )


PrimarySessionReport.TERM_REPORT_MODEL = PrimaryTermReport


# ============================================================
# NURSERY — TERM REPORT + RESULT + SESSION REPORT
# ============================================================


class NurseryTermReport(TenantMixin, BaseTermReport, PhysicalDevelopmentFields, models.Model):
    """
    Nursery uses marks-based aggregation so it doesn't inherit TermReportFields.
    It does inherit BaseTermReport for all permission helpers.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="nursery_term_reports",
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="nursery_term_reports",
    )
    total_subjects = models.PositiveIntegerField(default=0)
    total_max_marks = models.DecimalField(
        max_digits=8, decimal_places=2, default=0)
    total_marks_obtained = models.DecimalField(
        max_digits=8, decimal_places=2, default=0
    )
    overall_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students_in_class = models.PositiveIntegerField(default=0)
    times_school_opened = models.PositiveIntegerField(default=0)
    times_student_present = models.PositiveIntegerField(default=0)
    next_term_begins = models.DateField(null=True, blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature = models.URLField(blank=True, null=True)
    class_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    head_teacher_signature = models.URLField(blank=True, null=True)
    head_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(
        max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_nursery_term_reports",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_nursery_term_reports",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_nursery_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "overall_percentage"]),
            models.Index(fields=["tenant", "created_at"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.exam_session.name} (Nursery Term)"

    def calculate_metrics(self):
        agg = NurseryResult.objects.filter(
            student=self.student,
            exam_session=self.exam_session,
            status__in=("APPROVED", "PUBLISHED"),
        ).aggregate(
            total_max=Sum("max_marks_obtainable"),
            total_obtained=Sum("mark_obtained"),
            cnt=Count("id"),
        )
        self.total_subjects = agg["cnt"] or 0
        self.total_max_marks = agg["total_max"] or 0
        self.total_marks_obtained = agg["total_obtained"] or 0
        self.overall_percentage = (
            (self.total_marks_obtained / self.total_max_marks * 100)
            if self.total_max_marks > 0
            else Decimal(0)
        )
        self.save(
            update_fields=[
                "total_subjects",
                "total_max_marks",
                "total_marks_obtained",
                "overall_percentage",
                "updated_at",
            ]
        )

    @classmethod
    def bulk_recalculate_positions(
        cls, exam_session, student_class,
        statuses=("APPROVED", "PUBLISHED"), **_
    ):
        """SQL RANK() — no Python sort.
        Pass statuses=("DRAFT","APPROVED","PUBLISHED") to include all records.
        """
        base_filter = dict(
            exam_session=exam_session,
            student__student_class=student_class,
            status__in=statuses,
        )
        with transaction.atomic():
            qs = cls.objects.filter(**base_filter).select_for_update()
            total = qs.count()
            if not total:
                return

            # Use a separate queryset for the window function —
            # PostgreSQL does not allow FOR UPDATE with window functions.
            ranked = (
                cls.objects.filter(**base_filter)
                .annotate(
                    rank=Window(
                        expression=DenseRank(),
                        order_by=F("overall_percentage").desc(),
                    )
                )
                .values("pk", "rank")
            )
            rank_map = {row["pk"]: row["rank"] for row in ranked}
            reports = list(qs.only("pk", "class_position",
                           "total_students_in_class"))
            for r in reports:
                r.class_position = rank_map.get(r.pk)
                r.total_students_in_class = total
            cls.objects.bulk_update(
                reports,
                ["class_position", "total_students_in_class"],
                batch_size=200,
            )


class NurseryResult(TenantMixin, BaseResult, models.Model):
    """
    Nursery result.

    Now correctly inherits BaseResult so that:
      • save() → calculate_scores() → determine_grade() works identically
        to all other education levels.
      • ca_total, grade, is_passed, percentage, subject_position,
        position_formatted are all available on the model.
      • bulk_approve, bulk_publish, bulk_delete, bulk_record are inherited.

    calculate_scores() is overridden below to handle the Nursery-specific
    logic (direct mark entry or ComponentScore aggregation).
    """

    RESULT_FK_NAME = "nursery_result"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="nursery_results",
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name="nursery_results",
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="nursery_results",
    )
    grading_system = models.ForeignKey(
        GradingSystem,
        on_delete=models.PROTECT,
        related_name="nursery_results",
    )
    term_report = models.ForeignKey(
        NurseryTermReport,
        on_delete=models.SET_NULL,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    max_marks_obtainable = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Overridden by ComponentScore sum if nursery components are configured",
    )
    mark_obtained = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )
    academic_comment = models.TextField(blank=True)
    teacher_remark = models.TextField(blank=True)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="entered_nursery_results",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_nursery_results",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_nursery_results",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_nursery_results",
    )
    last_edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_nursery_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.subject.name} ({self.mark_obtained})"

    def calculate_scores(self):
        """
        Nursery-specific score calculation.

        If ComponentScore rows exist (school configured nursery components),
        sum those; otherwise fall back to direct mark_obtained / max_marks_obtainable.
        ca_total is set to 0 — Nursery has no CA sub-total concept.
        """
        if self.pk:
            cs_qs = ComponentScore.objects.filter(nursery_result=self).select_related(
                "component"
            )
            if cs_qs.exists():
                self.mark_obtained = sum(cs.score for cs in cs_qs)
                self.max_marks_obtainable = sum(
                    cs.component.max_score for cs in cs_qs)
        self.ca_total = Decimal(0)
        self.total_score = self.mark_obtained
        if self.max_marks_obtainable and self.max_marks_obtainable > 0:
            self.percentage = (self.mark_obtained /
                               self.max_marks_obtainable) * 100
        else:
            self.percentage = Decimal(0)

    @classmethod
    def bulk_record(cls, entries, user):
        return super().bulk_record(entries, user, result_fk_field="nursery_result_id")

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        with transaction.atomic():
            qs = cls.objects.filter(
                exam_session=exam_session,
                subject=subject,
                student__student_class=student_class,
                student__student_class__education_level__level_type=education_level,
                status__in=("APPROVED", "PUBLISHED"),
            ).select_for_update()
            cls.bulk_recalculate_positions(qs)


class NurserySessionReport(TenantMixin, BaseSessionReport, models.Model):
    """
    Session report for a Nursery student.
    compute_from_term_reports() detects overall_percentage on NurseryTermReport.
    """
    TERM_REPORT_MODEL = None

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="nursery_session_reports",
    )
    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="nursery_session_reports",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_nursery_session_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_nursery_session_reports",
    )

    class Meta:
        db_table = "results_nursery_session_report"
        unique_together = ["tenant", "student", "academic_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return (
            f"{self.student.full_name} — "
            f"{self.academic_session.name} (Nursery Session)"
        )


NurserySessionReport.TERM_REPORT_MODEL = NurseryTermReport
_REPORT_FK_MAP = {
    SeniorSecondaryTermReport: "senior_term_report",
    JuniorSecondaryTermReport: "junior_term_report",
    PrimaryTermReport: "primary_term_report",
    NurseryTermReport: "nursery_term_report",
}


# ============================================================
# LEGACY MODELS (unchanged — kept for backwards compatibility)
# ============================================================


class StudentResult(TenantMixin, models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="results"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="student_results"
    )
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="student_results"
    )
    grading_system = models.ForeignKey(
        GradingSystem, on_delete=models.CASCADE, related_name="student_results"
    )
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="student_results",
    )
    ca_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )
    exam_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )
    total_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0)
    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    grade = models.CharField(max_length=5, blank=True)
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )
    status = models.CharField(
        max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    is_passed = models.BooleanField(default=False)
    remarks = models.TextField(blank=True)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="entered_results",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_results",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_student_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.student.full_name} — {self.subject.name} ({self.total_score})"

    def save(self, *args, **kwargs):
        ca = Decimal(self.ca_score or 0)
        exam = Decimal(self.exam_score or 0)
        self.total_score = ca + exam
        max_score = Decimal(self.grading_system.max_score or 100)
        self.percentage = (self.total_score / max_score *
                           100) if max_score > 0 else 0
        super().save(*args, **kwargs)


class StudentTermResult(TenantMixin, models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="term_results"
    )
    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="student_term_results",
    )
    term = models.ForeignKey(
        Term,
        on_delete=models.PROTECT,
        related_name="student_term_results",
        null=True,
        blank=True,
    )
    total_subjects = models.PositiveIntegerField(default=0)
    subjects_passed = models.PositiveIntegerField(default=0)
    subjects_failed = models.PositiveIntegerField(default=0)
    total_score = models.DecimalField(
        max_digits=8, decimal_places=2, default=0)
    average_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0)
    gpa = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(default=0)
    times_opened = models.PositiveIntegerField(default=0)
    times_present = models.PositiveIntegerField(default=0)
    next_term_begins = models.DateField(null=True, blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_term_results",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_student_term_result"
        unique_together = ["tenant", "student", "academic_session", "term"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student"]),
            models.Index(fields=["tenant", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        term_name = self.term.name if self.term else "Unknown"
        return f"{self.student.full_name} — {term_name} {self.academic_session.name}"


class AssessmentScore(TenantMixin, models.Model):
    student_result = models.ForeignKey(
        StudentResult, on_delete=models.CASCADE, related_name="assessment_scores"
    )
    assessment_type = models.ForeignKey(
        AssessmentType, on_delete=models.CASCADE, related_name="scores"
    )
    score = models.DecimalField(
        max_digits=5, decimal_places=2, validators=[MinValueValidator(0)]
    )
    max_score = models.DecimalField(
        max_digits=5, decimal_places=2, validators=[MinValueValidator(0)]
    )
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    remarks = models.TextField(blank=True)
    date_assessed = models.DateField(default=timezone.now)

    class Meta:
        db_table = "results_assessment_score"
        unique_together = ["tenant", "student_result", "assessment_type"]

    def save(self, *args, **kwargs):
        if self.max_score > 0:
            self.percentage = (self.score / self.max_score) * 100
        super().save(*args, **kwargs)


class ResultSheet(TenantMixin, models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="result_sheets"
    )
    student_class = models.ForeignKey(
        StudentClass,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="result_sheets",
    )
    total_students = models.PositiveIntegerField(default=0)
    students_passed = models.PositiveIntegerField(default=0)
    students_failed = models.PositiveIntegerField(default=0)
    class_average = models.DecimalField(
        max_digits=5, decimal_places=2, default=0)
    highest_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0)
    lowest_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0)
    status = models.CharField(
        max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    prepared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="prepared_sheets",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_sheets",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_result_sheet"
        unique_together = ["tenant", "exam_session", "student_class"]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.student_class.name} — {self.exam_session.name}"

    @property
    def education_level(self):
        return self.student_class.education_level


class ResultTemplate(TenantMixin, models.Model):
    TEMPLATE_TYPES = [
        ("REPORT_CARD", "Report Card"),
        ("TRANSCRIPT", "Academic Transcript"),
        ("CERTIFICATE", "Certificate"),
        ("RESULT_SLIP", "Result Slip"),
    ]

    name = models.CharField(max_length=100)
    template_type = models.CharField(max_length=20, choices=TEMPLATE_TYPES)
    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.PROTECT,
        related_name="result_templates",
        null=True,
        blank=True,
    )
    template_content = models.TextField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_result_template"
        ordering = ["name"]
        unique_together = ["tenant", "name"]

    def __str__(self):
        level = self.education_level.name if self.education_level else "All Levels"
        return f"{self.name} ({self.get_template_type_display()}) — {level}"


class ResultComment(TenantMixin, models.Model):
    COMMENT_TYPES = [
        ("GENERAL", "General Comment"),
        ("SUBJECT", "Subject-specific Comment"),
        ("BEHAVIOR", "Behavioral Comment"),
        ("RECOMMENDATION", "Recommendation"),
    ]

    student_result = models.ForeignKey(
        StudentResult,
        on_delete=models.CASCADE,
        related_name="comments",
        null=True,
        blank=True,
    )
    term_result = models.ForeignKey(
        StudentTermResult,
        on_delete=models.CASCADE,
        related_name="comments",
        null=True,
        blank=True,
    )
    comment_type = models.CharField(max_length=20, choices=COMMENT_TYPES)
    comment = models.TextField()
    commented_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="result_comments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "results_result_comment"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Comment by {self.commented_by} on {self.created_at:%Y-%m-%d}"
