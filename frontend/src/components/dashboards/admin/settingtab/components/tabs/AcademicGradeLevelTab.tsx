// import React, { useState, useEffect } from 'react';
// import { Plus, Edit3, Trash2, Save, X, GraduationCap, Layers } from 'lucide-react';
// import { toast } from 'react-toastify';
// import api from '@/services/api';
// // import ToggleSwitch from '@/components/dashboards/admin/settingtab/components/ToggleSwitch';

// interface GradeLevel {
//   id: number;
//   name: string;
//   description: string;
//   education_level: string;
//   order: number;
//   is_active: boolean;
// }

// interface Section {
//   id: number;
//   name: string;
//   grade_level: number;
//   grade_level_name?: string;
//   is_active: boolean;
// }

// const AcademicGradeLevelTab = () => {
//   const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
//   const [sections, setSections] = useState<Section[]>([]);
//   const [loading, setLoading] = useState(true);
  
//   // Modal states
//   const [showGradeLevelModal, setShowGradeLevelModal] = useState(false);
//   const [showSectionModal, setShowSectionModal] = useState(false);
//   const [editingGradeLevel, setEditingGradeLevel] = useState<GradeLevel | null>(null);
//   const [editingSection, setEditingSection] = useState<Section | null>(null);
  
//   // Form states
//   const [gradeLevelForm, setGradeLevelForm] = useState({
//     name: '',
//     description: '',
//     education_level: 'PRIMARY',
//     order: 1,
//     is_active: true
//   });
  
//   const [sectionForm, setSectionForm] = useState({
//     name: '',
//     grade_level: 0,
//     is_active: true
//   });

//   const EDUCATION_LEVELS = [
//     { value: 'NURSERY', label: 'Nursery' },
//     { value: 'PRIMARY', label: 'Primary' },
//     { value: 'JUNIOR_SECONDARY', label: 'Junior Secondary' },
//     { value: 'SENIOR_SECONDARY', label: 'Senior Secondary' }
//   ];

//   useEffect(() => {
//     loadData();
//   }, []);

//   const loadData = async () => {
//     try {
//       setLoading(true);
//       const [gradeLevelsRes, sectionsRes] = await Promise.all([
//         api.get('/api/classrooms/grades/'),
//         api.get('/api/classrooms/sections/')
//       ]);
      
//       setGradeLevels(Array.isArray(gradeLevelsRes) ? gradeLevelsRes : (gradeLevelsRes.results || []));
//       setSections(Array.isArray(sectionsRes) ? sectionsRes : (sectionsRes.results || []));
//     } catch (error: any) {
//       console.error('Error loading data:', error);
//       toast.error('Failed to load academic data');
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Grade Level Operations
//   const handleGradeLevelSubmit = async () => {
//     if (!gradeLevelForm.name.trim()) {
//       toast.error('Grade level name is required');
//       return;
//     }

//     try {
//       if (editingGradeLevel) {
//         await api.put(`/api/classrooms/grades/${editingGradeLevel.id}/`, gradeLevelForm);
//         toast.success('Grade level updated successfully');
//       } else {
//         await api.post('/api/classrooms/grades/', gradeLevelForm);
//         toast.success('Grade level created successfully');
//       }
      
//       resetGradeLevelForm();
//       setShowGradeLevelModal(false);
//       await loadData();
//     } catch (error: any) {
//       const errorMessage = error.response?.data?.detail || 
//                           error.response?.data?.message || 
//                           'Operation failed';
//       toast.error(errorMessage);
//     }
//   };

//   const handleEditGradeLevel = (gradeLevel: GradeLevel) => {
//     setEditingGradeLevel(gradeLevel);
//     setGradeLevelForm({
//       name: gradeLevel.name,
//       description: gradeLevel.description,
//       education_level: gradeLevel.education_level,
//       order: gradeLevel.order,
//       is_active: gradeLevel.is_active
//     });
//     setShowGradeLevelModal(true);
//   };

//   const handleDeleteGradeLevel = async (id: number) => {
//     if (!window.confirm('Are you sure you want to delete this grade level? This will also delete all associated sections.')) {
//       return;
//     }

//     try {
//       await api.delete(`/api/classrooms/grades/${id}/`);
//       toast.success('Grade level deleted successfully');
//       await loadData();
//     } catch (error: any) {
//       toast.error('Failed to delete grade level');
//     }
//   };

//   const resetGradeLevelForm = () => {
//     setGradeLevelForm({
//       name: '',
//       description: '',
//       education_level: 'PRIMARY',
//       order: 1,
//       is_active: true
//     });
//     setEditingGradeLevel(null);
//   };

//   // Section Operations
//   const handleSectionSubmit = async () => {
//     if (!sectionForm.name.trim()) {
//       toast.error('Section name is required');
//       return;
//     }
    
//     if (!sectionForm.grade_level) {
//       toast.error('Please select a grade level');
//       return;
//     }

//     try {
//       if (editingSection) {
//         await api.put(`/api/classrooms/sections/${editingSection.id}/`, sectionForm);
//         toast.success('Section updated successfully');
//       } else {
//         await api.post('/api/classrooms/sections/', sectionForm);
//         toast.success('Section created successfully');
//       }
      
//       resetSectionForm();
//       setShowSectionModal(false);
//       await loadData();
//     } catch (error: any) {
//       const errorMessage = error.response?.data?.detail || 
//                           error.response?.data?.message || 
//                           'Operation failed';
//       toast.error(errorMessage);
//     }
//   };

//   const handleEditSection = (section: Section) => {
//     setEditingSection(section);
//     setSectionForm({
//       name: section.name,
//       grade_level: section.grade_level,
//       is_active: section.is_active
//     });
//     setShowSectionModal(true);
//   };

//   const handleDeleteSection = async (id: number) => {
//     if (!window.confirm('Are you sure you want to delete this section?')) {
//       return;
//     }



//     try {
//       await api.delete(`/api/classrooms/sections/${id}/`);
//       toast.success('Section deleted successfully');
//       await loadData();
//     } catch (error: any) {
//       toast.error('Failed to delete section');
//     }
//   };

//   const resetSectionForm = () => {
//     setSectionForm({
//       name: '',
//       grade_level: 0,
//       is_active: true
//     });
//     setEditingSection(null);
//   };

//   const getSectionsForGradeLevel = (gradeLevelId: number) => {
//     return sections.filter(s => s.grade_level === gradeLevelId);
//   };

//   const getGradeLevelName = (gradeLevelId: number) => {
//     const gradeLevel = gradeLevels.find(g => g.id === gradeLevelId);
//     return gradeLevel?.name || 'Unknown';
//   };

//   if (loading) {
//     return (
//       <div className="p-6 text-center">
//         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
//         <p className="text-gray-600">Loading academic settings...</p>
//       </div>
//     );
//   }

//   return (
//     <div className="p-6 space-y-8">
//       <div>
//         <h2 className="text-2xl font-bold text-gray-900 mb-2">Academic Settings</h2>
//         <p className="text-gray-600">Manage grade levels and sections for your school</p>
//       </div>

//       <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
//         <div className="flex items-start gap-3">
//           <div className="flex-shrink-0">
//             <GraduationCap className="w-5 h-5 text-blue-600" />
//           </div>
//           <div>
//             <h3 className="text-sm font-semibold text-blue-900 mb-1">Quick Guide</h3>
//             <ul className="text-sm text-blue-700 space-y-1">
//               <li><strong>1. Create Grade Levels:</strong> Define grade levels (e.g., Primary 1, JSS 2) with their education level and order.</li>
//               <li><strong>2. Add Sections:</strong> Create sections (A, B, C) for each grade level.</li>
//               <li><strong>3. Create Classrooms:</strong> Combine grade level + section in the classroom page (e.g., "Primary 1A").</li>
//             </ul>
//           </div>
//         </div>
//       </div>

//       <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
//         <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
//           <div className="flex items-center gap-3">
//             <GraduationCap className="w-6 h-6 text-white" />
//             <h3 className="text-xl font-bold text-white">Grade Levels</h3>
//           </div>
//           <button
//             onClick={() => {
//               resetGradeLevelForm();
//               setShowGradeLevelModal(true);
//             }}
//             className="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-50 transition-colors"
//           >
//             <Plus size={18} />
//             Add Grade Level
//           </button>
//         </div>

//         <div className="p-6">
//           {gradeLevels.length === 0 ? (
//             <div className="text-center py-8 text-gray-500">
//               <GraduationCap className="w-12 h-12 mx-auto mb-3 text-gray-300" />
//               <p>No grade levels created yet</p>
//               <p className="text-sm">Click "Add Grade Level" to get started</p>
//             </div>
//           ) : (
//             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//               {gradeLevels.map((gradeLevel) => (
//                 <div key={gradeLevel.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
//                   <div className="flex items-start justify-between mb-3">
//                     <div>
//                       <h4 className="font-semibold text-gray-900">{gradeLevel.name}</h4>
//                       <p className="text-xs text-gray-500 mt-1">
//                         {EDUCATION_LEVELS.find(e => e.value === gradeLevel.education_level)?.label} • Order: {gradeLevel.order}
//                       </p>
//                     </div>
//                     <span className={`px-2 py-1 rounded-full text-xs font-medium ${
//                       gradeLevel.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
//                     }`}>
//                       {gradeLevel.is_active ? 'Active' : 'Inactive'}
//                     </span>
//                   </div>
                  
//                   {gradeLevel.description && (
//                     <p className="text-sm text-gray-600 mb-3">{gradeLevel.description}</p>
//                   )}
                  
//                   <div className="mb-3">
//                     <p className="text-xs text-gray-500 mb-2">
//                       Sections ({getSectionsForGradeLevel(gradeLevel.id).length}):
//                     </p>
//                     <div className="flex flex-wrap gap-1">
//                       {getSectionsForGradeLevel(gradeLevel.id).length > 0 ? (
//                         getSectionsForGradeLevel(gradeLevel.id).map(section => (
//                           <span key={section.id} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
//                             {section.name}
//                           </span>
//                         ))
//                       ) : (
//                         <span className="text-xs text-gray-400 italic">No sections yet</span>
//                       )}
//                     </div>
//                   </div>
                  
//                   <div className="flex gap-2">
//                     <button
//                       onClick={() => handleEditGradeLevel(gradeLevel)}
//                       className="flex-1 px-3 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
//                     >
//                       <Edit3 size={14} />
//                       Edit
//                     </button>
//                     <button
//                       onClick={() => handleDeleteGradeLevel(gradeLevel.id)}
//                       className="flex-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
//                     >
//                       <Trash2 size={14} />
//                       Delete
//                     </button>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>
//       </div>

//       <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
//         <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
//           <div className="flex items-center gap-3">
//             <Layers className="w-6 h-6 text-white" />
//             <h3 className="text-xl font-bold text-white">Sections</h3>
//           </div>
//           <button
//             onClick={() => {
//               resetSectionForm();
//               setShowSectionModal(true);
//             }}
//             className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
//             disabled={gradeLevels.length === 0}
//           >
//             <Plus size={18} />
//             Add Section
//           </button>
//         </div>

//         <div className="p-6">
//           {gradeLevels.length === 0 ? (
//             <div className="text-center py-8 text-gray-500">
//               <p>Please create grade levels first before adding sections</p>
//             </div>
//           ) : sections.length === 0 ? (
//             <div className="text-center py-8 text-gray-500">
//               <Layers className="w-12 h-12 mx-auto mb-3 text-gray-300" />
//               <p>No sections created yet</p>
//               <p className="text-sm">Click "Add Section" to get started</p>
//             </div>
//           ) : (
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead className="bg-gray-50 border-b border-gray-200">
//                   <tr>
//                     <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Section</th>
//                     <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Grade Level</th>
//                     <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
//                     <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
//                   </tr>
//                 </thead>
//                 <tbody className="divide-y divide-gray-200">
//                   {sections.map((section) => (
//                     <tr key={section.id} className="hover:bg-gray-50 transition-colors">
//                       <td className="px-6 py-4">
//                         <span className="font-medium text-gray-900">{section.name}</span>
//                       </td>
//                       <td className="px-6 py-4 text-sm text-gray-600">
//                         {getGradeLevelName(section.grade_level)}
//                       </td>
//                       <td className="px-6 py-4">
//                         <span className={`px-2 py-1 rounded-full text-xs font-medium ${
//                           section.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
//                         }`}>
//                           {section.is_active ? 'Active' : 'Inactive'}
//                         </span>
//                       </td>
//                       <td className="px-6 py-4">
//                         <div className="flex gap-2">
//                           <button
//                             onClick={() => handleEditSection(section)}
//                             className="p-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg transition-colors"
//                           >
//                             <Edit3 size={16} />
//                           </button>
//                           <button
//                             onClick={() => handleDeleteSection(section.id)}
//                             className="p-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors"
//                           >
//                             <Trash2 size={16} />
//                           </button>
//                         </div>
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           )}
//         </div>
//       </div>

//       {showGradeLevelModal && (
//         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
//           <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
//             <h3 className="text-xl font-bold text-gray-900 mb-4">
//               {editingGradeLevel ? 'Edit Grade Level' : 'Add Grade Level'}
//             </h3>
//             <div className="space-y-4">
//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
//                 <input
//                   type="text"
//                   value={gradeLevelForm.name}
//                   onChange={(e) => setGradeLevelForm({...gradeLevelForm, name: e.target.value})}
//                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
//                   placeholder="e.g., Primary 1, JSS 2"
//                 />
//               </div>
              
//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
//                 <textarea
//                   value={gradeLevelForm.description}
//                   onChange={(e) => setGradeLevelForm({...gradeLevelForm, description: e.target.value})}
//                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
//                   rows={3}
//                   placeholder="Optional description"
//                 />
//               </div>
              
//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-1">Education Level *</label>
//                 <select
//                   value={gradeLevelForm.education_level}
//                   onChange={(e) => setGradeLevelForm({...gradeLevelForm, education_level: e.target.value})}
//                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
//                 >
//                   {EDUCATION_LEVELS.map(level => (
//                     <option key={level.value} value={level.value}>{level.label}</option>
//                   ))}
//                 </select>
//               </div>
              
//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-1">Order *</label>
//                 <input
//                   type="number"
//                   value={gradeLevelForm.order}
//                   onChange={(e) => setGradeLevelForm({...gradeLevelForm, order: parseInt(e.target.value) || 1})}
//                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
//                   min="1"
//                 />
//                 <p className="text-xs text-gray-500 mt-1">Order determines sequence (1 for first grade, 2 for second, etc.)</p>
//               </div>
              
//               <div className="flex items-center">
//                 <input
//                   type="checkbox"
//                   id="gradeLevel-active"
//                   checked={gradeLevelForm.is_active}
//                   onChange={(e) => setGradeLevelForm({...gradeLevelForm, is_active: e.target.checked})}
//                   className="rounded border-gray-300 mr-2"
//                 />
//                 <label htmlFor="gradeLevel-active" className="text-sm font-medium text-gray-700">Active</label>
//               </div>
              
//               <div className="flex gap-3 pt-4">
//                 <button
//                   onClick={() => {
//                     setShowGradeLevelModal(false);
//                     resetGradeLevelForm();
//                   }}
//                   className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
//                 >
//                   <X size={18} />
//                   Cancel
//                 </button>
//                 <button
//                   onClick={handleGradeLevelSubmit}
//                   className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
//                 >
//                   <Save size={18} />
//                   {editingGradeLevel ? 'Update' : 'Create'}
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       {showSectionModal && (
//         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
//           <div className="bg-white rounded-xl p-6 max-w-md w-full">
//             <h3 className="text-xl font-bold text-gray-900 mb-4">
//               {editingSection ? 'Edit Section' : 'Add Section'}
//             </h3>
//             <div className="space-y-4">
//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-1">Section Name *</label>
//                 <input
//                   type="text"
//                   value={sectionForm.name}
//                   onChange={(e) => setSectionForm({...sectionForm, name: e.target.value})}
//                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
//                   placeholder="e.g., A, B, C, Gold, Silver"
//                 />
//               </div>
              
//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level *</label>
//                 <select
//                   value={sectionForm.grade_level}
//                   onChange={(e) => setSectionForm({...sectionForm, grade_level: parseInt(e.target.value) || 0})}
//                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
//                 >
//                   <option value="">Select Grade Level</option>
//                   {gradeLevels.map(gradeLevel => (
//                     <option key={gradeLevel.id} value={gradeLevel.id}>
//                       {gradeLevel.name} ({EDUCATION_LEVELS.find(e => e.value === gradeLevel.education_level)?.label})
//                     </option>
//                   ))}
//                 </select>
//               </div>
              
//               <div className="flex items-center">
//                 <input
//                   type="checkbox"
//                   id="section-active"
//                   checked={sectionForm.is_active}
//                   onChange={(e) => setSectionForm({...sectionForm, is_active: e.target.checked})}
//                   className="rounded border-gray-300 mr-2"
//                 />
//                 <label htmlFor="section-active" className="text-sm font-medium text-gray-700">Active</label>
//               </div>
              
//               <div className="flex gap-3 pt-4">
//                 <button
//                   onClick={() => {
//                     setShowSectionModal(false);
//                     resetSectionForm();
//                   }}
//                   className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
//                 >
//                   <X size={18} />
//                   Cancel
//                 </button>
//                 <button
//                   onClick={handleSectionSubmit}
//                   className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
//                 >
//                   <Save size={18} />
//                   {editingSection ? 'Update' : 'Create'}
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default AcademicGradeLevelTab;

import React, { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, Save, X, GraduationCap, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/services/api';

interface GradeLevel {
  id: number;
  name: string;
  description: string;
  education_level: string;
  order: number;
  is_active: boolean;
}

interface Section {
  id: number;
  name: string;
  grade_level: number;
  grade_level_name?: string;
  is_active: boolean;
}

const AcademicGradeLevelTab = () => {
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination states
  const [gradeLevelPage, setGradeLevelPage] = useState(1);
  const [sectionPage, setSectionPage] = useState(1);
  const ITEMS_PER_PAGE = 6; // Grade levels per page
  const SECTIONS_PER_PAGE = 10; // Sections per page
  
  // Modal states
  const [showGradeLevelModal, setShowGradeLevelModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingGradeLevel, setEditingGradeLevel] = useState<GradeLevel | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  
  // Form states
  const [gradeLevelForm, setGradeLevelForm] = useState({
    name: '',
    description: '',
    education_level: 'PRIMARY',
    order: 1,
    is_active: true
  });
  
  const [sectionForm, setSectionForm] = useState({
    name: '',
    grade_level: 0,
    is_active: true
  });

  const EDUCATION_LEVELS = [
    { value: 'NURSERY', label: 'Nursery' },
    { value: 'PRIMARY', label: 'Primary' },
    { value: 'JUNIOR_SECONDARY', label: 'Junior Secondary' },
    { value: 'SENIOR_SECONDARY', label: 'Senior Secondary' }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // ✅ Load ALL data at once with large page_size
      const [gradeLevelsRes, sectionsRes] = await Promise.all([
        api.get('/api/classrooms/grades/', {
          params: { 
            page_size: 1000, // Get all grade levels
            ordering: 'education_level,order'
          }
        }),
        api.get('/api/classrooms/sections/', {
          params: { 
            page_size: 1000, // Get all sections
            ordering: 'grade_level__order,name'
          }
        })
      ]);
      
      // Handle both paginated and non-paginated responses
      const gradeLevelsData = Array.isArray(gradeLevelsRes) 
        ? gradeLevelsRes 
        : (gradeLevelsRes.results || gradeLevelsRes.data || []);
      
      const sectionsData = Array.isArray(sectionsRes) 
        ? sectionsRes 
        : (sectionsRes.results || sectionsRes.data || []);
      
      console.log('📊 Loaded Grade Levels:', gradeLevelsData.length);
      console.log('📊 Loaded Sections:', sectionsData.length);
      
      setGradeLevels(gradeLevelsData);
      setSections(sectionsData);
      
    } catch (error: any) {
      console.error('❌ Error loading data:', error);
      toast.error('Failed to load academic data');
    } finally {
      setLoading(false);
    }
  };

  // Grade Level Operations
  const handleGradeLevelSubmit = async () => {
    if (!gradeLevelForm.name.trim()) {
      toast.error('Grade level name is required');
      return;
    }

    try {
      if (editingGradeLevel) {
        await api.put(`/api/classrooms/grades/${editingGradeLevel.id}/`, gradeLevelForm);
        toast.success('Grade level updated successfully');
      } else {
        await api.post('/api/classrooms/grades/', gradeLevelForm);
        toast.success('Grade level created successfully');
      }
      
      resetGradeLevelForm();
      setShowGradeLevelModal(false);
      await loadData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.message || 
                          'Operation failed';
      toast.error(errorMessage);
    }
  };

  const handleEditGradeLevel = (gradeLevel: GradeLevel) => {
    setEditingGradeLevel(gradeLevel);
    setGradeLevelForm({
      name: gradeLevel.name,
      description: gradeLevel.description,
      education_level: gradeLevel.education_level,
      order: gradeLevel.order,
      is_active: gradeLevel.is_active
    });
    setShowGradeLevelModal(true);
  };

  const handleDeleteGradeLevel = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this grade level? This will also delete all associated sections.')) {
      return;
    }

    try {
      await api.delete(`/api/classrooms/grades/${id}/`);
      toast.success('Grade level deleted successfully');
      await loadData();
    } catch (error: any) {
      toast.error('Failed to delete grade level');
    }
  };

  const resetGradeLevelForm = () => {
    setGradeLevelForm({
      name: '',
      description: '',
      education_level: 'PRIMARY',
      order: 1,
      is_active: true
    });
    setEditingGradeLevel(null);
  };

  // Section Operations
  const handleSectionSubmit = async () => {
    if (!sectionForm.name.trim()) {
      toast.error('Section name is required');
      return;
    }
    
    if (!sectionForm.grade_level) {
      toast.error('Please select a grade level');
      return;
    }

    try {
      if (editingSection) {
        await api.put(`/api/classrooms/sections/${editingSection.id}/`, sectionForm);
        toast.success('Section updated successfully');
      } else {
        await api.post('/api/classrooms/sections/', sectionForm);
        toast.success('Section created successfully');
      }
      
      resetSectionForm();
      setShowSectionModal(false);
      await loadData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.message || 
                          'Operation failed';
      toast.error(errorMessage);
    }
  };

  const handleEditSection = (section: Section) => {
    setEditingSection(section);
    setSectionForm({
      name: section.name,
      grade_level: section.grade_level,
      is_active: section.is_active
    });
    setShowSectionModal(true);
  };

  const handleDeleteSection = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this section?')) {
      return;
    }

    try {
      await api.delete(`/api/classrooms/sections/${id}/`);
      toast.success('Section deleted successfully');
      await loadData();
    } catch (error: any) {
      toast.error('Failed to delete section');
    }
  };

  const resetSectionForm = () => {
    setSectionForm({
      name: '',
      grade_level: 0,
      is_active: true
    });
    setEditingSection(null);
  };

  const getSectionsForGradeLevel = (gradeLevelId: number) => {
    return sections.filter(s => s.grade_level === gradeLevelId);
  };

  const getGradeLevelName = (gradeLevelId: number) => {
    const gradeLevel = gradeLevels.find(g => g.id === gradeLevelId);
    return gradeLevel?.name || 'Unknown';
  };

  // ✅ Pagination Logic for Grade Levels
  const totalGradeLevelPages = Math.ceil(gradeLevels.length / ITEMS_PER_PAGE);
  const paginatedGradeLevels = gradeLevels.slice(
    (gradeLevelPage - 1) * ITEMS_PER_PAGE,
    gradeLevelPage * ITEMS_PER_PAGE
  );

  // ✅ Pagination Logic for Sections
  const totalSectionPages = Math.ceil(sections.length / SECTIONS_PER_PAGE);
  const paginatedSections = sections.slice(
    (sectionPage - 1) * SECTIONS_PER_PAGE,
    sectionPage * SECTIONS_PER_PAGE
  );

  // ✅ Pagination Component
  const Pagination = ({ 
    currentPage, 
    totalPages, 
    onPageChange 
  }: { 
    currentPage: number; 
    totalPages: number; 
    onPageChange: (page: number) => void;
  }) => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
        <div className="text-sm text-gray-700">
          Page <span className="font-medium">{currentPage}</span> of{' '}
          <span className="font-medium">{totalPages}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading academic settings...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Academic Settings</h2>
        <p className="text-gray-600">Manage grade levels and sections for your school</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <GraduationCap className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Quick Guide</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li><strong>1. Create Grade Levels:</strong> Define grade levels (e.g., Primary 1, JSS 2) with their education level and order.</li>
              <li><strong>2. Add Sections:</strong> Create sections (A, B, C) for each grade level.</li>
              <li><strong>3. Create Classrooms:</strong> Combine grade level + section in the classroom page (e.g., "Primary 1A").</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Grade Levels Section with Pagination */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-6 h-6 text-white" />
            <h3 className="text-xl font-bold text-white">
              Grade Levels ({gradeLevels.length})
            </h3>
          </div>
          <button
            onClick={() => {
              resetGradeLevelForm();
              setShowGradeLevelModal(true);
            }}
            className="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-50 transition-colors"
          >
            <Plus size={18} />
            Add Grade Level
          </button>
        </div>

        <div className="p-6">
          {gradeLevels.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No grade levels created yet</p>
              <p className="text-sm">Click "Add Grade Level" to get started</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedGradeLevels.map((gradeLevel) => {
                  const gradeSections = getSectionsForGradeLevel(gradeLevel.id);
                  
                  return (
                    <div key={gradeLevel.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-900">{gradeLevel.name}</h4>
                          <p className="text-xs text-gray-500 mt-1">
                            {EDUCATION_LEVELS.find(e => e.value === gradeLevel.education_level)?.label} • Order: {gradeLevel.order}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          gradeLevel.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {gradeLevel.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      
                      {gradeLevel.description && (
                        <p className="text-sm text-gray-600 mb-3">{gradeLevel.description}</p>
                      )}
                      
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-2">
                          Sections ({gradeSections.length}):
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {gradeSections.length > 0 ? (
                            gradeSections.map(section => (
                              <span key={section.id} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                                {section.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400 italic">No sections yet</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditGradeLevel(gradeLevel)}
                          className="flex-1 px-3 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <Edit3 size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteGradeLevel(gradeLevel.id)}
                          className="flex-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Grade Level Pagination */}
              <Pagination
                currentPage={gradeLevelPage}
                totalPages={totalGradeLevelPages}
                onPageChange={setGradeLevelPage}
              />
            </>
          )}
        </div>
      </div>

      {/* Sections Section with Pagination */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="w-6 h-6 text-white" />
            <h3 className="text-xl font-bold text-white">
              Sections ({sections.length})
            </h3>
          </div>
          <button
            onClick={() => {
              resetSectionForm();
              setShowSectionModal(true);
            }}
            className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={gradeLevels.length === 0}
          >
            <Plus size={18} />
            Add Section
          </button>
        </div>

        <div className="p-6">
          {gradeLevels.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Please create grade levels first before adding sections</p>
            </div>
          ) : sections.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Layers className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No sections created yet</p>
              <p className="text-sm">Click "Add Section" to get started</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Section</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Grade Level</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginatedSections.map((section) => (
                      <tr key={section.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-medium text-gray-900">{section.name}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {getGradeLevelName(section.grade_level)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            section.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {section.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditSection(section)}
                              className="p-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg transition-colors"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteSection(section.id)}
                              className="p-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Section Pagination */}
              <Pagination
                currentPage={sectionPage}
                totalPages={totalSectionPages}
                onPageChange={setSectionPage}
              />
            </>
          )}
        </div>
      </div>

      {/* Modals remain the same... */}
      {showGradeLevelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {editingGradeLevel ? 'Edit Grade Level' : 'Add Grade Level'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={gradeLevelForm.name}
                  onChange={(e) => setGradeLevelForm({...gradeLevelForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g., Primary 1, JSS 2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={gradeLevelForm.description}
                  onChange={(e) => setGradeLevelForm({...gradeLevelForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Education Level *</label>
                <select
                  value={gradeLevelForm.education_level}
                  onChange={(e) => setGradeLevelForm({...gradeLevelForm, education_level: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {EDUCATION_LEVELS.map(level => (
                    <option key={level.value} value={level.value}>{level.label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order *</label>
                <input
                  type="number"
                  value={gradeLevelForm.order}
                  onChange={(e) => setGradeLevelForm({...gradeLevelForm, order: parseInt(e.target.value) || 1})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  min="1"
                />
                <p className="text-xs text-gray-500 mt-1">Order determines sequence (1 for first grade, 2 for second, etc.)</p>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="gradeLevel-active"
                  checked={gradeLevelForm.is_active}
                  onChange={(e) => setGradeLevelForm({...gradeLevelForm, is_active: e.target.checked})}
                  className="rounded border-gray-300 mr-2"
                />
                <label htmlFor="gradeLevel-active" className="text-sm font-medium text-gray-700">Active</label>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowGradeLevelModal(false);
                    resetGradeLevelForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <X size={18} />
                  Cancel
                </button>
                <button
                  onClick={handleGradeLevelSubmit}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  {editingGradeLevel ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {editingSection ? 'Edit Section' : 'Add Section'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section Name *</label>
                <input
                  type="text"
                  value={sectionForm.name}
                  onChange={(e) => setSectionForm({...sectionForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g., A, B, C, Gold, Silver"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level *</label>
                <select
                  value={sectionForm.grade_level}
                  onChange={(e) => setSectionForm({...sectionForm, grade_level: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select Grade Level</option>
                  {gradeLevels.map(gradeLevel => (
                    <option key={gradeLevel.id} value={gradeLevel.id}>
                      {gradeLevel.name} ({EDUCATION_LEVELS.find(e => e.value === gradeLevel.education_level)?.label})
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="section-active"
                  checked={sectionForm.is_active}
                  onChange={(e) => setSectionForm({...sectionForm, is_active: e.target.checked})}
                  className="rounded border-gray-300 mr-2"
                />
                <label htmlFor="section-active" className="text-sm font-medium text-gray-700">Active</label>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowSectionModal(false);
                    resetSectionForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <X size={18} />
                  Cancel
                </button>
                <button
                  onClick={handleSectionSubmit}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  {editingSection ? 'Update' : 'Create'}
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