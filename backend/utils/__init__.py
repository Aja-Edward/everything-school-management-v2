from datetime import datetime


def generate_unique_username(role: str, registration_number: str = None, employee_id: str = None, school_code: str = None, tenant=None) -> str:
    """
    Generate a unique username in the format:
    PREFIX/SCHOOL_CODE/MONTH/YEAR/ID

    Args:
        role: User role (student, teacher, parent, admin)
        registration_number: For students
        employee_id: For teachers
        school_code: Override school code (if None, will fetch from TenantSettings)
        tenant: Tenant object to get school code from

    Returns:
        Generated username string
    """
    from users.models import CustomUser  # Import inside the function to avoid AppRegistryNotReady

    prefix_map = {
        'student': 'STU',
        'teacher': 'TCH',
        'parent': 'PAR',
        'admin': 'ADM',
        'superadmin': 'ADM',
        'secondary_admin': 'ADM',
        'senior_secondary_admin': 'ADM',
        'junior_secondary_admin': 'ADM',
        'primary_admin': 'ADM',
        'nursery_admin': 'ADM',
    }
    prefix = prefix_map.get(role.lower(), 'USR')

    # Get school code from parameter, tenant, or fallback
    if school_code is None:
        try:
            if tenant and hasattr(tenant, 'settings'):
                school_code = tenant.settings.school_code or "SCH"
            else:
                # Try to get from first active tenant as fallback
                from tenants.models import Tenant
                first_tenant = Tenant.objects.filter(is_active=True).first()
                if first_tenant and hasattr(first_tenant, 'settings'):
                    school_code = first_tenant.settings.school_code or "SCH"
                else:
                    school_code = "SCH"
        except Exception:
            # Fallback if TenantSettings doesn't exist or database not ready
            school_code = "SCH"
    
    now = datetime.now()
    month = now.strftime('%b').upper()  # e.g., 'NOV'
    year = now.strftime('%y')           # e.g., '25'

    # Determine the ID part based on role and provided data
    if role.lower() == 'student' and registration_number:
        # Use registration number for students, but ensure uniqueness
        base_username = f"{prefix}/{school_code}/{month}/{year}/{registration_number}"
        
        # Check if this exact username already exists
        if CustomUser.objects.filter(username=base_username).exists():
            # If registration number already exists, append a suffix
            counter = 1
            while CustomUser.objects.filter(username=f"{base_username}-{counter}").exists():
                counter += 1
            id_part = f"{registration_number}-{counter}"
        else:
            id_part = registration_number
            
    elif role.lower() == 'teacher' and employee_id:
        # Use employee ID for teachers, but ensure uniqueness
        base_username = f"{prefix}/{school_code}/{month}/{year}/{employee_id}"
        
        # Check if this exact username already exists
        if CustomUser.objects.filter(username=base_username).exists():
            # If employee ID already exists, append a suffix
            counter = 1
            while CustomUser.objects.filter(username=f"{base_username}-{counter}").exists():
                counter += 1
            id_part = f"{employee_id}-{counter}"
        else:
            id_part = employee_id
            
    else:
        # For parents and admins, or when no specific ID is provided, use auto-increment
        pattern = f"{prefix}/{school_code}/{month}/{year}/"
        existing_usernames = CustomUser.objects.filter(username__startswith=pattern)
        max_regnum = 0
        for user in existing_usernames:
            try:
                # Extract the last part and try to convert to number
                last_part = user.username.split('/')[-1]
                # Handle cases where the last part might have a suffix (e.g., "0001-2")
                base_num = last_part.split('-')[0]
                regnum = int(base_num)
                if regnum > max_regnum:
                    max_regnum = regnum
            except (ValueError, IndexError):
                continue
        id_part = f"{max_regnum + 1:04d}"  # 4 digits for parents/admins (0001, 0002, etc.)

    username = f"{prefix}/{school_code}/{month}/{year}/{id_part}"
    return username


def get_default_school_code():
    """
    Helper function to get school code for migrations.
    This ensures migrations don't fail when SchoolSettings doesn't exist yet.
    """
    return "SCH"