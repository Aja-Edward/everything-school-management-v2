import { useState, useEffect } from 'react';
import { 
  Shield, 
  Settings2, 
  PlusCircle, 
  UserCheck,  
  Users, 
  Trash2, 
  Copy,
  Edit,
  Save,
  X,
  UserPlus,
} from 'lucide-react';
import ToggleSwitch from '@/components/dashboards/admin/settingtab/components/ToggleSwitch';
import api from '@/services/api'; // ✅ removed API_BASE_URL — not needed anymore

// ==================== TYPE DEFINITIONS ====================
interface Permission {
  id: number;
  module: string;
  module_display: string;
  permission_type: string;
  permission_type_display: string;
  section: string;
  section_display: string;
  granted: boolean;
}

interface Role {
  id: number;
  name: string;
  description: string;
  color: string;
  is_system: boolean;
  is_active: boolean;
  user_count: number;
  permissions: Permission[];
  permissions_dict: Record<string, Record<string, boolean>>;
  primary_section_access: boolean;
  secondary_section_access: boolean;
  nursery_section_access: boolean;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

interface UserRole {
  id: number;
  user: number;
  user_name: string;
  user_email: string;
  role: number;
  role_name: string;
  role_color: string;
  primary_section_access: boolean;
  secondary_section_access: boolean;
  nursery_section_access: boolean;
  custom_permissions: Permission[];
  assigned_by_name: string;
  assigned_at: string;
  expires_at: string | null;
  is_active: boolean;
}

// ==================== PERMISSION UTILITIES ====================
const isSuperAdmin = (user: any) =>
  user?.role === 'superadmin' || user?.is_superuser === true;

const isSectionAdmin = (user: any) =>
  ['secondary_admin', 'senior_secondary_admin', 'junior_secondary_admin', 'primary_admin', 'nursery_admin']
    .includes(user?.role);

const canManageRolesPermissions = (user: any) => isSuperAdmin(user);

// ==================== MAIN COMPONENT ====================
const RolesPermissions = () => {
  const [activeTab, setActiveTab] = useState('roles');
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Role management
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRole, setNewRole] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    primary_section_access: true,
    secondary_section_access: true,
    nursery_section_access: true,
    permissions: [] as number[]
  });

  // Permission management
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [editingRolePermissions, setEditingRolePermissions] = useState<Role | null>(null);

  // User role assignment
  const [showAssignRole, setShowAssignRole] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [userRoleAssignment, setUserRoleAssignment] = useState({
    primary_section_access: true,
    secondary_section_access: true,
    nursery_section_access: true,
    expires_at: '',
    is_active: true
  });

  // View users for a role
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [roleUsers, setRoleUsers] = useState<any[]>([]);
  const [selectedRoleForUsers, setSelectedRoleForUsers] = useState<Role | null>(null);

  // ==================== HELPERS ====================
  const showSuccess = (msg: string) => setSuccessMessage(msg);
  const showError = (msg: string) => setErrorMessage(msg);

  useEffect(() => {
    if (successMessage) setTimeout(() => setSuccessMessage(null), 3000);
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) setTimeout(() => setErrorMessage(null), 5000);
  }, [errorMessage]);

  // ==================== LOAD CURRENT USER ====================
  useEffect(() => {
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser && canManageRolesPermissions(currentUser)) {
      loadRoles();
      loadUsers();
      loadUserRoles();
      loadPermissions();
    }
  }, [currentUser]);

  const loadCurrentUser = async () => {
    try {
      // ✅ api.get sends HttpOnly cookie automatically
      const userData = await api.get('/auth/profile/');
      setCurrentUser(userData);

      if (isSectionAdmin(userData)) {
        showError(
          'You do not have permission to manage roles and permissions. ' +
          'Only superadmins can access this feature.'
        );
      }
    } catch (error) {
      console.error('Failed to load current user:', error);
      showError('Failed to verify user permissions.');
    }
  };

  // ==================== LOAD DATA ====================
  const loadRoles = async () => {
    try {
      setLoading(true);
      const data = await api.get('/school-settings/roles/');
      setRoles(data.results || data);
    } catch (error) {
      console.error('Failed to load roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const usersData = await api.get('/profiles/all_users/');
      setUsers(usersData);
    } catch (error) {
      // Fallback: try teachers endpoint
      console.warn('Failed to load all_users, falling back to teachers:', error);
      try {
        const teachersData = await api.get('/teachers/teachers/');
        const teachers = teachersData.results || teachersData;
        const teachersArray = Array.isArray(teachers) ? teachers : [teachers];
        const allUsers: User[] = teachersArray.map((teacher: any) => ({
          id: teacher.user?.id || teacher.id,
          username: teacher.user?.username || teacher.username,
          email: teacher.user?.email || teacher.email,
          full_name: teacher.user?.full_name || teacher.full_name || `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim(),
          role: 'Teacher',
          is_active: teacher.user?.is_active ?? teacher.is_active ?? true
        }));
        setUsers(allUsers);
      } catch (fallbackError) {
        console.error('Failed to load teachers as fallback:', fallbackError);
      }
    }
  };

  const loadUserRoles = async () => {
    try {
      const data = await api.get('/school-settings/user-roles/');
      setUserRoles(data.results || data);
    } catch (error) {
      console.error('Failed to load user roles:', error);
    }
  };

  const loadPermissions = async () => {
    try {
      const data = await api.get('/school-settings/permissions/');
      setPermissions(data.results || data);
    } catch (error) {
      console.error('Failed to load permissions:', error);
    }
  };

  const viewRoleUsers = async (role: Role) => {
    try {
      const data = await api.get(`/school-settings/roles/${role.id}/users/`);
      setRoleUsers(data.users || []);
      setSelectedRoleForUsers(role);
      setShowUsersModal(true);
    } catch (error) {
      console.error('Failed to load users for role:', error);
      showError('Failed to load users for this role.');
    }
  };

  // ==================== CREATE ROLE ====================
  const createRole = async () => {
    if (!canManageRolesPermissions(currentUser)) {
      showError('You do not have permission to create roles.');
      return;
    }

    try {
      setSaving(true);
      await api.post('/school-settings/roles/', newRole);
      showSuccess('Role created successfully!');
      setShowCreateRole(false);
      setNewRole({
        name: '',
        description: '',
        color: '#3B82F6',
        primary_section_access: true,
        secondary_section_access: true,
        nursery_section_access: true,
        permissions: []
      });
      loadRoles();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to create role');
    } finally {
      setSaving(false);
    }
  };

  // ==================== ASSIGN ROLE ====================
  const assignRoleToUser = async () => {
    if (!canManageRolesPermissions(currentUser)) {
      showError('You do not have permission to assign roles.');
      return;
    }
    if (!selectedUser || !selectedRole) return;

    try {
      setSaving(true);
      const existingUserRole = userRoles.find(
        ur => ur.user === selectedUser.id && ur.role === selectedRole.id
      );

      const payload = { user: selectedUser.id, role: selectedRole.id, ...userRoleAssignment };

      if (existingUserRole) {
        await api.put(`/school-settings/user-roles/${existingUserRole.id}/`, payload);
        showSuccess(`Role "${selectedRole.name}" updated for ${selectedUser.full_name} successfully!`);
      } else {
        await api.post('/school-settings/user-roles/', payload);
        showSuccess(`Role "${selectedRole.name}" assigned to ${selectedUser.full_name} successfully!`);
      }

      setShowAssignRole(false);
      setSelectedUser(null);
      setSelectedRole(null);
      setUserRoleAssignment({
        primary_section_access: true,
        secondary_section_access: true,
        nursery_section_access: true,
        expires_at: '',
        is_active: true
      });
      loadUserRoles();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to assign role');
    } finally {
      setSaving(false);
    }
  };

  // ==================== DELETE ROLE ====================
  const deleteRole = async (roleId: number) => {
    if (!canManageRolesPermissions(currentUser)) {
      showError('You do not have permission to delete roles.');
      return;
    }
    if (!confirm('Are you sure you want to delete this role?')) return;

    try {
      await api.delete(`/school-settings/roles/${roleId}/`);
      showSuccess('Role deleted successfully!');
      loadRoles();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to delete role');
    }
  };

  // ==================== DUPLICATE ROLE ====================
  const duplicateRole = async (role: Role) => {
    if (!canManageRolesPermissions(currentUser)) {
      showError('You do not have permission to duplicate roles.');
      return;
    }

    try {
      await api.post(`/school-settings/roles/${role.id}/duplicate/`, {});
      showSuccess('Role duplicated successfully!');
      loadRoles();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to duplicate role');
    }
  };

  // ==================== EDIT PERMISSIONS ====================
  const editRolePermissions = (role: Role) => {
    setEditingRolePermissions(role);
    setSelectedPermissions(role.permissions_dict);
    setShowPermissionModal(true);
  };

  const saveRolePermissions = async () => {
    if (!canManageRolesPermissions(currentUser)) {
      showError('You do not have permission to modify role permissions.');
      return;
    }
    if (!editingRolePermissions) return;

    try {
      setSaving(true);

      // Build a lookup map for permissions
      const permissionMap = new Map<string, Permission>();
      permissions.forEach(p => {
        [
          `${p.module}:${p.permission_type}`,
          `${p.module_display}:${p.permission_type}`,
          `${p.module}:${p.permission_type_display}`,
          `${p.module_display}:${p.permission_type_display}`,
          `${p.module.toLowerCase()}:${p.permission_type.toLowerCase()}`,
          `${p.module_display.toLowerCase()}:${p.permission_type.toLowerCase()}`,
        ].forEach(key => permissionMap.set(key, p));
      });

      const permissionIds: number[] = [];
      Object.entries(selectedPermissions).forEach(([module, perms]) => {
        Object.entries(perms).forEach(([permType, granted]) => {
          if (!granted) return;
          const keys = [
            `${module}:${permType}`,
            `${module.toLowerCase()}:${permType.toLowerCase()}`,
          ];
          for (const key of keys) {
            const permission = permissionMap.get(key);
            if (permission) {
              permissionIds.push(permission.id);
              break;
            }
          }
        });
      });

      const payload = {
        name: editingRolePermissions.name,
        description: editingRolePermissions.description,
        color: editingRolePermissions.color,
        primary_section_access: editingRolePermissions.primary_section_access,
        secondary_section_access: editingRolePermissions.secondary_section_access,
        nursery_section_access: editingRolePermissions.nursery_section_access,
        permissions: permissionIds,
        is_active: editingRolePermissions.is_active
      };

      await api.patch(`/school-settings/roles/${editingRolePermissions.id}/`, payload);
      showSuccess('Role permissions updated successfully!');
      await loadRoles();
      setShowPermissionModal(false);
      setEditingRolePermissions(null);
      setSelectedPermissions({});
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to update role permissions');
    } finally {
      setSaving(false);
    }
  };

  // ==================== CREATE SECONDARY ADMIN ====================
  const createSecondarySectionAdminRole = async () => {
    if (!canManageRolesPermissions(currentUser)) {
      showError('You do not have permission to create roles.');
      return;
    }

    try {
      setSaving(true);
      const secondaryPermissions = permissions
        .filter(p => p.section === 'secondary' || p.section === 'all')
        .map(p => p.id);

      await api.post('/school-settings/roles/', {
        name: 'Secondary Section Admin',
        description: 'Oversees activities of teachers and students in the secondary section. Reports to the general admin.',
        color: '#8B5CF6',
        primary_section_access: false,
        secondary_section_access: true,
        nursery_section_access: false,
        permissions: secondaryPermissions
      });

      showSuccess('Secondary Section Admin role created successfully!');
      loadRoles();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to create Secondary Section Admin role');
    } finally {
      setSaving(false);
    }
  };

  // ==================== REVOKE USER ROLE ====================
  const revokeUserRole = async (userRoleId: number) => {
    if (!canManageRolesPermissions(currentUser)) {
      showError('You do not have permission to revoke role assignments.');
      return;
    }
    if (!confirm('Are you sure you want to revoke this role assignment?')) return;

    try {
      await api.delete(`/school-settings/user-roles/${userRoleId}/`);
      showSuccess('Role assignment revoked successfully!');
      loadUserRoles();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to revoke role assignment');
    }
  };

  // ==================== EDIT USER ROLE ====================
  const editUserRoleAssignment = (userRole: UserRole) => {
    setSelectedUser({
      id: userRole.user,
      username: userRole.user_name,
      email: userRole.user_email,
      full_name: userRole.user_name,
      role: userRole.role_name,
      is_active: userRole.is_active
    });
    setSelectedRole({
      id: userRole.role,
      name: userRole.role_name,
      description: '',
      color: userRole.role_color,
      is_system: false,
      is_active: true,
      user_count: 0,
      permissions: [],
      permissions_dict: {},
      primary_section_access: userRole.primary_section_access,
      secondary_section_access: userRole.secondary_section_access,
      nursery_section_access: userRole.nursery_section_access,
      created_by_name: '',
      created_at: '',
      updated_at: ''
    });
    setUserRoleAssignment({
      primary_section_access: userRole.primary_section_access,
      secondary_section_access: userRole.secondary_section_access,
      nursery_section_access: userRole.nursery_section_access,
      expires_at: userRole.expires_at || '',
      is_active: userRole.is_active
    });
    setShowAssignRole(true);
  };

  // ==================== LOADING STATE ====================
  if (!currentUser) {
    return (
      <div className="space-y-8">
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
            <p className="text-slate-600 mt-2">Checking permissions...</p>
          </div>
        </div>
      </div>
    );
  }

  // ==================== RENDER ====================
  return (
    <div className="space-y-8">
      {/* Messages */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 text-sm">{successMessage}</p>
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{errorMessage}</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-inner">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold text-slate-900">Roles & Permissions</h3>
              {isSuperAdmin(currentUser) && (
                <p className="text-xs text-slate-500">Superadmin Access</p>
              )}
            </div>
          </div>

          {isSuperAdmin(currentUser) && (
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateRole(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                Create Role
              </button>
              <button
                onClick={createSecondarySectionAdminRole}
                disabled={saving}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Creating...</>
                ) : (
                  <><Shield className="w-4 h-4" />Create Secondary Section Admin</>
                )}
              </button>
              <button
                onClick={() => setShowAssignRole(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Assign Role
              </button>
            </div>
          )}
        </div>

        <p className="text-slate-600 mb-6">
          Manage user roles and fine-tune permissions for various modules in your system.
          Create custom roles with section-specific access and assign them to users.
        </p>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-slate-100 rounded-lg p-1 mb-6">
          {[
            { key: 'roles', icon: Shield, label: 'Roles' },
            { key: 'assignments', icon: UserCheck, label: 'Role Assignments' }
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 inline mr-2" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Roles Tab ── */}
        {activeTab === 'roles' && (
          <div className="space-y-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                <p className="text-slate-600 mt-2">Loading roles...</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {roles.map((role) => (
                  <div key={role.id} className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: role.color }} />
                        <div>
                          <h4 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            {role.name}
                            {role.is_system && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">System</span>
                            )}
                          </h4>
                          <p className="text-slate-600 text-sm">{role.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500">{role.user_count} users</span>
                        <button onClick={() => viewRoleUsers(role)} className="p-2 text-slate-400 hover:text-purple-600 transition-colors" title="View users">
                          <Users className="w-4 h-4" />
                        </button>
                        <button onClick={() => editRolePermissions(role)} className="p-2 text-slate-400 hover:text-green-600 transition-colors" title="Edit permissions">
                          <Settings2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => duplicateRole(role)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="Duplicate role">
                          <Copy className="w-4 h-4" />
                        </button>
                        {!role.is_system && (
                          <button onClick={() => deleteRole(role.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Delete role">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Section Access */}
                    <div className="mb-4">
                      <h5 className="text-sm font-medium text-slate-700 mb-2">Section Access</h5>
                      <div className="flex gap-4">
                        {[
                          { label: 'Primary', value: role.primary_section_access },
                          { label: 'Secondary', value: role.secondary_section_access },
                          { label: 'Nursery', value: role.nursery_section_access },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${value ? 'bg-green-500' : 'bg-slate-300'}`} />
                            <span className="text-sm text-slate-600">{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Permissions Summary */}
                    <div>
                      <h5 className="text-sm font-medium text-slate-700 mb-2">Permissions</h5>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.entries(role.permissions_dict).slice(0, 8).map(([module, perms]) => (
                          <div key={module} className="text-xs">
                            <span className="font-medium text-slate-700">{module}:</span>
                            <div className="flex gap-1 mt-1">
                              {Object.entries(perms).map(([permType, granted]) => (
                                <div
                                  key={permType}
                                  className={`w-2 h-2 rounded-full ${granted ? 'bg-green-500' : 'bg-slate-200'}`}
                                  title={`${permType}: ${granted ? 'Granted' : 'Denied'}`}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      {Object.keys(role.permissions_dict).length > 8 && (
                        <p className="text-xs text-slate-500 mt-2">
                          +{Object.keys(role.permissions_dict).length - 8} more modules
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Assignments Tab ── */}
        {activeTab === 'assignments' && (
          <div className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    {['User', 'Role', 'Sections', 'Assigned By', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left py-3 px-4 font-medium text-slate-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userRoles.map((userRole) => (
                    <tr key={userRole.id} className="border-b border-slate-100">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{userRole.user_name}</p>
                        <p className="text-xs text-slate-500">{userRole.user_email}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="px-2 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: `${userRole.role_color}20`, color: userRole.role_color }}
                        >
                          {userRole.role_name}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {userRole.primary_section_access && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Primary</span>}
                          {userRole.secondary_section_access && <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">Secondary</span>}
                          {userRole.nursery_section_access && <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">Nursery</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{userRole.assigned_by_name}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${userRole.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {userRole.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button onClick={() => editUserRoleAssignment(userRole)} className="p-1 text-slate-400 hover:text-green-600 transition-colors" title="Edit">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => revokeUserRole(userRole.id)} className="p-1 text-slate-400 hover:text-red-600 transition-colors" title="Revoke">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Create Role Modal ── */}
      {showCreateRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">Create New Role</h3>
              <button onClick={() => setShowCreateRole(false)} className="p-2 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Role Name</label>
                <input
                  type="text"
                  value={newRole.name}
                  onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                  placeholder="Enter role name"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                <textarea
                  value={newRole.description}
                  onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                  placeholder="Enter role description"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Color</label>
                <input
                  type="color"
                  value={newRole.color}
                  onChange={(e) => setNewRole({ ...newRole, color: e.target.value })}
                  className="w-full h-12 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Section Access</label>
                <div className="space-y-2">
                  {[
                    { id: 'primary-access', field: 'primary_section_access', label: 'Primary Section' },
                    { id: 'secondary-access', field: 'secondary_section_access', label: 'Secondary Section' },
                    { id: 'nursery-access', field: 'nursery_section_access', label: 'Nursery Section' },
                  ].map(({ id, field, label }) => (
                    <div key={id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={id}
                        checked={newRole[field as keyof typeof newRole] as boolean}
                        onChange={(e) => setNewRole({ ...newRole, [field]: e.target.checked })}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor={id} className="text-sm text-slate-700">{label}</label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={createRole}
                disabled={saving || !newRole.name.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Creating...</> : <><Save className="w-4 h-4" />Create Role</>}
              </button>
              <button onClick={() => setShowCreateRole(false)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Role Modal ── */}
      {showAssignRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">
                {selectedUser && selectedRole ? 'Edit Role Assignment' : 'Assign Role to User'}
              </h3>
              <button onClick={() => setShowAssignRole(false)} className="p-2 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Select User</label>
                <select
                  value={selectedUser?.id || ''}
                  onChange={(e) => setSelectedUser(users.find(u => u.id === parseInt(e.target.value)) || null)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                >
                  <option value="">Choose a user...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} - {user.role} ({user.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Select Role</label>
                <select
                  value={selectedRole?.id || ''}
                  onChange={(e) => setSelectedRole(roles.find(r => r.id === parseInt(e.target.value)) || null)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                >
                  <option value="">Choose a role...</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Section Access</label>
                <div className="space-y-2">
                  {[
                    { id: 'user-primary-access', field: 'primary_section_access', label: 'Primary Section' },
                    { id: 'user-secondary-access', field: 'secondary_section_access', label: 'Secondary Section' },
                    { id: 'user-nursery-access', field: 'nursery_section_access', label: 'Nursery Section' },
                  ].map(({ id, field, label }) => (
                    <div key={id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={id}
                        checked={userRoleAssignment[field as keyof typeof userRoleAssignment] as boolean}
                        onChange={(e) => setUserRoleAssignment({ ...userRoleAssignment, [field]: e.target.checked })}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor={id} className="text-sm text-slate-700">{label}</label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Expiration Date (Optional)</label>
                <input
                  type="datetime-local"
                  value={userRoleAssignment.expires_at}
                  onChange={(e) => setUserRoleAssignment({ ...userRoleAssignment, expires_at: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="user-role-active"
                  checked={userRoleAssignment.is_active}
                  onChange={(e) => setUserRoleAssignment({ ...userRoleAssignment, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="user-role-active" className="text-sm text-slate-700">Active</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={assignRoleToUser}
                disabled={saving || !selectedUser || !selectedRole}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {saving
                  ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />{selectedUser && selectedRole ? 'Updating...' : 'Assigning...'}</>
                  : <><UserPlus className="w-4 h-4" />{selectedUser && selectedRole ? 'Update Assignment' : 'Assign Role'}</>
                }
              </button>
              <button onClick={() => setShowAssignRole(false)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Permission Management Modal ── */}
      {showPermissionModal && editingRolePermissions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">
                Edit Permissions: {editingRolePermissions.name}
              </h3>
              <button onClick={() => setShowPermissionModal(false)} className="p-2 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {Object.entries(selectedPermissions).map(([module, perms]) => (
                <div key={module} className="border border-slate-200 rounded-lg p-4">
                  <h4 className="text-lg font-semibold text-slate-800 mb-4">{module}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(perms).map(([permType, granted]) => (
                      <div key={permType} className="flex items-center justify-between">
                        <span className="text-sm text-slate-700 capitalize">{permType}</span>
                        <ToggleSwitch
                          id={`${module}-${permType}`}
                          checked={granted}
                          onChange={(checked) => {
                            setSelectedPermissions(prev => ({
                              ...prev,
                              [module]: { ...prev[module], [permType]: checked }
                            }));
                          }}
                          label=""
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveRolePermissions}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving...</> : <><Save className="w-4 h-4" />Save Permissions</>}
              </button>
              <button onClick={() => setShowPermissionModal(false)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Users Modal ── */}
      {showUsersModal && selectedRoleForUsers && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">
                Users with Role: {selectedRoleForUsers.name}
              </h3>
              <button onClick={() => setShowUsersModal(false)} className="p-2 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {roleUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {['User', 'Email', 'Sections', 'Assigned By', 'Assigned Date', 'Expires', 'Status'].map(h => (
                        <th key={h} className="text-left py-3 px-4 font-medium text-slate-700">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roleUsers.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{user.full_name}</div>
                          <div className="text-xs text-slate-500">@{user.username}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{user.email}</td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            {user.primary_section_access && <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Primary</span>}
                            {user.secondary_section_access && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Secondary</span>}
                            {user.nursery_section_access && <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">Nursery</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{user.assigned_by || 'System'}</td>
                        <td className="py-3 px-4 text-slate-600">{new Date(user.assigned_at).toLocaleDateString()}</td>
                        <td className="py-3 px-4 text-slate-600">{user.expires_at ? new Date(user.expires_at).toLocaleDateString() : 'Never'}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No users have been assigned to this role yet.</p>
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button onClick={() => setShowUsersModal(false)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesPermissions;