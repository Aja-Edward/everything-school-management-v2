import React, { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, Save, X, GraduationCap, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/services/api';

interface EducationLevel {
  id: number;
  name: string;
  level_type: string;
  display_order: number;
}

interface GradeLevel {
  id: number;
  name: string;
  description: string;
  education_level: number;        // FK id
  education_level_display: string; // read-only display name
  order: number;
  is_active: boolean;
  section_count: number;
}

interface Section {
  id: number;
  name: string;
  class_grade: number;            // FK to Class (auto-created per GradeLevel)
  classroom_name?: string;        // class_grade.name
  grade_level_name?: string;
  is_active: boolean;
}

interface LinkedClass {
  id: number;
  name: string;
  grade_level: number;
}

const ITEMS_PER_PAGE = 6;
const SECTIONS_PER_PAGE = 10;

const AcademicGradeLevelTab = () => {
  const [educationLevels, setEducationLevels] = useState<EducationLevel[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [linkedClasses, setLinkedClasses] = useState<LinkedClass[]>([]);
  const [loading, setLoading] = useState(true);

  const [gradeLevelPage, setGradeLevelPage] = useState(1);
  const [sectionPage, setSectionPage] = useState(1);
  const [showEdLevelModal, setShowEdLevelModal] = useState(false);
  const [edLevelForm, setEdLevelForm] = useState({ name: '', level_type: '', display_order: 1 });

  const [showGradeLevelModal, setShowGradeLevelModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingGradeLevel, setEditingGradeLevel] = useState<GradeLevel | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);

  const [gradeLevelForm, setGradeLevelForm] = useState({
    name: '',
    description: '',
    education_level: 0,   // FK id
    order: 1,
    is_active: true,
  });

  const [sectionForm, setSectionForm] = useState({
    name: '',
    class_grade: 0,       // FK to auto-created Class
    is_active: true,
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [edLevelsRes, gradeLevelsRes, sectionsRes, classesRes] = await Promise.all([
        api.get('/api/academics/education-levels/', { params: { page_size: 100 } }),
        api.get('/api/classrooms/grades/', { params: { page_size: 1000 } }),
        api.get('/api/classrooms/sections/', { params: { page_size: 1000 } }),
        // Load Classes so we can map GradeLevel → class_grade id for section form
        api.get('/api/classrooms/classes/', { params: { page_size: 1000 } }),
      ]);

      const toArray = (res: any) =>
        Array.isArray(res) ? res : (res.results || res.data || []);

      setEducationLevels(toArray(edLevelsRes));
      setGradeLevels(toArray(gradeLevelsRes));
      setSections(toArray(sectionsRes));
      setLinkedClasses(toArray(classesRes));
    } catch (err) {
      toast.error('Failed to load academic data');
    } finally {
      setLoading(false);
    }
  };

  // Update your submit handler to auto-generate code from name
const handleEdLevelSubmit = async () => {
  if (!edLevelForm.name.trim()) return toast.error('Name is required');

  // Auto-generate code from name: "Junior Secondary" → "junior_secondary"
  const autoCode = edLevelForm.name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  try {
    await api.post('/api/academics/education-levels/', {
      ...edLevelForm,
      code: autoCode,
    });
    toast.success('Education level created');
    setShowEdLevelModal(false);
    setEdLevelForm({ name: '', level_type: '', display_order: 1 });
    await loadData();
  } catch (err: any) {
    toast.error(err.response?.data?.detail || 'Failed to create education level');
  }
};

  // Get the auto-created Class id for a given GradeLevel id
  const getClassIdForGradeLevel = (gradeLevelId: number): number => {
    const cls = linkedClasses.find(c => c.grade_level === gradeLevelId);
    return cls?.id || 0;
  };

  const getSectionsForGradeLevel = (gradeLevelId: number) => {
    const classId = getClassIdForGradeLevel(gradeLevelId);
    return sections.filter(s => s.class_grade === classId);
  };

  // Grade Level CRUD
  const handleGradeLevelSubmit = async () => {
    if (!gradeLevelForm.name.trim()) return toast.error('Name is required');
    if (!gradeLevelForm.education_level) return toast.error('Education level is required');
    try {
      if (editingGradeLevel) {
        await api.put(`/api/classrooms/grades/${editingGradeLevel.id}/`, gradeLevelForm);
        toast.success('Grade level updated');
      } else {
        await api.post('/api/classrooms/grades/', gradeLevelForm);
        toast.success('Grade level created');
      }
      setShowGradeLevelModal(false);
      resetGradeLevelForm();
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Operation failed');
    }
  };

  const handleEditGradeLevel = (gl: GradeLevel) => {
    setEditingGradeLevel(gl);
    setGradeLevelForm({
      name: gl.name,
      description: gl.description,
      education_level: gl.education_level,
      order: gl.order,
      is_active: gl.is_active,
    });
    setShowGradeLevelModal(true);
  };

  const handleDeleteGradeLevel = async (id: number) => {
    if (!window.confirm('Delete this grade level and all its sections?')) return;
    try {
      await api.delete(`/api/classrooms/grades/${id}/`);
      toast.success('Deleted');
      await loadData();
    } catch { toast.error('Delete failed'); }
  };

  const resetGradeLevelForm = () => {
    setGradeLevelForm({ name: '', description: '', education_level: 0, order: 1, is_active: true });
    setEditingGradeLevel(null);
  };

  // Section CRUD
  const handleSectionSubmit = async () => {
    if (!sectionForm.name.trim()) return toast.error('Section name is required');
    if (!sectionForm.class_grade) return toast.error('Please select a grade level');
    try {
      if (editingSection) {
        await api.put(`/api/classrooms/sections/${editingSection.id}/`, sectionForm);
        toast.success('Section updated');
      } else {
        await api.post('/api/classrooms/sections/', sectionForm);
        toast.success('Section created');
      }
      setShowSectionModal(false);
      resetSectionForm();
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Operation failed');
    }
  };

  const handleEditSection = (s: Section) => {
    setEditingSection(s);
    setSectionForm({ name: s.name, class_grade: s.class_grade, is_active: s.is_active });
    setShowSectionModal(true);
  };

  const handleDeleteSection = async (id: number) => {
    if (!window.confirm('Delete this section?')) return;
    try {
      await api.delete(`/api/classrooms/sections/${id}/`);
      toast.success('Deleted');
      await loadData();
    } catch { toast.error('Delete failed'); }
  };

  const resetSectionForm = () => {
    setSectionForm({ name: '', class_grade: 0, is_active: true });
    setEditingSection(null);
  };

  // Group grade levels by education level for display
  const gradeLevelsByEdLevel = educationLevels.map(el => ({
    educationLevel: el,
    grades: gradeLevels.filter(g => g.education_level === el.id),
  })).filter(g => g.grades.length > 0);

  const paginatedGradeLevels = gradeLevels.slice(
    (gradeLevelPage - 1) * ITEMS_PER_PAGE, gradeLevelPage * ITEMS_PER_PAGE
  );
  const totalGradeLevelPages = Math.ceil(gradeLevels.length / ITEMS_PER_PAGE);

  const paginatedSections = sections.slice(
    (sectionPage - 1) * SECTIONS_PER_PAGE, sectionPage * SECTIONS_PER_PAGE
  );
  const totalSectionPages = Math.ceil(sections.length / SECTIONS_PER_PAGE);

  const Pagination = ({ currentPage, totalPages, onPageChange }: {
    currentPage: number; totalPages: number; onPageChange: (p: number) => void;
  }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
        <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
        <div className="flex gap-2">
          <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
            className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40 flex items-center gap-1">
            <ChevronLeft size={14}/> Prev
          </button>
          <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
            className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40 flex items-center gap-1">
            Next <ChevronRight size={14}/>
          </button>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="p-6 text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"/>
      <p className="text-gray-600">Loading academic settings...</p>
    </div>
  );

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Academic Settings</h2>
        <p className="text-gray-500 text-sm">Define your school's grade levels and sections</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>Setup guide:</strong> Create grade levels (e.g. "Primary 1", "JSS 2") under each
        education level, then add sections (A, B, C) to each grade. Classrooms are built from
        grade + section combinations.
      </div>
      {/* Education Levels */}
<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <div className="bg-gradient-to-r from-green-600 to-teal-600 px-6 py-4 flex items-center justify-between">
    <h3 className="text-lg font-bold text-white">
      Education Levels ({educationLevels.length})
    </h3>
    <button
      onClick={() => setShowEdLevelModal(true)}
      className="bg-white text-green-600 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-green-50">
      <Plus size={16}/> Add Education Level
    </button>
  </div>

  <div className="p-6">
    {educationLevels.length === 0 ? (
      <div className="text-center py-6 text-gray-400">
        <p>No education levels yet.</p>
        <p className="text-xs mt-1">
          Create one first (e.g. "Primary", "Junior Secondary", "Senior Secondary")
        </p>
      </div>
    ) : (
      <div className="flex flex-wrap gap-2">
        {educationLevels.map(el => (
          <span key={el.id}
            className="px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
            {el.name}
          </span>
        ))}
      </div>
    )}
  </div>
</div>

{/* Education Level Modal */}
{showEdLevelModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl p-6 max-w-md w-full">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Add Education Level</h3>
      <div className="space-y-4">

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            value={edLevelForm.name}
            onChange={e => setEdLevelForm({...edLevelForm, name: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            placeholder="e.g., Primary, Junior Secondary, Senior Secondary"/>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Level Type</label>
          <select
            value={edLevelForm.level_type}
            onChange={e => setEdLevelForm({...edLevelForm, level_type: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none">
            <option value="">Select type</option>
             <option value="Nursery">Nursery</option>
            <option value="primary">Primary</option>
            <option value="junior_secondary">Junior Secondary</option>
            <option value="senior_secondary">Senior Secondary</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
          <input
            type="number" min={1}
            value={edLevelForm.display_order}
            onChange={e => setEdLevelForm({...edLevelForm, display_order: parseInt(e.target.value) || 1})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"/>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setShowEdLevelModal(false)}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 text-sm">
            <X size={16}/> Cancel
          </button>
          <button
            onClick={handleEdLevelSubmit}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 text-sm">
            <Save size={16}/> Create
          </button>
        </div>
      </div>
    </div>
  </div>
)}
      {/* Grade Levels */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-5 h-5 text-white"/>
            <h3 className="text-lg font-bold text-white">Grade Levels ({gradeLevels.length})</h3>
          </div>
          <button onClick={() => { resetGradeLevelForm(); setShowGradeLevelModal(true); }}
            className="bg-white text-blue-600 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-blue-50">
            <Plus size={16}/> Add Grade Level
          </button>
        </div>

        <div className="p-6">
          {gradeLevels.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <GraduationCap className="w-10 h-10 mx-auto mb-2"/>
              <p>No grade levels yet. Click "Add Grade Level" to start.</p>
            </div>
          ) : (
            <>
              {/* Group by education level */}
              {gradeLevelsByEdLevel.map(({ educationLevel, grades }) => (
                <div key={educationLevel.id} className="mb-6">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    {educationLevel.name}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {grades.map(gl => {
                      const gradeSections = getSectionsForGradeLevel(gl.id);
                      return (
                        <div key={gl.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-medium text-gray-900">{gl.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">Order: {gl.order} • {gradeSections.length} section{gradeSections.length !== 1 ? 's' : ''}</p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gl.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {gl.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mb-3 min-h-[24px]">
                            {gradeSections.length > 0
                              ? gradeSections.map(s => (
                                  <span key={s.id} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{s.name}</span>
                                ))
                              : <span className="text-xs text-gray-300 italic">No sections yet</span>
                            }
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleEditGradeLevel(gl)}
                              className="flex-1 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded text-xs font-medium flex items-center justify-center gap-1">
                              <Edit3 size={12}/> Edit
                            </button>
                            <button onClick={() => handleDeleteGradeLevel(gl.id)}
                              className="flex-1 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-medium flex items-center justify-center gap-1">
                              <Trash2 size={12}/> Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <Pagination currentPage={gradeLevelPage} totalPages={totalGradeLevelPages} onPageChange={setGradeLevelPage}/>
            </>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-white"/>
            <h3 className="text-lg font-bold text-white">Sections ({sections.length})</h3>
          </div>
          <button onClick={() => { resetSectionForm(); setShowSectionModal(true); }}
            disabled={gradeLevels.length === 0}
            className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-indigo-50 disabled:opacity-40">
            <Plus size={16}/> Add Section
          </button>
        </div>

        <div className="p-6">
          {sections.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Layers className="w-10 h-10 mx-auto mb-2"/>
              <p>No sections yet. Create grade levels first, then add sections.</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Section</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Grade Level</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedSections.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                      <td className="px-4 py-3 text-gray-600">{s.grade_level_name || s.classroom_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleEditSection(s)} className="p-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded"><Edit3 size={14}/></button>
                          <button onClick={() => handleDeleteSection(s.id)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded"><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination currentPage={sectionPage} totalPages={totalSectionPages} onPageChange={setSectionPage}/>
            </>
          )}
        </div>
      </div>

      {/* Grade Level Modal */}
      {showGradeLevelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingGradeLevel ? 'Edit Grade Level' : 'Add Grade Level'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" value={gradeLevelForm.name}
                  onChange={e => setGradeLevelForm({...gradeLevelForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g., Primary 1, JSS 2, SS 3"/>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Education Level *</label>
                <select value={gradeLevelForm.education_level}
                  onChange={e => setGradeLevelForm({...gradeLevelForm, education_level: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value={0}>Select education level</option>
                  {educationLevels.map(el => (
                    <option key={el.id} value={el.id}>{el.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Which school stage does this grade belong to?</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order *</label>
                <input type="number" min={1} value={gradeLevelForm.order}
                  onChange={e => setGradeLevelForm({...gradeLevelForm, order: parseInt(e.target.value) || 1})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"/>
                <p className="text-xs text-gray-400 mt-1">Sequence within the education level (1 = first grade, 2 = second, etc.)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={gradeLevelForm.description} rows={2}
                  onChange={e => setGradeLevelForm({...gradeLevelForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Optional"/>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="gl-active" checked={gradeLevelForm.is_active}
                  onChange={e => setGradeLevelForm({...gradeLevelForm, is_active: e.target.checked})}
                  className="rounded border-gray-300"/>
                <label htmlFor="gl-active" className="text-sm text-gray-700">Active</label>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowGradeLevelModal(false); resetGradeLevelForm(); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 text-sm">
                  <X size={16}/> Cancel
                </button>
                <button onClick={handleGradeLevelSubmit}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm">
                  <Save size={16}/> {editingGradeLevel ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Modal */}
      {showSectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingSection ? 'Edit Section' : 'Add Section'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section Name *</label>
                <input type="text" value={sectionForm.name}
                  onChange={e => setSectionForm({...sectionForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g., A, B, C, Gold, Silver"/>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level *</label>
                <select
                  value={
                    // reverse-map: find grade level id from class_grade id
                    linkedClasses.find(c => c.id === sectionForm.class_grade)?.grade_level || 0
                  }
                  onChange={e => {
                    const glId = parseInt(e.target.value);
                    const classId = getClassIdForGradeLevel(glId);
                    setSectionForm({...sectionForm, class_grade: classId});
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value={0}>Select grade level</option>
                  {educationLevels.map(el => {
                    const elGrades = gradeLevels.filter(g => g.education_level === el.id);
                    if (elGrades.length === 0) return null;
                    return (
                      <optgroup key={el.id} label={el.name}>
                        {elGrades.map(gl => (
                          <option key={gl.id} value={gl.id}
                            disabled={getClassIdForGradeLevel(gl.id) === 0}>
                            {gl.name}{getClassIdForGradeLevel(gl.id) === 0 ? ' (not ready)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                <p className="text-xs text-gray-400 mt-1">Sections are grouped under a grade level</p>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="sec-active" checked={sectionForm.is_active}
                  onChange={e => setSectionForm({...sectionForm, is_active: e.target.checked})}
                  className="rounded border-gray-300"/>
                <label htmlFor="sec-active" className="text-sm text-gray-700">Active</label>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowSectionModal(false); resetSectionForm(); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 text-sm">
                  <X size={16}/> Cancel
                </button>
                <button onClick={handleSectionSubmit}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2 text-sm">
                  <Save size={16}/> {editingSection ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicGradeLevelTab;