import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api from '@/services/api';
import { ADMIN_ROLE_OPTIONS } from './adminRoles';

const AddAdminForm: React.FC = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'admin',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setAdminUsername(null);
    setAdminPassword(null);
    setShowPasswordModal(false);
    
    try {
      const payload = {
        email: formData.email,
        first_name: formData.firstName,
        last_name: formData.lastName,
        role: formData.role,
      };
      
      // Use the admins endpoint that generates unique username
      const response = await api.post('/api/auth/admins/', payload);
      
      setSuccess('Admin created successfully!');
      toast.success('Admin added successfully');
      
      // api.post returns the body itself, { id, username, password, email }.
      // Reading response.data.admin_username here meant the credentials box
      // never opened and the only copy of the password was lost.
      if (response?.username) {
        setAdminUsername(response.username);
        setAdminPassword(response.password);
        setShowPasswordModal(true);
      }
      
      // Reset form after a delay
      setTimeout(() => {
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          role: 'admin',
        });
      }, 1200);
      
      setLoading(false);
    } catch (err: any) {
      console.error('Full error object:', err);
      console.error('Error response data:', err.response?.data);
      const errorMessage = err.response?.data?.detail 
        || err.response?.data?.email?.[0]
        || err.response?.data?.message
        || err.message
        || 'Failed to create admin';
      setError(errorMessage);
      toast.error(`Cannot add admin: ${errorMessage}`);
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowPasswordModal(false);
    setSuccess(null);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Add New Admin</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">First Name*</label>
          <input 
            type="text" 
            name="firstName" 
            value={formData.firstName} 
            onChange={handleInputChange} 
            className="w-full p-3 border border-gray-300 rounded-lg" 
            placeholder="First name"
            required 
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Last Name*</label>
          <input 
            type="text" 
            name="lastName" 
            value={formData.lastName} 
            onChange={handleInputChange} 
            className="w-full p-3 border border-gray-300 rounded-lg" 
            placeholder="Last name"
            required 
          />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Email*</label>
        <input 
          type="email" 
          name="email" 
          value={formData.email} 
          onChange={handleInputChange} 
          className="w-full p-3 border border-gray-300 rounded-lg" 
          placeholder="admin@example.com"
          required
        />
      </div>
      <div className="mb-4">
        <label htmlFor="admin-role" className="block text-sm font-medium text-gray-700 mb-2">Role*</label>
        <select
          id="admin-role"
          name="role"
          value={formData.role}
          onChange={handleInputChange}
          className="w-full p-3 border border-gray-300 rounded-lg bg-white"
        >
          {ADMIN_ROLE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          {ADMIN_ROLE_OPTIONS.find(option => option.value === formData.role)?.hint}
        </p>
      </div>
      <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
        <button 
          onClick={handleSave} 
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
          disabled={loading || !formData.firstName || !formData.lastName || !formData.email}
        >
          {loading ? 'Saving...' : 'Save Admin'}
        </button>
      </div>
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm font-medium">Error:</p>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
      {success && !showPasswordModal && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}
      
      {/* Modal for showing credentials */}
      {showPasswordModal && (adminUsername || adminPassword) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
            <h3 className="text-lg font-semibold mb-4 text-blue-700">Admin Account Created</h3>
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium mb-2">Important: Save These Credentials</p>
              <p className="text-xs text-yellow-700">These credentials will only be shown once. Please copy them now.</p>
            </div>
            {adminUsername && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg text-left">
                <h4 className="font-semibold text-blue-800 mb-3">Login Credentials</h4>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-semibold text-gray-700 block mb-1">Username:</span>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-mono text-sm bg-white px-3 py-2 rounded border border-gray-200">{adminUsername}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(adminUsername);
                          toast.success('Username copied!');
                        }} 
                        className="px-3 py-2 text-xs text-blue-600 hover:bg-blue-100 rounded border border-blue-200"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-700 block mb-1">Temporary Password:</span>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-mono text-sm bg-white px-3 py-2 rounded border border-gray-200">{adminPassword}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(adminPassword!);
                          toast.success('Password copied!');
                        }} 
                        className="px-3 py-2 text-xs text-blue-600 hover:bg-blue-100 rounded border border-blue-200"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <p className="text-sm text-gray-600 mb-4">
              Send these credentials to the new admin and ask them to change the password after they sign in.
            </p>
            <button 
              onClick={handleCloseModal} 
              className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddAdminForm;