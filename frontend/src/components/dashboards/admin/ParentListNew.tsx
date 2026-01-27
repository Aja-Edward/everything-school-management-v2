import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, Eye, User, Phone, Mail, MapPin, Calendar, Users, GraduationCap, X, Save, UserPlus, Power, PowerOff, Filter } from 'lucide-react';
import { toast } from 'react-toastify';
import ParentService, { Parent, CreateParentData, UpdateParentData } from '@/services/ParentService';
import api from '@/services/api';

const ParentListNew: React.FC = () => {
  const [parents, setParents] = useState<Parent[]>([]);
  const [filteredParents, setFilteredParents] = useState<Parent[]>([]);
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit' | 'create'>('view');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  
  // Credential popup state
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [parentUsername, setParentUsername] = useState<string | null>(null);
  const [parentPassword, setParentPassword] = useState<string | null>(null);
  
  // Filter states
  const [streamFilter, setStreamFilter] = useState<string>('all');
  const [educationLevelFilter, setEducationLevelFilter] = useState<string>('all');

  // Fetch parents from API
  const fetchParents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ParentService.getParents();
      const parentsArray = Array.isArray(response) ? response : [];
      
      // Ensure all parent data is properly formatted and flatten nested user object
      const sanitizedParents = parentsArray.map(parent => {
        // Handle nested user object structure
        const userData = parent.user && typeof parent.user === 'object' ? parent.user as any : {};
        
        return {
          ...parent,
          user: userData.email || parent.user || '', // Use email from nested user object
          user_first_name: userData.first_name || parent.user_first_name || '',
          user_last_name: userData.last_name || parent.user_last_name || '',
          parent_contact: parent.parent_contact || '',
          parent_address: parent.parent_address || '',
          students: Array.isArray(parent.students) ? parent.students : [],
          is_active: Boolean(parent.is_active)
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

  useEffect(() => {
    fetchParents();
  }, []);

  useEffect(() => {
    const filtered = parents.filter((parent) => {
      const userEmail = typeof parent.user === 'string' ? parent.user : '';
      const firstName = parent.user_first_name || '';
      const lastName = parent.user_last_name || '';
      
      // Search filter
      const matchesSearch = userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           lastName.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Stream filter
      const matchesStream = streamFilter === 'all' || 
        parent.students.some(child => child.stream_name === streamFilter);
      
      // Education level filter
      const matchesEducationLevel = educationLevelFilter === 'all' || 
        parent.students.some(child => child.education_level_display === educationLevelFilter);
      
      return matchesSearch && matchesStream && matchesEducationLevel;
    });
    setFilteredParents(filtered);
  }, [searchTerm, parents, streamFilter, educationLevelFilter]);

  // Toggle parent activation status
  const handleToggleStatus = async (parent: Parent) => {
    try {
      setToggleLoading(parent.id);
      if (parent.is_active) {
        await ParentService.deactivateParent(parent.id);
      } else {
        await ParentService.activateParent(parent.id);
      }
      
      // Update the parent in the local state
      const parentsArray = Array.isArray(parents) ? parents : [];
      setParents(parentsArray.map(p => 
        p.id === parent.id ? { ...p, is_active: !p.is_active } : p
      ));
      
      toast.success(`Parent ${parent.is_active ? 'deactivated' : 'activated'} successfully!`);
    } catch (err: any) {
      console.error('Error toggling parent status:', err);
      toast.error(err.response?.data?.message || 'Failed to update parent status');
    } finally {
      setToggleLoading(null);
    }
  };

  const handleView = (parent: Parent) => {
    setSelectedParent(parent);
    setModalMode('view');
    setShowModal(true);
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

  const handleDelete = (parentId: number) => {
    setShowDeleteConfirm(parentId);
  };

  const confirmDelete = async () => {
    if (!showDeleteConfirm) return;
    
    try {
      await ParentService.deleteParent(showDeleteConfirm);
      
      // Remove from local state
      const parentsArray = Array.isArray(parents) ? parents : [];
      setParents(parentsArray.filter(p => p.id !== showDeleteConfirm));
      
      toast.success('Parent deleted successfully!');
    } catch (err: any) {
      console.error('Error deleting parent:', err);
      toast.error(err.response?.data?.message || 'Failed to delete parent');
    } finally {
      setShowDeleteConfirm(null);
    }
  };

  const handleSave = async (formData: CreateParentData | UpdateParentData) => {
    try {
      if (modalMode === 'create') {
        const newParent = await ParentService.createParent(formData as CreateParentData);
        console.log('New parent created:', newParent);
        toast.success('Parent created successfully!');
        
        // Check if credentials are returned and show popup
        if (newParent.parent_username && newParent.parent_password) {
          setParentUsername(newParent.parent_username);
          setParentPassword(newParent.parent_password);
          setShowCredentialModal(true);
        }
        
        // Refresh the data to get the complete parent information
        await fetchParents();
      } else if (modalMode === 'edit' && selectedParent) {
        const updatedParent = await ParentService.updateParent(selectedParent.id, formData as UpdateParentData);
        console.log('Parent updated:', updatedParent);
        toast.success('Parent updated successfully!');
        // Refresh the data to get the updated parent information
        await fetchParents();
      }
      
      setShowModal(false);
      setSelectedParent(null);
    } catch (err: any) {
      console.error('Error saving parent:', err);
      toast.error(err.response?.data?.message || 'Failed to save parent');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedParent(null);
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
  };

  const getStatusIcon = (isActive: boolean) => {
    return isActive ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">{error}</div>
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Parent Management
              </h1>
              <p className="text-gray-600 mt-2">
                Manage all parent accounts and their children
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                {viewMode === 'cards' ? (
                  <>
                    <div className="w-4 h-4 border border-gray-600 rounded"></div>
                    List View
                  </>
                ) : (
                  <>
                    <div className="w-4 h-4 bg-gray-600 rounded"></div>
                    Card View
                  </>
                )}
              </button>
              <button
                onClick={handleCreate}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Parent
              </button>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search parents by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={educationLevelFilter}
                onChange={(e) => setEducationLevelFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Streams</option>
                <option value="Science">Science</option>
                <option value="Arts">Arts</option>
                <option value="Commercial">Commercial</option>
                <option value="Technical">Technical</option>
              </select>
              <span className="text-sm text-gray-600 flex items-center">
                {filteredParents.length} of {parents.length} parents
              </span>
            </div>
          </div>
        </div>

        {/* Parent Cards/List */}
        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredParents.map((parent) => (
              <div key={parent.id} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow min-w-0">
                <div className="flex justify-between items-start mb-4 gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {parent.user_first_name} {parent.user_last_name}
                      </h3>
                      <p className="text-sm text-gray-600 truncate">{typeof parent.user === 'string' ? parent.user : ''}</p>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 flex-shrink-0 ${getStatusColor(parent.is_active)}`}>
                    {getStatusIcon(parent.is_active)}
                    <span className="hidden sm:inline">{parent.is_active ? 'Active' : 'Inactive'}</span>
                    <span className="sm:hidden">{parent.is_active ? 'A' : 'I'}</span>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
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
                    <span>{parent.students.length} child{parent.students.length !== 1 ? 'ren' : ''}</span>
                  </div>
                </div>

                {parent.students.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Children:</h4>
                    <div className="space-y-1">
                      {parent.students.map((child) => (
                        <div key={child.id} className="flex items-center gap-2 text-sm">
                          <GraduationCap className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-600 truncate flex-1">{child.full_name}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            ({child.education_level_display || child.education_level})
                            {child.stream_name && ` - ${child.stream_name}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-4 border-t border-gray-100">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleView(parent)}
                      className="flex-1 px-2 py-2 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      View
                    </button>
                    <button
                      onClick={() => handleEdit(parent)}
                      className="flex-1 px-2 py-2 text-xs bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100 transition-colors flex items-center justify-center gap-1"
                    >
                      <Edit className="w-3 h-3" />
                      Edit
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleStatus(parent)}
                      disabled={toggleLoading === parent.id}
                      className="flex-1 px-2 py-2 text-xs bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-1"
                    >
                      {toggleLoading === parent.id ? (
                        <div className="w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                      ) : (
                        getStatusIcon(!parent.is_active)
                      )}
                      {parent.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDelete(parent.id)}
                      className="flex-1 px-2 py-2 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parent</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Children</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Streams</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredParents.map((parent) => (
                    <tr key={parent.id} className="hover:bg-gray-100 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {parent.user_first_name} {parent.user_last_name}
                          </div>
                          <div className="text-sm text-gray-500">{typeof parent.user === 'string' ? parent.user : ''}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{parent.parent_contact || 'N/A'}</div>
                        <div className="text-sm text-gray-500">{parent.parent_address || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{parent.students.length} child{parent.students.length !== 1 ? 'ren' : ''}</div>
                        <div className="text-sm text-gray-500">
                          {parent.students.map(child => child.full_name).join(', ')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {parent.students
                            .filter(child => child.stream_name)
                            .map(child => child.stream_name)
                            .filter((stream, index, arr) => arr.indexOf(stream) === index)
                            .join(', ') || 'None'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {parent.students
                            .filter(child => child.education_level_display)
                            .map(child => child.education_level_display)
                            .filter((level, index, arr) => arr.indexOf(level) === index)
                            .join(', ')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(parent.is_active)}`}>
                          {getStatusIcon(parent.is_active)}
                          {parent.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleView(parent)}
                            className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(parent)}
                            className="text-yellow-600 hover:text-yellow-900 p-1 rounded hover:bg-yellow-50 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(parent)}
                            disabled={toggleLoading === parent.id}
                            className="text-gray-600 hover:text-gray-900 p-1 rounded hover:bg-gray-50 transition-colors"
                          >
                            {toggleLoading === parent.id ? (
                              <div className="w-4 h-4 border border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                            ) : (
                              getStatusIcon(!parent.is_active)
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(parent.id)}
                            className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors"
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

        {filteredParents.length === 0 && !loading && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No parents found</h3>
            <p className="text-gray-600 mb-4">
              {searchTerm ? 'Try adjusting your search terms.' : 'Get started by adding your first parent.'}
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
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

      {/* Parent Modal */}
      {showModal && (
        <ParentModal
          parent={selectedParent}
          mode={modalMode}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}

      {/* Credential Modal */}
      {showCredentialModal && parentUsername && parentPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
            <h3 className="text-lg font-semibold mb-4 text-blue-700">Parent Account Credentials</h3>
            <div className="mb-4 p-4 bg-blue-50 rounded">
              <h4 className="font-semibold text-blue-800 mb-2">Parent Account</h4>
              <div className="text-sm text-gray-800">
                <span className="font-semibold">Username:</span>
                <span className="ml-2 font-mono text-lg bg-gray-100 px-2 py-1 rounded">{parentUsername}</span>
                <button 
                  onClick={() => navigator.clipboard.writeText(parentUsername!)} 
                  className="ml-2 text-xs text-blue-600 underline"
                >
                  Copy
                </button>
              </div>
              <div className="text-sm text-gray-800 mt-2">
                <span className="font-semibold">Password:</span>
                <span className="ml-2 font-mono text-lg bg-gray-100 px-2 py-1 rounded">{parentPassword}</span>
                <button 
                  onClick={() => navigator.clipboard.writeText(parentPassword!)} 
                  className="ml-2 text-xs text-blue-600 underline"
                >
                  Copy
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Please copy and send these credentials to the parent. They should be required to reset their password on first login.
            </p>
            <button 
              onClick={() => {
                setShowCredentialModal(false);
                setParentUsername(null);
                setParentPassword(null);
              }} 
              className="mt-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Parent Modal Component
interface ParentModalProps {
  parent: Parent | null;
  mode: 'view' | 'edit' | 'create';
  onSave: (data: CreateParentData | UpdateParentData) => void;
  onClose: () => void;
}

interface Student {
  id: number;
  full_name: string;
  education_level_display?: string;
  student_class_display?: string;
  stream_name?: string;
}

const ParentModal: React.FC<ParentModalProps> = ({ parent, mode, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    user_email: parent?.user || '',
    user_first_name: parent?.user_first_name || '',
    user_last_name: parent?.user_last_name || '',
    phone: parent?.parent_contact || '',
    address: parent?.parent_address || '',
    student_ids: parent?.students?.map(s => s.id) || []
  });

  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [searchStudentTerm, setSearchStudentTerm] = useState('');

  // Fetch available students
  useEffect(() => {
    const fetchStudents = async () => {
      if (mode === 'view') return; // No need to fetch for view mode

      try {
        setLoadingStudents(true);
        console.log('Fetching students from /api/students/students/');
        const response = await api.get('/api/students/students/');
        console.log('Students response:', response);
        const studentsData = Array.isArray(response) ? response : (response.results || []);
        console.log('Parsed students data:', studentsData);
        setAvailableStudents(studentsData);
      } catch (error: any) {
        console.error('Error fetching students:', error);
        console.error('Error details:', {
          message: error.message,
          response: error.response,
          status: error.response?.status,
          data: error.response?.data
        });
        // Don't show error toast if it's just empty results
        if (error.response?.status !== 404) {
          toast.error(`Failed to load students: ${error.message}`);
        }
      } finally {
        setLoadingStudents(false);
      }
    };

    fetchStudents();
  }, [mode]);

  // Update form data when parent changes
  useEffect(() => {
    if (parent) {
      // Handle nested user object structure
      const userData = parent.user && typeof parent.user === 'object' ? parent.user as any : {};

      setFormData({
        user_email: userData.email || parent.user || '',
        user_first_name: userData.first_name || parent.user_first_name || '',
        user_last_name: userData.last_name || parent.user_last_name || '',
        phone: parent.parent_contact || '',
        address: parent.parent_address || '',
        student_ids: parent.students?.map(s => s.id) || []
      });
    } else {
      setFormData({
        user_email: '',
        user_first_name: '',
        user_last_name: '',
        phone: '',
        address: '',
        student_ids: []
      });
    }
  }, [parent]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleStudentToggle = (studentId: number) => {
    setFormData(prev => {
      const isSelected = prev.student_ids.includes(studentId);
      return {
        ...prev,
        student_ids: isSelected
          ? prev.student_ids.filter(id => id !== studentId)
          : [...prev.student_ids, studentId]
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const filteredAvailableStudents = availableStudents.filter(student =>
    student.full_name.toLowerCase().includes(searchStudentTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {mode === 'create' ? 'Add New Parent' : mode === 'edit' ? 'Edit Parent' : 'Parent Details'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {mode === 'view' && parent ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <p className="text-gray-900">
                  {parent.user && typeof parent.user === 'object' ? (parent.user as any).email : parent.user}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <p className="text-gray-900">
                  {parent.user && typeof parent.user === 'object' 
                    ? `${(parent.user as any).first_name} ${(parent.user as any).last_name}`
                    : `${parent.user_first_name} ${parent.user_last_name}`
                  }
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contact</label>
                <p className="text-gray-900">{parent.parent_contact || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <p className="text-gray-900">{parent.parent_address || 'N/A'}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Children</label>
              {parent.students.length > 0 ? (
                <div className="space-y-2">
                  {parent.students.map((child) => (
                    <div key={child.id} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <GraduationCap className="w-4 h-4 text-gray-400" />
                      <div className="flex-1">
                        <span className="text-gray-900 font-medium">{child.full_name}</span>
                        <div className="text-sm text-gray-500">
                          {child.education_level_display || child.education_level}
                          {child.student_class_display && ` - ${child.student_class_display}`}
                          {child.stream_name && (
                            <span className="text-blue-600 ml-1">
                              ({child.stream_name} {child.stream_type})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No children assigned</p>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  name="user_email"
                  value={typeof formData.user_email === 'string' ? formData.user_email : ''}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name *
                </label>
                <input
                  type="text"
                  name="user_first_name"
                  value={formData.user_first_name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="user_last_name"
                  value={formData.user_last_name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Number
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Student Selection Section */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Link Students (Optional)
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Select one or more students to link to this parent. You can also link students later.
                </p>

                {loadingStudents ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <>
                    {/* Search Students */}
                    <div className="mb-3">
                      <input
                        type="text"
                        placeholder="Search students..."
                        value={searchStudentTerm}
                        onChange={(e) => setSearchStudentTerm(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>

                    {/* Selected Students Count */}
                    {formData.student_ids.length > 0 && (
                      <div className="mb-2 text-sm text-blue-600">
                        {formData.student_ids.length} student{formData.student_ids.length !== 1 ? 's' : ''} selected
                      </div>
                    )}

                    {/* Student List */}
                    <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                      {filteredAvailableStudents.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">
                          {searchStudentTerm ? 'No students found matching your search' : 'No students available'}
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-200">
                          {filteredAvailableStudents.map((student) => {
                            const isSelected = formData.student_ids.includes(student.id);
                            return (
                              <label
                                key={student.id}
                                className={`flex items-center p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                                  isSelected ? 'bg-blue-50' : ''
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleStudentToggle(student.id)}
                                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 text-sm truncate">
                                    {student.full_name}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">
                                    {student.education_level_display || 'Unknown Level'}
                                    {student.student_class_display && ` - ${student.student_class_display}`}
                                    {student.stream_name && (
                                      <span className="text-blue-600 ml-1">
                                        ({student.stream_name})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {mode === 'create' ? 'Create Parent' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ParentListNew;
