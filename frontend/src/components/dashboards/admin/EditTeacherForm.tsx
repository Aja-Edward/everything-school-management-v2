import React, { useState, useEffect, useRef } from 'react';
import type {
  Teacher,
  AssignmentRow,
  UpdateTeacherData,
  LevelType,
  EditTeacherFormData,
  SubjectOption,
} from '@/types/teacher';
import api from '@/services/api';

interface EditTeacherFormProps {
  teacher: Teacher | null;
  onSave: (data: UpdateTeacherData) => void;
  onCancel: () => void;
  themeClasses: any;
  isDark: boolean;
}

const LEVEL_TO_EDUCATION_LEVEL: Record<string, string> = {
  nursery:          'NURSERY',
  primary:          'PRIMARY',
  junior_secondary: 'JUNIOR_SECONDARY',
  senior_secondary: 'SENIOR_SECONDARY',
  secondary:        'JUNIOR_SECONDARY',
};

const LEVEL_TO_CLASSROOM_FILTER: Record<string, string> = {
  nursery:          'NURSERY',
  primary:          'PRIMARY',
  junior_secondary: 'JUNIOR_SECONDARY',
  senior_secondary: 'SENIOR_SECONDARY',
  secondary:        'SECONDARY',
};

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────

const EditTeacherForm: React.FC<EditTeacherFormProps> = ({
  teacher,
  onSave,
  onCancel,
  themeClasses,
}) => {
  const [formData, setFormData] = useState<EditTeacherFormData>(() => ({
    first_name:     teacher?.user?.first_name    || teacher?.first_name    || '',
    last_name:      teacher?.user?.last_name     || teacher?.last_name     || '',
    email:          teacher?.user?.email         || teacher?.email         || '',
    employee_id:    teacher?.employee_id         || '',
    phone_number:   teacher?.phone_number        || '',
    address:        teacher?.address             || '',
    qualification:  teacher?.qualification       || '',
    specialization: teacher?.specialization      || '',
    staff_type:     (teacher?.staff_type as 'teaching' | 'non-teaching') || 'teaching',
    level:          (teacher?.level || undefined) as LevelType,
    is_active:      teacher?.is_active           ?? true,
    photo:          teacher?.photo               || undefined,
  }));

  const [photoPreview, setPhotoPreview] = useState<string | null>(teacher?.photo || null);
  const [uploading, setUploading]       = useState(false);

  // ── Subjects ──────────────────────────────────────────────────────────────
  const [subjectOptions, setSubjectOptions]       = useState< SubjectOption[]>([]);
  const [selectedSubjects, setSelectedSubjects]   = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading]     = useState(false);
  const [subjectPage, setSubjectPage]             = useState(1);
  const [subjectTotalCount, setSubjectTotalCount] = useState(0);
  const [subjectHasNext, setSubjectHasNext]       = useState(false);
  const [subjectHasPrev, setSubjectHasPrev]       = useState(false);

  // Use a ref to track whether we've already seeded from teacher.assigned_subjects,
  // keyed by level so a level-change correctly re-seeds.
  const seededLevelRef = useRef<string | undefined | null>(null);

  // ── Classrooms ────────────────────────────────────────────────────────────
  const [classroomOptions, setClassroomOptions]   = useState<{ id: number; name: string }[]>([]);
  const [classroomsLoading, setClassroomsLoading] = useState(false);

  // ── Classroom Assignments ─────────────────────────────────────────────────
  const [currentAssignments, setCurrentAssignments] = useState<AssignmentRow[]>([]);

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 1 — Reset page + selections when level changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    setSubjectPage(1);
    setSelectedSubjects([]);
    seededLevelRef.current = null;
  }, [formData.level]);

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 2 — Fetch subjects page
  //
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (formData.staff_type !== 'teaching' || !formData.level) {
      setSubjectOptions([]);
      setSubjectTotalCount(0);
      setSubjectHasNext(false);
      setSubjectHasPrev(false);
      return;
    }

    const educationLevel = LEVEL_TO_EDUCATION_LEVEL[formData.level];
    if (!educationLevel) return;

    let cancelled = false; // prevent stale state updates if level/page changes mid-fetch

    const fetchSubjects = async () => {
      setSubjectsLoading(true);
      try {
        // Build URL params explicitly so offset is always sent as a proper
        // query-string value. This bypasses any ambiguity in api.get()'s
        // internal param serialisation.
        const params = new URLSearchParams({
          education_levels: educationLevel,
          available_only:   'true',
          page_size:        String(PAGE_SIZE),   // ← matches page_size_query_param
          page:             String(subjectPage), // ← matches PageNumberPagination
        });

        const data = await api.get(`/subjects/?${params.toString()}`);

        if (cancelled) return;

        const results: any[] = data.results ?? [];
        const count: number  = data.count   ?? results.length;

        console.log(
          `[subjects] page=${subjectPage} of ${data.total_pages}`,
          `count=${count} returned=${results.length}`,
          results.map((s: any) => s.name),
        );

        setSubjectOptions(results.map((s: any) => ({ id: s.id, name: s.name, code: s.code })));
        setSubjectTotalCount(count);
        setSubjectHasNext(!!data.next);      // truthy if next page URL exists
        setSubjectHasPrev(!!data.previous);  // truthy if previous page URL exists

        // Seed teacher's pre-selected subjects on page 1 of the initial load only
        if (
          subjectPage === 1 &&
          seededLevelRef.current !== formData.level &&
          teacher?.assigned_subjects?.length
        ) {
          setSelectedSubjects(
            teacher.assigned_subjects.map((s: any) => String(s.id))
          );
          seededLevelRef.current = formData.level ?? null;
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch subjects:', err);
        setSubjectOptions([]);
        setSubjectTotalCount(0);
        setSubjectHasNext(false);
        setSubjectHasPrev(false);
      } finally {
        if (!cancelled) setSubjectsLoading(false);
      }
    };

    fetchSubjects();

    // Cleanup: if the effect re-runs (level or page changed) before the fetch
    // resolves, ignore the stale response.
    return () => { cancelled = true; };

  // NOTE: `teacher` is intentionally excluded — we only need its assigned_subjects
  // on the very first load, guarded by seededLevelRef. Including it would cause
  // an infinite loop if the parent re-creates the teacher object on each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.level, formData.staff_type, subjectPage]);

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 3 — Fetch classrooms, server-filtered by education level
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (formData.staff_type !== 'teaching' || !formData.level) {
      setClassroomOptions([]);
      return;
    }
    const educationLevel = LEVEL_TO_CLASSROOM_FILTER[formData.level];
    if (!educationLevel) return;

    let cancelled = false;

    const fetchClassrooms = async () => {
      setClassroomsLoading(true);
      try {
        const params = new URLSearchParams({
          section__grade_level__education_level: educationLevel,
          limit:  '200',
          offset: '0',
        });

        const data = await api.get(`/classrooms/classrooms/?${params.toString()}`);

        if (cancelled) return;

        const results: any[] = Array.isArray(data) ? data : (data.results ?? []);

        const seen   = new Set<number>();
        const unique = results.filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });

        setClassroomOptions(
          unique.map((c) => ({
            id:   c.id,
            name: c.name || `${c.grade_level_name || ''} ${c.section_name || ''}`.trim(),
          }))
        );
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch classrooms:', err);
        setClassroomOptions([]);
      } finally {
        if (!cancelled) setClassroomsLoading(false);
      }
    };

    fetchClassrooms();
    return () => { cancelled = true; };
  }, [formData.level, formData.staff_type]);

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 4 — Seed classroom assignments from teacher prop
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!teacher?.classroom_assignments?.length) {
      setCurrentAssignments([]);
      return;
    }
    setCurrentAssignments(
      teacher.classroom_assignments.map((a: any, i: number) => ({
        id:                 `existing-${a.id ?? i}`,
        grade_level_id:     a.grade_level_id     || '',
        section_id:         a.section_id         || '',
        sectionOptions:     a.sectionOptions     || [],
        classroom_id:       a.classroom_id       || '',
        subject_id:         a.subject_id         || '',
        is_primary_teacher: a.is_primary_teacher || false,
        periods_per_week:   a.periods_per_week   || 1,
      }))
    );
  }, [teacher]);

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const getInitials = (first: string, last: string) =>
    `${first?.charAt(0) || ''}${last?.charAt(0) || ''}`.toUpperCase();

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const newValue =
      type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

    if (name === 'level') setCurrentAssignments([]);

    setFormData((prev: EditTeacherFormData) => ({ ...prev, [name]: newValue }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', 'profile_upload');
      const res  = await fetch('https://api.cloudinary.com/v1_1/djbz7wunu/image/upload', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      setFormData((prev) => ({ ...prev, photo: data.secure_url }));
      setPhotoPreview(data.secure_url);
    } catch (err) {
      console.error('Photo upload failed:', err);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    setFormData((prev) => ({ ...prev, photo: undefined }));
    setPhotoPreview(null);
  };

  const handleSubjectToggle = (subjectId: string | number, checked: boolean) => {
    const id = String(subjectId);
    setSelectedSubjects((prev) =>
      checked ? [...prev, id] : prev.filter((s) => s !== id)
    );
  };

  const currentPageIds    = subjectOptions.map((s) => String(s.id));
  const allOnPageSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) => selectedSubjects.includes(id));

  const handleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedSubjects((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      setSelectedSubjects((prev) => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  const addAssignment = () =>
    setCurrentAssignments((prev) => [
      ...prev,
      {
        id:                 `new-${Date.now()}`,
        grade_level_id:     '',
        section_id:         '',
        sectionOptions:     [],
        classroom_id:       '',
        subject_id:         '',
        is_primary_teacher: false,
        periods_per_week:   1,
      },
    ]);

  const removeAssignment = (id: string) =>
    setCurrentAssignments((prev) => prev.filter((a) => a.id !== id));

  const updateAssignment = (id: string, field: string, value: string | boolean | number) =>
    setCurrentAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updateData: UpdateTeacherData = {
      employee_id:    formData.employee_id,
      phone_number:   formData.phone_number,
      address:        formData.address,
      qualification:  formData.qualification,
      specialization: formData.specialization,
      staff_type:     formData.staff_type,
      level:          formData.level,
      is_active:      formData.is_active,
      photo:          formData.photo,
      subjects:       selectedSubjects.map(Number),
      user: {
        first_name: formData.first_name,
        last_name:  formData.last_name,
        email:      formData.email,
      },
      assignments: currentAssignments
        .filter((a) => a.classroom_id && a.subject_id)
        .map((a) => ({
          classroom_id:       Number(a.classroom_id),
          subject_id:         Number(a.subject_id),
          is_primary_teacher: a.is_primary_teacher,
          periods_per_week:   a.periods_per_week,
        })),
    };
    onSave(updateData);
  };

  if (!teacher) {
    return (
      <div className="text-center p-4">
        <p className="text-gray-500">Loading teacher data…</p>
      </div>
    );
  }

  const inputClass = `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500
    focus:border-transparent outline-none transition-all duration-300
    ${themeClasses.inputBg} ${themeClasses.inputFocus} ${themeClasses.textPrimary}`;

  const isTeaching = formData.staff_type === 'teaching' && !!formData.level;
  const totalPages = Math.ceil(subjectTotalCount / PAGE_SIZE);
  const levelLabel = formData.level?.replace(/_/g, ' ') ?? '';
  const rangeStart = (subjectPage - 1) * PAGE_SIZE + 1;
  const rangeEnd   = Math.min(subjectPage * PAGE_SIZE, subjectTotalCount);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Profile Picture ────────────────────────────────────────────────── */}
      <div>
        <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>
          Profile Picture
        </label>
        <div className="flex flex-col items-center gap-3">
          <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Teacher" className="w-20 h-20 object-cover rounded" />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-lg font-bold text-white">
                  {getInitials(formData.first_name, formData.last_name)}
                </span>
              </div>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
            id="edit-teacher-photo"
            disabled={uploading}
          />
          <label
            htmlFor="edit-teacher-photo"
            className={`px-4 py-2 rounded text-sm cursor-pointer transition-colors ${
              uploading
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {uploading ? 'Uploading…' : 'Choose New Photo'}
          </label>
        </div>
      </div>

      {/* ── Basic Fields ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>First Name *</label>
          <input type="text" name="first_name" value={formData.first_name} onChange={handleInputChange} required className={inputClass} />
        </div>
        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Last Name *</label>
          <input type="text" name="last_name" value={formData.last_name} onChange={handleInputChange} required className={inputClass} />
        </div>
        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Email *</label>
          <input type="email" name="email" value={formData.email} onChange={handleInputChange} required className={inputClass} />
        </div>
        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Employee ID</label>
          <input type="text" name="employee_id" value={formData.employee_id} onChange={handleInputChange} placeholder="e.g., EMP001" className={inputClass} />
        </div>
        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Phone Number</label>
          <input type="tel" name="phone_number" value={formData.phone_number} onChange={handleInputChange} className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Address</label>
          <input type="text" name="address" value={formData.address} onChange={handleInputChange} className={inputClass} />
        </div>
        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Staff Type</label>
          <select name="staff_type" value={formData.staff_type} onChange={handleInputChange} className={inputClass}>
            <option value="teaching">Teaching</option>
            <option value="non-teaching">Non-Teaching</option>
          </select>
        </div>
        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Level</label>
          <select name="level" value={formData.level || ''} onChange={handleInputChange} className={inputClass}>
            <option value="">Select Level</option>
            <option value="nursery">Nursery</option>
            <option value="primary">Primary</option>
            <option value="junior_secondary">Junior Secondary</option>
            <option value="senior_secondary">Senior Secondary</option>
          </select>
        </div>
        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Qualification</label>
          <input type="text" name="qualification" value={formData.qualification} onChange={handleInputChange} className={inputClass} />
        </div>
        <div>
          <label className={`block text-sm font-medium ${themeClasses.textSecondary} mb-2`}>Specialization</label>
          <input type="text" name="specialization" value={formData.specialization} onChange={handleInputChange} className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleInputChange} className="rounded" />
            <span className={`text-sm font-medium ${themeClasses.textSecondary}`}>Active Status</span>
          </label>
        </div>
      </div>

      {/* ── Subjects (server-filtered, paginated) ─────────────────────────── */}
      {isTeaching && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={`block text-sm font-medium ${themeClasses.textSecondary}`}>
              Assigned Subjects
              {subjectTotalCount > 0 && (
                <span className="ml-1 text-xs text-gray-400 font-normal">
                  ({subjectTotalCount} available for {levelLabel})
                </span>
              )}
            </label>

            {!subjectsLoading && subjectOptions.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllOnPage}
                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                  allOnPageSelected
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                    : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'
                }`}
              >
                {allOnPageSelected
                  ? `Deselect page (${currentPageIds.length})`
                  : `Select page (${currentPageIds.length})`}
              </button>
            )}
          </div>

          {selectedSubjects.length > 0 && (
             
            <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              
              <p className="text-xs font-medium text-blue-700 mb-2">
                {selectedSubjects.length} selected
                
                {totalPages > 1 && (
                  <span className="ml-1 font-normal text-blue-500">
                    — kept as you page through
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                {selectedSubjects.map((id) => {
                  const subject = subjectOptions.find((s) => String(s.id) === id);
                 
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full"
                    >
                      {subject ? subject.name : `Subject #${id}`}
                      <button
                        type="button"
                        onClick={() => handleSubjectToggle(id, false)}
                        className="text-blue-500 hover:text-blue-800 leading-none"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {subjectsLoading ? (
            <div className="flex items-center gap-2 p-4 text-gray-500 text-sm">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              Loading {levelLabel} subjects…
            </div>
          ) : subjectOptions.length === 0 ? (
            <div className="bg-gray-50 p-4 rounded-lg border text-sm text-gray-500 text-center">
              No subjects found for {levelLabel} level.
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border">
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-1 max-h-56 overflow-y-auto">
                {subjectOptions.map((subj) => (
                  <label
                    key={subj.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSubjects.includes(String(subj.id))}
                      onChange={(e) => handleSubjectToggle(subj.id, e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">{subj.name}({subj.code})</span>
                  </label>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-white rounded-b-lg">
                  <button
                    type="button"
                    onClick={() => setSubjectPage((p) => Math.max(1, p - 1))}
                    disabled={!subjectHasPrev || subjectsLoading}
                    className="px-3 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-600
                      hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>

                  <span className="text-xs text-gray-500">
                    Page {subjectPage} of {totalPages}
                    <span className="ml-1 text-gray-400">
                      ({rangeStart}–{rangeEnd} of {subjectTotalCount})
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => setSubjectPage((p) => p + 1)}
                    disabled={!subjectHasNext || subjectsLoading}
                    className="px-3 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-600
                      hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Classroom Assignments ──────────────────────────────────────────── */}
      {isTeaching && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className={`block text-sm font-medium ${themeClasses.textSecondary}`}>
              Classroom Assignments
              {classroomOptions.length > 0 && (
                <span className="ml-1 text-xs text-gray-400 font-normal">
                  ({classroomOptions.length} classrooms for {levelLabel})
                </span>
              )}
            </label>
            <button
              type="button"
              onClick={addAssignment}
              className="px-3 py-1 text-sm rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              + Add Assignment
            </button>
          </div>

          {currentAssignments.length === 0 ? (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center text-gray-500 text-sm">
              No classroom assignments yet. Click "+ Add Assignment" to add one.
            </div>
          ) : (
            <div className="space-y-3">
              {currentAssignments.map((assignment, index) => (
                <div key={assignment.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-700">
                      Assignment {index + 1}
                    </h4>
                    <button
                      type="button"
                      onClick={() => removeAssignment(assignment.id)}
                      className="text-sm text-red-500 hover:text-red-700 transition-colors"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Classroom
                        {classroomsLoading && (
                          <span className="ml-1 text-gray-400">(loading…)</span>
                        )}
                      </label>
                      <select
                        value={assignment.classroom_id}
                        onChange={(e) => updateAssignment(assignment.id, 'classroom_id', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        disabled={classroomsLoading}
                      >
                        <option value="">
                          {classroomsLoading
                            ? 'Loading…'
                            : `Select classroom (${classroomOptions.length})`}
                        </option>
                        {classroomOptions.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Subject
                      </label>
                      <select
                        value={assignment.subject_id}
                        onChange={(e) => updateAssignment(assignment.id, 'subject_id', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        disabled={subjectsLoading}
                      >
                        <option value="">Select subject</option>
                        {subjectOptions.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Periods/Week
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={assignment.periods_per_week}
                        onChange={(e) =>
                          updateAssignment(
                            assignment.id,
                            'periods_per_week',
                            parseInt(e.target.value) || 1
                          )
                        }
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>

                    <div className="flex items-center pt-5">
                      <input
                        type="checkbox"
                        id={`primary-${assignment.id}`}
                        checked={assignment.is_primary_teacher}
                        onChange={(e) =>
                          updateAssignment(assignment.id, 'is_primary_teacher', e.target.checked)
                        }
                        className="rounded mr-2"
                      />
                      <label
                        htmlFor={`primary-${assignment.id}`}
                        className="text-xs font-medium text-gray-600"
                      >
                        Primary Teacher
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex gap-3 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border rounded-lg font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Save Changes
        </button>
      </div>
    </form>
  );
};

export default EditTeacherForm;