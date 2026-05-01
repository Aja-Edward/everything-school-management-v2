import { useState, useEffect } from 'react';
import {
  Plus, Edit, Trash2, Search, Save, X,
  Loader2, RefreshCw, Tag, Hash, AlignLeft,
  ToggleLeft, ToggleRight, Palette, ArrowUpDown,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { subjectService, SubjectCategory } from '@/services/SubjectService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  name: string;
  code: string;
  description: string;
  color_code: string;
  display_order: number;
  is_active: boolean;
}

interface FormErrors {
  name?: string;
  code?: string;
  description?: string;
  color_code?: string;
  display_order?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#8B5CF6', // purple
  '#EF4444', // red
  '#F59E0B', // amber
  '#6366F1', // indigo
  '#F97316', // orange
  '#EC4899', // pink
  '#14B8A6', // teal
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#6B7280', // gray
];

const EMPTY_FORM: FormData = {
  name: '',
  code: '',
  description: '',
  color_code: '#3B82F6',
  display_order: 0,
  is_active: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateCode = (name: string): string => {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => w.substring(0, 3))
    .join('_')
    .substring(0, 12);
};

const getContrastColor = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1F2937' : '#FFFFFF';
};

// ─── Component ────────────────────────────────────────────────────────────────

const SubjectCategoryManagement = () => {
  // ── Data state ──
  const [categories, setCategories] = useState<SubjectCategory[]>([]);
  const [filtered, setFiltered] = useState<SubjectCategory[]>([]);

  // ── Loading state ──
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SubjectCategory | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<SubjectCategory | null>(null);

  // ── Filter / view state ──
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // ── Form state ──
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showColorPicker, setShowColorPicker] = useState(false);

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    let result = categories;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
      );
    }
    if (activeFilter === 'active') result = result.filter(c => c.is_active);
    if (activeFilter === 'inactive') result = result.filter(c => !c.is_active);
    setFiltered(result);
  }, [categories, searchTerm, activeFilter]);

  // Auto-generate code from name (create mode only)
  useEffect(() => {
    if (!editingCategory && formData.name) {
      setFormData(prev => ({ ...prev, code: generateCode(formData.name) }));
    }
  }, [formData.name]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = async () => {
    try {
      setLoading(true);
      const cats = await subjectService.getCategories();
      setCategories(Array.isArray(cats) ? cats : []);
    } catch {
      toast.error('Failed to load categories');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Form handlers ─────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!formData.name.trim()) e.name = 'Category name is required';
    if (!formData.code.trim()) e.code = 'Category code is required';
    if (formData.display_order < 0) e.display_order = 'Display order must be 0 or greater';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const payload: Partial<SubjectCategory> = {
        name: formData.name,
        code: formData.code,
        description: formData.description || undefined,
        color_code: formData.color_code,
        display_order: formData.display_order,
        is_active: formData.is_active,
      };

      if (editingCategory) {
        await subjectService.updateCategory(editingCategory.id, payload);
        toast.success('Category updated successfully');
      } else {
        await subjectService.createCategory(payload);
        toast.success('Category created successfully');
      }

      resetForm();
      loadData();
    } catch (err: any) {
      // Surface API field errors
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
      toast.error(err.response?.data?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (category: SubjectCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      code: category.code,
      description: category.description || '',
      color_code: category.color_code || '#3B82F6',
      display_order: category.display_order,
      is_active: category.is_active,
    });
    setErrors({});
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setErrors({});
    setEditingCategory(null);
    setShowModal(false);
    setShowColorPicker(false);
  };

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return;
    try {
      await subjectService.deleteCategory(categoryToDelete.id);
      toast.success('Category deleted');
      loadData();
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.response?.data?.message || err.message}`);
    } finally {
      setShowDeleteModal(false);
      setCategoryToDelete(null);
    }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────

  const totalActive = categories.filter(c => c.is_active).length;
  const totalInactive = categories.length - totalActive;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading categories…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Tag className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Subject Categories</h1>
              <p className="text-gray-500 text-sm mt-0.5">Manage categories used to organise subjects</p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-white transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Categories', value: categories.length, color: 'blue', dot: null },
            { label: 'Active', value: totalActive, color: 'green', dot: 'bg-green-500' },
            { label: 'Inactive', value: totalInactive, color: 'yellow', dot: 'bg-yellow-500' },
          ].map(({ label, value, color, dot }) => (
            <div key={label} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
              <div className={`p-2.5 rounded-lg bg-${color}-100`}>
                <Tag className={`w-5 h-5 text-${color}-600`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                  {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
                  {label}
                </p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 mb-5 items-start sm:items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(true)}
                className="bg-gray-900 text-white px-4 py-2.5 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Add Category
              </button>
              <button
                onClick={() => { setSearchTerm(''); setActiveFilter('all'); }}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                Reset
              </button>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              {(['grid', 'list'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                    viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search categories…"
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Active filter */}
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
              {filtered.length} categor{filtered.length !== 1 ? 'ies' : 'y'}
            </span>
          </div>
        </div>

        {/* ── Grid View ── */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(category => (
              <div
                key={category.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Color swatch */}
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm font-bold shadow-sm"
                      style={{
                        backgroundColor: category.color_code || '#6B7280',
                        color: getContrastColor(category.color_code || '#6B7280'),
                      }}
                    >
                      {category.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{category.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{category.code}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => handleEdit(category)}
                      className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setCategoryToDelete(category); setShowDeleteModal(true); }}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {category.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{category.description}</p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                  <div className="flex gap-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      category.is_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {category.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {category.subject_count !== undefined && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {category.subject_count} subject{category.subject_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <ArrowUpDown className="w-3 h-3" />
                    {category.display_order}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── List View ── */
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Category', 'Code', 'Description', 'Subjects', 'Order', 'Status', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(category => (
                  <tr key={category.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center text-xs font-bold"
                          style={{
                            backgroundColor: category.color_code || '#6B7280',
                            color: getContrastColor(category.color_code || '#6B7280'),
                          }}
                        >
                          {category.name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{category.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{category.code}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {category.description || '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {category.subject_count ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{category.display_order}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        category.is_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {category.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(category)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setCategoryToDelete(category); setShowDeleteModal(true); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
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

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Tag className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">No categories found</p>
            {!categories.length && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                Create your first category
              </button>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            ADD / EDIT MODAL
        ══════════════════════════════════════════════════════ */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-5 border-b">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingCategory ? 'Edit Category' : 'Add New Category'}
                </h2>
                <button onClick={resetForm} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">

                {/* Color preview banner */}
                <div
                  className="rounded-xl h-14 flex items-center px-4 gap-3 transition-colors"
                  style={{ backgroundColor: formData.color_code }}
                >
                  <div
                    className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm font-bold"
                    style={{ color: getContrastColor(formData.color_code) }}
                  >
                    {formData.name ? formData.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <span
                    className="font-semibold text-sm"
                    style={{ color: getContrastColor(formData.color_code) }}
                  >
                    {formData.name || 'Category preview'}
                  </span>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <AlignLeft className="w-3.5 h-3.5 text-gray-400" />
                    Category Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                    placeholder="e.g. Core Science"
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
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.code ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      placeholder="e.g. CORE_SCI"
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
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.display_order ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      value={formData.display_order}
                      onChange={e => setFormData(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                    />
                    {errors.display_order && <p className="text-red-500 text-xs mt-1">{errors.display_order}</p>}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                  <textarea
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Optional description for this category…"
                    rows={2}
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-gray-400" />
                    Color
                  </label>
                  <div className="flex items-center gap-3">
                    {/* Hex input */}
                    <div className="relative flex-1">
                      <div
                        className="w-5 h-5 rounded absolute left-3 top-1/2 -translate-y-1/2 border border-gray-200"
                        style={{ backgroundColor: formData.color_code }}
                      />
                      <input
                        type="text"
                        className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={formData.color_code}
                        onChange={e => setFormData(prev => ({ ...prev, color_code: e.target.value }))}
                        placeholder="#3B82F6"
                      />
                    </div>
                    {/* Native color picker */}
                    <label className="px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-sm text-gray-600 flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      Pick
                      <input
                        type="color"
                        className="sr-only"
                        value={formData.color_code}
                        onChange={e => setFormData(prev => ({ ...prev, color_code: e.target.value }))}
                      />
                    </label>
                  </div>

                  {/* Preset swatches */}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, color_code: color }))}
                        className={`w-6 h-6 rounded-md border-2 transition-transform hover:scale-110 ${
                          formData.color_code === color ? 'border-gray-800 scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Active</p>
                    <p className="text-xs text-gray-400">Inactive categories won't appear in subject forms</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
                    className="transition-colors"
                  >
                    {formData.is_active
                      ? <ToggleRight className="w-8 h-8 text-blue-600" />
                      : <ToggleLeft className="w-8 h-8 text-gray-400" />
                    }
                  </button>
                </div>

              </div>

              {/* Modal footer */}
              <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingCategory ? 'Update Category' : 'Create Category'}
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
        {showDeleteModal && categoryToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Category?</h2>
              <p className="text-sm text-gray-500 mb-1">
                This will permanently delete <strong>"{categoryToDelete.name}"</strong>.
              </p>
              {(categoryToDelete.subject_count ?? 0) > 0 && (
                <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-4">
                  ⚠️ This category has {categoryToDelete.subject_count} subject{categoryToDelete.subject_count !== 1 ? 's' : ''} assigned to it. Deleting it may affect those subjects.
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
                  onClick={() => { setShowDeleteModal(false); setCategoryToDelete(null); }}
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

export default SubjectCategoryManagement;