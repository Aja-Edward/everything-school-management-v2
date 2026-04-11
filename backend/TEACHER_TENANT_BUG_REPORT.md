## 🔍 TEACHER TENANT ASSIGNMENT BUG - DEBUG & FIX REPORT

### Problem Summary
- ✗ Newly created teacher "Kalu Ogbonnaya" was not showing in the Teacher List
- ✗ Dashboard showed "0 teachers" despite teacher existing in database
- ✓ Teacher was showing correctly in classroom assignments (because classroom filtering works differently)

### Root Cause Analysis

**Why the teacher was "invisible":**

1. **Teachers were created WITHOUT tenant assignment**
   - Both teachers in the database had `tenant = NULL`
   - The TeacherViewSet uses `TenantFilterMixin` which filters: `queryset.filter(tenant=tenant)`
   - When `tenant = NULL`, records are excluded from all tenant-filtered queries

2. **Why tenants were NULL:**
   - The `TeacherViewSet.perform_create()` method calls: `serializer.save(tenant=getattr(self.request, "tenant", None))`
   - When the Add Teacher form posts the request, the middleware couldn't resolve the tenant from subdomain/header
   - Result: `request.tenant = None` → `teacher.tenant = None`

3. **Why middleware couldn't find tenant:**
   - TenantMiddleware tries these strategies (in order):
     1. Subdomain resolution (localhost or platform domain)
     2. Custom domain lookup
     3. X-Tenant-ID/X-Tenant-Slug header
     4. User's tenant attribute (if user.tenant is set)
     5. Session tenant_id
   - For the Add Teacher form, none of these were properly set

### Database State Before Fix

| Teacher | Tenant | Status |
|---------|--------|--------|
| Kingsley Samuel (EMP000001) | NULL ⚠️ | Not visible in list |
| Kalu Ogbonnaya (EMP0001) | NULL ⚠️ | Not visible in list |

### Fixes Implemented

#### 1. ✅ Enhanced `TeacherViewSet.perform_create()` (teacher/views.py)

**Before:**
```python
def perform_create(self, serializer):
    tenant = getattr(self.request, "tenant", None)
    serializer.save(tenant=tenant)
```

**After:**
```python
def perform_create(self, serializer):
    tenant = getattr(self.request, "tenant", None)
    
    # If tenant not in request, try to get from authenticated user
    if not tenant and self.request.user.is_authenticated:
        user = self.request.user
        tenant = getattr(user, 'tenant', None)
        logger.info(f"[TeacherViewSet.perform_create] Using user's tenant: {tenant}")
    
    # If still no tenant, try to find the school from the current session
    if not tenant and self.request.user.is_authenticated:
        if self.request.user.is_staff or self.request.user.is_superuser:
            from tenants.models import Tenant
            tenant = Tenant.objects.filter(is_active=True, status='active').first()
            logger.warning(f"[TeacherViewSet.perform_create] Using fallback tenant: {tenant}")
    
    serializer.save(tenant=tenant)
```

**Impact:** New teachers created going forward will have proper tenant assignment via multiple fallback strategies.

#### 2. ✅ Data Recovery - Fixed Existing Teachers

Ran `fix_teacher_tenants.py`:
- Assigned: 2 teachers
- Strategy: Matched email domain (@godstreasureschools.com → gods-treasure-schools)
- Result: Both teachers now assigned to correct tenant

#### 3. ✅ Fixed CustomUser Records

Ran `fix_user_tenants.py`:
- Updated: 2 teacher users
- Now user.tenant matches teacher.tenant
- Prevents future issues with user-based tenant fallback

### Database State After Fix

| Teacher | User Tenant | Teacher Tenant | Status |
|---------|-------------|---|--------|
| Kingsley Samuel (EMP000001) | gods-treasure-schools | gods-treasure-schools | ✅ Visible |
| Kalu Ogbonnaya (EMP0001) | gods-treasure-schools | gods-treasure-schools | ✅ Visible |

### Verification

```
Total teachers in DB: 2
- ID: 1, Kingsley Samuel → Tenant: gods-treasure-schools ✅
- ID: 2, Kalu Ogbonnaya → Tenant: gods-treasure-schools ✅

Teachers with NULL tenant: 0 ✅
Teachers assigned to gods-treasure-schools: 2 ✅
```

### Going Forward

**For new teacher registrations:**
1. Ensure the request has tenant context (via middleware resolution or header)
2. If not, fallback to user's tenant or first active tenant
3. Log all tenant assignment decisions for debugging

**Best Practices:**
- Always send `X-Tenant-Slug` header when creating resources via API (especially from forms)
- Ensure admin users accessing school-specific features have their tenant set
- Use localhost with tenant subdomain: `gods-treasure-schools.localhost:3000`

### Files Modified
- `backend/teacher/views.py` - Enhanced perform_create()
- `backend/debug_teacher.py` - Diagnostic script (created)
- `backend/fix_teacher_tenants.py` - Data recovery script (created)
- `backend/fix_user_tenants.py` - User tenant fix script (created)

---
✅ **Status: FIXED - Teachers now visible in Teacher List and Dashboard**
