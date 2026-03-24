from rest_framework import permissions
from django.contrib.auth import get_user_model

User = get_user_model()


class HasStudentsPermissionOrReadOnly(permissions.BasePermission):
    """
    Custom permission to check if user has students module access.
    Read permissions are allowed to any request.
    Write permissions require students write permission.
    """

    def has_permission(self, request, view):
        # Read permissions are allowed to any authenticated user
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated

        # Write permissions require specific permission
        is_platform_admin = (
            request.user.is_superuser or
            (hasattr(request.user, 'role') and request.user.role.upper() == 'SUPERADMIN')
        )

        return (
            request.user
            and request.user.is_authenticated
            and (
                request.user.is_staff
                or is_platform_admin
                or self._has_students_write_permission(request.user)
            )
        )

    def _has_students_write_permission(self, user):
        """Check if user has write permission for students module"""
        # Check user roles for students write permission
        if hasattr(user, "user_roles"):
            for user_role in user.user_roles.filter(is_active=True):
                if user_role.has_permission("students", "write"):
                    return True
        return False


class IsStudentOwnerOrStaff(permissions.BasePermission):
    """
    Permission class to allow students to only access their own data,
    while staff can access all student data.
    """

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        # Staff and platform admins can access any student record
        is_platform_admin = (
            request.user.is_superuser or
            (hasattr(request.user, 'role') and request.user.role.upper() == 'SUPERADMIN')
        )

        if request.user.is_staff or is_platform_admin:
            return True

        # Students can only access their own record
        if hasattr(request.user, "student_profile"):
            return obj == request.user.student_profile

        # Parents can access their children's records
        if hasattr(request.user, "parent_profile"):
            return obj in request.user.parent_profile.children.all()

        return False


class ModulePermissionBase(permissions.BasePermission):
    """
    Base class for module permissions.
    Set module_name as a class attribute in subclasses.
    """

    module_name = None
    permission_type = None

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if not request.user.is_active:
            return False

        # Get module name from class attribute or view
        module = self.module_name or getattr(view, "permission_module", None)
        if not module:
            return False

        # Determine permission type based on HTTP method
        if self.permission_type:
            perm_type = self.permission_type
        else:
            perm_type = self.get_permission_type_from_method(request.method)

        # Check if user has the required permission
        return self.user_has_permission(request.user, module, perm_type)

    def get_permission_type_from_method(self, method):
        """Map HTTP methods to permission types"""
        method_to_permission = {
            "GET": "read",
            "HEAD": "read",
            "OPTIONS": "read",
            "POST": "write",
            "PUT": "write",
            "PATCH": "write",
            "DELETE": "delete",
        }
        return method_to_permission.get(method.upper(), "read")

    def user_has_permission(self, user, module, permission_type):
        """Check if user has specific permission through their role assignments"""
        # Platform admins have full access to everything (both is_superuser flag and role='SUPERADMIN')
        is_platform_admin = (
            user.is_superuser or
            (hasattr(user, 'role') and user.role.upper() == 'SUPERADMIN')
        )

        if is_platform_admin:
            return True

        # Get all active role assignments for the user
        from schoolSettings.models import UserRole

        user_roles = UserRole.objects.filter(
            user=user, is_active=True
        ).prefetch_related("role", "role__permissions", "custom_permissions")

        for user_role in user_roles:
            # Skip expired assignments
            if user_role.is_expired():
                continue

            # Check custom permissions first (they override role permissions)
            custom_perm = user_role.custom_permissions.filter(
                module=module, permission_type=permission_type, granted=True
            ).first()

            if custom_perm:
                return True

            # Check role permissions
            if user_role.role.has_permission(module, permission_type):
                return True

        return False


# ============================================================================
# MODULE-SPECIFIC PERMISSIONS
# ============================================================================


class HasExamsPermission(ModulePermissionBase):
    """Permission for exams module"""

    module_name = "exams"


class HasTeachersPermission(ModulePermissionBase):
    """Permission for teachers module"""

    module_name = "teachers"


class PublicReadOnly(permissions.BasePermission):
    """
    Allow public read access, but require authentication for write operations.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True  # Allow public read access

        # Require authentication for write operations
        return request.user and request.user.is_authenticated and request.user.is_active


class HasStudentsPermission(ModulePermissionBase):
    """Permission for students module"""

    module_name = "students"


class HasAttendancePermission(ModulePermissionBase):
    """Permission for attendance module"""

    module_name = "attendance"


class HasResultsPermission(ModulePermissionBase):
    """Permission for results module"""

    module_name = "results"


class HasFinancePermission(ModulePermissionBase):
    """Permission for finance module"""

    module_name = "finance"


class HasReportsPermission(ModulePermissionBase):
    """Permission for reports module"""

    module_name = "reports"


class HasSettingsPermission(ModulePermissionBase):
    """Permission for settings module"""

    module_name = "settings"


class HasAnnouncementsPermission(ModulePermissionBase):
    """Permission for announcements module"""

    module_name = "announcements"


class HasMessagingPermission(ModulePermissionBase):
    """Permission for messaging module"""

    module_name = "messaging"


class HasClassroomPermission(ModulePermissionBase):
    """Permission for classroom module"""

    module_name = "classroom"


class HasSubjectsPermission(ModulePermissionBase):
    """Permission for subjects module"""

    module_name = "subjects"


class HasTimetablePermission(ModulePermissionBase):
    """Permission for timetable module"""

    module_name = "timetable"


class HasLibraryPermission(ModulePermissionBase):
    """Permission for library module"""

    module_name = "library"


class HasInventoryPermission(ModulePermissionBase):
    """Permission for inventory module"""

    module_name = "inventory"


class HasTransportPermission(ModulePermissionBase):
    """Permission for transport module"""

    module_name = "transport"


class ModulePermissionOrReadOnly(ModulePermissionBase):
    """
    Base class for module permissions with read-only access for authenticated users.
    Read permissions are allowed to any authenticated user.
    Write/Delete permissions require specific module permission.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Allow safe methods (GET, HEAD, OPTIONS) for all authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True

        # For write methods, check specific permissions
        return super().has_permission(request, view)


class HasAttendancePermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for attendance module (read-only variant)"""

    module_name = "attendance"


class HasExamsPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for exams module (read-only variant)"""

    module_name = "exams"


class HasTeachersPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for teachers module (read-only variant)"""

    module_name = "teachers"


class HasResultsPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for results module (read-only variant)"""

    module_name = "results"


class HasFinancePermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for finance module (read-only variant)"""

    module_name = "finance"


class HasReportsPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for reports module (read-only variant)"""

    module_name = "reports"


class HasSettingsPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for settings module (read-only variant)"""

    module_name = "settings"


class HasAnnouncementsPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for announcements module (read-only variant)"""

    module_name = "announcements"


class HasMessagingPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for messaging module (read-only variant)"""

    module_name = "messaging"


class HasClassroomPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for classroom module (read-only variant)"""

    module_name = "classroom"


class HasSubjectsPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for subjects module (read-only variant)"""

    module_name = "subjects"


class HasTimetablePermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for timetable module (read-only variant)"""

    module_name = "timetable"


class HasLibraryPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for library module (read-only variant)"""

    module_name = "library"


class HasInventoryPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for inventory module (read-only variant)"""

    module_name = "inventory"


class HasTransportPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for transport module (read-only variant)"""

    module_name = "transport"


class HasParentsPermissionOrReadOnly(ModulePermissionOrReadOnly):
    """Permission for parents module (read-only variant)"""

    module_name = "parents"


# ============================================================================
# SECTION-BASED PERMISSIONS
# ============================================================================


class SectionPermissionBase(permissions.BasePermission):
    """
    Check if user has access to specific school sections.
    Set section as a class attribute in subclasses.
    """

    section = None

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if not request.user.is_active:
            return False

        # Platform admins have access to all sections
        is_platform_admin = (
            request.user.is_superuser or
            (hasattr(request.user, 'role') and request.user.role.upper() == 'SUPERADMIN')
        )

        if is_platform_admin:
            return True

        # Get user's section access from role assignments
        from schoolSettings.models import UserRole

        user_roles = UserRole.objects.filter(user=request.user, is_active=True)

        for user_role in user_roles:
            if user_role.is_expired():
                continue

            # Check section access based on section type
            if self.section == "primary" and user_role.primary_section_access:
                return True
            elif self.section == "secondary" and user_role.secondary_section_access:
                return True
            elif self.section == "nursery" and user_role.nursery_section_access:
                return True

        return False


class HasPrimarySectionAccess(SectionPermissionBase):
    """Access to Primary Section (typically grades 1-6)"""

    section = "primary"


class HasSecondarySectionAccess(SectionPermissionBase):
    """Access to entire Secondary Section (JSS + SSS)"""

    section = "secondary"


class HasNurserySectionAccess(SectionPermissionBase):
    """Access to Nursery Section (pre-primary)"""

    section = "nursery"


# ============================================================================
# SUB-SECTION PERMISSIONS (Junior Secondary, Senior Secondary)
# ============================================================================


class SubSectionPermissionBase(permissions.BasePermission):
    """
    Check if user has access to specific sub-sections.
    This checks both section access AND grade level access.
    """

    section = None  # 'secondary', 'primary', etc.
    grade_levels = []  # List of grade level names

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if not request.user.is_active:
            return False

        # Platform admins have access to all sections
        is_platform_admin = (
            request.user.is_superuser or
            (hasattr(request.user, 'role') and request.user.role.upper() == 'SUPERADMIN')
        )

        if is_platform_admin:
            return True

        # Get user's section access from role assignments
        from schoolSettings.models import UserRole

        user_roles = UserRole.objects.filter(user=request.user, is_active=True)

        for user_role in user_roles:
            if user_role.is_expired():
                continue

            # Check if user has access to the parent section
            has_section_access = False
            if self.section == "primary" and user_role.primary_section_access:
                has_section_access = True
            elif self.section == "secondary" and user_role.secondary_section_access:
                has_section_access = True
            elif self.section == "nursery" and user_role.nursery_section_access:
                has_section_access = True

            if has_section_access:
                # If no specific grade levels specified in permission class, grant access
                if not self.grade_levels:
                    return True

                # Check if user has specific grade level restrictions
                allowed_grades = user_role.allowed_grade_levels

                # If no grade level restrictions set (None or empty list), grant access to all
                if not allowed_grades:
                    return True

                # Check if any of the permission's required grade levels match user's allowed grades
                # Use set intersection for efficient checking
                permission_grades = set(self.grade_levels)
                user_allowed_grades = set(allowed_grades)

                if permission_grades.intersection(user_allowed_grades):
                    return True

        return False


class HasJuniorSecondaryAccess(SubSectionPermissionBase):
    """
    Access to Junior Secondary School (JSS 1-3)
    Typically grades 7-9
    """

    section = "secondary"
    grade_levels = ["JSS 1", "JSS 2", "JSS 3"]


class HasSeniorSecondaryAccess(SubSectionPermissionBase):
    """
    Access to Senior Secondary School (SSS 1-3)
    Typically grades 10-12
    """

    section = "secondary"
    grade_levels = ["SSS 1", "SSS 2", "SSS 3"]


class HasLowerPrimaryAccess(SubSectionPermissionBase):
    """
    Access to Lower Primary (Primary 1-3)
    """

    section = "primary"
    grade_levels = ["Primary 1", "Primary 2", "Primary 3"]


class HasUpperPrimaryAccess(SubSectionPermissionBase):
    """
    Access to Upper Primary (Primary 4-6)
    """

    section = "primary"
    grade_levels = ["Primary 4", "Primary 5", "Primary 6"]


# ============================================================================
# ADMIN ROLE PERMISSIONS (Combines Module + Section)
# ============================================================================


class AdminRolePermissionBase(permissions.BasePermission):
    """
    Base class for admin roles that combine module permissions and section access.
    Checks if user has BOTH the required module permissions AND section access.
    """

    required_modules = (
        []
    )  # List of module names that should have at least 'read' permission
    section = None  # 'primary', 'secondary', 'nursery'
    grade_levels = []  # Optional: specific grade levels

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if not request.user.is_active:
            return False

        # Superusers have full access
        if request.user.is_superuser:
            return True

        from schoolSettings.models import UserRole

        user_roles = UserRole.objects.filter(
            user=request.user, is_active=True
        ).prefetch_related("role", "role__permissions")

        for user_role in user_roles:
            if user_role.is_expired():
                continue

            # Check section access
            has_section_access = False
            if self.section == "primary" and user_role.primary_section_access:
                has_section_access = True
            elif self.section == "secondary" and user_role.secondary_section_access:
                has_section_access = True
            elif self.section == "nursery" and user_role.nursery_section_access:
                has_section_access = True
            elif self.section is None:  # No section restriction
                has_section_access = True

            if not has_section_access:
                continue

            # Check if user has permissions for required modules
            has_all_module_permissions = True
            for module in self.required_modules:
                if not user_role.role.has_permission(module, "read"):
                    has_all_module_permissions = False
                    break

            if has_all_module_permissions:
                return True

        return False


class IsPrimaryAdmin(AdminRolePermissionBase):
    """
    Primary Section Administrator
    - Full access to primary section (grades 1-6)
    - Can manage students, teachers, attendance, exams, results
    """

    section = "primary"
    required_modules = [
        "students",
        "teachers",
        "attendance",
        "exams",
        "results",
        "classroom",
    ]


class IsSecondaryAdmin(AdminRolePermissionBase):
    """
    Secondary Section Administrator (Full Secondary)
    - Full access to entire secondary section (JSS + SSS)
    - Can manage students, teachers, attendance, exams, results
    """

    section = "secondary"
    required_modules = [
        "students",
        "teachers",
        "attendance",
        "exams",
        "results",
        "classroom",
    ]


class IsJuniorSecondaryAdmin(AdminRolePermissionBase):
    """
    Junior Secondary Administrator
    - Access to JSS 1-3 only
    - Can manage students, teachers, attendance, exams, results for junior secondary
    """

    section = "secondary"
    grade_levels = ["JSS 1", "JSS 2", "JSS 3"]
    required_modules = [
        "students",
        "teachers",
        "attendance",
        "exams",
        "results",
        "classroom",
    ]


class IsSeniorSecondaryAdmin(AdminRolePermissionBase):
    """
    Senior Secondary Administrator
    - Access to SSS 1-3 only
    - Can manage students, teachers, attendance, exams, results for senior secondary
    """

    section = "secondary"
    grade_levels = ["SSS 1", "SSS 2", "SSS 3"]
    required_modules = [
        "students",
        "teachers",
        "attendance",
        "exams",
        "results",
        "classroom",
    ]


class IsNurseryAdmin(AdminRolePermissionBase):
    """
    Nursery Section Administrator
    - Full access to nursery section
    - Can manage students, teachers, attendance
    """

    section = "nursery"
    required_modules = ["students", "teachers", "attendance", "classroom"]


class IsAcademicAdmin(AdminRolePermissionBase):
    """
    Academic Administrator (Cross-section)
    - Can access all sections
    - Focused on academic modules: exams, results, subjects, timetable
    """

    section = None  # Access all sections
    required_modules = ["exams", "results", "subjects", "timetable", "reports"]


class IsFinanceAdmin(AdminRolePermissionBase):
    """
    Finance Administrator
    - Can access all sections
    - Focused on financial operations
    """

    section = None  # Access all sections
    required_modules = ["finance", "reports"]


# ============================================================================
# COMBINED PERMISSIONS (OR Logic)
# ============================================================================


class IsSectionAdmin(permissions.BasePermission):
    """
    Check if user is an admin for ANY section
    (Primary OR Secondary OR Nursery OR Junior Secondary OR Senior Secondary)
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Platform admins have full access
        is_platform_admin = (
            request.user.is_superuser or
            (hasattr(request.user, 'role') and request.user.role.upper() == 'SUPERADMIN')
        )

        if is_platform_admin:
            return True

        # Check if user has any admin role
        admin_permissions = [
            IsPrimaryAdmin(),
            IsSecondaryAdmin(),
            IsJuniorSecondaryAdmin(),
            IsSeniorSecondaryAdmin(),
            IsNurseryAdmin(),
        ]

        for perm in admin_permissions:
            if perm.has_permission(request, view):
                return True

        return False


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Allow any section admin to write, but allow authenticated users to read
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Read permissions for authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write permissions for admins only
        return IsSectionAdmin().has_permission(request, view)


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================


def get_user_sections(user):
    """
    Get all sections a user has access to
    Returns: dict with keys 'primary', 'secondary', 'nursery', 'allowed_grade_levels'
    """
    # Platform admins have access to all sections
    is_platform_admin = (
        user.is_superuser or
        (hasattr(user, 'role') and user.role.upper() == 'SUPERADMIN')
    )

    if is_platform_admin:
        return {
            "primary": True,
            "secondary": True,
            "nursery": True,
            "junior_secondary": True,
            "senior_secondary": True,
            "allowed_grade_levels": None,  # None means access to all grades
        }

    from schoolSettings.models import UserRole

    user_roles = UserRole.objects.filter(user=user, is_active=True)

    sections = {
        "primary": False,
        "secondary": False,
        "nursery": False,
        "junior_secondary": False,
        "senior_secondary": False,
        "allowed_grade_levels": set(),  # Collect all allowed grade levels
    }

    for user_role in user_roles:
        if user_role.is_expired():
            continue

        # Collect allowed grade levels from all active roles
        if user_role.allowed_grade_levels:
            sections["allowed_grade_levels"].update(user_role.allowed_grade_levels)

        if user_role.primary_section_access:
            sections["primary"] = True
        if user_role.secondary_section_access:
            sections["secondary"] = True
            # Check if they have grade level restrictions for secondary
            if user_role.allowed_grade_levels:
                # Parse allowed grades to determine JSS/SSS access
                jss_grades = {"JSS 1", "JSS 2", "JSS 3"}
                sss_grades = {"SSS 1", "SSS 2", "SSS 3", "SS 1", "SS 2", "SS 3"}
                user_grades = set(user_role.allowed_grade_levels)

                if user_grades.intersection(jss_grades):
                    sections["junior_secondary"] = True
                if user_grades.intersection(sss_grades):
                    sections["senior_secondary"] = True
            else:
                # No restrictions, grant access to both
                sections["junior_secondary"] = True
                sections["senior_secondary"] = True
        if user_role.nursery_section_access:
            sections["nursery"] = True

    # Convert allowed_grade_levels set to list for JSON serialization
    # If empty, set to None (means access to all grades in assigned sections)
    sections["allowed_grade_levels"] = (
        list(sections["allowed_grade_levels"]) if sections["allowed_grade_levels"] else None
    )

    return sections


def get_user_permissions(user):
    """
    Get all module permissions for a user
    Returns: dict mapping module names to list of permission types
    """
    # Platform admins have all permissions
    is_platform_admin = (
        user.is_superuser or
        (hasattr(user, 'role') and user.role.upper() == 'SUPERADMIN')
    )

    if is_platform_admin:
        return {"all": ["read", "write", "delete"]}

    from schoolSettings.models import UserRole

    user_roles = UserRole.objects.filter(user=user, is_active=True).prefetch_related(
        "role", "role__permissions", "custom_permissions"
    )

    permissions = {}

    for user_role in user_roles:
        if user_role.is_expired():
            continue

        # Add role permissions
        for perm in user_role.role.permissions.filter(granted=True):
            if perm.module not in permissions:
                permissions[perm.module] = set()
            permissions[perm.module].add(perm.permission_type)

        # Add/override with custom permissions
        for custom_perm in user_role.custom_permissions.all():
            if custom_perm.granted:
                if custom_perm.module not in permissions:
                    permissions[custom_perm.module] = set()
                permissions[custom_perm.module].add(custom_perm.permission_type)
            elif custom_perm.module in permissions:
                # Remove if explicitly denied
                permissions[custom_perm.module].discard(custom_perm.permission_type)

    # Convert sets to lists
    return {module: list(perms) for module, perms in permissions.items()}
