import React, { useState, useEffect } from 'react';
import {
  Search, Plus, Edit, Trash2, Eye, User,
  Phone, MapPin, Users, GraduationCap, X,
  Power, PowerOff,
} from 'lucide-react';
import { toast } from 'react-toastify';
import ParentService, {
  Parent, CreateParentData, UpdateParentData,
} from '@/services/ParentService';
import api from '@/services/api';
import ParentViewModal from "@/components/dashboards/admin/ParentViewModal";
import ParentBulkUploadMenu from "@/components/dashboards/admin/ParentBulkUploadMenu";

// ---------------------------------------------------------------------------
// Main list component
// ---------------------------------------------------------------------------

const ParentListNew: React.FC = () => {
  const [parents,          setParents]          = useState<Parent[]>([]);
  const [filteredParents,  setFilteredParents]  = useState<Parent[]>([]);
  const [selectedParent,   setSelectedParent]   = useState<Parent | null>(null);
  const [showModal,        setShowModal]        = useState(false);
  const [showViewModal,    setShowViewModal]    = useState(false);
  const [modalMode,        setModalMode]        = useState<'edit' | 'create'>('create'); // ← 'view' removed
  const [searchTerm,       setSearchTerm]       = useState('');
  const [showDeleteConfirm,setShowDeleteConfirm]= useState<number | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState<string | null>(null);
  const [toggleLoading,    setToggleLoading]    = useState<number | null>(null);
  const [viewMode,         setViewMode]         = useState<'cards' | 'list'>('cards');

  // Credential popup
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [parentUsername,      setParentUsername]      = useState<string | null>(null);
  const [parentPassword,      setParentPassword]      = useState<string | null>(null);

  // Filters
  const [streamFilter,         setStreamFilter]         = useState('all');
  const [educationLevelFilter, setEducationLevelFilter] = useState('all');

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchParents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ParentService.getParents();
      const parentsArray = Array.isArray(response) ? response : [];

      const sanitizedParents = parentsArray.map((parent) => {
        const userData =
          parent.user && typeof parent.user === 'object'
            ? (parent.user as any)
            : {};
        return {
          ...parent,
          user:            userData.email      || parent.user            || '',
          user_first_name: userData.first_name || parent.user_first_name || '',
          user_last_name:  userData.last_name  || parent.user_last_name  || '',
          parent_contact:  parent.parent_contact  || '',
          parent_address:  parent.parent_address  || '',
          students:        Array.isArray(parent.students) ? parent.students : [],
          is_active:       Boolean(parent.is_active),
        };
      });

      setParents(sanitizedParents);
      setFilteredParents(sanitizedParents);
    } catch (err) {
      console.error('Error fetching parents:', err);
      setError('Failed to load parents. Please try again.');
      setParents([]);
      setFilteredParents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchParents(); }, []);

  // ── Filter ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const filtered = parents.filter((parent) => {
      const email     = typeof parent.user === 'string' ? parent.user : '';
      const firstName = parent.user_first_name || '';
      const lastName  = parent.user_last_name  || '';

      const matchesSearch =
        email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lastName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStream =
        streamFilter === 'all' ||
        parent.students.some((c) => c.stream_name === streamFilter);

      const matchesLevel =
        educationLevelFilter === 'all' ||
        parent.students.some(
          (c) => c.education_level_display === educationLevelFilter
        );

      return matchesSearch && matchesStream && matchesLevel;
    });
    setFilteredParents(filtered);
  }, [searchTerm, parents, streamFilter, educationLevelFilter]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleToggleStatus = async (parent: Parent) => {
    try {
      setToggleLoading(parent.id);
      if (parent.is_active) {
        await ParentService.deactivateParent(parent.id);
      } else {
        await ParentService.activateParent(parent.id);
      }
      setParents((prev) =>
        prev.map((p) =>
          p.id === parent.id ? { ...p, is_active: !p.is_active } : p
        )
      );
      toast.success(
        `Parent ${parent.is_active ? 'deactivated' : 'activated'} successfully!`
      );
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update parent status');
    } finally {
      setToggleLoading(null);
    }
  };

  // View opens dedicated modal — no longer touches showModal/modalMode
  const handleView = (parent: Parent) => {
    setSelectedParent(parent);
    setShowViewModal(true);
  };

  const handleEdit = (parent: Parent) => {
    setSelectedParent(parent);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleCreate = () => {
    setSelectedParent(null);
    setModalMode('create');
    setShowModal(true);
  };

  const handleDelete = (parentId: number) => setShowDeleteConfirm(parentId);

  const confirmDelete = async () => {
    if (!showDeleteConfirm) return;
    try {
      await ParentService.deleteParent(showDeleteConfirm);
      setParents((prev) => prev.filter((p) => p.id !== showDeleteConfirm));
      toast.success('Parent deleted successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete parent');
    } finally {
      setShowDeleteConfirm(null);
    }
  };

  const handleSave = async (formData: CreateParentData | UpdateParentData) => {
    try {
      if (modalMode === 'create') {
        const newParent = await ParentService.createParent(
          formData as CreateParentData
        );
        toast.success('Parent created successfully!');
        if (newParent.parent_username && newParent.parent_password) {
          setParentUsername(newParent.parent_username);
          setParentPassword(newParent.parent_password);
          setShowCredentialModal(true);
        }
        await fetchParents();
      } else if (modalMode === 'edit' && selectedParent) {
        await ParentService.updateParent(
          selectedParent.id,
          formData as UpdateParentData
        );
        toast.success('Parent updated successfully!');
        await fetchParents();
      }
      setShowModal(false);
      setSelectedParent(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save parent');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedParent(null);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const statusColor = (isActive: boolean) =>
    isActive ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';

  const statusIcon = (isActive: boolean) =>
    isActive ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />;

  // ── Loading / error guards ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 text-xl mb-4">{error}</p>
          <button
            onClick={fetchParents}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Parent Management</h1>
              <p className="text-gray-600 mt-2">Manage all parent accounts and their children</p>
            </div>

            <div className="flex gap-3 items-center">
              <button
                onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm"
              >
                {viewMode === 'cards' ? 'List View' : 'Card View'}
              </button>

              <ParentBulkUploadMenu />

              <button
                onClick={handleCreate}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Parent
              </button>
            </div>
          </div>
        </div>

        {/* ── Search & filters ── */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search parents by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={educationLevelFilter}
                onChange={(e) => setEducationLevelFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="all">All Education Levels</option>
                <option value="Nursery">Nursery</option>
                <option value="Primary">Primary</option>
                <option value="Junior Secondary">Junior Secondary</option>
                <option value="Senior Secondary">Senior Secondary</option>
                <option value="Secondary (Legacy)">Secondary (Legacy)</option>
              </select>

              <select
                value={streamFilter}
                onChange={(e) => setStreamFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="all">All Streams</option>
                <option value="Science">Science</option>
                <option value="Arts">Arts</option>
                <option value="Commercial">Commercial</option>
                <option value="Technical">Technical</option>
              </select>

              <span className="text-sm text-gray-500">
                {filteredParents.length} of {parents.length} parents
              </span>
            </div>
          </div>
        </div>

        {/* ── Card grid ── */}
        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredParents.map((parent) => (
              <div
                key={parent.id}
                className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow min-w-0"
              >
                {/* Card header */}
                <div className="flex justify-between items-start mb-4 gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {parent.user_first_name} {parent.user_last_name}
                      </h3>
                      <p className="text-sm text-gray-600 truncate">
                        {typeof parent.user === 'string' ? parent.user : ''}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 flex-shrink-0 ${statusColor(parent.is_active)}`}
                  >
                    {statusIcon(parent.is_active)}
                    <span className="hidden sm:inline">
                      {parent.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </span>
                </div>

                {/* Contact info */}
                <div className="space-y-2 mb-4">
                  {parent.parent_contact && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{parent.parent_contact}</span>
                    </div>
                  )}
                  {parent.parent_address && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{parent.parent_address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="w-4 h-4 flex-shrink-0" />
                    <span>
                      {parent.students.length}{' '}
                      {parent.students.length === 1 ? 'child' : 'children'}
                    </span>
                  </div>
                </div>

                {/* Children preview */}
                {parent.students.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Children
                    </h4>
                    <div className="space-y-1">
                      {parent.students.map((child) => (
                        <div key={child.id} className="flex items-center gap-2 text-sm">
                          <GraduationCap className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700 truncate flex-1">
                            {child.full_name}
                          </span>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {child.education_level_display || child.education_level}
                            {child.stream_name && ` · ${child.stream_name}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Card actions */}
                <div className="flex flex-col gap-2 pt-4 border-t border-gray-100">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleView(parent)}
                      className="flex-1 py-2 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> View
                    </button>
                    <button
                      onClick={() => handleEdit(parent)}
                      className="flex-1 py-2 text-xs bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100 transition-colors flex items-center justify-center gap-1"
                    >
                      <Edit className="w-3 h-3" /> Edit
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleStatus(parent)}
                      disabled={toggleLoading === parent.id}
                      className="flex-1 py-2 text-xs bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {toggleLoading === parent.id ? (
                        <div className="w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                      ) : (
                        statusIcon(!parent.is_active)
                      )}
                      {parent.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDelete(parent.id)}
                      className="flex-1 py-2 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── List / table view ── */
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {['Parent', 'Contact', 'Children', 'Streams', 'Status', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredParents.map((parent) => (
                    <tr
                      key={parent.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm font-medium text-gray-900">
                          {parent.user_first_name} {parent.user_last_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {typeof parent.user === 'string' ? parent.user : ''}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm text-gray-900">
                          {parent.parent_contact || 'N/A'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {parent.parent_address || 'N/A'}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm text-gray-900">
                          {parent.students.length}{' '}
                          {parent.students.length === 1 ? 'child' : 'children'}
                        </p>
                        <p className="text-sm text-gray-500 truncate max-w-[180px]">
                          {parent.students.map((c) => c.full_name).join(', ')}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm text-gray-900">
                          {[...new Set(
                            parent.students.map((c) => c.stream_name).filter(Boolean)
                          )].join(', ') || 'None'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {[...new Set(
                            parent.students
                              .map((c) => c.education_level_display)
                              .filter(Boolean)
                          )].join(', ')}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(parent.is_active)}`}
                        >
                          {statusIcon(parent.is_active)}
                          {parent.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleView(parent)}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(parent)}
                            className="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(parent)}
                            disabled={toggleLoading === parent.id}
                            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            {toggleLoading === parent.id ? (
                              <div className="w-4 h-4 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                            ) : (
                              statusIcon(!parent.is_active)
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(parent.id)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
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
          </div>
        )}

        {/* ── Empty state ── */}
        {filteredParents.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No parents found</h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Try adjusting your search terms.'
                : 'Get started by adding your first parent.'}
            </p>
            {!searchTerm && (
              <button
                onClick={handleCreate}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Parent
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Delete confirmation ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this parent? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit / Create modal ── */}
      {showModal && (
        <ParentModal
          parent={selectedParent}
          mode={modalMode}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}

      {/* ── View modal ── */}
      {showViewModal && selectedParent && (
        <ParentViewModal
          parent={selectedParent}
          onClose={() => {
            setShowViewModal(false);
            setSelectedParent(null);
          }}
          onEdit={() => {
            setShowViewModal(false);
            setModalMode('edit');
            setShowModal(true);
          }}
        />
      )}

      {/* ── Credential modal ── */}
      {showCredentialModal && parentUsername && parentPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4 text-blue-700">
              Parent account credentials
            </h3>
            <div className="mb-4 p-4 bg-blue-50 rounded-lg space-y-3">
              <div className="text-sm text-gray-800 flex items-center gap-2 flex-wrap">
                <span className="font-semibold">Username:</span>
                <span className="font-mono bg-white px-2 py-1 rounded border border-gray-200">
                  {parentUsername}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(parentUsername)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Copy
                </button>
              </div>
              <div className="text-sm text-gray-800 flex items-center gap-2 flex-wrap">
                <span className="font-semibold">Password:</span>
                <span className="font-mono bg-white px-2 py-1 rounded border border-gray-200">
                  {parentPassword}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(parentPassword)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Copy
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Share these credentials securely. The parent should change their
              password on first login.
            </p>
            <button
              onClick={() => {
                setShowCredentialModal(false);
                setParentUsername(null);
                setParentPassword(null);
              }}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ParentModal — edit & create only (view is now ParentViewModal)
// ---------------------------------------------------------------------------

interface ParentModalProps {
  parent: Parent | null;
  mode: 'edit' | 'create'; // ← 'view' removed
  onSave: (data: CreateParentData | UpdateParentData) => void;
  onClose: () => void;
}

interface StudentOption {
  id: number;
  full_name: string;
  education_level_display?: string;
  student_class_display?: string;
  stream_name?: string;
}

const ParentModal: React.FC<ParentModalProps> = ({ parent, mode, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    user_email:      typeof parent?.user === 'string' ? parent.user : '',
    user_first_name: parent?.user_first_name || '',
    user_last_name:  parent?.user_last_name  || '',
    phone:           parent?.parent_contact  || '',
    address:         parent?.parent_address  || '',
    student_ids:     parent?.students?.map((s) => s.id) || [],
  });

  const [availableStudents,  setAvailableStudents]  = useState<StudentOption[]>([]);
  const [loadingStudents,    setLoadingStudents]    = useState(false);
  const [searchStudentTerm,  setSearchStudentTerm]  = useState('');

  // Fetch students for linking
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setLoadingStudents(true);
        const response = await api.get('/api/students/students/');
        const data = Array.isArray(response)
          ? response
          : (response as any).results ?? [];
        setAvailableStudents(data);
      } catch (err: any) {
        if (err.response?.status !== 404) {
          toast.error(`Failed to load students: ${err.message}`);
        }
      } finally {
        setLoadingStudents(false);
      }
    };
    fetchStudents();
  }, []); // ← no mode check needed — this modal is never opened in view mode

  // Sync form when parent prop changes (e.g. switching between records)
  useEffect(() => {
    if (parent) {
      const userData =
        parent.user && typeof parent.user === 'object'
          ? (parent.user as any)
          : {};
      setFormData({
        user_email:      userData.email      || (typeof parent.user === 'string' ? parent.user : '') || '',
        user_first_name: userData.first_name || parent.user_first_name || '',
        user_last_name:  userData.last_name  || parent.user_last_name  || '',
        phone:           parent.parent_contact || '',
        address:         parent.parent_address || '',
        student_ids:     parent.students?.map((s) => s.id) || [],
      });
    } else {
      setFormData({
        user_email: '', user_first_name: '', user_last_name: '',
        phone: '', address: '', student_ids: [],
      });
    }
  }, [parent]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleStudentToggle = (id: number) => {
    setFormData((prev) => ({
      ...prev,
      student_ids: prev.student_ids.includes(id)
        ? prev.student_ids.filter((s) => s !== id)
        : [...prev.student_ids, id],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const filtered = availableStudents.filter((s) =>
    s.full_name.toLowerCase().includes(searchStudentTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {mode === 'create' ? 'Add new parent' : 'Edit parent'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address *
              </label>
              <input
                type="email" name="user_email"
                value={typeof formData.user_email === 'string' ? formData.user_email : ''}
                onChange={handleInputChange} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                First name *
              </label>
              <input
                type="text" name="user_first_name"
                value={formData.user_first_name}
                onChange={handleInputChange} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Last name *
              </label>
              <input
                type="text" name="user_last_name"
                value={formData.user_last_name}
                onChange={handleInputChange} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Contact number
              </label>
              <input
                type="tel" name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Address
              </label>
              <input
                type="text" name="address"
                value={formData.address}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Student linking */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Link students (optional)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Select students to link now, or do it later.
              </p>

              {loadingStudents ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={searchStudentTerm}
                    onChange={(e) => setSearchStudentTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm mb-2"
                  />

                  {formData.student_ids.length > 0 && (
                    <p className="text-sm text-blue-600 mb-1">
                      {formData.student_ids.length}{' '}
                      {formData.student_ids.length === 1 ? 'student' : 'students'} selected
                    </p>
                  )}

                  <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                    {filtered.length === 0 ? (
                      <p className="p-4 text-center text-sm text-gray-500">
                        {searchStudentTerm
                          ? 'No students match your search.'
                          : 'No students available.'}
                      </p>
                    ) : (
                      filtered.map((student) => {
                        const selected = formData.student_ids.includes(student.id);
                        return (
                          <label
                            key={student.id}
                            className={`flex items-center p-3 cursor-pointer transition-colors hover:bg-gray-50 ${selected ? 'bg-blue-50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => handleStudentToggle(student.id)}
                              className="mr-3 h-4 w-4 text-blue-600 border-gray-300 rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {student.full_name}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {student.education_level_display ?? 'Unknown level'}
                                {student.student_class_display && ` · ${student.student_class_display}`}
                                {student.stream_name && (
                                  <span className="text-blue-600 ml-1">
                                    ({student.stream_name})
                                  </span>
                                )}
                              </p>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {mode === 'create' ? 'Create parent' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ParentListNew;