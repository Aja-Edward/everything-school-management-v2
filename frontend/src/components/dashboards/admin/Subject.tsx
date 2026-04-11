import { useState, useEffect } from 'react';
import {
  Plus, Edit, Trash2, Search, BookOpen, Save, X,
  CheckCircle, Beaker, UserCheck, Loader2, RefreshCw, Tag, Layers,
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
  subjectService,
  Subject,
  CreateSubjectData,
  SubjectFilters,
  SubjectStatistics,
  SubjectCategory,
  SubjectType,
  GradeLevel,
} from '@/services/SubjectService';

// ─── Constants ───────────────────────────────────────────────────────────────

const EDUCATION_LEVELS = [
  { value: 'NURSERY', label: 'Nursery' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'JUNIOR_SECONDARY', label: 'Junior Secondary' },
  { value: 'SENIOR_SECONDARY', label: 'Senior Secondary' },
];

const CATEGORY_COLORS: Record<string, string> = {
  core: 'bg-blue-100 text-blue-800',
  elective: 'bg-green-100 text-green-800',
  cross_cutting: 'bg-purple-100 text-purple-800',
  core_science: 'bg-red-100 text-red-800',
  core_art: 'bg-yellow-100 text-yellow-800',
  core_humanities: 'bg-indigo-100 text-indigo-800',
  vocational: 'bg-orange-100 text-orange-800',
  creative_arts: 'bg-pink-100 text-pink-800',
  religious: 'bg-gray-100 text-gray-800',
  physical: 'bg-teal-100 text-teal-800',
  language: 'bg-cyan-100 text-cyan-800',
  practical: 'bg-lime-100 text-lime-800',
  nursery_activities: 'bg-rose-100 text-rose-800',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  name: string;
  code: string;
  category_new_id: number | undefined;
  education_levels: string[];
  ss_subject_type_id: number | undefined; // required when SENIOR_SECONDARY selected
}

interface FormErrors {
  name?: string;
  code?: string;
  category?: string;
  education_levels?: string;
  ss_subject_type?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getCategoryDisplay = (subject: Subject): string =>
  subject.category_new?.name || subject.category_display || 'Unknown';

const getGradeLevelsDisplay = (subject: Subject): string => {
  if (subject.grade_levels?.length) return subject.grade_levels.map(gl => gl.name).join(', ');
  return subject.education_levels_display || 'No levels';
};

const getCategoryColor = (subject: Subject): string => {
  if (subject.category_new?.color_code) return 'bg-gray-100 text-gray-800'; // dynamic colors need inline style
  return CATEGORY_COLORS[subject.category || ''] || 'bg-gray-100 text-gray-800';
};

const generateCode = (name: string, categories: SubjectCategory[], categoryId?: number): string => {
  if (!name) return '';
  const prefix = name.substring(0, 3).toUpperCase();
  const cat = categories.find(c => c.id === categoryId);
  const suffix = cat ? cat.code.substring(0, 2).toUpperCase() : 'GEN';
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${suffix}-${rand}`;
};

const EMPTY_FORM: FormData = {
  name: '',
  code: '',
  category_new_id: undefined,
  education_levels: [],
  ss_subject_type_id: undefined,
};

// ─── Component ────────────────────────────────────────────────────────────────

const SubjectManagement = () => {
  // ── Data state ──
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<Subject[]>([]);
  const [statistics, setStatistics] = useState<SubjectStatistics | null>(null);
  const [categories, setCategories] = useState<SubjectCategory[]>([]);
  const [subjectTypes, setSubjectTypes] = useState<SubjectType[]>([]);

  // ── Loading state ──
  const [loading, setLoading] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);

  // ── Filter state ──
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>(undefined);
  const [levelFilter, setLevelFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  // ── Form state ──
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  const isSeniorSecondary = formData.education_levels.includes('SENIOR_SECONDARY');

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => { loadMeta(); loadData(); }, []);

  useEffect(() => {
    let result = subjects;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q)
      );
    }
    if (categoryFilter) result = result.filter(s => s.category_new_id === categoryFilter);
    if (levelFilter) {
      result = result.filter(s => {
        if (s.grade_levels?.length) return s.grade_levels.some(gl => gl.education_level === levelFilter);
        return s.education_levels?.includes(levelFilter);
      });
    }
    setFilteredSubjects(result);
    setCurrentPage(1);
  }, [subjects, searchTerm, categoryFilter, levelFilter]);

  // Auto-generate code on name/category change (create mode only)
  useEffect(() => {
    if (!editingSubject && formData.name) {
      setFormData(prev => ({ ...prev, code: generateCode(formData.name, categories, formData.category_new_id) }));
    }
  }, [formData.name, formData.category_new_id]);

  // Clear ss_subject_type when Senior Secondary is deselected
  useEffect(() => {
    if (!isSeniorSecondary) {
      setFormData(prev => ({ ...prev, ss_subject_type_id: undefined }));
    }
  }, [isSeniorSecondary]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadMeta = async () => {
    try {
      setLoadingMeta(true);
      const [cats, types] = await Promise.all([
        subjectService.getCategories().catch(() => []),
        subjectService.getSubjectTypes().catch(() => []),
      ]);
      setCategories(cats);
      setSubjectTypes(types);
    } catch {
      toast.error('Failed to load form options');
    } finally {
      setLoadingMeta(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [subs, stats] = await Promise.all([
        subjectService.getSubjects({}).catch(() => []),
        subjectService.getSubjectStatistics().catch(() => null),
      ]);
      setSubjects(Array.isArray(subs) ? subs : []);
      setStatistics(stats);
    } catch (err: any) {
      toast.error('Failed to load subjects');
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Form handlers ─────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!formData.name.trim()) e.name = 'Subject name is required';
    if (!formData.code.trim()) e.code = 'Subject code is required';
    if (!formData.category_new_id) e.category = 'Category is required';
    if (!formData.education_levels.length) e.education_levels = 'Select at least one education level';
    if (isSeniorSecondary && !formData.ss_subject_type_id) {
      e.ss_subject_type = 'Subject type is required for Senior Secondary';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setSaving(true);

      const payload: CreateSubjectData = {
        name: formData.name,
        code: formData.code,
        category_new_id: formData.category_new_id,
        category: formData.category_new_id, // backward compat
        education_levels: formData.education_levels,
        ss_subject_type: formData.ss_subject_type_id,
        subject_type_new_id: formData.ss_subject_type_id,
        grade_level_ids: [],
        // sensible defaults for optional fields
        is_compulsory: true,
        pass_mark: 50,
        has_continuous_assessment: true,
        has_final_exam: true,
      };

      if (editingSubject) {
        await subjectService.updateSubject(editingSubject.id, payload);
        toast.success('Subject updated successfully');
      } else {
        await subjectService.createSubject(payload);
        toast.success('Subject created successfully');
      }

      resetForm();
      loadData();
    } catch (err: any) {
      // Surface field-level errors from the API
      if (err.message) {
        try {
          const parsed = JSON.parse(err.message);
          const fieldErrors: FormErrors = {};
          if (parsed.name) fieldErrors.name = parsed.name[0];
          if (parsed.code) fieldErrors.code = parsed.code[0];
          if (parsed.category) fieldErrors.category = parsed.category[0];
          if (parsed.education_levels) fieldErrors.education_levels = parsed.education_levels[0];
          if (parsed.ss_subject_type) fieldErrors.ss_subject_type = parsed.ss_subject_type[0];
          if (parsed.is_cross_cutting) fieldErrors.education_levels = parsed.is_cross_cutting[0];

          if (Object.keys(fieldErrors).length) {
            setErrors(prev => ({ ...prev, ...fieldErrors }));
            toast.error(Object.values(fieldErrors)[0]);
            return;
          }
        } catch { /* fall through */ }
      }
      toast.error(err.response?.data?.message || 'Failed to save subject');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setFormData({
      name: subject.name,
      code: subject.code,
      category_new_id: subject.category_new_id,
      education_levels: subject.education_levels || [],
      ss_subject_type_id: subject.subject_type_new_id || subject.ss_subject_type as any,
    });
    setErrors({});
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setErrors({});
    setEditingSubject(null);
    setShowModal(false);
  };

  const handleDeleteConfirm = async () => {
    if (!subjectToDelete) return;
    try {
      await subjectService.deleteSubject(subjectToDelete.id);
      toast.success('Subject deleted');
      loadData();
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.response?.data?.message || err.message}`);
    } finally {
      setShowDeleteModal(false);
      setSubjectToDelete(null);
    }
  };

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(filteredSubjects.length / ITEMS_PER_PAGE);
  const pageSubjects = filteredSubjects.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // ── Render helpers ────────────────────────────────────────────────────────

  const toggleLevel = (value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      education_levels: checked
        ? [...prev.education_levels, value]
        : prev.education_levels.filter(l => l !== value),
    }));
  };

  if (loading || loadingMeta) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">{loadingMeta ? 'Loading options…' : 'Loading subjects…'}</p>
        </div>
      </div>
    );
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Subject Management</h1>
              <p className="text-gray-500 text-sm mt-0.5">Manage subjects across all educational levels</p>
            </div>
          </div>
          <button
            onClick={() => { loadData(); loadMeta(); }}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-white transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* ── Stats ── */}
        {statistics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Subjects', value: statistics.total_subjects, icon: BookOpen, color: 'blue' },
              { label: 'Active', value: statistics.active_subjects, icon: CheckCircle, color: 'green' },
              { label: 'Cross-cutting', value: statistics.cross_cutting_subjects, icon: Layers, color: 'purple' },
              { label: 'With Practical', value: statistics.subjects_with_practical, icon: Beaker, color: 'orange' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
                <div className={`p-2.5 rounded-lg bg-${color}-100`}>
                  <Icon className={`w-5 h-5 text-${color}-600`} />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{label}</p>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 mb-5 items-start sm:items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(true)}
                className="bg-gray-900 text-white px-4 py-2.5 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Add Subject
              </button>
              <button
                onClick={() => { setCategoryFilter(undefined); setLevelFilter(''); setSearchTerm(''); }}
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
                placeholder="Search subjects…"
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Category filter */}
            <div className="relative">
              <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                className="pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                value={categoryFilter || ''}
                onChange={e => setCategoryFilter(e.target.value ? parseInt(e.target.value) : undefined)}
              >
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Level filter */}
            <select
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              value={levelFilter}
              onChange={e => setLevelFilter(e.target.value)}
            >
              <option value="">All Levels</option>
              {EDUCATION_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>

            <span className="ml-auto text-sm text-gray-400">
              {filteredSubjects.length} subject{filteredSubjects.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── Grid View ── */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pageSubjects.map(subject => (
              <div key={subject.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{subject.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{getGradeLevelsDisplay(subject)}</p>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <button onClick={() => handleEdit(subject)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setSubjectToDelete(subject); setShowDeleteModal(true); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(subject)}`}>
                    {getCategoryDisplay(subject)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${subject.is_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {subject.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {subject.is_cross_cutting && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Cross-cutting</span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{subject.code}</span>
                  {subject.subject_type_new && (
                    <span className="text-xs text-blue-600 font-medium">{subject.subject_type_new.name}</span>
                  )}
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
                  {['Subject', 'Code', 'Category', 'Type', 'Levels', 'Status', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pageSubjects.map(subject => (
                  <tr key={subject.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{subject.name}</td>
                    <td className="px-5 py-3"><span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{subject.code}</span></td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(subject)}`}>
                        {getCategoryDisplay(subject)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{subject.subject_type_new?.name || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{getGradeLevelsDisplay(subject)}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${subject.is_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {subject.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(subject)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setSubjectToDelete(subject); setShowDeleteModal(true); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
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

        {pageSubjects.length === 0 && (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">No subjects found</p>
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between bg-white rounded-xl shadow-sm p-4">
            <span className="text-sm text-gray-500">
              Page {currentPage} of {totalPages} · {filteredSubjects.length} subjects
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >Previous</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${currentPage === p ? 'bg-blue-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
                  >{p}</button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >Next</button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            ADD / EDIT MODAL — only required fields
        ══════════════════════════════════════════════════════ */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-5 border-b">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingSubject ? 'Edit Subject' : 'Add New Subject'}
                </h2>
                <button onClick={resetForm} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">

                {/* Subject Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Subject Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                    placeholder="e.g. Religious Studies (CRS/IRS)"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>

                {/* Code + Category in a row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Subject Code */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.code ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      placeholder="Auto-generated"
                      value={formData.code}
                      onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    />
                    {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code}</p>}
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white ${errors.category ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      value={formData.category_new_id || ''}
                      onChange={e => setFormData(prev => ({ ...prev, category_new_id: e.target.value ? parseInt(e.target.value) : undefined }))}
                    >
                      <option value="">Select…</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category}</p>}
                  </div>
                </div>

                {/* Education Levels */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Education Levels <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {EDUCATION_LEVELS.map(level => (
                      <label key={level.value} className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                        formData.education_levels.includes(level.value)
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}>
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.education_levels.includes(level.value)}
                          onChange={e => toggleLevel(level.value, e.target.checked)}
                        />
                        <span className="text-sm text-gray-700">{level.label}</span>
                      </label>
                    ))}
                  </div>
                  {errors.education_levels && <p className="text-red-500 text-xs mt-1">{errors.education_levels}</p>}
                </div>

                {/* Subject Type — only shown when Senior Secondary is selected */}
                {isSeniorSecondary && subjectTypes.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Subject Type <span className="text-red-500">*</span>
                      <span className="ml-1 text-xs text-gray-400 font-normal">(required for Senior Secondary)</span>
                    </label>
                    <select
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white ${errors.ss_subject_type ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      value={formData.ss_subject_type_id || ''}
                      onChange={e => setFormData(prev => ({ ...prev, ss_subject_type_id: e.target.value ? parseInt(e.target.value) : undefined }))}
                    >
                      <option value="">Select subject type…</option>
                      {subjectTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {errors.ss_subject_type && <p className="text-red-500 text-xs mt-1">{errors.ss_subject_type}</p>}
                  </div>
                )}

              </div>

              {/* Modal footer */}
              <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingSubject ? 'Update Subject' : 'Create Subject'}
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
        {showDeleteModal && subjectToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Subject?</h2>
              <p className="text-sm text-gray-500 mb-6">
                This will permanently delete <strong>"{subjectToDelete.name}"</strong>. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
                <button
                  onClick={() => { setShowDeleteModal(false); setSubjectToDelete(null); }}
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

export default SubjectManagement;