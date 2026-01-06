# # # utils/section_filtering.py - ENHANCED VERSION
# # from django.db.models import Q
# # from classroom.models import Section
# # import logging

# # logger = logging.getLogger(__name__)


# # class SectionFilterMixin:
# #     """
# #     Enhanced mixin to automatically filter querysets based on user's section and role.
# #     Now includes automatic queryset filtering in get_queryset().
# #     """

# #     def get_user_role(self):
# #         """
# #         Helper method to get user's role from various possible sources.
# #         Returns role name as string in lowercase.
# #         """
# #         user = self.request.user

# #         # Check if superuser first
# #         if user.is_superuser:
# #             return "superadmin"

# #         # Check for role attribute directly on user
# #         if hasattr(user, "role") and isinstance(user.role, str):
# #             return user.role.lower()

# #         # Check for userrole relationship (many-to-many)
# #         if hasattr(user, "userrole"):
# #             roles = user.userrole.roles.all()
# #             if roles.exists():
# #                 # Return the highest priority role
# #                 role_names = [role.name.lower() for role in roles]

# #                 # Priority order
# #                 if "super_admin" in role_names or "superadmin" in role_names:
# #                     return "superadmin"
# #                 if "admin" in role_names or "principal" in role_names:
# #                     return "admin"
# #                 if "secondary_admin" in role_names:
# #                     return "secondary_admin"
# #                 if "nursery_admin" in role_names:
# #                     return "nursery_admin"
# #                 if "primary_admin" in role_names:
# #                     return "primary_admin"
# #                 if "junior_secondary_admin" in role_names:
# #                     return "junior_secondary_admin"
# #                 if "senior_secondary_admin" in role_names:
# #                     return "senior_secondary_admin"
# #                 if "teacher" in role_names:
# #                     return "teacher"
# #                 if "student" in role_names:
# #                     return "student"
# #                 if "parent" in role_names:
# #                     return "parent"

# #                 # Return first role if no priority match
# #                 return role_names[0] if role_names else None

# #         # Check for is_staff as fallback
# #         if user.is_staff:
# #             return "admin"

# #         return None

# #     def get_user_section_access(self):
# #         """
# #         Returns the sections the current user has access to based on their role.
# #         """
# #         user = self.request.user
# #         role = self.get_user_role()

# #         logger.info(f"User {user.username} has role: {role}")

# #         # Super Admin sees everything
# #         if role == "superadmin" or user.is_superuser:
# #             logger.info("Super admin access - returning all sections")
# #             return Section.objects.all()

# #         # Admin/Principal sees everything
# #         if role in ["admin", "principal"]:
# #             logger.info("Admin access - returning all sections")
# #             return Section.objects.all()

# #         # Secondary Admin sees both JSS and SSS
# #         if role == "secondary_admin":
# #             logger.info("Secondary admin access")
# #             return Section.objects.filter(
# #                 grade_level__education_level__in=[
# #                     "JUNIOR_SECONDARY",
# #                     "SENIOR_SECONDARY",
# #                 ]
# #             )

# #         # Section-specific admins
# #         if role in [
# #             "nursery_admin",
# #             "primary_admin",
# #             "junior_secondary_admin",
# #             "senior_secondary_admin",
# #         ]:
# #             role_to_education_level = {
# #                 "nursery_admin": "NURSERY",
# #                 "primary_admin": "PRIMARY",
# #                 "junior_secondary_admin": "JUNIOR_SECONDARY",
# #                 "senior_secondary_admin": "SENIOR_SECONDARY",
# #             }
# #             edu_level = role_to_education_level.get(role)
# #             if edu_level:
# #                 logger.info(f"Section admin access for {edu_level}")
# #                 return Section.objects.filter(grade_level__education_level=edu_level)

# #         # Teachers see sections of their assigned classrooms
# #         if role == "teacher":
# #             try:
# #                 from teacher.models import Teacher
# #                 from classroom.models import Classroom

# #                 teacher = Teacher.objects.get(user=user)

# #                 assigned_classrooms = Classroom.objects.filter(
# #                     Q(class_teacher=teacher)
# #                     | Q(classroomteacherassignment__teacher=teacher)
# #                 ).distinct()

# #                 section_ids = assigned_classrooms.values_list(
# #                     "section_id", flat=True
# #                 ).distinct()

# #                 sections = Section.objects.filter(id__in=section_ids)
# #                 logger.info(f"Teacher access - {sections.count()} sections")
# #                 return sections
# #             except Teacher.DoesNotExist:
# #                 logger.warning(f"Teacher object not found for user {user.username}")
# #                 return Section.objects.none()
# #             except Exception as e:
# #                 logger.error(f"Error getting teacher sections: {str(e)}")
# #                 return Section.objects.none()

# #         # Students see only their section
# #         if role == "student":
# #             try:
# #                 from students.models import Student

# #                 student = Student.objects.get(user=user)
# #                 if hasattr(student, "current_classroom") and student.current_classroom:
# #                     return Section.objects.filter(
# #                         id=student.current_classroom.section_id
# #                     )
# #             except Student.DoesNotExist:
# #                 logger.warning(f"Student object not found for user {user.username}")
# #             except Exception as e:
# #                 logger.error(f"Error getting student sections: {str(e)}")

# #         # Default: For staff users without specific role, grant all access
# #         if user.is_staff:
# #             logger.info("Staff user without specific role - granting all access")
# #             return Section.objects.all()

# #         logger.warning(f"No section access for user {user.username} with role {role}")
# #         return Section.objects.none()

# #     def get_education_levels_for_sections(self, sections):
# #         """
# #         Returns distinct education levels for the given sections.
# #         """
# #         if not sections or not sections.exists():
# #             logger.warning("No sections provided or sections queryset is empty")
# #             return []

# #         education_levels = list(
# #             sections.values_list("grade_level__education_level", flat=True).distinct()
# #         )
# #         logger.info(f"Education levels from sections: {education_levels}")
# #         return education_levels

# #     def get_user_education_level_access(self):
# #         """
# #         Returns the specific education levels the user has access to.
# #         More granular than section access.
# #         """
# #         user = self.request.user
# #         role = self.get_user_role()

# #         logger.info(
# #             f"Getting education level access for {user.username} with role {role}"
# #         )

# #         # Super Admin sees everything
# #         if role == "superadmin" or user.is_superuser or user.is_staff:
# #             logger.info("Super admin - all education levels")
# #             return ["NURSERY", "PRIMARY", "JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

# #         # General Admin/Principal sees everything
# #         if role in ["admin", "principal"]:
# #             logger.info("Admin/Principal - all education levels")
# #             return ["NURSERY", "PRIMARY", "JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

# #         # Secondary Admin sees both JSS and SSS
# #         if role == "secondary_admin":
# #             logger.info("Secondary admin - JSS and SSS")
# #             return ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

# #         # Section-specific admins
# #         section_admin_mapping = {
# #             "nursery_admin": ["NURSERY"],
# #             "primary_admin": ["PRIMARY"],
# #             "junior_secondary_admin": ["JUNIOR_SECONDARY"],
# #             "senior_secondary_admin": ["SENIOR_SECONDARY"],
# #         }

# #         if role in section_admin_mapping:
# #             levels = section_admin_mapping[role]
# #             logger.info(f"Section admin {role} - access: {levels}")
# #             return levels

# #         # For teachers, get from their assigned classrooms/subjects
# #         if role == "teacher":
# #             try:
# #                 from teacher.models import Teacher
# #                 from classroom.models import Classroom

# #                 teacher = Teacher.objects.get(user=user)

# #                 # Get education levels from assigned classrooms
# #                 classroom_edu_levels = (
# #                     Classroom.objects.filter(
# #                         Q(class_teacher=teacher)
# #                         | Q(classroomteacherassignment__teacher=teacher)
# #                     )
# #                     .values_list("grade_level__education_level", flat=True)
# #                     .distinct()
# #                 )

# #                 levels = list(set(classroom_edu_levels))
# #                 logger.info(f"Teacher education level access: {levels}")
# #                 return levels

# #             except Teacher.DoesNotExist:
# #                 logger.warning(f"Teacher not found for user {user.username}")
# #                 return []
# #             except Exception as e:
# #                 logger.error(f"Error getting teacher education levels: {str(e)}")
# #                 return []

# #         logger.warning(f"No education level access for user {user.username}")
# #         return []

# #     def apply_section_filters(self, queryset):
# #         """
# #         🔥 NEW: Automatically apply section-based filtering to any queryset.
# #         This is the core method that enforces section restrictions.
# #         """
# #         user = self.request.user
# #         role = self.get_user_role()

# #         # Get the model name to determine how to filter
# #         model_name = queryset.model.__name__

# #         logger.info(
# #             f"Applying section filters for {user.username} (role: {role}) on {model_name}"
# #         )

# #         # Super admins and general admins see everything
# #         if role in ["superadmin", "admin", "principal"] or user.is_superuser:
# #             logger.info(f"✅ Admin access - no filtering applied")
# #             return queryset

# #         # Get user's allowed education levels
# #         allowed_education_levels = self.get_user_education_level_access()

# #         if not allowed_education_levels:
# #             logger.warning(f"❌ No education level access for {user.username}")
# #             return queryset.none()

# #         logger.info(f"🔒 Restricting to education levels: {allowed_education_levels}")

# #         # Apply filters based on model type
# #         try:
# #             # STUDENT MODELS
# #             if model_name == "Student":
# #                 return queryset.filter(education_level__in=allowed_education_levels)

# #             # CLASSROOM MODELS
# #             elif model_name == "Classroom":
# #                 return queryset.filter(
# #                     grade_level__education_level__in=allowed_education_levels
# #                 )

# #             # ENROLLMENT MODELS
# #             elif model_name == "StudentEnrollment":
# #                 return queryset.filter(
# #                     student__education_level__in=allowed_education_levels
# #                 )

# #             # SUBJECT MODELS
# #             elif model_name == "Subject":
# #                 return queryset.filter(education_level__in=allowed_education_levels)

# #             # GRADE LEVEL MODELS
# #             elif model_name == "GradeLevel":
# #                 return queryset.filter(education_level__in=allowed_education_levels)

# #             # EXAM/RESULT MODELS
# #             elif model_name in ["ExamSession", "Exam"]:
# #                 return queryset.filter(
# #                     Q(education_level__in=allowed_education_levels)
# #                     | Q(grade_level__education_level__in=allowed_education_levels)
# #                 )

# #             elif model_name in [
# #                 "SeniorSecondaryResult",
# #                 "SeniorSecondaryTermReport",
# #                 "SeniorSecondarySessionResult",
# #             ]:
# #                 if "SENIOR_SECONDARY" in allowed_education_levels:
# #                     return queryset
# #                 return queryset.none()

# #             elif model_name in ["JuniorSecondaryResult", "JuniorSecondaryTermReport"]:
# #                 if "JUNIOR_SECONDARY" in allowed_education_levels:
# #                     return queryset
# #                 return queryset.none()

# #             elif model_name in ["PrimaryResult", "PrimaryTermReport"]:
# #                 if "PRIMARY" in allowed_education_levels:
# #                     return queryset
# #                 return queryset.none()

# #             elif model_name in ["NurseryResult", "NurseryTermReport"]:
# #                 if "NURSERY" in allowed_education_levels:
# #                     return queryset
# #                 return queryset.none()

# #             # TEACHER MODELS (teachers should see all teachers in their education levels)
# #             elif model_name == "Teacher":
# #                 from classroom.models import Classroom

# #                 # Get classrooms in allowed education levels
# #                 allowed_classrooms = Classroom.objects.filter(
# #                     grade_level__education_level__in=allowed_education_levels
# #                 )
# #                 return queryset.filter(
# #                     Q(classroomteacherassignment__classroom__in=allowed_classrooms)
# #                     | Q(classroom__in=allowed_classrooms)
# #                 ).distinct()

# #             # ATTENDANCE MODELS
# #             elif model_name == "Attendance":
# #                 return queryset.filter(
# #                     student__education_level__in=allowed_education_levels
# #                 )

# #             # TIMETABLE MODELS
# #             elif model_name == "Timetable":
# #                 return queryset.filter(
# #                     classroom__grade_level__education_level__in=allowed_education_levels
# #                 )

# #             # DEFAULT: Try common foreign key relationships
# #             else:
# #                 # Try student relationship
# #                 if hasattr(queryset.model, "student"):
# #                     return queryset.filter(
# #                         student__education_level__in=allowed_education_levels
# #                     )

# #                 # Try classroom relationship
# #                 elif hasattr(queryset.model, "classroom"):
# #                     return queryset.filter(
# #                         classroom__grade_level__education_level__in=allowed_education_levels
# #                     )

# #                 # Try education_level field directly
# #                 elif hasattr(queryset.model, "education_level"):
# #                     return queryset.filter(education_level__in=allowed_education_levels)

# #                 # If no recognizable relationship, log warning and return empty
# #                 logger.warning(f"⚠️ No section filtering rule for model {model_name}")
# #                 return queryset

# #         except Exception as e:
# #             logger.error(f"❌ Error applying section filters: {str(e)}", exc_info=True)
# #             return queryset

# #     def filter_students_by_section_access(self, queryset):
# #         """Filter students based on user's role and section"""
# #         return self.apply_section_filters(queryset)

# #     def filter_classrooms_by_section_access(self, queryset):
# #         """Filter classrooms based on user's role and section"""
# #         return self.apply_section_filters(queryset)


# # # 🔥 NEW: Automatic Section Enforcement Mixin
# # class AutoSectionFilterMixin(SectionFilterMixin):
# #     """
# #     Enhanced mixin that AUTOMATICALLY applies section filtering to get_queryset().
# #     Just add this mixin to any ViewSet and section filtering is enforced automatically.
# #     """

# #     def get_queryset(self):
# #         """
# #         Override get_queryset to automatically apply section filtering.
# #         This ensures ALL queries are filtered by section.
# #         """
# #         # Get the base queryset (from parent class or model)
# #         if hasattr(super(), "get_queryset"):
# #             queryset = super().get_queryset()
# #         else:
# #             queryset = (
# #                 self.queryset.all()
# #                 if hasattr(self, "queryset")
# #                 else self.model.objects.all()
# #             )

# #         # Apply section-based filtering
# #         filtered_queryset = self.apply_section_filters(queryset)

# #         return filtered_queryset


# # utils/section_filtering.py - FIXED VERSION
# # utils/section_filtering.py - FIXED VERSION
# from django.db.models import Q
# from classroom.models import Section
# import logging

# logger = logging.getLogger(__name__)


# class SectionFilterMixin:
#     """
#     Enhanced mixin to automatically filter querysets based on user's section and role.
#     """

#     def get_user_role(self):
#         """
#         Helper method to get user's role from various possible sources.
#         Returns role name as string in lowercase.
#         """
#         user = self.request.user

#         # Check if superuser first
#         if user.is_superuser:
#             logger.info(f"✅ User {user.username} is superuser")
#             return "superadmin"

#         # Check for role attribute directly on user
#         if hasattr(user, "role") and isinstance(user.role, str):
#             role = user.role.lower()
#             logger.info(f"📋 User {user.username} has role: {role}")
#             return role

#         # Check for userrole relationship (many-to-many)
#         if hasattr(user, "userrole"):
#             roles = user.userrole.roles.all()
#             if roles.exists():
#                 # Return the highest priority role
#                 role_names = [role.name.lower() for role in roles]

#                 # Priority order
#                 if "super_admin" in role_names or "superadmin" in role_names:
#                     return "superadmin"
#                 if "admin" in role_names or "principal" in role_names:
#                     return "admin"
#                 if "secondary_admin" in role_names:
#                     return "secondary_admin"
#                 if "nursery_admin" in role_names:
#                     return "nursery_admin"
#                 if "primary_admin" in role_names:
#                     return "primary_admin"
#                 if "junior_secondary_admin" in role_names:
#                     return "junior_secondary_admin"
#                 if "senior_secondary_admin" in role_names:
#                     return "senior_secondary_admin"
#                 if "teacher" in role_names:
#                     return "teacher"
#                 if "student" in role_names:
#                     return "student"
#                 if "parent" in role_names:
#                     return "parent"

#                 # Return first role if no priority match
#                 return role_names[0] if role_names else None

#         logger.warning(f"⚠️ No role found for user {user.username}")
#         return None

#     def get_user_section_access(self):
#         """
#         Returns the sections the current user has access to based on their role.
#         """
#         user = self.request.user
#         role = self.get_user_role()

#         logger.info(f"🔍 Getting section access for {user.username} with role: {role}")

#         # Super Admin sees everything
#         if role == "superadmin" or user.is_superuser:
#             logger.info("✅ Super admin access - returning all sections")
#             return Section.objects.all()

#         # Admin/Principal sees everything
#         if role in ["admin", "principal"]:
#             logger.info("✅ Admin access - returning all sections")
#             return Section.objects.all()

#         # Secondary Admin sees both JSS and SSS
#         if role == "secondary_admin":
#             logger.info("🔒 Secondary admin access")
#             return Section.objects.filter(
#                 grade_level__education_level__in=[
#                     "JUNIOR_SECONDARY",
#                     "SENIOR_SECONDARY",
#                 ]
#             ).distinct()

#         # Section-specific admins
#         if role in [
#             "nursery_admin",
#             "primary_admin",
#             "junior_secondary_admin",
#             "senior_secondary_admin",
#         ]:
#             role_to_education_level = {
#                 "nursery_admin": "NURSERY",
#                 "primary_admin": "PRIMARY",
#                 "junior_secondary_admin": "JUNIOR_SECONDARY",
#                 "senior_secondary_admin": "SENIOR_SECONDARY",
#             }
#             edu_level = role_to_education_level.get(role)
#             if edu_level:
#                 logger.info(f"🔒 Section admin access for {edu_level}")
#                 return Section.objects.filter(
#                     grade_level__education_level=edu_level
#                 ).distinct()

#         # Teachers see sections of their assigned classrooms
#         if role == "teacher":
#             try:
#                 from teacher.models import Teacher
#                 from classroom.models import Classroom

#                 teacher = Teacher.objects.get(user=user)

#                 assigned_classrooms = Classroom.objects.filter(
#                     Q(class_teacher=teacher)
#                     | Q(classroomteacherassignment__teacher=teacher)
#                 ).distinct()

#                 section_ids = assigned_classrooms.values_list(
#                     "section_id", flat=True
#                 ).distinct()

#                 sections = Section.objects.filter(id__in=section_ids)
#                 logger.info(f"🔒 Teacher access - {sections.count()} sections")
#                 return sections
#             except Exception as e:
#                 logger.error(f"Error getting teacher sections: {str(e)}")
#                 return Section.objects.none()

#         # Students see only their section
#         if role == "student":
#             try:
#                 from students.models import Student

#                 student = Student.objects.get(user=user)
#                 if hasattr(student, "current_classroom") and student.current_classroom:
#                     return Section.objects.filter(
#                         id=student.current_classroom.section_id
#                     )
#             except Exception as e:
#                 logger.error(f"Error getting student sections: {str(e)}")

#         logger.warning(f"⚠️ No section access for user {user.username} with role {role}")
#         return Section.objects.none()

#     def get_user_education_level_access(self):
#         """
#         Returns the specific education levels the user has access to.
#         More granular than section access.
#         """
#         user = self.request.user
#         role = self.get_user_role()

#         logger.info(
#             f"🎓 Getting education level access for {user.username} with role: {role}"
#         )

#         # Super Admin sees everything
#         if role == "superadmin" or user.is_superuser:
#             logger.info("✅ Super admin - all education levels")
#             return ["NURSERY", "PRIMARY", "JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

#         # General Admin/Principal sees everything
#         if role in ["admin", "principal"]:
#             logger.info("✅ Admin/Principal - all education levels")
#             return ["NURSERY", "PRIMARY", "JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

#         # Secondary Admin sees both JSS and SSS
#         if role == "secondary_admin":
#             logger.info("🔒 Secondary admin - JSS and SSS only")
#             return ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

#         # Section-specific admins - THIS IS THE KEY FIX
#         section_admin_mapping = {
#             "nursery_admin": ["NURSERY"],
#             "primary_admin": ["PRIMARY"],
#             "junior_secondary_admin": ["JUNIOR_SECONDARY"],
#             "senior_secondary_admin": ["SENIOR_SECONDARY"],
#         }

#         if role in section_admin_mapping:
#             levels = section_admin_mapping[role]
#             logger.info(f"🔒 Section admin '{role}' - restricted to: {levels}")
#             return levels

#         # For teachers, get from their assigned classrooms/subjects
#         if role == "teacher":
#             try:
#                 from teacher.models import Teacher
#                 from classroom.models import Classroom

#                 teacher = Teacher.objects.get(user=user)

#                 # Get education levels from assigned classrooms via section
#                 assigned_classrooms = Classroom.objects.filter(
#                     Q(class_teacher=teacher)
#                     | Q(classroomteacherassignment__teacher=teacher)
#                 ).select_related("section__grade_level")

#                 # Get education levels through section -> grade_level
#                 education_levels = set()
#                 for classroom in assigned_classrooms:
#                     if classroom.section and classroom.section.grade_level:
#                         education_levels.add(
#                             classroom.section.grade_level.education_level
#                         )

#                 levels = list(education_levels)
#                 logger.info(f"🔒 Teacher education level access: {levels}")
#                 return levels

#             except Exception as e:
#                 logger.error(f"Error getting teacher education levels: {str(e)}")
#                 return []

#         logger.warning(f"⚠️ No education level access for user {user.username}")
#         return []

#     def apply_section_filters(self, queryset):
#         """
#         🔥 Automatically apply section-based filtering to any queryset.
#         This is the core method that enforces section restrictions.
#         """
#         user = self.request.user
#         role = self.get_user_role()

#         # Get the model name to determine how to filter
#         model_name = queryset.model.__name__

#         logger.info(
#             f"🔍 Applying filters for {user.username} (role: {role}) on {model_name}"
#         )

#         # Super admins see everything - NO FILTERING
#         if role == "superadmin" or user.is_superuser:
#             logger.info(f"✅ Super admin - no filtering on {model_name}")
#             return queryset

#         # General admins/principals see everything - NO FILTERING
#         if role in ["admin", "principal"]:
#             logger.info(f"✅ Admin/Principal - no filtering on {model_name}")
#             return queryset

#         # Get user's allowed education levels
#         allowed_education_levels = self.get_user_education_level_access()

#         if not allowed_education_levels:
#             logger.warning(f"❌ No education level access for {user.username}")
#             return queryset.none()

#         logger.info(f"🔒 Restricting {model_name} to: {allowed_education_levels}")

#         # Apply filters based on model type
#         try:
#             # STUDENT MODELS
#             if model_name == "Student":
#                 filtered = queryset.filter(education_level__in=allowed_education_levels)
#                 logger.info(
#                     f"✅ Filtered Students: {filtered.count()} of {queryset.count()}"
#                 )
#                 return filtered

#             # CLASSROOM MODELS - FIXED: Use section relationship
#             elif model_name == "Classroom":
#                 # Filter through section -> grade_level -> education_level
#                 filtered = queryset.filter(
#                     section__grade_level__education_level__in=allowed_education_levels
#                 )
#                 logger.info(
#                     f"✅ Filtered Classrooms: {filtered.count()} of {queryset.count()}"
#                 )
#                 return filtered

#             # ENROLLMENT MODELS
#             elif model_name == "StudentEnrollment":
#                 return queryset.filter(
#                     student__education_level__in=allowed_education_levels
#                 )

#             # SUBJECT MODELS
#             elif model_name == "Subject":
#                 return queryset.filter(education_level__in=allowed_education_levels)

#             # GRADE LEVEL MODELS
#             elif model_name == "GradeLevel":
#                 return queryset.filter(education_level__in=allowed_education_levels)

#             # SECTION MODELS
#             elif model_name == "Section":
#                 return queryset.filter(
#                     grade_level__education_level__in=allowed_education_levels
#                 )

#             # EXAM/RESULT MODELS
#             elif model_name in ["ExamSession", "Exam"]:
#                 # Try multiple filtering approaches
#                 if hasattr(queryset.model, "education_level"):
#                     return queryset.filter(education_level__in=allowed_education_levels)
#                 elif hasattr(queryset.model, "grade_level"):
#                     return queryset.filter(
#                         grade_level__education_level__in=allowed_education_levels
#                     )
#                 return queryset

#             # SENIOR SECONDARY RESULTS
#             elif model_name in [
#                 "SeniorSecondaryResult",
#                 "SeniorSecondaryTermReport",
#                 "SeniorSecondarySessionResult",
#             ]:
#                 if "SENIOR_SECONDARY" in allowed_education_levels:
#                     logger.info(f"✅ Access granted to {model_name}")
#                     return queryset
#                 logger.warning(f"❌ No SSS access for {model_name}")
#                 return queryset.none()

#             # JUNIOR SECONDARY RESULTS
#             elif model_name in [
#                 "JuniorSecondaryResult",
#                 "JuniorSecondaryTermReport",
#                 "JuniorSecondarySessionResult",
#             ]:
#                 if "JUNIOR_SECONDARY" in allowed_education_levels:
#                     logger.info(f"✅ Access granted to {model_name}")
#                     return queryset
#                 logger.warning(f"❌ No JSS access for {model_name}")
#                 return queryset.none()

#             # PRIMARY RESULTS
#             elif model_name in [
#                 "PrimaryResult",
#                 "PrimaryTermReport",
#                 "PrimarySessionResult",
#             ]:
#                 if "PRIMARY" in allowed_education_levels:
#                     logger.info(f"✅ Access granted to {model_name}")
#                     return queryset
#                 logger.warning(f"❌ No Primary access for {model_name}")
#                 return queryset.none()

#             # NURSERY RESULTS
#             elif model_name in [
#                 "NurseryResult",
#                 "NurseryTermReport",
#                 "NurserySessionResult",
#             ]:
#                 if "NURSERY" in allowed_education_levels:
#                     logger.info(f"✅ Access granted to {model_name}")
#                     return queryset
#                 logger.warning(f"❌ No Nursery access for {model_name}")
#                 return queryset.none()

#             # TEACHER MODELS
#             elif model_name == "Teacher":
#                 from classroom.models import Classroom

#                 # Get classrooms in allowed education levels (via section)
#                 allowed_classrooms = Classroom.objects.filter(
#                     section__grade_level__education_level__in=allowed_education_levels
#                 )

#                 # Filter teachers by classroom assignments
#                 # Note: Teachers don't have direct 'classroom' field, only through assignments
#                 return queryset.filter(
#                     Q(classroomteacherassignment__classroom__in=allowed_classrooms)
#                     | Q(assigned_classes__in=allowed_classrooms)
#                 ).distinct()

#             # ATTENDANCE MODELS
#             elif model_name == "Attendance":
#                 return queryset.filter(
#                     student__education_level__in=allowed_education_levels
#                 )

#             # TIMETABLE MODELS
#             elif model_name == "Timetable":
#                 return queryset.filter(
#                     classroom__section__grade_level__education_level__in=allowed_education_levels
#                 )

#             # DEFAULT: Try common foreign key relationships
#             else:
#                 # Try student relationship
#                 if hasattr(queryset.model, "student"):
#                     return queryset.filter(
#                         student__education_level__in=allowed_education_levels
#                     )

#                 # Try classroom relationship (via section)
#                 elif hasattr(queryset.model, "classroom"):
#                     return queryset.filter(
#                         classroom__section__grade_level__education_level__in=allowed_education_levels
#                     )

#                 # Try education_level field directly
#                 elif hasattr(queryset.model, "education_level"):
#                     return queryset.filter(education_level__in=allowed_education_levels)

#                 # If no recognizable relationship, return unfiltered for safety
#                 logger.warning(
#                     f"⚠️ No filtering rule for {model_name}, returning unfiltered"
#                 )
#                 return queryset

#         except Exception as e:
#             logger.error(
#                 f"❌ Error applying section filters on {model_name}: {str(e)}",
#                 exc_info=True,
#             )
#             # On error, return unfiltered queryset to avoid breaking the app
#             return queryset

#     def filter_students_by_section_access(self, queryset):
#         """Filter students based on user's role and section"""
#         return self.apply_section_filters(queryset)

#     def filter_classrooms_by_section_access(self, queryset):
#         """Filter classrooms based on user's role and section"""
#         return self.apply_section_filters(queryset)


# # 🔥 Automatic Section Enforcement Mixin
# class AutoSectionFilterMixin(SectionFilterMixin):
#     """
#     Enhanced mixin that AUTOMATICALLY applies section filtering to get_queryset().
#     Just add this mixin to any ViewSet and section filtering is enforced automatically.
#     """

#     def get_queryset(self):
#         """
#         Override get_queryset to automatically apply section filtering.
#         This ensures ALL queries are filtered by section.
#         """
#         # Get the base queryset (from parent class or model)
#         if hasattr(super(), "get_queryset"):
#             queryset = super().get_queryset()
#         else:
#             queryset = (
#                 self.queryset.all()
#                 if hasattr(self, "queryset")
#                 else self.model.objects.all()
#             )

#         # Apply section-based filtering
#         filtered_queryset = self.apply_section_filters(queryset)

#         user = self.request.user
#         role = self.get_user_role()
#         model_name = queryset.model.__name__

#         logger.info(
#             f"📊 get_queryset result for {model_name}: "
#             f"User={user.username}, Role={role}, "
#             f"Original={queryset.count()}, Filtered={filtered_queryset.count()}"
#         )

#         return filtered_queryset

from django.db.models import Q
from classroom.models import Section
import logging

logger = logging.getLogger(__name__)


class SectionFilterMixin:
    """
    Enhanced mixin to automatically filter querysets based on user's section and role.
    """

    def get_user_role(self):
        """
        Helper method to get user's role from various possible sources.
        Returns role name as string in lowercase.
        """
        user = self.request.user

        # 🔥 FIX: Refresh user from database to get all attributes
        # This is needed because request.user might be a SimpleLazyObject
        if hasattr(user, "_wrapped"):
            # It's a SimpleLazyObject, force evaluation
            user = user._wrapped

        # If user has an ID, refresh from database to ensure we have all fields
        if hasattr(user, "id") and user.id:
            from users.models import CustomUser

            try:
                user = CustomUser.objects.get(id=user.id)
            except CustomUser.DoesNotExist:
                logger.warning(f"⚠️ User {user.username} not found in database")
                return None

        # Check if superuser first
        if user.is_superuser:
            logger.info(f"✅ User {user.username} is superuser")
            return "superadmin"

        # Check for role attribute directly on user
        if hasattr(user, "role") and user.role and isinstance(user.role, str):
            role = user.role.lower()
            logger.info(f"📋 User {user.username} has role: {role}")
            return role

        # Check for userrole relationship (many-to-many)
        if hasattr(user, "userrole"):
            roles = user.userrole.roles.all()
            if roles.exists():
                # Return the highest priority role
                role_names = [role.name.lower() for role in roles]

                # Priority order
                if "super_admin" in role_names or "superadmin" in role_names:
                    return "superadmin"
                if "admin" in role_names or "principal" in role_names:
                    return "admin"
                if "secondary_admin" in role_names:
                    return "secondary_admin"
                if "nursery_admin" in role_names:
                    return "nursery_admin"
                if "primary_admin" in role_names:
                    return "primary_admin"
                if "junior_secondary_admin" in role_names:
                    return "junior_secondary_admin"
                if "senior_secondary_admin" in role_names:
                    return "senior_secondary_admin"
                if "teacher" in role_names:
                    return "teacher"
                if "student" in role_names:
                    return "student"
                if "parent" in role_names:
                    return "parent"

                # Return first role if no priority match
                return role_names[0] if role_names else None

        logger.warning(f"⚠️ No role found for user {user.username}")
        return None

    def get_user_section_access(self):
        """
        Returns the sections the current user has access to based on their role.
        """
        user = self.request.user
        role = self.get_user_role()

        logger.info(f"🔍 Getting section access for {user.username} with role: {role}")

        # Super Admin sees everything
        if role == "superadmin" or user.is_superuser:
            logger.info("✅ Super admin access - returning all sections")
            return Section.objects.all()

        # Admin/Principal sees everything
        if role in ["admin", "principal"]:
            logger.info("✅ Admin access - returning all sections")
            return Section.objects.all()

        # Secondary Admin sees both JSS and SSS
        if role == "secondary_admin":
            logger.info("🔒 Secondary admin access")
            return Section.objects.filter(
                grade_level__education_level__in=[
                    "JUNIOR_SECONDARY",
                    "SENIOR_SECONDARY",
                ]
            ).distinct()

        # Section-specific admins
        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
        ]:
            role_to_education_level = {
                "nursery_admin": "NURSERY",
                "primary_admin": "PRIMARY",
                "junior_secondary_admin": "JUNIOR_SECONDARY",
                "senior_secondary_admin": "SENIOR_SECONDARY",
            }
            edu_level = role_to_education_level.get(role)
            if edu_level:
                logger.info(f"🔒 Section admin access for {edu_level}")
                return Section.objects.filter(
                    grade_level__education_level=edu_level
                ).distinct()

        # Teachers see sections of their assigned classrooms
        if role == "teacher":
            try:
                from teacher.models import Teacher
                from classroom.models import Classroom

                teacher = Teacher.objects.get(user=user)

                assigned_classrooms = Classroom.objects.filter(
                    Q(class_teacher=teacher)
                    | Q(classroomteacherassignment__teacher=teacher)
                ).distinct()

                section_ids = assigned_classrooms.values_list(
                    "section_id", flat=True
                ).distinct()

                sections = Section.objects.filter(id__in=section_ids)
                logger.info(f"🔒 Teacher access - {sections.count()} sections")
                return sections
            except Exception as e:
                logger.error(f"Error getting teacher sections: {str(e)}")
                return Section.objects.none()

        # Students see only their section
        if role == "student":
            try:
                from students.models import Student

                student = Student.objects.get(user=user)
                if hasattr(student, "current_classroom") and student.current_classroom:
                    return Section.objects.filter(
                        id=student.current_classroom.section_id
                    )
            except Exception as e:
                logger.error(f"Error getting student sections: {str(e)}")

        logger.warning(f"⚠️ No section access for user {user.username} with role {role}")
        return Section.objects.none()

    def get_user_education_level_access(self):
        """
        Returns the specific education levels the user has access to.
        More granular than section access.
        """
        user = self.request.user
        role = self.get_user_role()

        logger.info(
            f"🎓 Getting education level access for {user.username} with role: {role}"
        )

        # Super Admin sees everything
        if role == "superadmin" or user.is_superuser:
            logger.info("✅ Super admin - all education levels")
            return ["NURSERY", "PRIMARY", "JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

        # General Admin/Principal sees everything
        if role in ["admin", "principal"]:
            logger.info("✅ Admin/Principal - all education levels")
            return ["NURSERY", "PRIMARY", "JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

        # Secondary Admin sees both JSS and SSS
        if role == "secondary_admin":
            logger.info("🔒 Secondary admin - JSS and SSS only")
            return ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

        # Section-specific admins - THIS IS THE KEY FIX
        section_admin_mapping = {
            "nursery_admin": ["NURSERY"],
            "primary_admin": ["PRIMARY"],
            "junior_secondary_admin": ["JUNIOR_SECONDARY"],
            "senior_secondary_admin": ["SENIOR_SECONDARY"],
        }

        if role in section_admin_mapping:
            levels = section_admin_mapping[role]
            logger.info(f"🔒 Section admin '{role}' - restricted to: {levels}")
            return levels

        # For teachers, get from their assigned classrooms/subjects
        if role == "teacher":
            try:
                from teacher.models import Teacher
                from classroom.models import Classroom

                teacher = Teacher.objects.get(user=user)

                # Get education levels from assigned classrooms via section
                assigned_classrooms = Classroom.objects.filter(
                    Q(class_teacher=teacher)
                    | Q(classroomteacherassignment__teacher=teacher)
                ).select_related("section__grade_level")

                # Get education levels through section -> grade_level
                education_levels = set()
                for classroom in assigned_classrooms:
                    if classroom.section and classroom.section.grade_level:
                        education_levels.add(
                            classroom.section.grade_level.education_level
                        )

                levels = list(education_levels)
                logger.info(f"🔒 Teacher education level access: {levels}")
                return levels

            except Exception as e:
                logger.error(f"Error getting teacher education levels: {str(e)}")
                return []

        logger.warning(f"⚠️ No education level access for user {user.username}")
        return []

    def apply_section_filters(self, queryset):
        """
        Apply section-based filtering based on user role and access.
        Returns filtered queryset.
        """
        user = self.request.user
        role = self.get_user_role()

        # Skip filtering for superusers and staff
        if user.is_superuser or user.is_staff:
            logger.info(f"✅ Super admin - no filtering on {queryset.model.__name__}")
            return queryset

        # Get model name
        model_name = queryset.model.__name__

        # Get user's allowed education levels
        allowed_levels = self.get_user_education_level_access()

        if not allowed_levels:
            logger.info(f"⚠️ No education level access for user {user.username}")
            return queryset

        logger.info(f"🔒 Restricting {model_name} to: {allowed_levels}")

        # Apply filtering based on model type
        try:
            # For models with direct education_level field
            if hasattr(queryset.model, "education_level"):
                queryset = queryset.filter(education_level__in=allowed_levels)
                logger.info(f"✅ Filtered {model_name} by education_level field")

            # For Classroom model (has section -> grade_level -> education_level)
            elif model_name == "Classroom":
                queryset = queryset.filter(
                    section__grade_level__education_level__in=allowed_levels
                )
                logger.info(
                    f"✅ Filtered {model_name} by section__grade_level__education_level"
                )

            # For Teacher model - CORRECTED based on actual fields
            elif model_name == "Teacher":
                # Available fields: assigned_classes, classroom_assignments, primary_classes, subject_allocations
                # Build Q object for multiple possible relationships
                filters = Q()

                # Try assigned_classes (if it's a related name for a FK or M2M)
                if hasattr(queryset.model, "assigned_classes"):
                    filters |= Q(
                        assigned_classes__section__grade_level__education_level__in=allowed_levels
                    )

                # Try classroom_assignments
                if hasattr(queryset.model, "classroom_assignments"):
                    filters |= Q(
                        classroom_assignments__classroom__section__grade_level__education_level__in=allowed_levels
                    )

                # Try primary_classes (for class teachers)
                if hasattr(queryset.model, "primary_classes"):
                    filters |= Q(
                        primary_classes__section__grade_level__education_level__in=allowed_levels
                    )

                # Try subject_allocations
                if hasattr(queryset.model, "subject_allocations"):
                    filters |= Q(
                        subject_allocations__classroom__section__grade_level__education_level__in=allowed_levels
                    )

                # Apply filters if any were built
                if filters:
                    queryset = queryset.filter(filters).distinct()
                    logger.info(f"✅ Filtered {model_name} by classroom relationships")
                else:
                    # If no relationships found, return empty queryset for non-admin teachers
                    logger.warning(
                        f"⚠️ No classroom relationships found for Teacher model"
                    )
                    queryset = queryset.none()

            # For Section model (has grade_level FK)
            elif model_name == "Section":
                queryset = queryset.filter(
                    grade_level__education_level__in=allowed_levels
                )
                logger.info(f"✅ Filtered {model_name} by grade_level__education_level")

            # For GradeLevel model
            elif model_name == "GradeLevel":
                queryset = queryset.filter(education_level__in=allowed_levels)
                logger.info(f"✅ Filtered {model_name} by education_level")

            # For Student model
            elif model_name == "Student":
                # Assuming students have enrollments with sections
                queryset = queryset.filter(
                    studentenrollment__section__grade_level__education_level__in=allowed_levels
                ).distinct()
                logger.info(f"✅ Filtered {model_name} by enrollments")

            # For Subject model
            elif model_name == "Subject":
                if hasattr(queryset.model, "education_level"):
                    queryset = queryset.filter(education_level__in=allowed_levels)
                elif hasattr(queryset.model, "grade_levels"):
                    # Many-to-many relationship
                    queryset = queryset.filter(
                        grade_levels__education_level__in=allowed_levels
                    ).distinct()
                logger.info(f"✅ Filtered {model_name} by education_level")

            # For models with grade_level FK
            elif hasattr(queryset.model, "grade_level"):
                field = queryset.model._meta.get_field("grade_level")
                if field.is_relation:
                    queryset = queryset.filter(
                        grade_level__education_level__in=allowed_levels
                    )
                    logger.info(
                        f"✅ Filtered {model_name} by grade_level__education_level"
                    )

            logger.info(
                f"✅ Filtered {model_name}: {queryset.count()} of original records"
            )

        except Exception as e:
            logger.error(f"❌ Error filtering {model_name} for {role}: {str(e)}")
            # For safety, return empty queryset on error for non-admins
            # This prevents showing unauthorized data
            return queryset.model.objects.none()

        return queryset

    def filter_students_by_section_access(self, queryset):
        """Filter students based on user's role and section"""
        return self.apply_section_filters(queryset)

    def filter_classrooms_by_section_access(self, queryset):
        """Filter classrooms based on user's role and section"""
        return self.apply_section_filters(queryset)


# 🔥 Automatic Section Enforcement Mixin
class AutoSectionFilterMixin(SectionFilterMixin):
    """
    Enhanced mixin that AUTOMATICALLY applies section filtering to get_queryset().
    Just add this mixin to any ViewSet and section filtering is enforced automatically.
    """

    def get_queryset(self):
        """
        Override get_queryset to automatically apply section filtering.
        This ensures ALL queries are filtered by section.
        """
        # Get the base queryset (from parent class or model)
        if hasattr(super(), "get_queryset"):
            queryset = super().get_queryset()
        else:
            queryset = (
                self.queryset.all()
                if hasattr(self, "queryset")
                else self.model.objects.all()
            )

        # Apply section-based filtering
        filtered_queryset = self.apply_section_filters(queryset)

        user = self.request.user
        role = self.get_user_role()
        model_name = queryset.model.__name__

        logger.info(
            f"📊 get_queryset result for {model_name}: "
            f"User={user.username}, Role={role}, "
            f"Original={queryset.count()}, Filtered={filtered_queryset.count()}"
        )

        return filtered_queryset
