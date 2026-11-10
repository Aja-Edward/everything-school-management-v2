import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '@/services/api';
import AddAdminForm from './AddAdminForm';
import { ADMIN_ROLE_OPTIONS, OWNER_TITLE_OPTIONS, adminRoleLabel } from './adminRoles';
import { useAuth } from '@/hooks/useAuth';
import {
  Search,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  User,
  Mail,
  Clock,
  Calendar,
  X,
  ChevronLeft,
  BadgeCheck,
} from 'lucide-react';

interface Admin {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
  phone?: string;
  role?: string;
  // What others see in place of the admin's name (messages, announcements).
  admin_title?: string;
  // The account made when the school registered: the Proprietor/Proprietress.
  is_owner?: boolean;
  section?: string | null;
}

interface AssignState {
  admin: Admin;
  title: string;
  role: string;
  saving: boolean;
}

const AllAdmins = () => {
  const { user } = useAuth();
  // Only the owner assigns roles; the server refuses anyone else too.
  const canAssign = (user as any)?.role === 'superadmin' || (user as any)?.is_superuser === true;
  const [assign, setAssign] = useState<AssignState | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; admin: Admin | null }>({
    open: false,
    admin: null,
  });

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await api.get('/api/auth/admins/list/');
      const adminList = Array.isArray(response) ? response : [];
      setAdmins(adminList);
    } catch (error: any) {
      console.error('Error fetching admins:', error);
      toast.error('Failed to load admins.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (adminId: number, currentStatus: boolean) => {
    try {
      await api.patch(`/api/auth/users/${adminId}/activate/`, {
        is_active: !currentStatus,
      });
      toast.success(`Admin ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchAdmins();
    } catch (error: any) {
      console.error('Error toggling admin status:', error);
      toast.error(error?.response?.data?.error || 'Failed to update admin status');
    }
  };

  const openAssign = (admin: Admin) => {
    setAssign({
      admin,
      title: admin.admin_title || '',
      role: admin.role || 'admin',
      saving: false,
    });
  };

  const handleAssign = async () => {
    if (!assign) return;
    setAssign({ ...assign, saving: true });
    try {
      const payload: Record<string, string> = { admin_title: assign.title.trim() };
      if (!assign.admin.is_owner) payload.role = assign.role;
      await api.patch(`/api/auth/admins/${assign.admin.id}/`, payload);
      toast.success('Role updated');
      setAssign(null);
      fetchAdmins();
    } catch (error: any) {
      console.error('Error assigning admin role:', error);
      toast.error(error?.response?.data?.error || 'Failed to update role');
      setAssign(current => (current ? { ...current, saving: false } : current));
    }
  };

  const handleDeleteAdmin = async () => {
    if (!deleteModal.admin) return;

    try {
      await api.delete(`/api/auth/admins/${deleteModal.admin.id}/`);
      toast.success('Admin deleted successfully');
      setDeleteModal({ open: false, admin: null });
      fetchAdmins();
    } catch (error: any) {
      console.error('Error deleting admin:', error);
      // The server says why, e.g. the owner account can't be deleted.
      toast.error(error?.response?.data?.error || 'Failed to delete admin');
    }
  };

  const filteredAdmins = admins.filter((admin) => {
    const matchesSearch =
      (admin.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (admin.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (admin.first_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (admin.last_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (admin.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (admin.admin_title || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterStatus === 'all'
        ? true
        : filterStatus === 'active'
          ? admin.is_active
          : !admin.is_active;

    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getInitials = (admin: Admin) => {
    const first = admin.first_name?.[0] || '';
    const last = admin.last_name?.[0] || '';
    return (first + last).toUpperCase() || admin.username?.[0]?.toUpperCase() || 'A';
  };

  const activeCount = admins.filter((a) => a.is_active).length;
  const inactiveCount = admins.filter((a) => !a.is_active).length;

  if (showAddForm) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <button
          onClick={() => setShowAddForm(false)}
          className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Admin List
        </button>
        <AddAdminForm />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Admin Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage administrator accounts and permissions</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Admin
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{admins.length}</p>
              <p className="text-xs text-gray-500">Total Admins</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{activeCount}</p>
              <p className="text-xs text-gray-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
              <ShieldOff className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{inactiveCount}</p>
              <p className="text-xs text-gray-500">Inactive</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search admins..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filterStatus === 'all'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All ({admins.length})
              </button>
              <button
                onClick={() => setFilterStatus('active')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filterStatus === 'active'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Active ({activeCount})
              </button>
              <button
                onClick={() => setFilterStatus('inactive')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filterStatus === 'inactive'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Inactive ({inactiveCount})
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchAdmins}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto"></div>
            <p className="mt-3 text-sm text-gray-500">Loading admins...</p>
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">No admins found</p>
            <p className="text-xs text-gray-500">
              {searchTerm || filterStatus !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Click "Add Admin" to create one'}
            </p>
            {(searchTerm || filterStatus !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('all');
                }}
                className="mt-3 text-sm font-medium text-gray-900 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Admin
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAdmins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gray-900 rounded-full flex items-center justify-center text-white text-xs font-medium">
                          {getInitials(admin)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {admin.full_name || `${admin.first_name} ${admin.last_name}`.trim() || admin.username}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">@{admin.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                        {admin.is_owner && <BadgeCheck className="w-3.5 h-3.5 text-amber-600" />}
                        {admin.admin_title || (admin.role ? adminRoleLabel(admin.role) : 'Admin')}
                      </p>
                      {admin.role && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {admin.is_owner ? 'Super admin · whole school' : adminRoleLabel(admin.role)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        {admin.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          admin.is_active
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${admin.is_active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        {admin.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {formatDate(admin.date_joined)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <div>
                          <p>{formatDate(admin.last_login)}</p>
                          {admin.last_login && (
                            <p className="text-xs text-gray-400">{formatTime(admin.last_login)}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {canAssign && (
                          <button
                            onClick={() => openAssign(admin)}
                            className="px-2.5 py-1 text-xs font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                          >
                            Assign role
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleStatus(admin.id, admin.is_active)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                            admin.is_active
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                              : 'text-green-700 bg-green-50 hover:bg-green-100'
                          }`}
                        >
                          {admin.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => setDeleteModal({ open: true, admin })}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!loading && filteredAdmins.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
            Showing {filteredAdmins.length} of {admins.length} admin{admins.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Assign Role Modal */}
      {assign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !assign.saving && setAssign(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-5">
            <button
              onClick={() => setAssign(null)}
              disabled={assign.saving}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Assign role</h3>
            <p className="text-sm text-gray-500 mb-4">
              {assign.admin.full_name || assign.admin.username}
            </p>

            <label htmlFor="assign-title" className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            {assign.admin.is_owner ? (
              <select
                id="assign-title"
                value={OWNER_TITLE_OPTIONS.includes(assign.title) ? assign.title : ''}
                onChange={e => setAssign({ ...assign, title: e.target.value })}
                className="w-full p-2.5 text-sm border border-gray-300 rounded-lg bg-white"
              >
                <option value="">Proprietor/Proprietress</option>
                {OWNER_TITLE_OPTIONS.map(title => (
                  <option key={title} value={title}>{title}</option>
                ))}
              </select>
            ) : (
              <input
                id="assign-title"
                type="text"
                maxLength={100}
                value={assign.title}
                onChange={e => setAssign({ ...assign, title: e.target.value })}
                placeholder="e.g. School Admin 2, Vice Principal"
                className="w-full p-2.5 text-sm border border-gray-300 rounded-lg"
              />
            )}
            <p className="mt-1 text-xs text-gray-500">
              Shown instead of the admin's name on messages, announcements and reviews.
            </p>

            <label htmlFor="assign-role" className="block text-sm font-medium text-gray-700 mt-4 mb-1">
              Section
            </label>
            {assign.admin.is_owner ? (
              <p className="text-sm text-gray-600">The super admin always covers the whole school.</p>
            ) : (
              <>
                <select
                  id="assign-role"
                  value={assign.role}
                  onChange={e => setAssign({ ...assign, role: e.target.value })}
                  className="w-full p-2.5 text-sm border border-gray-300 rounded-lg bg-white"
                >
                  {ADMIN_ROLE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {ADMIN_ROLE_OPTIONS.find(option => option.value === assign.role)?.hint}
                </p>
              </>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setAssign(null)}
                disabled={assign.saving}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={assign.saving}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {assign.saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.admin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDeleteModal({ open: false, admin: null })}
          />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-5">
            <button
              onClick={() => setDeleteModal({ open: false, admin: null })}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Delete Admin</h3>
              <p className="text-sm text-gray-500">
                Are you sure you want to delete{' '}
                <span className="font-medium text-gray-900">
                  {deleteModal.admin.full_name || deleteModal.admin.username}
                </span>
                ? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal({ open: false, admin: null })}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAdmin}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllAdmins;
