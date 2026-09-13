# ==============================================================================
# 3. SUBJECT MANAGEMENT VIEWSET - Administrative Operations
# ==============================================================================
import csv
import io
import logging
from datetime import datetime, timedelta

# import pandas as pd  # Commented out - not available in container
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q, Count, Avg, Sum, Prefetch, Max, Min
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response

logger = logging.getLogger(__name__)

from . import cache as subject_cache
from .models import (
    Subject,
    SUBJECT_CATEGORY_CHOICES,
    EDUCATION_LEVELS,
    NURSERY_LEVELS,
    SS_SUBJECT_TYPES,
)
# from classroom.models import GradeLevel  # Commented out to avoid circular import
from .serializers import (
    SubjectSerializer,
    SubjectListSerializer,
    SubjectCreateUpdateSerializer,
    SubjectEducationLevelSerializer,
)


class SubjectManagementViewSet(viewsets.ViewSet):
    """
    Enhanced Management ViewSet for Subject administrative operations and bulk actions.

    Responsibilities:
    - Bulk operations (create, update, delete, status changes)
    - Administrative management tasks
    - Subject lifecycle management
    - Data maintenance and cleanup
    - Import/Export operations
    - Analytics and reporting
    - Assessment configuration management

    URL Pattern: /api/subjects/management/
    """

    permission_classes = [IsAdminUser]  # Admin only
    queryset = Subject.objects.all()

    def _addressable(self):
        """
        The subjects this caller is allowed to act on by id.

        A plain ViewSet, so TenantFilterMixin has no queryset to filter and the
        scoping has to be explicit. The bulk endpoints take subject_ids from
        the request body and fed them straight to Subject.objects.filter(), so
        a request carrying another school's ids would deactivate, reassess or
        delete that school's subjects.

        IsAdminUser here means platform staff, not a school's own admin, so
        this was a footgun rather than an exposure -- but a platform admin
        working inside one school's context should not be able to reach
        another school's rows by id either.
        """
        tenant = getattr(self.request, "tenant", None)
        if tenant is None:
            return Subject.objects.all()
        return Subject.objects.filter(tenant=tenant)


    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        """Enhanced bulk create subjects from uploaded data"""
        subjects_data = request.data.get("subjects", [])

        if not subjects_data:
            return Response({"error": "No subjects data provided"}, status=400)

        created_subjects = []
        errors = []

        try:
            with transaction.atomic():
                for i, subject_data in enumerate(subjects_data):
                    try:
                        # Validate assessment weights if provided
                        if self._validate_assessment_weights(subject_data):
                            serializer = SubjectCreateUpdateSerializer(
                                data=subject_data
                            )
                            if serializer.is_valid():
                                subject = serializer.save()
                                created_subjects.append(subject)
                            else:
                                errors.append({f"subject_{i}": serializer.errors})
                        else:
                            errors.append(
                                {f"subject_{i}": "Assessment weights must sum to 100%"}
                            )
                    except Exception as e:
                        errors.append({f"subject_{i}": str(e)})

            # Clear all relevant caches
            self._clear_subject_caches()

            return Response(
                {
                    "created_count": len(created_subjects),
                    "error_count": len(errors),
                    "created_subjects": [
                        {
                            "id": s.id,
                            "name": s.name,
                            "code": s.code,
                            "education_levels": s.education_levels,
                            "category": s.category,
                        }
                        for s in created_subjects
                    ],
                    "errors": errors,
                }
            )

        except Exception as e:
            logger.error(f"Bulk create failed: {e}")
            return Response({"error": "Bulk creation failed"}, status=500)

    @action(detail=False, methods=["post"])
    def bulk_update_status(self, request):
        """Enhanced bulk update active/discontinued status"""
        subject_ids = request.data.get("subject_ids", [])
        is_active = request.data.get("is_active")
        is_discontinued = request.data.get("is_discontinued")
        reason = request.data.get("reason", "")

        if not subject_ids:
            return Response({"error": "subject_ids required"}, status=400)

        update_fields = {}
        if is_active is not None:
            update_fields["is_active"] = is_active
        if is_discontinued is not None:
            update_fields["is_discontinued"] = is_discontinued

        if not update_fields:
            return Response({"error": "No update fields provided"}, status=400)

        try:
            with transaction.atomic():
                subjects = self._addressable().filter(id__in=subject_ids)

                # Check for dependencies before deactivating
                if is_active is False:
                    dependency_check = self._check_subject_dependencies(subjects)
                    if dependency_check["has_dependencies"]:
                        return Response(
                            {
                                "error": "Cannot deactivate subjects with active dependencies",
                                "dependencies": dependency_check["dependencies"],
                            },
                            status=400,
                        )

                updated_count = subjects.update(**update_fields)

                # Log the action
                logger.info(
                    f"Bulk status update: {updated_count} subjects by {request.user}. "
                    f"Fields: {update_fields}. Reason: {reason}"
                )

                self._clear_subject_caches()

                return Response(
                    {
                        "message": f"Successfully updated {updated_count} subjects",
                        "updated_count": updated_count,
                        "update_fields": update_fields,
                        "reason": reason,
                    }
                )
        except Exception as e:
            logger.error(f"Bulk update failed: {e}")
            return Response({"error": "Bulk update failed"}, status=500)

    @action(detail=False, methods=["post"])
    def bulk_update_assessment(self, request):
        """Bulk update assessment configuration"""
        subject_ids = request.data.get("subject_ids", [])
        assessment_config = request.data.get("assessment_config", {})

        if not subject_ids or not assessment_config:
            return Response(
                {"error": "subject_ids and assessment_config required"}, status=400
            )

        # Validate assessment weights
        ca_weight = assessment_config.get("ca_weight", 0)
        exam_weight = assessment_config.get("exam_weight", 0)
        practical_weight = assessment_config.get("practical_weight", 0)

        if ca_weight + exam_weight + practical_weight != 100:
            return Response(
                {"error": "Assessment weights must sum to 100%"}, status=400
            )

        try:
            with transaction.atomic():
                updated_count = self._addressable().filter(id__in=subject_ids).update(
                    **assessment_config
                )

                logger.info(
                    f"Bulk assessment update: {updated_count} subjects by {request.user}"
                )

                self._clear_subject_caches()

                return Response(
                    {
                        "message": f"Successfully updated assessment config for {updated_count} subjects",
                        "updated_count": updated_count,
                        "assessment_config": assessment_config,
                    }
                )
        except Exception as e:
            logger.error(f"Bulk assessment update failed: {e}")
            return Response({"error": "Assessment update failed"}, status=500)

    @action(detail=False, methods=["post"])
    def bulk_delete(self, request):
        """Enhanced bulk delete subjects with comprehensive safety checks"""
        subject_ids = request.data.get("subject_ids", [])
        force_delete = request.data.get("force_delete", False)
        backup_before_delete = request.data.get("backup", True)

        if not subject_ids:
            return Response({"error": "subject_ids required"}, status=400)

        subjects = self._addressable().filter(id__in=subject_ids)

        if not subjects.exists():
            return Response({"error": "No subjects found"}, status=404)

        # Enhanced dependency checking
        dependency_analysis = self._analyze_subject_dependencies(subjects)

        if dependency_analysis["blocking_dependencies"] and not force_delete:
            return Response(
                {
                    "error": "Subjects have blocking dependencies",
                    "dependencies": dependency_analysis,
                    "suggestion": "Use force_delete=True to override or remove dependencies first",
                },
                status=400,
            )

        result = {
            "deleted_count": 0,
            "soft_deleted_count": 0,
            "backup_created": False,
            "errors": [],
        }

        try:
            with transaction.atomic():
                # Create backup if requested
                if backup_before_delete:
                    backup_data = self._create_subjects_backup(subjects)
                    result["backup_created"] = True
                    result["backup_info"] = backup_data

                # Soft delete subjects with non-blocking dependencies
                subjects_with_soft_deps = dependency_analysis["soft_delete_candidates"]
                if subjects_with_soft_deps:
                    soft_delete_count = len(subjects_with_soft_deps)
                    Subject.objects.filter(
                        id__in=[s.id for s in subjects_with_soft_deps]
                    ).update(is_active=False, is_discontinued=True)
                    result["soft_deleted_count"] = soft_delete_count

                # Hard delete subjects without dependencies or with force_delete
                safe_to_delete = dependency_analysis["safe_delete_candidates"]
                if safe_to_delete and (
                    force_delete or not dependency_analysis["blocking_dependencies"]
                ):
                    deleted_count = len(safe_to_delete)
                    Subject.objects.filter(
                        id__in=[s.id for s in safe_to_delete]
                    ).delete()
                    result["deleted_count"] = deleted_count

                self._clear_subject_caches()
                logger.info(f"Bulk delete completed by {request.user}: {result}")

        except Exception as e:
            logger.error(f"Bulk delete failed: {e}")
            return Response({"error": "Bulk delete failed"}, status=500)

        return Response(result)

    @action(detail=False, methods=["post"])
    def import_subjects(self, request):
        """Enhanced import subjects from CSV/Excel file with validation"""
        uploaded_file = request.FILES.get("file")
        import_mode = request.data.get("mode", "create")  # create, update, or upsert
        validate_only = request.data.get("validate_only", False)

        if not uploaded_file:
            return Response({"error": "No file uploaded"}, status=400)

        file_extension = uploaded_file.name.split(".")[-1].lower()

        try:
            # Process file based on extension
            if file_extension == "csv":
                data = self._process_csv_import(uploaded_file)
            elif file_extension in ["xlsx", "xls"]:
                data = self._process_excel_import(uploaded_file)
            else:
                return Response({"error": "Unsupported file format"}, status=400)

            # Validate data structure
            validation_result = self._validate_import_data(data)
            if not validation_result["is_valid"]:
                return Response(
                    {
                        "error": "Data validation failed",
                        "validation_errors": validation_result["errors"],
                    },
                    status=400,
                )

            # If validate_only mode, return validation results
            if validate_only:
                return Response(
                    {
                        "message": "Validation completed",
                        "total_records": len(data),
                        "validation_result": validation_result,
                        "preview": data[:5],  # Preview first 5 records
                    }
                )

            # Process import
            import_result = self._create_subjects_from_import(data, import_mode)
            return Response(import_result)

        except Exception as e:
            logger.error(f"Import failed: {e}")
            return Response({"error": f"Import failed: {str(e)}"}, status=500)

    @action(detail=False, methods=["get"])
    def export_subjects(self, request):
        """Export subjects to CSV/Excel format"""
        export_format = request.query_params.get("format", "csv")
        education_level = request.query_params.get("education_level")
        category = request.query_params.get("category")
        include_inactive = (
            request.query_params.get("include_inactive", "false").lower() == "true"
        )

        # Build queryset
        queryset = Subject.objects.all()

        if not include_inactive:
            queryset = queryset.filter(is_active=True, is_discontinued=False)

        if education_level:
            queryset = queryset.filter(education_levels__contains=[education_level])

        if category:
            queryset = queryset.filter(category=category)

        try:
            if export_format == "csv":
                response_data = self._export_subjects_csv(queryset)
            elif export_format in ["xlsx", "excel"]:
                response_data = self._export_subjects_excel(queryset)
            else:
                return Response({"error": "Unsupported export format"}, status=400)

            return Response(response_data)

        except Exception as e:
            logger.error(f"Export failed: {e}")
            return Response({"error": f"Export failed: {str(e)}"}, status=500)

    @action(detail=False, methods=["get"])
    def inactive_subjects(self, request):
        """Enhanced inactive subjects analysis"""
        inactive_subjects = Subject.objects.filter(
            Q(is_active=False) | Q(is_discontinued=True)
        ).order_by("-updated_at")

        # Enhanced statistics
        stats = {
            "total_inactive": inactive_subjects.count(),
            "deactivated_only": inactive_subjects.filter(
                is_active=False, is_discontinued=False
            ).count(),
            "discontinued_only": inactive_subjects.filter(is_discontinued=True).count(),
            "by_education_level": self._get_inactive_stats_by_level(inactive_subjects),
            "by_category": self._get_inactive_stats_by_category(inactive_subjects),
            "recently_deactivated": inactive_subjects.filter(
                updated_at__gte=timezone.now() - timedelta(days=30)
            ).count(),
        }

        serializer = SubjectListSerializer(inactive_subjects, many=True)
        return Response({"statistics": stats, "subjects": serializer.data})

    @action(detail=False, methods=["post"])
    def reactivate_subjects(self, request):
        """Enhanced bulk reactivate subjects with dependency checking"""
        subject_ids = request.data.get("subject_ids", [])
        check_prerequisites = request.data.get("check_prerequisites", True)

        if not subject_ids:
            return Response({"error": "subject_ids required"}, status=400)

        subjects = self._addressable().filter(id__in=subject_ids)

        # Check if prerequisites are available if requested
        if check_prerequisites:
            prerequisite_check = self._check_prerequisites_availability(subjects)
            if not prerequisite_check["all_available"]:
                return Response(
                    {
                        "error": "Some prerequisites are not available",
                        "unavailable_prerequisites": prerequisite_check["unavailable"],
                        "suggestion": "Activate prerequisites first or set check_prerequisites=False",
                    },
                    status=400,
                )

        try:
            with transaction.atomic():
                updated_count = subjects.update(is_active=True, is_discontinued=False)

                self._clear_subject_caches()

                logger.info(
                    f"Bulk reactivation: {updated_count} subjects by {request.user}"
                )

                return Response(
                    {
                        "message": f"Successfully reactivated {updated_count} subjects",
                        "reactivated_count": updated_count,
                    }
                )
        except Exception as e:
            logger.error(f"Bulk reactivation failed: {e}")
            return Response({"error": "Reactivation failed"}, status=500)

    @action(detail=False, methods=["post"])
    def cleanup_orphaned(self, request):
        """Enhanced cleanup of orphaned or inconsistent subject data"""
        cleanup_results = {
            "orphaned_prerequisites": 0,
            "invalid_grade_levels": 0,
            "duplicate_codes": 0,
            "inconsistent_statuses": 0,
            "invalid_assessment_weights": 0,
            "missing_ss_types": 0,
            "invalid_education_levels": 0,
        }

        try:
            with transaction.atomic():
                # Clean up orphaned prerequisites
                cleanup_results["orphaned_prerequisites"] = (
                    self._cleanup_orphaned_prerequisites()
                )

                # Clean up invalid grade level assignments
                cleanup_results["invalid_grade_levels"] = (
                    self._cleanup_invalid_grade_levels()
                )

                # Fix duplicate subject codes
                cleanup_results["duplicate_codes"] = self._fix_duplicate_codes()

                # Fix inconsistent status combinations
                cleanup_results["inconsistent_statuses"] = (
                    self._fix_inconsistent_statuses()
                )

                # Fix invalid assessment weights
                cleanup_results["invalid_assessment_weights"] = (
                    self._fix_assessment_weights()
                )

                # Fix missing SS subject types
                cleanup_results["missing_ss_types"] = self._fix_missing_ss_types()

                # Fix invalid education levels
                cleanup_results["invalid_education_levels"] = (
                    self._fix_invalid_education_levels()
                )

                self._clear_subject_caches()

                logger.info(
                    f"Data cleanup completed by {request.user}: {cleanup_results}"
                )

                return Response(
                    {
                        "message": "Cleanup completed successfully",
                        "results": cleanup_results,
                        "total_fixes": sum(cleanup_results.values()),
                    }
                )
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
            return Response({"error": "Cleanup failed"}, status=500)

    @action(detail=False, methods=["get"])
    def analytics_dashboard(self, request):
        """Enhanced analytics dashboard for subjects"""
        tenant_id = subject_cache.tenant_id_from(request)
        dashboard_data = subject_cache.read("management_dashboard", tenant_id)

        if not dashboard_data:
            dashboard_data = {
                "overview": self._get_subjects_overview(),
                "distribution": self._get_subjects_distribution(),
                "assessment_analysis": self._get_assessment_analysis(),
                "resource_requirements": self._get_resource_requirements(),
                "trends": self._get_subjects_trends(),
                "quality_metrics": self._get_quality_metrics(),
                "last_updated": timezone.now().isoformat(),
            }
            subject_cache.write("management_dashboard", tenant_id, dashboard_data)

        return Response(dashboard_data)

    @action(detail=False, methods=["get"])
    def maintenance_report(self, request):
        """Enhanced maintenance and health report"""
        report = {
            "data_quality": self._check_data_quality(),
            "system_health": self._check_system_health(),
            "recommendations": self._generate_maintenance_recommendations(),
            "performance_metrics": self._get_performance_metrics(),
            "last_updated": timezone.now().isoformat(),
        }

        return Response(report)

    @action(detail=False, methods=["post"])
    def duplicate_subjects(self, request):
        """Create duplicate subjects with modifications"""
        source_subject_ids = request.data.get("source_subject_ids", [])
        target_education_levels = request.data.get("target_education_levels", [])
        modifications = request.data.get("modifications", {})

        if not source_subject_ids or not target_education_levels:
            return Response(
                {"error": "source_subject_ids and target_education_levels required"},
                status=400,
            )

        created_subjects = []
        errors = []

        try:
            with transaction.atomic():
                for subject_id in source_subject_ids:
                    try:
                        source_subject = Subject.objects.get(id=subject_id)

                        for education_level in target_education_levels:
                            new_subject = self._duplicate_subject(
                                source_subject, education_level, modifications
                            )
                            created_subjects.append(new_subject)

                    except Subject.DoesNotExist:
                        errors.append(f"Subject with ID {subject_id} not found")
                    except Exception as e:
                        errors.append(
                            f"Failed to duplicate subject {subject_id}: {str(e)}"
                        )

                self._clear_subject_caches()

                return Response(
                    {
                        "message": f"Successfully created {len(created_subjects)} duplicate subjects",
                        "created_count": len(created_subjects),
                        "created_subjects": [
                            {
                                "id": s.id,
                                "name": s.name,
                                "code": s.code,
                                "education_levels": s.education_levels,
                            }
                            for s in created_subjects
                        ],
                        "errors": errors,
                    }
                )

        except Exception as e:
            logger.error(f"Subject duplication failed: {e}")
            return Response({"error": "Duplication failed"}, status=500)

    # ======================== HELPER METHODS ========================

    def _validate_assessment_weights(self, subject_data):
        """Validate that assessment weights sum to 100%"""
        ca_weight = subject_data.get("ca_weight", 40)
        exam_weight = subject_data.get("exam_weight", 60)
        practical_weight = subject_data.get("practical_weight", 0)

        return ca_weight + exam_weight + practical_weight == 100

    def _clear_subject_caches(self):
        """Throw away the cached subject views for the school being worked on."""
        subject_cache.invalidate(subject_cache.tenant_id_from(self.request))

    def _check_subject_dependencies(self, subjects):
        """Check for subject dependencies"""
        dependencies = []
        has_dependencies = False

        for subject in subjects:
            # Check if subject is a prerequisite for other subjects
            dependent_subjects = subject.unlocks_subjects.filter(is_active=True)
            if dependent_subjects.exists():
                has_dependencies = True
                dependencies.append(
                    {
                        "subject_id": subject.id,
                        "subject_name": subject.name,
                        "dependent_subjects": [
                            {"id": dep.id, "name": dep.name}
                            for dep in dependent_subjects
                        ],
                    }
                )

        return {"has_dependencies": has_dependencies, "dependencies": dependencies}

    def _analyze_subject_dependencies(self, subjects):
        """Comprehensive dependency analysis"""
        analysis = {
            "blocking_dependencies": [],
            "soft_delete_candidates": [],
            "safe_delete_candidates": [],
        }

        for subject in subjects:
            # Check for active student enrollments (blocking)
            if (
                hasattr(subject, "student_subjects")
                and subject.student_subjects.exists()
            ):
                analysis["soft_delete_candidates"].append(subject)
            # Check for prerequisite relationships (blocking)
            elif subject.unlocks_subjects.filter(is_active=True).exists():
                analysis["blocking_dependencies"].append(
                    {
                        "subject": subject,
                        "dependent_subjects": list(
                            subject.unlocks_subjects.filter(is_active=True)
                        ),
                    }
                )
            else:
                analysis["safe_delete_candidates"].append(subject)

        return analysis

    def _create_subjects_backup(self, subjects):
        """Create backup of subjects before deletion"""
        backup_data = []
        for subject in subjects:
            backup_data.append(
                {
                    "id": subject.id,
                    "name": subject.name,
                    "code": subject.code,
                    "data": SubjectSerializer(subject).data,
                    "backup_time": timezone.now().isoformat(),
                }
            )

        # Here you could save to file system, database, or external storage
        return {
            "backup_count": len(backup_data),
            "backup_timestamp": timezone.now().isoformat(),
        }

    def _process_csv_import(self, file):
        """Process CSV file for import"""
        try:
            # Read CSV file
            file_content = file.read().decode("utf-8")
            csv_reader = csv.DictReader(io.StringIO(file_content))

            data = []
            for row in csv_reader:
                # Clean and process row data
                processed_row = self._clean_import_row(row)
                if processed_row:
                    data.append(processed_row)

            return data
        except Exception as e:
            raise Exception(f"CSV processing failed: {str(e)}")

    def _process_excel_import(self, file):
        """Process Excel file for import"""
        try:
            # Read Excel file
            df = pd.read_excel(file)

            # Convert to list of dictionaries
            data = []
            for _, row in df.iterrows():
                processed_row = self._clean_import_row(row.to_dict())
                if processed_row:
                    data.append(processed_row)

            return data
        except Exception as e:
            raise Exception(f"Excel processing failed: {str(e)}")

    def _clean_import_row(self, row):
        """Clean and validate import row data"""
        # Remove empty values and strip whitespace
        cleaned_row = {}
        for key, value in row.items():
            if pd.notna(value) and str(value).strip():
                # Convert column names to model field names
                field_name = key.lower().replace(" ", "_").replace("-", "_")
                cleaned_row[field_name] = str(value).strip()

        # Parse JSON fields
        if "education_levels" in cleaned_row:
            try:
                cleaned_row["education_levels"] = cleaned_row["education_levels"].split(
                    ","
                )
            except:
                pass

        return cleaned_row if cleaned_row else None

    def _validate_import_data(self, data):
        """Validate import data structure and content"""
        validation_result = {
            "is_valid": True,
            "errors": [],
            "warnings": [],
        }

        required_fields = ["name", "code"]

        for i, row in enumerate(data):
            row_errors = []

            # Check required fields
            for field in required_fields:
                if field not in row or not row[field]:
                    row_errors.append(f"Missing required field: {field}")

            # Validate education levels
            if "education_levels" in row:
                valid_levels = [choice[0] for choice in EDUCATION_LEVELS]
                for level in row["education_levels"]:
                    if level not in valid_levels:
                        row_errors.append(f"Invalid education level: {level}")

            # Validate category
            if "category" in row:
                valid_categories = [choice[0] for choice in SUBJECT_CATEGORY_CHOICES]
                if row["category"] not in valid_categories:
                    row_errors.append(f"Invalid category: {row['category']}")

            if row_errors:
                validation_result["is_valid"] = False
                validation_result["errors"].append({"row": i + 1, "errors": row_errors})

        return validation_result

    def _create_subjects_from_import(self, data, import_mode="create"):
        """Create subjects from imported data"""
        result = {
            "created_count": 0,
            "updated_count": 0,
            "skipped_count": 0,
            "error_count": 0,
            "errors": [],
        }

        try:
            with transaction.atomic():
                for i, row_data in enumerate(data):
                    try:
                        if import_mode == "create":
                            serializer = SubjectCreateUpdateSerializer(data=row_data)
                            if serializer.is_valid():
                                serializer.save()
                                result["created_count"] += 1
                            else:
                                result["errors"].append(
                                    {"row": i + 1, "errors": serializer.errors}
                                )
                                result["error_count"] += 1

                        elif import_mode == "update":
                            # Update existing subjects by code
                            try:
                                subject = Subject.objects.get(code=row_data["code"])
                                serializer = SubjectCreateUpdateSerializer(
                                    subject, data=row_data, partial=True
                                )
                                if serializer.is_valid():
                                    serializer.save()
                                    result["updated_count"] += 1
                                else:
                                    result["errors"].append(
                                        {"row": i + 1, "errors": serializer.errors}
                                    )
                                    result["error_count"] += 1
                            except Subject.DoesNotExist:
                                result["skipped_count"] += 1

                        elif import_mode == "upsert":
                            # Create or update
                            try:
                                subject = Subject.objects.get(code=row_data["code"])
                                serializer = SubjectCreateUpdateSerializer(
                                    subject, data=row_data, partial=True
                                )
                                if serializer.is_valid():
                                    serializer.save()
                                    result["updated_count"] += 1
                            except Subject.DoesNotExist:
                                serializer = SubjectCreateUpdateSerializer(
                                    data=row_data
                                )
                                if serializer.is_valid():
                                    serializer.save()
                                    result["created_count"] += 1

                    except Exception as e:
                        result["errors"].append({"row": i + 1, "error": str(e)})
                        result["error_count"] += 1

                self._clear_subject_caches()

        except Exception as e:
            raise Exception(f"Import processing failed: {str(e)}")

        return result

    def _export_subjects_csv(self, queryset):
        """Export subjects to CSV format"""
        # Implementation for CSV export
        subjects_data = []
        for subject in queryset:
            subjects_data.append(
                {
                    "name": subject.name,
                    "code": subject.code,
                    "category": subject.category,
                    "education_levels": ",".join(subject.education_levels),
                    "is_active": subject.is_active,
                    # Add more fields as needed
                }
            )

        return {
            "format": "csv",
            "data": subjects_data,
            "filename": f"subjects_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv",
        }

    def _export_subjects_excel(self, queryset):
        """Export subjects to Excel format"""
        # Implementation for Excel export
        subjects_data = []
        for subject in queryset:
            subjects_data.append(
                {
                    "Name": subject.name,
                    "Code": subject.code,
                    "Category": subject.get_category_display(),
                    "Education Levels": subject.education_levels_display,
                    "Active": "Yes" if subject.is_active else "No",
                    # Add more fields as needed
                }
            )

        return {
            "format": "excel",
            "data": subjects_data,
            "filename": f"subjects_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
        }

    def _get_inactive_stats_by_level(self, inactive_subjects):
        """Get inactive subjects statistics by education level"""
        stats = {}
        for choice in EDUCATION_LEVELS:
            level_code, level_name = choice
            count = inactive_subjects.filter(
                education_levels__contains=[level_code]
            ).count()
            stats[level_name] = count
        return stats

    def _get_inactive_stats_by_category(self, inactive_subjects):
        """Get inactive subjects statistics by category"""
        stats = {}
        for choice in SUBJECT_CATEGORY_CHOICES:
            category_code, category_name = choice
            count = inactive_subjects.filter(category=category_code).count()
            stats[category_name] = count
        return stats

    def _check_prerequisites_availability(self, subjects):
        """Check if prerequisites are available for reactivation"""
        result = {"all_available": True, "unavailable": []}

        for subject in subjects:
            prerequisites = subject.prerequisites.all()
            for prereq in prerequisites:
                if not prereq.is_active or prereq.is_discontinued:
                    result["all_available"] = False
                    result["unavailable"].append(
                        {
                            "subject": subject.name,
                            "prerequisite": prereq.name,
                            "status": (
                                "inactive" if not prereq.is_active else "discontinued"
                            ),
                        }
                    )

        return result

    def _cleanup_orphaned_prerequisites(self):
        """Clean up orphaned prerequisite relationships"""
        count = 0
        # Find prerequisites pointing to inactive/discontinued subjects
        subjects_with_prereqs = Subject.objects.prefetch_related("prerequisites").all()

        for subject in subjects_with_prereqs:
            inactive_prereqs = subject.prerequisites.filter(
                Q(is_active=False) | Q(is_discontinued=True)
            )
            if inactive_prereqs.exists():
                subject.prerequisites.remove(*inactive_prereqs)
                count += inactive_prereqs.count()

        return count

    def _cleanup_invalid_grade_levels(self):
        """Clean up invalid grade level assignments"""
        count = 0
        # Remove grade level assignments for inactive subjects
        inactive_subjects = Subject.objects.filter(
            Q(is_active=False) | Q(is_discontinued=True)
        )

        for subject in inactive_subjects:
            if subject.grade_levels.exists():
                grade_count = subject.grade_levels.count()
                subject.grade_levels.clear()
                count += grade_count

        return count

    def _fix_duplicate_codes(self):
        """Fix duplicate subject codes by appending sequence numbers"""
        count = 0
        codes_seen = {}

        # Find subjects with duplicate codes
        subjects = Subject.objects.all().order_by("created_at")

        for subject in subjects:
            if subject.code in codes_seen:
                # Generate new unique code
                base_code = subject.code
                sequence = 1
                new_code = f"{base_code}_{sequence}"

                while Subject.objects.filter(code=new_code).exists():
                    sequence += 1
                    new_code = f"{base_code}_{sequence}"

                subject.code = new_code
                subject.save(update_fields=["code"])
                count += 1
            else:
                codes_seen[subject.code] = subject.id

        return count

    def _fix_inconsistent_statuses(self):
        """Fix inconsistent status combinations"""
        count = 0

        # Fix subjects that are discontinued but still active
        inconsistent_subjects = Subject.objects.filter(
            is_discontinued=True, is_active=True
        )

        updated = inconsistent_subjects.update(is_active=False)
        count += updated

        return count

    def _fix_assessment_weights(self):
        """Fix invalid assessment weight configurations"""
        count = 0
        subjects = Subject.objects.all()

        for subject in subjects:
            # Get assessment weights (assuming these fields exist or add them to model)
            ca_weight = getattr(subject, "ca_weight", 40)
            exam_weight = getattr(subject, "exam_weight", 60)
            practical_weight = getattr(subject, "practical_weight", 0)

            total_weight = ca_weight + exam_weight + practical_weight

            if total_weight != 100:
                # Fix weights proportionally
                if total_weight > 0:
                    subject.ca_weight = int((ca_weight / total_weight) * 100)
                    subject.exam_weight = int((exam_weight / total_weight) * 100)
                    subject.practical_weight = (
                        100 - subject.ca_weight - subject.exam_weight
                    )
                else:
                    # Set default weights
                    subject.ca_weight = 40
                    subject.exam_weight = 60
                    subject.practical_weight = 0

                subject.save(
                    update_fields=["ca_weight", "exam_weight", "practical_weight"]
                )
                count += 1

        return count

    def _fix_missing_ss_types(self):
        """Fix missing SS subject types for Senior Secondary subjects"""
        count = 0

        ss_subjects_without_type = Subject.objects.filter(
            education_levels__contains=["SENIOR_SECONDARY"],
            ss_subject_type__isnull=True,
        )

        for subject in ss_subjects_without_type:
            # Auto-assign type based on subject name/category
            if subject.is_cross_cutting or any(
                keyword in subject.name.lower()
                for keyword in ["mathematics", "english", "civic"]
            ):
                subject.ss_subject_type = "cross_cutting"
            elif "science" in subject.category.lower() or any(
                keyword in subject.name.lower()
                for keyword in ["physics", "chemistry", "biology", "mathematics"]
            ):
                subject.ss_subject_type = "core_science"
            elif "art" in subject.category.lower() or any(
                keyword in subject.name.lower()
                for keyword in ["literature", "government", "economics", "geography"]
            ):
                subject.ss_subject_type = "core_art"
            elif "humanities" in subject.category.lower() or any(
                keyword in subject.name.lower()
                for keyword in ["history", "islamic", "christian", "arabic"]
            ):
                subject.ss_subject_type = "core_humanities"
            else:
                subject.ss_subject_type = "elective"

            subject.save(update_fields=["ss_subject_type"])
            count += 1

        return count

    def _fix_invalid_education_levels(self):
        """Fix invalid education level configurations"""
        count = 0
        valid_levels = [choice[0] for choice in EDUCATION_LEVELS]

        subjects = Subject.objects.all()

        for subject in subjects:
            if subject.education_levels:
                # Remove invalid levels
                valid_subject_levels = [
                    level for level in subject.education_levels if level in valid_levels
                ]

                if len(valid_subject_levels) != len(subject.education_levels):
                    subject.education_levels = valid_subject_levels or [
                        "PRIMARY"
                    ]  # Default fallback
                    subject.save(update_fields=["education_levels"])
                    count += 1
            elif not subject.education_levels:
                # Assign default level based on subject name/category
                if "nursery" in subject.name.lower() or subject.is_activity_based:
                    subject.education_levels = ["NURSERY"]
                elif "primary" in subject.name.lower():
                    subject.education_levels = ["PRIMARY"]
                else:
                    subject.education_levels = ["PRIMARY"]  # Default

                subject.save(update_fields=["education_levels"])
                count += 1

        return count

    def _get_subjects_overview(self):
        """Get comprehensive subjects overview statistics"""
        total_subjects = Subject.objects.count()
        active_subjects = Subject.objects.filter(
            is_active=True, is_discontinued=False
        ).count()

        return {
            "total_subjects": total_subjects,
            "active_subjects": active_subjects,
            "inactive_subjects": total_subjects - active_subjects,
            "discontinued_subjects": Subject.objects.filter(
                is_discontinued=True
            ).count(),
            "by_education_level": {
                level_name: Subject.objects.filter(
                    education_levels__contains=[level_code], is_active=True
                ).count()
                for level_code, level_name in EDUCATION_LEVELS
            },
            "by_category": {
                category_name: Subject.objects.filter(
                    category=category_code, is_active=True
                ).count()
                for category_code, category_name in SUBJECT_CATEGORY_CHOICES
            },
            "cross_cutting_subjects": Subject.objects.filter(
                is_cross_cutting=True, is_active=True
            ).count(),
            "activity_based_subjects": Subject.objects.filter(
                is_activity_based=True, is_active=True
            ).count(),
        }

    def _get_subjects_distribution(self):
        """Get detailed subjects distribution analysis"""
        return {
            "nursery_distribution": {
                level_name: Subject.objects.filter(
                    nursery_levels__contains=[level_code], is_active=True
                ).count()
                for level_code, level_name in NURSERY_LEVELS
            },
            "ss_type_distribution": {
                type_name: Subject.objects.filter(
                    ss_subject_type=type_code, is_active=True
                ).count()
                for type_code, type_name in SS_SUBJECT_TYPES
            },
            "practical_subjects": Subject.objects.filter(
                has_practical=True, is_active=True
            ).count(),
            "lab_required_subjects": Subject.objects.filter(
                requires_lab=True, is_active=True
            ).count(),
            "specialist_teacher_subjects": Subject.objects.filter(
                requires_specialist_teacher=True, is_active=True
            ).count(),
        }

    def _get_assessment_analysis(self):
        """Analyze assessment configurations across subjects"""
        subjects = Subject.objects.filter(is_active=True)

        return {
            "subjects_with_ca": subjects.filter(has_continuous_assessment=True).count(),
            "subjects_with_exam": subjects.filter(has_final_exam=True).count(),
            "subjects_with_practical": subjects.filter(has_practical=True).count(),
            "average_pass_mark": subjects.aggregate(Avg("pass_mark"))["pass_mark__avg"]
            or 0,
            "pass_mark_distribution": {
                "below_40": subjects.filter(pass_mark__lt=40).count(),
                "40_to_50": subjects.filter(
                    pass_mark__gte=40, pass_mark__lt=50
                ).count(),
                "50_to_60": subjects.filter(
                    pass_mark__gte=50, pass_mark__lt=60
                ).count(),
                "above_60": subjects.filter(pass_mark__gte=60).count(),
            },
        }

    def _get_resource_requirements(self):
        """Analyze resource requirements across subjects"""
        subjects = Subject.objects.filter(is_active=True)

        return {
            "total_credit_hours": subjects.aggregate(Sum("credit_hours"))[
                "credit_hours__sum"
            ]
            or 0,
            "total_practical_hours": subjects.aggregate(Sum("practical_hours"))[
                "practical_hours__sum"
            ]
            or 0,
            "subjects_requiring_lab": subjects.filter(requires_lab=True).count(),
            "subjects_requiring_equipment": subjects.filter(
                requires_special_equipment=True
            ).count(),
            "subjects_requiring_specialist": subjects.filter(
                requires_specialist_teacher=True
            ).count(),
            "average_credit_hours": subjects.aggregate(Avg("credit_hours"))[
                "credit_hours__avg"
            ]
            or 0,
        }

    def _get_subjects_trends(self):
        """Analyze subjects trends over time"""
        current_year = timezone.now().year

        # Subjects introduced in recent years
        recent_subjects = Subject.objects.filter(
            introduced_year__gte=current_year - 5, introduced_year__isnull=False
        ).count()

        # Monthly creation trends (last 12 months)
        monthly_creation = []
        for i in range(12):
            month_start = timezone.now().replace(day=1) - timedelta(days=30 * i)
            month_end = month_start + timedelta(days=32)
            month_end = month_end.replace(day=1) - timedelta(days=1)

            count = Subject.objects.filter(
                created_at__gte=month_start, created_at__lte=month_end
            ).count()

            monthly_creation.append(
                {"month": month_start.strftime("%Y-%m"), "count": count}
            )

        return {
            "recent_subjects": recent_subjects,
            "monthly_creation": list(reversed(monthly_creation)),
            "subjects_by_curriculum": Subject.objects.values("curriculum_version")
            .annotate(count=Count("id"))
            .order_by("-count")[:5],
        }

    def _get_quality_metrics(self):
        """Get data quality metrics"""
        total_subjects = Subject.objects.count()

        return {
            "completeness": {
                "with_description": Subject.objects.exclude(description="").count(),
                "with_learning_outcomes": Subject.objects.exclude(
                    learning_outcomes=""
                ).count(),
                "with_short_name": Subject.objects.exclude(short_name="").count(),
                "with_curriculum_version": Subject.objects.exclude(
                    curriculum_version=""
                ).count(),
            },
            "consistency": {
                "valid_education_levels": Subject.objects.exclude(
                    education_levels=[]
                ).count(),
                "valid_ss_types": Subject.objects.filter(
                    education_levels__contains=["SENIOR_SECONDARY"],
                    ss_subject_type__isnull=False,
                ).count(),
                "consistent_practical_config": Subject.objects.filter(
                    has_practical=True, practical_hours__gt=0
                ).count(),
            },
            "total_subjects": total_subjects,
        }

    def _check_data_quality(self):
        """Comprehensive data quality check"""
        issues = []

        # Check for subjects without education levels
        subjects_without_levels = Subject.objects.filter(education_levels=[])
        if subjects_without_levels.exists():
            issues.append(
                {
                    "type": "missing_education_levels",
                    "count": subjects_without_levels.count(),
                    "severity": "high",
                }
            )

        # Check for SS subjects without types
        ss_without_types = Subject.objects.filter(
            education_levels__contains=["SENIOR_SECONDARY"],
            ss_subject_type__isnull=True,
        )
        if ss_without_types.exists():
            issues.append(
                {
                    "type": "missing_ss_types",
                    "count": ss_without_types.count(),
                    "severity": "medium",
                }
            )

        # Check for inconsistent practical configuration
        practical_inconsistent = Subject.objects.filter(
            has_practical=True, practical_hours=0
        )
        if practical_inconsistent.exists():
            issues.append(
                {
                    "type": "inconsistent_practical_config",
                    "count": practical_inconsistent.count(),
                    "severity": "low",
                }
            )

        return {
            "issues": issues,
            "total_issues": len(issues),
            "data_quality_score": max(0, 100 - (len(issues) * 10)),
        }

    def _check_system_health(self):
        """Check system health metrics"""
        return {
            "database_health": {
                "total_subjects": Subject.objects.count(),
                "active_subjects": Subject.objects.filter(is_active=True).count(),
                "recent_updates": Subject.objects.filter(
                    updated_at__gte=timezone.now() - timedelta(days=7)
                ).count(),
            },
            "performance_indicators": {
                "subjects_with_prerequisites": Subject.objects.filter(
                    prerequisites__isnull=False
                )
                .distinct()
                .count(),
                "subjects_with_grade_levels": Subject.objects.filter(
                    grade_levels__isnull=False
                )
                .distinct()
                .count(),
            },
        }

    def _generate_maintenance_recommendations(self):
        """Generate maintenance recommendations"""
        recommendations = []

        # Check for missing descriptions
        subjects_without_description = Subject.objects.filter(
            description="", is_active=True
        ).count()
        if subjects_without_description > 0:
            recommendations.append(
                {
                    "type": "content_improvement",
                    "message": f"{subjects_without_description} active subjects missing descriptions",
                    "action": "Add subject descriptions for better documentation",
                }
            )

        # Check for subjects without learning outcomes
        subjects_without_outcomes = Subject.objects.filter(
            learning_outcomes="", is_active=True
        ).count()
        if subjects_without_outcomes > 0:
            recommendations.append(
                {
                    "type": "curriculum_enhancement",
                    "message": f"{subjects_without_outcomes} active subjects missing learning outcomes",
                    "action": "Define learning outcomes for curriculum compliance",
                }
            )

        return recommendations

    def _get_performance_metrics(self):
        """Get performance-related metrics"""
        return {
            "query_performance": {
                "avg_subjects_per_level": Subject.objects.values("education_levels")
                .annotate(count=Count("id"))
                .aggregate(Avg("count"))["count__avg"]
                or 0,
            },
            "cache_efficiency": {
                "cache_hit_ratio": 85,  # This would come from actual cache metrics
                "avg_response_time": "120ms",  # This would come from monitoring
            },
        }

    def _duplicate_subject(self, source_subject, target_education_level, modifications):
        """Create a duplicate subject with modifications"""
        # Create new subject instance
        new_subject = Subject(
            name=source_subject.name,
            short_name=source_subject.short_name,
            code=f"{source_subject.code}-{target_education_level[:3]}",
            description=source_subject.description,
            category=source_subject.category,
            education_levels=[target_education_level],
            credit_hours=source_subject.credit_hours,
            is_compulsory=source_subject.is_compulsory,
            is_core=source_subject.is_core,
            has_continuous_assessment=source_subject.has_continuous_assessment,
            has_final_exam=source_subject.has_final_exam,
            pass_mark=source_subject.pass_mark,
            has_practical=source_subject.has_practical,
            practical_hours=source_subject.practical_hours,
            requires_lab=source_subject.requires_lab,
            requires_specialist_teacher=source_subject.requires_specialist_teacher,
            learning_outcomes=source_subject.learning_outcomes,
        )

        # Apply modifications
        for field, value in modifications.items():
            if hasattr(new_subject, field):
                setattr(new_subject, field, value)

        # Ensure unique code
        base_code = new_subject.code
        counter = 1
        while Subject.objects.filter(code=new_subject.code).exists():
            new_subject.code = f"{base_code}-{counter}"
            counter += 1

        new_subject.save()

        # Copy many-to-many relationships if applicable
        # (grade_levels, prerequisites would need to be handled separately)

        return new_subject
