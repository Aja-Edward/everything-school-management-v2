import React, { useState, useEffect, useRef } from 'react';
import { User, ChevronRight, ChevronLeft, Check, X, AlertCircle, Plus, Trash2 } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import teacherService from '@/services/TeacherService';

import type {FormData, GradeLevel, Section, SubjectOption, ClassroomOption, CreateTeacherPayload, PrimaryAssignmentPayload, SecondaryAssignmentPayload, AssignmentRow
} from '@/types/teacher'


interface AddTeacherFormProps {
  onTeacherAdded?: () => void;
}

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Personal',     short: 'Who'  },
  { id: 2, label: 'Professional', short: 'Role' },
  { id: 3, label: 'Review',       short: 'Done' },
];

// ─── Component ────────────────────────────────────────────────────────────────

const AddTeacherForm: React.FC<AddTeacherFormProps> = ({ onTeacherAdded }) => {
  const submittingRef = useRef(false);
  const [step, setStep]             = useState(1);
  const [loading, setLoading]       = useState(false);
  const [stepErrors, setStepErrors] = useState<string[]>([]);

  const [modal, setModal] = useState<{ username: string; password: string } | null>(null);

  // Photo
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl]         = useState<string | null>(null);
  const [uploading, setUploading]       = useState(false);

  const [form, setForm] = useState<FormData>({
    firstName: '', lastName: '', middleName: '',
    email: '', phoneNumber: '',
    staffType: 'teaching', level: '',
    employeeId: '', hireDate: '', qualification: '',
    subjects: [], assignments: [],
  });

  // Dropdown data — all fetched via TeacherService
  const [gradeLevels, setGradeLevels]         = useState<GradeLevel[]>([]);
  const [subjectOptions, setSubjectOptions]   = useState<SubjectOption[]>([]);
  const [classroomOptions, setClassroomOptions] = useState<ClassroomOption[]>([]);
  const [loadingSubjects, setLoadingSubjects]     = useState(false);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);

  const isPrimary   = form.level === 'nursery' || form.level === 'primary';
  const isSecondary = form.level === 'junior_secondary' || form.level === 'senior_secondary';
  const isTeaching  = form.staffType === 'teaching';

  // ── Fetch grade levels ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTeaching || !form.level) { setGradeLevels([]); return; }
    teacherService
      .getGradeLevelsByEducationLevel(form.level)
      .then(setGradeLevels)
      .catch(() => setGradeLevels([]));
  }, [form.level, form.staffType]);

  // ── Fetch subjects ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTeaching || !form.level) {
      setSubjectOptions([]);
      setForm(p => ({ ...p, subjects: [] }));
      return;
    }
    setLoadingSubjects(true);
    teacherService
      .getSubjectsByEducationLevel(form.level)
      .then(subjects => {
        setSubjectOptions(subjects);
        // Auto-select all for primary / nursery
        if (isPrimary) {
          setForm(p => ({ ...p, subjects: subjects.map(s => String(s.id)) }));
        }
      })
      .catch(() => setSubjectOptions([]))
      .finally(() => setLoadingSubjects(false));
  }, [form.level, form.staffType]);

  // ── Fetch classrooms (secondary only) ────────────────────────────────────────
  useEffect(() => {
    if (!isTeaching || !isSecondary || !form.level) { setClassroomOptions([]); return; }
    setLoadingClassrooms(true);
    teacherService
      .getClassroomsByEducationLevel(form.level)
      .then(setClassroomOptions)
      .catch(() => setClassroomOptions([]))
      .finally(() => setLoadingClassrooms(false));
  }, [form.level, form.staffType]);

  // ── Photo upload ──────────────────────────────────────────────────────────────
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', 'profile_upload');
    try {
      const res = await axios.post(
        'https://api.cloudinary.com/v1_1/djbz7wunu/image/upload',
        fd,
      );
      setPhotoUrl(res.data.secure_url);
      setPhotoPreview(res.data.secure_url);
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const set = (field: keyof FormData, value: any) =>
    setForm(p => ({ ...p, [field]: value }));

  const newRow = (): AssignmentRow => ({
    id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
    grade_level_id: '', section_id: '', sectionOptions: [],
    classroom_id: '', subject_id: '',
    periods_per_week: 1, is_primary_teacher: false,
  });

  const updateRow = (id: string, field: string, value: any) =>
    setForm(p => ({
      ...p,
      assignments: p.assignments.map(a => (a.id === id ? { ...a, [field]: value } : a)),
    }));

  const loadSections = async (gradeLevelId: string, rowId: string) => {
    if (!gradeLevelId) return;
    try {
      const sections = await teacherService.getSectionsByGradeLevel(gradeLevelId);
      setForm(p => ({
        ...p,
        assignments: p.assignments.map(a =>
          a.id === rowId ? { ...a, sectionOptions: sections, section_id: '' } : a,
        ),
      }));
    } catch {
      toast.error('Failed to load sections');
    }
  };

  // ── Validation ────────────────────────────────────────────────────────────────
  const validate = (s: number): string[] => {
    const e: string[] = [];
    if (s === 1) {
      if (!form.firstName.trim()) e.push('First name is required');
      if (!form.lastName.trim())  e.push('Last name is required');
      if (!form.email.trim())     e.push('Email is required');
      else if (!/\S+@\S+\.\S+/.test(form.email)) e.push('Enter a valid email');
      if (!form.phoneNumber.trim()) e.push('Phone number is required');
    }
    if (s === 2) {
      if (!form.employeeId.trim()) e.push('Employee ID is required');
      if (!form.hireDate)          e.push('Hire date is required');
      if (isTeaching && !form.level) e.push('Education level is required for teaching staff');
      if (isTeaching && form.subjects.length === 0) e.push('Select at least one subject');
      if (isTeaching && isPrimary) {
        const a = form.assignments[0];
        if (!a?.grade_level_id) e.push('Select a grade level for the assignment');
        if (!a?.section_id)     e.push('Select a section for the assignment');
      }
      if (isTeaching && isSecondary && form.assignments.length === 0)
        e.push('Add at least one classroom assignment');
      if (isTeaching && isSecondary) {
        form.assignments.forEach((a, i) => {
          if (!a.classroom_id) e.push(`Assignment ${i + 1}: select a classroom`);
          if (!a.subject_id)   e.push(`Assignment ${i + 1}: select a subject`);
        });
      }
    }
    return e;
  };

  const next = () => {
    const errs = validate(step);
    if (errs.length) { setStepErrors(errs); return; }
    setStepErrors([]);
    setStep(s => s + 1);
  };

  const back = () => { setStepErrors([]); setStep(s => s - 1); };

  // ── Build payload ─────────────────────────────────────────────────────────────
  const buildPayload = (): CreateTeacherPayload => {
    let assignments: PrimaryAssignmentPayload[] | SecondaryAssignmentPayload[] = [];

    if (isPrimary) {
      const a = form.assignments[0];
      if (a?.grade_level_id && a?.section_id) {
        assignments = [{
          grade_level_id: a.grade_level_id,
          section_id: a.section_id,
          subject_ids: form.subjects,
        }] as PrimaryAssignmentPayload[];
      }
    } else if (isSecondary) {
      assignments = form.assignments
        .filter(a => a.classroom_id && a.subject_id)
        .map(a => ({
          classroom_id: Number(a.classroom_id),
          subject_id: Number(a.subject_id),
          is_primary_teacher: a.is_primary_teacher,
          periods_per_week: a.periods_per_week,
        })) as SecondaryAssignmentPayload[];
    }

    return {
      user_first_name: form.firstName,
      user_last_name: form.lastName,
      user_email: form.email,
      phone_number: form.phoneNumber,
      employee_id: form.employeeId,
      hire_date: form.hireDate,
      staff_type: form.staffType,
      subjects: form.subjects.map(Number),
      assignments,
      ...(form.middleName.trim() && { user_middle_name: form.middleName }),
      ...(form.level && { level: form.level }),
      ...(form.qualification && { qualification: form.qualification }),
      ...(photoUrl && { photo: photoUrl }),
    };
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const errs = [...validate(1), ...validate(2)];
    if (errs.length) { setStepErrors(errs); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setStepErrors([]);

    try {
      const data = await teacherService.createTeacher(buildPayload());

      toast.success('Teacher created successfully');
      onTeacherAdded?.();

      setModal({
        username: data.user_username || (data as any).username || '',
        password: data.user_password || (data as any).password || '',
      });

      // Reset form
      setForm({
        firstName: '', lastName: '', middleName: '',
        email: '', phoneNumber: '',
        staffType: 'teaching', level: '',
        employeeId: '', hireDate: '', qualification: '',
        subjects: [], assignments: [],
      });
      setPhotoPreview(null);
      setPhotoUrl(null);
      setStep(1);
    } catch (err: any) {
      const msg = err.message || 'Failed to create teacher';
      setStepErrors([msg]);
      toast.error(msg);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const inp = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-400';
  const sel = inp + ' cursor-pointer';
  const lbl = 'block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide';

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        .atf-root { font-family: 'DM Sans', sans-serif; }
        .step-dot { transition: all .25s ease; }
        .step-line { transition: background .25s ease; }
        .fade-in { animation: fadeSlide .2s ease forwards; }
        @keyframes fadeSlide { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        .cred-pill { font-family: 'Courier New', monospace; letter-spacing:.04em; }
      `}</style>

      <div className="atf-root max-w-xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900">Add New Teacher</h2>
          <p className="text-sm text-slate-500 mt-0.5">Required fields only — takes about 60 seconds</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center mb-8 select-none">
          {STEPS.map((s, idx) => (
            <React.Fragment key={s.id}>
              <div className="flex items-center gap-2">
                <div className={`step-dot w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2
                  ${step > s.id  ? 'bg-blue-600 border-blue-600 text-white'
                  : step === s.id ? 'bg-white border-blue-600 text-blue-600'
                  :                 'bg-white border-slate-200 text-slate-400'}`}>
                  {step > s.id ? <Check className="w-4 h-4" /> : s.id}
                </div>
                <span className={`text-sm font-medium hidden sm:block
                  ${step === s.id ? 'text-slate-900' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`step-line flex-1 h-0.5 mx-3 rounded
                  ${step > s.id ? 'bg-blue-600' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6">

            {/* ── STEP 1: Personal ─────────────────────────────────────────── */}
            {step === 1 && (
              <div className="fade-in space-y-4">
                <h3 className="text-base font-semibold text-slate-800 mb-4">Personal Information</h3>

                {/* Photo */}
                <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                    {photoPreview
                      ? <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                      : <User className="w-7 h-7 text-slate-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />}
                    {photoPreview && (
                      <button
                        onClick={() => { setPhotoPreview(null); setPhotoUrl(null); }}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" id="teacher-photo" />
                    <label htmlFor="teacher-photo"
                      className="text-xs font-semibold text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors">
                      {uploading ? 'Uploading…' : 'Upload Photo'}
                    </label>
                    <p className="text-xs text-slate-400 mt-1">Optional</p>
                  </div>
                </div>

                {/* Name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>First Name <span className="text-rose-500">*</span></label>
                    <input className={inp} placeholder="e.g. Amara" value={form.firstName}
                      onChange={e => set('firstName', e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Last Name <span className="text-rose-500">*</span></label>
                    <input className={inp} placeholder="e.g. Okonkwo" value={form.lastName}
                      onChange={e => set('lastName', e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className={lbl}>Middle Name <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
                  <input className={inp} placeholder="Middle name" value={form.middleName}
                    onChange={e => set('middleName', e.target.value)} />
                </div>

                <div>
                  <label className={lbl}>Email <span className="text-rose-500">*</span></label>
                  <input className={inp} type="email" placeholder="teacher@school.edu"
                    value={form.email} onChange={e => set('email', e.target.value)} />
                </div>

                <div>
                  <label className={lbl}>Phone Number <span className="text-rose-500">*</span></label>
                  <input className={inp} type="tel" placeholder="+234 xxx xxx xxxx"
                    value={form.phoneNumber} onChange={e => set('phoneNumber', e.target.value)} />
                </div>
              </div>
            )}

            {/* ── STEP 2: Professional ─────────────────────────────────────── */}
            {step === 2 && (
              <div className="fade-in space-y-4">
                <h3 className="text-base font-semibold text-slate-800 mb-4">Professional Information</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Employee ID <span className="text-rose-500">*</span></label>
                    <input className={inp} placeholder="e.g. EMP001"
                      value={form.employeeId} onChange={e => set('employeeId', e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Hire Date <span className="text-rose-500">*</span></label>
                    <input className={inp} type="date"
                      value={form.hireDate} onChange={e => set('hireDate', e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className={lbl}>Qualification <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
                  <input className={inp} placeholder="e.g. B.Sc. Education, M.Ed."
                    value={form.qualification} onChange={e => set('qualification', e.target.value)} />
                </div>

                <div>
                  <label className={lbl}>Staff Type <span className="text-rose-500">*</span></label>
                  <select className={sel} value={form.staffType}
                    onChange={e => {
                      set('staffType', e.target.value);
                      set('level', '');
                      set('subjects', []);
                      set('assignments', []);
                    }}>
                    <option value="teaching">Teaching</option>
                    <option value="non-teaching">Non-Teaching</option>
                  </select>
                </div>

                {/* Teaching-only fields */}
                {isTeaching && (
                  <>
                    <div>
                      <label className={lbl}>Education Level <span className="text-rose-500">*</span></label>
                      <select className={sel} value={form.level}
                        onChange={e => {
                          set('level', e.target.value);
                          set('subjects', []);
                          set('assignments', []);
                        }}>
                        <option value="">Select level</option>
                        <option value="nursery">Nursery</option>
                        <option value="primary">Primary</option>
                        <option value="junior_secondary">Junior Secondary</option>
                        <option value="senior_secondary">Senior Secondary</option>
                      </select>
                    </div>

                    {/* Subjects */}
                    {form.level && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className={lbl + ' mb-0'}>
                            Subjects <span className="text-rose-500">*</span>
                          </label>
                          {subjectOptions.length > 0 && (
                            <div className="flex gap-2">
                              <button type="button"
                                onClick={() => set('subjects', subjectOptions.map(s => String(s.id)))}
                                className="text-xs text-blue-600 hover:underline font-medium">
                                All
                              </button>
                              <span className="text-slate-300">|</span>
                              <button type="button"
                                onClick={() => set('subjects', [])}
                                className="text-xs text-slate-500 hover:underline">
                                Clear
                              </button>
                            </div>
                          )}
                        </div>

                        {loadingSubjects ? (
                          <div className="py-4 text-center text-sm text-slate-400">Loading subjects…</div>
                        ) : subjectOptions.length === 0 ? (
                          <div className="py-4 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
                            No subjects found for this level
                          </div>
                        ) : (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-44 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-1">
                              {subjectOptions.map(subject => (
                                <label key={subject.id}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white transition-colors">
                                  <input type="checkbox"
                                    checked={form.subjects.includes(String(subject.id))}
                                    onChange={e => {
                                      const id = String(subject.id);
                                      set('subjects', e.target.checked
                                        ? [...form.subjects, id]
                                        : form.subjects.filter(s => s !== id));
                                    }}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                                  />
                                  <span className="text-sm text-slate-700">{subject.name} ({subject.code})</span>
                                </label>
                              ))}
                            </div>
                            <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-200">
                              {form.subjects.length} of {subjectOptions.length} selected
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Primary / Nursery assignment ── */}
                    {isPrimary && form.level && (
                      <div>
                        <label className={lbl}>Classroom Assignment <span className="text-rose-500">*</span></label>
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                          <p className="text-xs text-blue-600">
                            This teacher will teach all selected subjects to one class.
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={lbl}>Grade Level <span className="text-rose-500">*</span></label>
                              <select className={sel}
                                value={form.assignments[0]?.grade_level_id || ''}
                                onChange={e => {
                                  const gradeId = e.target.value;
                                  if (form.assignments.length === 0) {
                                    const row = newRow();
                                    setForm(p => ({
                                      ...p,
                                      assignments: [{ ...row, grade_level_id: gradeId }],
                                    }));
                                    loadSections(gradeId, row.id);
                                  } else {
                                    updateRow(form.assignments[0].id, 'grade_level_id', gradeId);
                                    loadSections(gradeId, form.assignments[0].id);
                                  }
                                }}>
                                <option value="">Select grade</option>
                                {gradeLevels.map(g => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={lbl}>Section <span className="text-rose-500">*</span></label>
                              <select className={sel}
                                value={form.assignments[0]?.section_id || ''}
                                disabled={!form.assignments[0]?.grade_level_id}
                                onChange={e =>
                                  updateRow(form.assignments[0].id, 'section_id', e.target.value)
                                }>
                                <option value="">
                                  {!form.assignments[0]?.grade_level_id ? 'Select grade first' : 'Select section'}
                                </option>
                                {(form.assignments[0]?.sectionOptions ?? []).map(s => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Preview */}
                          {form.assignments[0]?.grade_level_id && form.assignments[0]?.section_id && (
                            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                              <Check className="w-3.5 h-3.5" />
                              Teaching {form.subjects.length} subject(s) to{' '}
                              <strong>
                                {gradeLevels.find(g => String(g.id) === form.assignments[0].grade_level_id)?.name}
                                {' — '}
                                {form.assignments[0].sectionOptions.find(
                                  s => String(s.id) === form.assignments[0].section_id,
                                )?.name}
                              </strong>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Secondary assignments ── */}
                    {isSecondary && form.level && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className={lbl + ' mb-0'}>
                            Classroom Assignments <span className="text-rose-500">*</span>
                          </label>
                          <button type="button"
                            onClick={() =>
                              setForm(p => ({ ...p, assignments: [...p.assignments, newRow()] }))
                            }
                            className="flex items-center gap-1 text-xs font-semibold text-blue-600 border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                            <Plus className="w-3.5 h-3.5" /> Add
                          </button>
                        </div>

                        {form.assignments.length === 0 ? (
                          <div className="py-6 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
                            No assignments yet.{' '}
                            <button type="button"
                              onClick={() =>
                                setForm(p => ({ ...p, assignments: [newRow()] }))
                              }
                              className="text-blue-600 font-semibold underline">
                              Add one
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {form.assignments.map((a, idx) => (
                              <div key={a.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                    Assignment {idx + 1}
                                  </span>
                                  <button type="button"
                                    onClick={() =>
                                      setForm(p => ({
                                        ...p,
                                        assignments: p.assignments.filter(x => x.id !== a.id),
                                      }))
                                    }
                                    className="text-rose-400 hover:text-rose-600 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className={lbl}>Classroom <span className="text-rose-500">*</span></label>
                                    <select className={sel} value={a.classroom_id}
                                      disabled={loadingClassrooms}
                                      onChange={e => updateRow(a.id, 'classroom_id', e.target.value)}>
                                      <option value="">
                                        {loadingClassrooms ? 'Loading…' : 'Select classroom'}
                                      </option>
                                      {classroomOptions.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className={lbl}>Subject <span className="text-rose-500">*</span></label>
                                    <select className={sel} value={a.subject_id}
                                      disabled={!a.classroom_id}
                                      onChange={e => updateRow(a.id, 'subject_id', e.target.value)}>
                                      <option value="">Select subject</option>
                                      {subjectOptions.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mt-3">
                                  <div>
                                    <label className={lbl}>Periods / Week</label>
                                    <input className={inp} type="number" min="1" max="10"
                                      value={a.periods_per_week}
                                      onChange={e =>
                                        updateRow(a.id, 'periods_per_week', parseInt(e.target.value) || 1)
                                      } />
                                  </div>
                                  <div className="flex items-end pb-2.5">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input type="checkbox" checked={a.is_primary_teacher}
                                        onChange={e =>
                                          updateRow(a.id, 'is_primary_teacher', e.target.checked)
                                        }
                                        className="rounded border-slate-300 text-blue-600 h-4 w-4" />
                                      <span className="text-sm text-slate-700">Class teacher</span>
                                    </label>
                                  </div>
                                </div>
                              </div>
                            ))}
                            <div className="text-xs text-slate-500 text-right">
                              {form.assignments.filter(a => a.classroom_id && a.subject_id).length} of{' '}
                              {form.assignments.length} complete
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── STEP 3: Review ────────────────────────────────────────────── */}
            {step === 3 && (
              <div className="fade-in space-y-5">
                <h3 className="text-base font-semibold text-slate-800 mb-4">Review & Confirm</h3>

                <ReviewSection title="Personal">
                  <ReviewRow label="Name"  value={[form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ')} />
                  <ReviewRow label="Email" value={form.email} />
                  <ReviewRow label="Phone" value={form.phoneNumber} />
                </ReviewSection>

                <ReviewSection title="Professional">
                  <ReviewRow label="Employee ID" value={form.employeeId} />
                  <ReviewRow label="Hire Date"   value={form.hireDate} />
                  <ReviewRow label="Staff Type"  value={form.staffType === 'teaching' ? 'Teaching' : 'Non-Teaching'} />
                  {form.level && (
                    <ReviewRow label="Level" value={form.level.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
                  )}
                  {form.qualification && <ReviewRow label="Qualification" value={form.qualification} />}
                  {form.subjects.length > 0 && (
                    <ReviewRow
                      label="Subjects"
                      value={`${form.subjects.length} subject(s): ${
                        subjectOptions
                          .filter(s => form.subjects.includes(String(s.id)))
                          .map(s => s.name)
                          .join(', ')
                      }`}
                    />
                  )}
                </ReviewSection>

                {form.assignments.length > 0 && (
                  <ReviewSection title="Assignments">
                    {isPrimary && form.assignments[0] && (
                      <ReviewRow
                        label="Classroom"
                        value={`${gradeLevels.find(g => String(g.id) === form.assignments[0].grade_level_id)?.name || ''} — ${
                          form.assignments[0].sectionOptions.find(
                            s => String(s.id) === form.assignments[0].section_id,
                          )?.name || ''
                        }`}
                      />
                    )}
                    {isSecondary && form.assignments.map((a, i) => (
                      <ReviewRow key={a.id}
                        label={`#${i + 1}`}
                        value={`${classroomOptions.find(c => String(c.id) === a.classroom_id)?.name || '—'} · ${
                          subjectOptions.find(s => String(s.id) === a.subject_id)?.name || '—'
                        } · ${a.periods_per_week} period/wk`}
                      />
                    ))}
                  </ReviewSection>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                  A login username and password will be generated automatically and shown after saving.
                </div>
              </div>
            )}

            {/* Errors */}
            {stepErrors.length > 0 && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <ul className="text-xs text-rose-700 space-y-0.5">
                  {stepErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={step === 1 ? () => window.history.back() : back}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors px-3 py-2 rounded-lg hover:bg-slate-100">
              <ChevronLeft className="w-4 h-4" />
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < 3 ? (
              <button onClick={next}
                className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg transition-colors shadow-sm">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 rounded-lg transition-colors shadow-sm">
                {loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                  : <><Check className="w-4 h-4" /> Save Teacher</>}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-3">
          Step {step} of {STEPS.length} — {STEPS[step - 1].label}
        </p>
      </div>

      {/* Credentials Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-md w-full">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Teacher Account Created</h3>
            <p className="text-xs text-slate-500 mb-5">
              Copy and securely share these credentials. The teacher should change their password on first login.
            </p>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2 mb-4">
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Login Credentials</div>
              <CredRow label="Username" value={modal.username} />
              <CredRow label="Password" value={modal.password} />
            </div>
            <button onClick={() => setModal(null)}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors">
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Review helpers ───────────────────────────────────────────────────────────

const ReviewSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{title}</div>
    <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100">
      {children}
    </div>
  </div>
);

const ReviewRow = ({ label, value }: { label: string; value?: string }) => {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <span className="text-xs text-slate-500 flex-shrink-0 w-24">{label}</span>
      <span className="text-sm text-slate-800 text-right">{value}</span>
    </div>
  );
};

const CredRow = ({ label, value }: { label: string; value?: string }) => {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500 w-16 flex-shrink-0">{label}</span>
      <span className="cred-pill flex-1 text-sm bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-800 truncate">
        {value}
      </span>
      <button
        onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copied`); }}
        className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex-shrink-0">
        Copy
      </button>
    </div>
  );
};

export default AddTeacherForm;
       