import { useState, useEffect } from 'react';
import {
  Plus, Edit, Trash2, Search, Save, X,
  Loader2, RefreshCw, Hash, AlignLeft,
  ArrowUpDown, Layers,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { subjectService, SubjectType } from '@/services/SubjectService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  name: string;
  code: string;
  description: string;
  display_order: number;
  is_active: boolean;
  is_cross_cutting: boolean;
}

interface FormErrors {
  name?: string;
  code?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormData = {
  name: '',
  code: '',
  description: '',
  display_order: 0,
  is_active: true,
  is_cross_cutting: false,
};

const generateCode = (name: string): string => {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => w.substring(0, 4))
    .join('_')
    .substring(0, 12);
};

// ─── Component ────────────────────────────────────────────────────────────────

const SubjectTypeManagement = () => {
  const [types, setTypes] = useState<SubjectType[]>([]);
  const [filtered, setFiltered] = useState<SubjectType[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<SubjectType | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<SubjectType | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    let result = types;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    if (activeFilter === 'active') result = result.filter(t => t.is_active);
    if (activeFilter === 'inactive') result = result.filter(t => !t.is_active);
    setFiltered(result);
  }, [types, searchTerm, activeFilter]);

  // Auto-generate code from name in create mode
  useEffect(() => {
    if (!editingType && formData.name) {
      setFormData(prev => ({ ...prev, code: generateCode(formData.name) }));
    }
  }, [formData.name]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await subjectService.getSubjectTypes();
      setTypes(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load subject types');
      setTypes([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Form handlers ─────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!formData.name.trim()) e.name = 'Type name is required';
    if (!formData.code.trim()) e.code = 'Type code is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const payload: Partial<SubjectType> = {
        name: formData.name,
        code: formData.code,
        description: formData.description || undefined,
        display_order: formData.display_order,
        is_active: formData.is_active,
        is_cross_cutting: formData.is_cross_cutting,
      };

      if (editingType) {
        await subjectService.updateSubjectType(editingType.id, payload);
        toast.success('Subject type updated');
      } else {
        await subjectService.createSubjectType(payload);
        toast.success('Subject type created');
      }

      resetForm();
      loadData();
    } catch (err: any) {
      if (err.message) {
        try {
          const parsed = JSON.parse(err.message);
          const fieldErrors: FormErrors = {};
          if (parsed.name) fieldErrors.name = parsed.name[0];
          if (parsed.code) fieldErrors.code = parsed.code[0];
          if (Object.keys(fieldErrors).length) {
            setErrors(prev => ({ ...prev, ...fieldErrors }));
            toast.error(Object.values(fieldErrors)[0]);
            return;
          }
        } catch { /* fall through */ }
      }
      toast.error(err.response?.data?.message || 'Failed to save subject type');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (type: SubjectType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      code: type.code,
      description: type.description || '',
      display_order: type.display_order,
      is_active: type.is_active,
      is_cross_cutting: type.is_cross_cutting,
    });
    setErrors({});
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setErrors({});
    setEditingType(null);
    setShowModal(false);
  };

  const handleDeleteConfirm = async () => {
    if (!typeToDelete) return;
    try {
      await subjectService.deleteSubjectType(typeToDelete.id);
      toast.success('Subject type deleted');
      loadData();
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.response?.data?.message || err.message}`);
    } finally {
      setShowDeleteModal(false);
      setTypeToDelete(null);
    }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────

  const totalActive = types.filter(t => t.is_active).length;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600 mr-3" />
        <span className="text-gray-500">Loading subject types…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Subject Types</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                Define stream types for Senior Secondary subjects — e.g. Science, Arts, Commercial
              </p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-white transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Types', value: types.length },
            { label: 'Active', value: totalActive },
            { label: 'Inactive', value: types.length - totalActive },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-indigo-50">
                <Layers className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 mb-4 items-start sm:items-center justify-between">
            <button
              onClick={() => setShowModal(true)}
              className="bg-gray-900 text-white px-4 py-2.5 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Add Subject Type
            </button>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search types…"
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-52"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {(['all', 'active', 'inactive'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                    activeFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <span className="ml-auto text-sm text-gray-400">
              {filtered.length} type{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── Table ── */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Layers className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 mb-1">No subject types found</p>
            {!types.length && (
              <>
                <p className="text-sm text-gray-400 mb-4">
                  Create subject types like "Science", "Arts", "Commercial" to organise Senior Secondary subjects.
                </p>
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors"
                >
                  Create your first subject type
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Type', 'Code', 'Description', 'Subjects', 'Cross-cutting', 'Order', 'Status', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(type => (
                  <tr key={type.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                          {type.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{type.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{type.code}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {type.description || '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {type.subject_count ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        type.is_cross_cutting ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {type.is_cross_cutting ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{type.display_order}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        type.is_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {type.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(type)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setTypeToDelete(type); setShowDeleteModal(true); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
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

        {/* ══ ADD / EDIT MODAL ══ */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

              <div className="flex items-center justify-between px-6 py-5 border-b">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingType ? 'Edit Subject Type' : 'Add Subject Type'}
                </h2>
                <button onClick={resetForm} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <AlignLeft className="w-3.5 h-3.5 text-gray-400" />
                    Type Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                    placeholder="e.g. Science, Arts, Commercial"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>

                {/* Code + Order */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-gray-400" />
                      Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${errors.code ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      placeholder="e.g. SCI"
                      value={formData.code}
                      onChange={e => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    />
                    {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                      Display Order
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      value={formData.display_order}
                      onChange={e => setFormData(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                  <textarea
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    placeholder="e.g. For students in the Science stream"
                    rows={2}
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                {/* Toggles */}
                <div className="space-y-3">
                  {[
                    {
                      field: 'is_active' as const,
                      label: 'Active',
                      hint: 'Inactive types won\'t appear in subject forms',
                    },
                    {
                      field: 'is_cross_cutting' as const,
                      label: 'Cross-cutting',
                      hint: 'Subject applies across multiple streams',
                    },
                  ].map(({ field, label, hint }) => (
                    <div key={field} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{label}</p>
                        <p className="text-xs text-gray-400">{hint}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, [field]: !prev[field] }))}
                        className={`relative w-11 h-6 rounded-full transition-colors ${formData[field] ? 'bg-indigo-600' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData[field] ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>
                  ))}
                </div>

              </div>

              <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingType ? 'Update Type' : 'Create Type'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-white transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Confirmation ── */}
        {showDeleteModal && typeToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Subject Type?</h2>
              <p className="text-sm text-gray-500 mb-1">
                This will permanently delete <strong>"{typeToDelete.name}"</strong>.
              </p>
              {(typeToDelete.subject_count ?? 0) > 0 && (
                <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-4">
                  ⚠️ {typeToDelete.subject_count} subject{typeToDelete.subject_count !== 1 ? 's' : ''} use this type. They will lose their type assignment.
                </p>
              )}
              <p className="text-sm text-gray-500 mb-6">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
                <button
                  onClick={() => { setShowDeleteModal(false); setTypeToDelete(null); }}
                  className="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default SubjectTypeManagement;
