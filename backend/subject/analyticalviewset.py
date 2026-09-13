# ==============================================================================
# 2. SUBJECT ANALYTICS VIEWSET - Statistics & Reporting
# ==============================================================================
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Prefetch, Avg, Sum, Count, Case, When, IntegerField
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.http import HttpResponse
import csv
import json
from .models import (
    Subject,
    SUBJECT_CATEGORY_CHOICES,
    EDUCATION_LEVELS,
    NURSERY_LEVELS,
    SS_SUBJECT_TYPES,
)
import logging

from classroom.models import GradeLevel
from tenants.mixins import TenantFilterMixin

from . import cache as subject_cache


class SubjectAnalyticsViewSet(TenantFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    Analytics ViewSet for Subject statistics, reports, and data insights.

    Responsibilities:
    - Comprehensive statistics dashboard
    - Performance metrics and KPIs
    - Data export for reporting
    - Academic planning insights
    - Resource utilization analysis
    - Nigerian education system specific analytics

    URL Pattern: /api/subjects/analytics/
    """

    queryset = Subject.objects.all()
    permission_classes = [IsAuthenticated]

    # Only allow read operations
    http_method_names = ["get", "head", "options"]

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """Comprehensive analytics dashboard with Nigerian education system metrics"""
        tenant_id = subject_cache.tenant_id_from(getattr(self, "request", None))
        stats = subject_cache.read("analytics_dashboard", tenant_id)

        if not stats:
            queryset = self.get_queryset()

            # Core metrics
            total_subjects = queryset.count()
            active_subjects = queryset.filter(
                is_active=True, is_discontinued=False
            ).count()

            stats = {
                "overview": {
                    "total_subjects": total_subjects,
                    "active_subjects": active_subjects,
                    "inactive_subjects": queryset.filter(is_active=False).count(),
                    "discontinued_subjects": queryset.filter(
                        is_discontinued=True
                    ).count(),
                    "compulsory_subjects": queryset.filter(is_compulsory=True).count(),
                    "elective_subjects": queryset.filter(is_compulsory=False).count(),
                    "practical_subjects": queryset.filter(has_practical=True).count(),
                    "lab_required_subjects": queryset.filter(requires_lab=True).count(),
                    "cross_cutting_subjects": queryset.filter(
                        is_cross_cutting=True
                    ).count(),
                    "activity_based_subjects": queryset.filter(
                        is_activity_based=True
                    ).count(),
                    "specialist_required_subjects": queryset.filter(
                        requires_specialist_teacher=True
                    ).count(),
                },
                "by_category": self._get_category_breakdown(queryset),
                "by_education_level": self._get_education_level_breakdown(queryset),
                "nursery_analysis": self._get_nursery_level_breakdown(queryset),
                "ss_analysis": self._get_ss_subject_breakdown(queryset),
                "academic_metrics": self._get_academic_metrics(queryset),
                "resource_requirements": self._get_resource_requirements(queryset),
                "grade_distribution": self._get_grade_distribution(queryset),
                "curriculum_metrics": self._get_curriculum_metrics(queryset),
                "trends": self._get_trend_analysis(queryset),
            }

            subject_cache.write("analytics_dashboard", tenant_id, stats)

        return Response(stats)

    @action(detail=False, methods=["get"])
    def category_analysis(self, request):
        """Deep dive into category-specific analytics"""
        category = request.query_params.get("category")

        if category and category in dict(SUBJECT_CATEGORY_CHOICES):
            queryset = self.get_queryset().filter(category=category)
        else:
            queryset = self.get_queryset()

        analysis = {
            "category_overview": self._get_category_breakdown(queryset),
            "performance_metrics": self._get_category_performance(queryset, category),
            "resource_analysis": self._get_category_resources(queryset, category),
            "student_engagement": self._get_category_engagement(queryset, category),
            "curriculum_alignment": self._get_category_curriculum_alignment(
                queryset, category
            ),
        }

        return Response(analysis)

    @action(detail=False, methods=["get"])
    def education_level_analysis(self, request):
        """Detailed analysis by education level"""
        level = request.query_params.get("level")

        if level and level in dict(EDUCATION_LEVELS):
            queryset = self.get_queryset().filter(education_levels__contains=[level])
        else:
            queryset = self.get_queryset()

        analysis = {
            "level_overview": self._get_education_level_breakdown(queryset),
            "subject_distribution": self._get_level_subject_distribution(
                queryset, level
            ),
            "workload_analysis": self._get_level_workload_analysis(queryset, level),
            "progression_mapping": self._get_level_progression_mapping(queryset, level),
        }

        # Add specific analysis for different levels
        if level == "NURSERY":
            analysis["nursery_specifics"] = self._get_nursery_specific_analysis(
                queryset
            )
        elif level == "SENIOR_SECONDARY":
            analysis["ss_specifics"] = self._get_ss_specific_analysis(queryset)

        return Response(analysis)

    @action(detail=False, methods=["get"])
    def nursery_analytics(self, request):
        """Specialized analytics for nursery education"""
        nursery_subjects = self.get_queryset().filter(
            education_levels__contains=["NURSERY"]
        )

        analytics = {
            "overview": {
                "total_nursery_subjects": nursery_subjects.count(),
                "activity_based_subjects": nursery_subjects.filter(
                    is_activity_based=True
                ).count(),
                "by_nursery_level": self._get_nursery_level_breakdown(nursery_subjects),
            },
            "activity_analysis": {
                "play_based_learning": nursery_subjects.filter(
                    category="nursery_activities", is_activity_based=True
                ).count(),
                "skill_development": self._get_nursery_skill_distribution(
                    nursery_subjects
                ),
            },
            "development_areas": self._get_nursery_development_areas(nursery_subjects),
            "resource_needs": self._get_nursery_resource_requirements(nursery_subjects),
        }

        return Response(analytics)

    @action(detail=False, methods=["get"])
    def senior_secondary_analytics(self, request):
        """Specialized analytics for Senior Secondary education"""
        ss_subjects = self.get_queryset().filter(
            education_levels__contains=["SENIOR_SECONDARY"]
        )

        analytics = {
            "overview": {
                "total_ss_subjects": ss_subjects.count(),
                "cross_cutting_subjects": ss_subjects.filter(
                    is_cross_cutting=True
                ).count(),
                "by_subject_type": self._get_ss_subject_breakdown(ss_subjects),
            },
            "stream_analysis": {
                "science_stream": self._get_ss_stream_analysis(
                    ss_subjects, "core_science"
                ),
                "arts_stream": self._get_ss_stream_analysis(ss_subjects, "core_art"),
                "commercial_stream": self._get_ss_stream_analysis(
                    ss_subjects, "core_humanities"
                ),
            },
            "elective_patterns": self._get_ss_elective_patterns(ss_subjects),
            "career_pathways": self._get_ss_career_alignment(ss_subjects),
        }

        return Response(analytics)

    @action(detail=False, methods=["get"])
    def resource_utilization(self, request):
        """Analyze resource requirements and utilization"""
        queryset = self.get_queryset().filter(is_active=True)

        utilization = {
            "lab_requirements": {
                "total_lab_subjects": queryset.filter(requires_lab=True).count(),
                "lab_utilization_rate": self._calculate_lab_utilization(),
                "peak_lab_hours": self._get_peak_lab_usage(),
                "by_education_level": self._get_lab_requirements_by_level(queryset),
            },
            "equipment_requirements": {
                "special_equipment_subjects": queryset.filter(
                    requires_special_equipment=True
                ).count(),
                "equipment_categories": self._get_equipment_breakdown(),
                "equipment_sharing_opportunities": self._get_equipment_sharing_analysis(),
            },
            "staff_requirements": {
                "practical_subjects": queryset.filter(has_practical=True).count(),
                "specialist_required": queryset.filter(
                    requires_specialist_teacher=True
                ).count(),
                "estimated_staff_hours": self._calculate_staff_requirements(),
                "teacher_specialization_needs": self._get_teacher_specialization_needs(),
            },
            "facility_utilization": {
                "classroom_only": queryset.filter(
                    requires_lab=False, requires_special_equipment=False
                ).count(),
                "multi_purpose_requirements": self._get_multi_purpose_facility_needs(),
            },
        }

        return Response(utilization)

    @action(detail=False, methods=["get"])
    def academic_planning(self, request):
        """Insights for academic planning and curriculum development"""
        planning_data = {
            "curriculum_gaps": self._identify_curriculum_gaps(),
            "prerequisite_chains": self._analyze_prerequisite_chains(),
            "credit_distribution": self._analyze_credit_distribution(),
            "workload_analysis": self._analyze_student_workload(),
            "progression_pathways": self._analyze_progression_pathways(),
            "curriculum_versions": self._analyze_curriculum_versions(),
            "recommendations": self._generate_planning_recommendations(),
        }

        return Response(planning_data)

    @action(detail=False, methods=["get"])
    def curriculum_compliance(self, request):
        """Analyze compliance with Nigerian curriculum standards"""
        compliance_data = {
            "curriculum_coverage": self._analyze_curriculum_coverage(),
            "mandatory_subjects": self._check_mandatory_subject_coverage(),
            "cross_cutting_compliance": self._check_cross_cutting_compliance(),
            "practical_component_compliance": self._check_practical_compliance(),
            "assessment_compliance": self._check_assessment_compliance(),
            "recommendations": self._generate_compliance_recommendations(),
        }

        return Response(compliance_data)

    @action(detail=False, methods=["get"])
    def export_analytics(self, request):
        """Export comprehensive analytics data"""
        if not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=403)

        export_format = request.query_params.get("format", "json")

        analytics_data = {
            "export_metadata": {
                "generated_at": timezone.now().isoformat(),
                "generated_by": request.user.username,
                "format": export_format,
                "school_system": "Nigerian Education System",
            },
            "dashboard_data": self._get_dashboard_export(),
            "detailed_subjects": self._get_subjects_export(),
            "education_level_analysis": self._get_education_level_export(),
            "nursery_analysis": self._get_nursery_export(),
            "ss_analysis": self._get_ss_export(),
            "trends_analysis": self._get_trends_export(),
        }

        if export_format == "csv":
            return self._generate_csv_response(analytics_data)
        elif export_format == "excel":
            return self._generate_excel_response(analytics_data)

        return Response(analytics_data)

    # Helper methods for analytics calculations

    def _get_category_breakdown(self, queryset):
        """Calculate breakdown by category with enhanced metrics"""
        breakdown = {}
        for category, display in SUBJECT_CATEGORY_CHOICES:
            category_subjects = queryset.filter(category=category)
            breakdown[category] = {
                "display_name": display,
                "total": category_subjects.count(),
                "active": category_subjects.filter(
                    is_active=True, is_discontinued=False
                ).count(),
                "avg_credit_hours": round(
                    category_subjects.aggregate(avg=Avg("credit_hours"))["avg"] or 0, 2
                ),
                "practical_subjects": category_subjects.filter(
                    has_practical=True
                ).count(),
                "compulsory_subjects": category_subjects.filter(
                    is_compulsory=True
                ).count(),
            }
        return breakdown

    def _get_education_level_breakdown(self, queryset):
        """Calculate breakdown by education level with detailed metrics"""
        breakdown = {}
        for level_code, display in EDUCATION_LEVELS:
            level_subjects = queryset.filter(education_levels__contains=[level_code])

            breakdown[level_code] = {
                "display_name": display,
                "total": level_subjects.count(),
                "active": level_subjects.filter(
                    is_active=True, is_discontinued=False
                ).count(),
                "compulsory": level_subjects.filter(is_compulsory=True).count(),
                "elective": level_subjects.filter(is_compulsory=False).count(),
                "practical": level_subjects.filter(has_practical=True).count(),
                "avg_credit_hours": round(
                    level_subjects.aggregate(avg=Avg("credit_hours"))["avg"] or 0, 2
                ),
                "total_weekly_hours": level_subjects.aggregate(
                    total=Sum("credit_hours")
                )["total"]
                or 0,
            }
        return breakdown

    def _get_nursery_level_breakdown(self, queryset):
        """Calculate breakdown by nursery levels"""
        nursery_subjects = queryset.filter(education_levels__contains=["NURSERY"])
        breakdown = {}

        for level_code, display in NURSERY_LEVELS:
            level_subjects = nursery_subjects.filter(
                nursery_levels__contains=[level_code]
            )
            breakdown[level_code] = {
                "display_name": display,
                "total": level_subjects.count(),
                "activity_based": level_subjects.filter(is_activity_based=True).count(),
                "avg_credit_hours": round(
                    level_subjects.aggregate(avg=Avg("credit_hours"))["avg"] or 0, 2
                ),
            }

        return breakdown

    def _get_ss_subject_breakdown(self, queryset):
        """Calculate breakdown by Senior Secondary subject types"""
        ss_subjects = queryset.filter(education_levels__contains=["SENIOR_SECONDARY"])
        breakdown = {}

        for type_code, display in SS_SUBJECT_TYPES:
            type_subjects = ss_subjects.filter(ss_subject_type=type_code)
            breakdown[type_code] = {
                "display_name": display,
                "total": type_subjects.count(),
                "active": type_subjects.filter(is_active=True).count(),
                "practical": type_subjects.filter(has_practical=True).count(),
                "lab_required": type_subjects.filter(requires_lab=True).count(),
                "avg_credit_hours": round(
                    type_subjects.aggregate(avg=Avg("credit_hours"))["avg"] or 0, 2
                ),
            }

        return breakdown

    def _get_academic_metrics(self, queryset):
        """Calculate enhanced academic performance metrics"""
        metrics = queryset.aggregate(
            avg_credit_hours=Avg("credit_hours"),
            total_credit_hours=Sum("credit_hours"),
            avg_practical_hours=Avg("practical_hours"),
            total_practical_hours=Sum("practical_hours"),
            avg_pass_mark=Avg("pass_mark"),
            min_pass_mark=Min("pass_mark"),
            max_pass_mark=Max("pass_mark"),
        )

        # Add calculated metrics
        metrics.update(
            {
                "subjects_with_practical": queryset.filter(has_practical=True).count(),
                "subjects_with_continuous_assessment": queryset.filter(
                    has_continuous_assessment=True
                ).count(),
                "subjects_with_final_exam": queryset.filter(
                    has_final_exam=True
                ).count(),
                "avg_total_weekly_hours": round(
                    (metrics["avg_credit_hours"] or 0)
                    + (metrics["avg_practical_hours"] or 0),
                    2,
                ),
            }
        )

        return metrics

    def _get_resource_requirements(self, queryset):
        """Calculate enhanced resource requirement statistics"""
        return {
            "lab_required": queryset.filter(requires_lab=True).count(),
            "special_equipment": queryset.filter(
                requires_special_equipment=True
            ).count(),
            "practical_components": queryset.filter(has_practical=True).count(),
            "specialist_teachers": queryset.filter(
                requires_specialist_teacher=True
            ).count(),
            "standard_classroom_only": queryset.filter(
                requires_lab=False,
                requires_special_equipment=False,
                has_practical=False,
            ).count(),
            "activity_based": queryset.filter(is_activity_based=True).count(),
            "resource_intensity": {
                "high": queryset.filter(
                    Q(requires_lab=True)
                    | Q(requires_special_equipment=True)
                    | Q(requires_specialist_teacher=True)
                ).count(),
                "medium": queryset.filter(has_practical=True)
                .exclude(
                    Q(requires_lab=True)
                    | Q(requires_special_equipment=True)
                    | Q(requires_specialist_teacher=True)
                )
                .count(),
                "low": queryset.filter(
                    requires_lab=False,
                    requires_special_equipment=False,
                    has_practical=False,
                    requires_specialist_teacher=False,
                ).count(),
            },
        }

    def _get_curriculum_metrics(self, queryset):
        """Calculate curriculum-specific metrics"""
        return {
            "curriculum_versions": queryset.exclude(curriculum_version__isnull=True)
            .exclude(curriculum_version="")
            .values("curriculum_version")
            .annotate(count=Count("id"))
            .order_by("-count"),
            "introduction_years": queryset.exclude(introduced_year__isnull=True)
            .values("introduced_year")
            .annotate(count=Count("id"))
            .order_by("-introduced_year"),
            "learning_outcomes_coverage": {
                "with_outcomes": queryset.exclude(learning_outcomes__isnull=True)
                .exclude(learning_outcomes="")
                .count(),
                "without_outcomes": queryset.filter(
                    Q(learning_outcomes__isnull=True) | Q(learning_outcomes="")
                ).count(),
            },
        }

    def _get_grade_distribution(self, queryset):
        """Calculate distribution across grade levels"""
        distribution = {}
        if GradeLevel.objects.exists():
            for grade in GradeLevel.objects.all().order_by("order"):
                subject_count = queryset.filter(
                    grade_levels=grade, is_active=True, is_discontinued=False
                ).count()
                distribution[f"grade_{grade.order}"] = {
                    "name": grade.name,
                    "count": subject_count,
                    "education_level": (
                        grade.education_level
                        if hasattr(grade, "education_level")
                        else "Unknown"
                    ),
                }
        return distribution

    def _get_trend_analysis(self, queryset):
        """Analyze trends over time"""
        current_year = timezone.now().year

        trends = {
            "subject_introduction_trend": queryset.exclude(introduced_year__isnull=True)
            .values("introduced_year")
            .annotate(count=Count("id"))
            .order_by("introduced_year"),
            "recent_additions": queryset.filter(
                introduced_year__gte=current_year - 5
            ).count(),
            "curriculum_modernization": {
                "updated_recently": queryset.filter(
                    updated_at__year__gte=current_year - 1
                ).count(),
                "needs_review": queryset.filter(
                    Q(curriculum_version__isnull=True)
                    | Q(curriculum_version="")
                    | Q(introduced_year__lte=current_year - 10)
                ).count(),
            },
        }

        return trends

    # Additional helper methods for new analytics features

    def _get_nursery_specific_analysis(self, queryset):
        """Nursery-specific analysis"""
        return {
            "developmental_areas": self._get_nursery_development_areas(queryset),
            "activity_types": self._get_nursery_activity_types(queryset),
            "skill_progression": self._get_nursery_skill_progression(queryset),
        }

    def _get_ss_specific_analysis(self, queryset):
        """Senior Secondary specific analysis"""
        return {
            "stream_distribution": self._get_ss_stream_distribution(queryset),
            "university_preparation": self._get_ss_university_prep_analysis(queryset),
            "career_pathways": self._get_ss_career_pathways(queryset),
        }

    def _calculate_lab_utilization(self):
        """Calculate laboratory utilization rate"""
        # Placeholder implementation
        return 75.5

    def _get_peak_lab_usage(self):
        """Get peak laboratory usage hours"""
        # Placeholder implementation
        return {"peak_hours": "10:00-12:00", "utilization_rate": 85}

    # Export helper methods
    def _generate_csv_response(self, data):
        """Generate CSV export response"""
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="subject_analytics_{timezone.now().strftime("%Y%m%d")}.csv"'
        )

        writer = csv.writer(response)
        writer.writerow(["Subject Analytics Export"])
        writer.writerow(["Generated:", timezone.now().isoformat()])
        writer.writerow([])

        # Write summary data
        overview = data.get("dashboard_data", {}).get("overview", {})
        writer.writerow(["Overview"])
        for key, value in overview.items():
            writer.writerow([key.replace("_", " ").title(), value])

        return response

    def _generate_excel_response(self, data):
        """Generate Excel export response - placeholder"""
        # Would implement Excel generation using openpyxl or similar
        return Response({"message": "Excel export not implemented yet"})

    def _get_dashboard_export(self):
        """Get dashboard data for export"""
        return self.dashboard(None).data

    def _get_subjects_export(self):
        """Get detailed subjects data for export"""
        return list(
            self.get_queryset().values(
                "name",
                "short_name",
                "code",
                "category",
                "education_levels",
                "nursery_levels",
                "ss_subject_type",
                "credit_hours",
                "practical_hours",
                "is_compulsory",
                "is_cross_cutting",
                "is_activity_based",
                "is_active",
            )
        )

    def _get_education_level_export(self):
        """Get education level analysis for export"""
        return self._get_education_level_breakdown(self.get_queryset())

    def _get_nursery_export(self):
        """Get nursery analysis for export"""
        return self._get_nursery_level_breakdown(self.get_queryset())

    def _get_ss_export(self):
        """Get Senior Secondary analysis for export"""
        return self._get_ss_subject_breakdown(self.get_queryset())

    def _get_trends_export(self):
        """Get trends analysis for export"""
        return self._get_trend_analysis(self.get_queryset())

    # Placeholder methods for advanced analytics (to be implemented)
    def _get_category_performance(self, queryset, category):
        return {"message": "Category performance analysis to be implemented"}

    def _get_category_resources(self, queryset, category):
        return {"message": "Category resource analysis to be implemented"}

    def _get_category_engagement(self, queryset, category):
        return {"message": "Category engagement analysis to be implemented"}

    def _get_category_curriculum_alignment(self, queryset, category):
        return {"message": "Category curriculum alignment to be implemented"}

    def _identify_curriculum_gaps(self):
        return {"message": "Curriculum gap analysis to be implemented"}

    def _analyze_prerequisite_chains(self):
        return {"message": "Prerequisite chain analysis to be implemented"}

    def _analyze_credit_distribution(self):
        return {"message": "Credit distribution analysis to be implemented"}

    def _analyze_student_workload(self):
        return {"message": "Student workload analysis to be implemented"}

    def _generate_planning_recommendations(self):
        return {"message": "Planning recommendations to be implemented"}
