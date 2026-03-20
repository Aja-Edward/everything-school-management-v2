import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Layers,
  AlertCircle,
  CheckCircle,
  Info
} from 'lucide-react';
import { useStreamConfiguration } from '@/contexts/StreamConfigurationContext';
import StreamConfigurationService, { Stream } from '@/services/StreamConfigurationService';
import { toast } from 'react-toastify';

interface StreamFormData {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

const StreamManagement: React.FC = () => {
  const { streams, loadStreams, isLoading } = useStreamConfiguration();
  const [showForm, setShowForm] = useState(false);
  const [editingStream, setEditingStream] = useState<Stream | null>(null);
  const [formData, setFormData] = useState<StreamFormData>({
    name: '',
    code: '',
    description: '',
    is_active: true
  });
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      is_active: true
    });
    setEditingStream(null);
    setShowForm(false);
  };

  const handleEdit = (stream: Stream) => {
    setEditingStream(stream);
    setFormData({
      name: stream.name,
      code: stream.code,
      description: stream.description || '',
      is_active: stream.is_active
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      toast.error('Stream name is required');
      return;
    }
    if (!formData.code.trim()) {
      toast.error('Stream code is required');
      return;
    }

    setSaving(true);
    try {
      if (editingStream) {
        // Update existing stream
        await StreamConfigurationService.updateStream(editingStream.id, formData);
        toast.success('Stream updated successfully!');
      } else {
        // Create new stream
        await StreamConfigurationService.createStream(formData);
        toast.success('Stream created successfully!');
      }
      
      await loadStreams();
      resetForm();
    } catch (error: any) {
      console.error('Error saving stream:', error);
      toast.error(error.message || 'Failed to save stream');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (stream: Stream) => {
    if (!window.confirm(`Are you sure you want to delete "${stream.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await StreamConfigurationService.deleteStream(stream.id);
      toast.success('Stream deleted successfully!');
      await loadStreams();
    } catch (error: any) {
      console.error('Error deleting stream:', error);
      toast.error(error.message || 'Failed to delete stream');
    }
  };

  const handleToggleStatus = async (stream: Stream) => {
    try {
      await StreamConfigurationService.updateStream(stream.id, {
        ...stream,
        is_active: !stream.is_active
      });
      toast.success(`Stream ${stream.is_active ? 'deactivated' : 'activated'} successfully!`);
      await loadStreams();
    } catch (error: any) {
      console.error('Error updating stream status:', error);
      toast.error(error.message || 'Failed to update stream status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900">Stream Management</h3>
              <p className="text-slate-600 mt-1">Create and manage academic streams</p>
            </div>
          </div>
          
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium hover:from-cyan-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5" />
              Add Stream
            </button>
          )}
        </div>

        {/* Info Banner */}
        {streams.length === 0 && !showForm && (
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">No streams found</p>
              <p>Get started by creating your first academic stream (e.g., Science, Arts, Commercial).</p>
            </div>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-2xl p-6 border border-cyan-200 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-lg font-bold text-slate-900">
                {editingStream ? 'Edit Stream' : 'Create New Stream'}
              </h4>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Stream Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Science, Arts, Commercial"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all bg-white font-medium"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Stream Code *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g., SCI, ART, COM"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all bg-white font-medium uppercase"
                    maxLength={10}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter a brief description of this stream..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all bg-white font-medium resize-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-5 h-5 text-cyan-600 rounded focus:ring-2 focus:ring-cyan-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
                  Active (Stream is available for use)
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium hover:from-cyan-600 hover:to-blue-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingStream ? 'Update Stream' : 'Create Stream'}
                    </>
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Streams List */}
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin mx-auto" />
            <p className="mt-3 text-sm text-slate-500">Loading streams...</p>
          </div>
        ) : streams.length > 0 ? (
          <div className="space-y-3">
            {streams.map((stream) => (
              <div
                key={stream.id}
                className={`p-6 rounded-2xl border transition-all ${
                  stream.is_active
                    ? 'bg-white border-slate-200 hover:border-cyan-300 hover:shadow-md'
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-md ${
                      stream.is_active
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-600'
                        : 'bg-gradient-to-br from-slate-400 to-slate-500'
                    }`}>
                      {stream.code.substring(0, 3).toUpperCase()}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className="text-lg font-bold text-slate-900">{stream.name}</h4>
                        <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold">
                          {stream.code}
                        </span>
                        {!stream.is_active && (
                          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                            Inactive
                          </span>
                        )}
                      </div>
                      {stream.description && (
                        <p className="text-sm text-slate-600">{stream.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStatus(stream)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        stream.is_active
                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {stream.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    
                    <button
                      onClick={() => handleEdit(stream)}
                      className="p-2 hover:bg-cyan-50 text-cyan-600 rounded-lg transition-colors"
                      title="Edit stream"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    
                    <button
                      onClick={() => handleDelete(stream)}
                      className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                      title="Delete stream"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default StreamManagement;