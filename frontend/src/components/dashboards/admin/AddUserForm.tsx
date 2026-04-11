import React, { useState, useEffect, useRef } from 'react';
import { User, ChevronRight, ChevronLeft, Check, Search, X, AlertCircle } from 'lucide-react';
import api from '@/services/api';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { triggerDashboardRefresh } from '@/hooks/useDashboardRefresh';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  // Step 1 – Personal (required)
  firstName: string;
  lastName: string;
  middleName: string;
  gender: string;
  dateOfBirth: string;
  // Step 2 – Academic (required)
  student_class: string;
  education_level: string;
  section: string;
  stream: string;
  registration_number: string;
  // Step 3 – Parent (required: link to existing parent)
  existing_parent_id: string;
  relationship: string;
  // Photo (optional)
  photo: string | null;
}

interface Parent {
  id: number;
  full_name: string;
  username: string;
  email: string;
  phone: string;
}

interface AddStudentFormProps {
  onStudentAdded?: () => void;
}

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Personal',  short: 'Who' },
  { id: 2, label: 'Academic',  short: 'Class' },
  { id: 3, label: 'Parent',    short: 'Guardian' },
];

// ─── Component ────────────────────────────────────────────────────────────────

const AddStudentForm: React.FC<AddStudentFormProps> = ({ onStudentAdded }) => {
  const navigate = useNavigate();
  const submittingRef = useRef(false);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [stepErrors, setStepErrors] = useState<string[]>([]);

  // Credentials modal
  const [modal, setModal] = useState<{
    studentUsername: string; studentPassword: string;
    parentUsername?: string; parentPassword?: string;
  } | null>(null);

  // Form data
  const [form, setForm] = useState<FormData>({
    firstName: '', lastName: '', middleName: '', gender: '', dateOfBirth: '',
    student_class: '', education_level: '', section: '', stream: '',
    registration_number: '', existing_parent_id: '', relationship: '', photo: null,
  });

  // DOB split state
  const [dobDay, setDobDay]     = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear]   = useState('');

  // Cascading dropdowns
  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [sections, setSections]       = useState<any[]>([]);
  const [streams, setStreams]         = useState<any[]>([]);
  const [loadingGrades, setLoadingGrades]     = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);

  // Photo
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading]       = useState(false);

  // Parent search
  const [parentQuery, setParentQuery]         = useState('');
  const [parentResults, setParentResults]     = useState<Parent[]>([]);
  const [parentSearching, setParentSearching] = useState(false);
  const [selectedParent, setSelectedParent]   = useState<Parent | null>(null);
  const parentDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoadingGrades(true);
    api.get('/api/classrooms/classes/')
      .then(res => {
        const arr = Array.isArray(res) ? res : res?.results ?? res?.data ?? [];
        setGradeLevels(arr);
      })
      .catch(() => setGradeLevels([]))
      .finally(() => setLoadingGrades(false));
  }, []);

  useEffect(() => {
    api.get('/api/classrooms/streams/')
      .then(res => {
        const arr = Array.isArray(res) ? res : res?.results ?? res?.data ?? [];
        setStreams(arr);
      })
      .catch(() => setStreams([]));
  }, []);

  useEffect(() => {
    if (!form.student_class) { setSections([]); return; }
    setLoadingSections(true);
    api.get(`/api/classrooms/sections/?class_grade=${form.student_class}`)
      .then(res => {
        const arr = Array.isArray(res) ? res : res?.results ?? res?.data ?? [];
        setSections(arr);
      })
      .catch(() => setSections([]))
      .finally(() => setLoadingSections(false));
  }, [form.student_class]);

  // DOB sync
  useEffect(() => {
    if (dobDay && dobMonth && dobYear) {
      const m = dobMonth.padStart(2, '0');
      const d = dobDay.padStart(2, '0');
      setForm(p => ({ ...p, dateOfBirth: `${dobYear}-${m}-${d}` }));
    }
  }, [dobDay, dobMonth, dobYear]);

  // Parent search debounce
  useEffect(() => {
    if (parentDebounce.current) clearTimeout(parentDebounce.current);
    if (parentQuery.length < 2) { setParentResults([]); return; }
    parentDebounce.current = setTimeout(() => {
      setParentSearching(true);
      api.get(`/api/parents/search/?q=${encodeURIComponent(parentQuery)}`)
        .then(res => setParentResults(Array.isArray(res) ? res : []))
        .catch(() => setParentResults([]))
        .finally(() => setParentSearching(false));
    }, 350);
  }, [parentQuery]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const set = (field: keyof FormData, value: string | null) =>
    setForm(p => ({ ...p, [field]: value as any }));

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
      const res = await axios.post('https://api.cloudinary.com/v1_1/djbz7wunu/image/upload', fd);
      setForm(p => ({ ...p, photo: res.data.secure_url }));
      setPhotoPreview(res.data.secure_url);
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── Validation per step ───────────────────────────────────────────────────────

  const validate = (s: number): string[] => {
    const e: string[] = [];
    if (s === 1) {
      if (!form.firstName.trim())  e.push('First name is required');
      if (!form.lastName.trim())   e.push('Surname is required');
      if (!form.gender)            e.push('Gender is required');
      if (!form.dateOfBirth)       e.push('Date of birth is required');
    }
    if (s === 2) {
      if (!form.student_class) e.push('Class is required');
      if (!form.section)       e.push('Section is required');
      const isSS = form.education_level === 'SENIOR_SECONDARY';
      if (isSS && !form.stream) e.push('Stream is required for Senior Secondary');
    }
    if (s === 3) {
      if (!selectedParent)   e.push('Please search and select a parent/guardian');
      if (!form.relationship) e.push('Relationship is required');
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

  // ── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const errs = validate(3);
    if (errs.length) { setStepErrors(errs); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setStepErrors([]);

    try {
      const payload: any = {
        user_first_name:     form.firstName,
        user_last_name:      form.lastName,
        user_middle_name:    form.middleName,
        gender:              form.gender,
        date_of_birth:       form.dateOfBirth,
        student_class:       form.student_class ? parseInt(form.student_class) : null,
        section:             form.section ? parseInt(form.section) : null,
        stream:              form.stream ? parseInt(form.stream) : null,
        registration_number: form.registration_number || '',
        profile_picture:     form.photo,
        existing_parent_id:  selectedParent!.id,
        relationship:        form.relationship,
        is_primary_contact:  true,
      };

      const response = await api.post('/api/students/students/', payload);
      toast.success('Student added successfully');
      triggerDashboardRefresh();
      onStudentAdded?.();

      if (response) {
        setModal({
          studentUsername: response.student_username,
          studentPassword: response.student_password,
          parentUsername:  response.parent_username,
          parentPassword:  response.parent_password,
        });
      }

      // Reset
      setForm({
        firstName: '', lastName: '', middleName: '', gender: '', dateOfBirth: '',
        student_class: '', education_level: '', section: '', stream: '',
        registration_number: '', existing_parent_id: '', relationship: '', photo: null,
      });
      setDobDay(''); setDobMonth(''); setDobYear('');
      setSelectedParent(null); setParentQuery('');
      setPhotoPreview(null); setStep(1);

    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        JSON.stringify(err.response?.data) ||
        'Failed to create student';
      setStepErrors([msg]);
      toast.error('Error: ' + msg);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // ── Date options ──────────────────────────────────────────────────────────────

  const days   = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years  = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - 5 - i);

  // ── Shared input styles ───────────────────────────────────────────────────────

  const inp  = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-400';
  const sel  = inp + ' cursor-pointer';
  const lbl  = 'block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide';

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        .asf-root { font-family: 'DM Sans', sans-serif; }
        .step-dot { transition: all .25s ease; }
        .step-line { transition: background .25s ease; }
        .fade-in { animation: fadeSlide .2s ease forwards; }
        @keyframes fadeSlide { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        .cred-pill { font-family: 'Courier New', monospace; letter-spacing:.04em; }
      `}</style>

      <div className="asf-root max-w-xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900">Add New Student</h2>
          <p className="text-sm text-slate-500 mt-0.5">Required fields only — takes about 60 seconds</p>
        </div>

        {/* ── Step indicator ─────────────────────────────────────────────────── */}
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

        {/* ── Card ───────────────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

          <div className="p-6">

            {/* ── STEP 1: Personal ─────────────────────────────────────────── */}
            {step === 1 && (
              <div className="fade-in space-y-4">
                <h3 className="text-base font-semibold text-slate-800 mb-4">Personal Information</h3>

                {/* Photo — compact */}
                <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                    {photoPreview
                      ? <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                      : <User className="w-7 h-7 text-slate-400 m-auto mt-4" />}
                    {photoPreview && (
                      <button onClick={() => { setPhotoPreview(null); set('photo', null); }}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" id="photo-up" />
                    <label htmlFor="photo-up"
                      className="text-xs font-semibold text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors">
                      {uploading ? 'Uploading…' : 'Upload Photo'}
                    </label>
                    <p className="text-xs text-slate-400 mt-1">Optional</p>
                  </div>
                </div>

                {/* Name row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>First Name <span className="text-rose-500">*</span></label>
                    <input className={inp} placeholder="e.g. Amara" value={form.firstName}
                      onChange={e => set('firstName', e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Surname <span className="text-rose-500">*</span></label>
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
                  <label className={lbl}>Gender <span className="text-rose-500">*</span></label>
                  <select className={sel} value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="">Select gender</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>

                {/* DOB */}
                <div>
                  <label className={lbl}>Date of Birth <span className="text-rose-500">*</span></label>
                  <div className="grid grid-cols-3 gap-2">
                    <select className={sel} value={dobDay} onChange={e => setDobDay(e.target.value)}>
                      <option value="">Day</option>
                      {days.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select className={sel} value={dobMonth} onChange={e => setDobMonth(e.target.value)}>
                      <option value="">Month</option>
                      {months.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                    </select>
                    <select className={sel} value={dobYear} onChange={e => setDobYear(e.target.value)}>
                      <option value="">Year</option>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  {form.dateOfBirth && (
                    <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                      <Check className="w-3 h-3" /> {new Date(form.dateOfBirth).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 2: Academic ─────────────────────────────────────────── */}
            {step === 2 && (
              <div className="fade-in space-y-4">
                <h3 className="text-base font-semibold text-slate-800 mb-4">Academic Information</h3>

                <div>
                  <label className={lbl}>Class / Grade <span className="text-rose-500">*</span></label>
                  <select className={sel} value={form.student_class} disabled={loadingGrades}
                    onChange={e => {
                      const g = gradeLevels.find(x => x.id === parseInt(e.target.value));
                      setForm(p => ({ ...p, student_class: e.target.value, education_level: g?.education_level || '', section: '', stream: '' }));
                    }}>
                    <option value="">{loadingGrades ? 'Loading…' : 'Select class'}</option>
                    {gradeLevels.map(g => <option key={g.id} value={g.id}>{g.name || g.display_name}</option>)}
                  </select>
                </div>

                <div>
                  <label className={lbl}>Section <span className="text-rose-500">*</span></label>
                  <select className={sel} value={form.section} disabled={!form.student_class || loadingSections}
                    onChange={e => set('section', e.target.value)}>
                    <option value="">{loadingSections ? 'Loading…' : !form.student_class ? 'Select class first' : 'Select section'}</option>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {/* Stream — only Senior Secondary */}
                {form.education_level === 'SENIOR_SECONDARY' && (
                  <div>
                    <label className={lbl}>Stream <span className="text-rose-500">*</span></label>
                    <select className={sel} value={form.stream} onChange={e => set('stream', e.target.value)}>
                      <option value="">Select stream</option>
                      {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className={lbl}>Registration Number <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
                  <input className={inp} placeholder="e.g. 0042" value={form.registration_number}
                    onChange={e => set('registration_number', e.target.value)} />
                </div>
              </div>
            )}

            {/* ── STEP 3: Parent ───────────────────────────────────────────── */}
            {step === 3 && (
              <div className="fade-in space-y-4">
                <h3 className="text-base font-semibold text-slate-800 mb-1">Parent / Guardian</h3>
                <p className="text-xs text-slate-500 mb-4">Search for an existing parent account by name, phone, or username.</p>

                {/* Search input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    className={inp + ' pl-9'}
                    placeholder="Name, phone or username…"
                    value={parentQuery}
                    onChange={e => { setParentQuery(e.target.value); setSelectedParent(null); }}
                  />
                  {parentSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {/* Dropdown results */}
                {!selectedParent && parentResults.length > 0 && (
                  <ul className="border border-slate-200 rounded-xl bg-white max-h-48 overflow-y-auto shadow-lg divide-y divide-slate-100">
                    {parentResults.map(p => (
                      <li key={p.id}
                        className="px-4 py-3 cursor-pointer hover:bg-blue-50 transition-colors"
                        onClick={() => { setSelectedParent(p); setParentQuery(''); setParentResults([]); }}>
                        <div className="text-sm font-semibold text-slate-900">{p.full_name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{p.username} · {p.phone}</div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Selected parent card — auto-populated */}
                {selectedParent && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-emerald-900">{selectedParent.full_name}</div>
                          <div className="text-xs text-emerald-700 mt-0.5">{selectedParent.username}</div>
                        </div>
                      </div>
                      <button onClick={() => { setSelectedParent(null); setParentQuery(''); }}
                        className="text-slate-400 hover:text-rose-500 transition-colors mt-0.5">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-emerald-800">
                      <div><span className="text-emerald-600 font-medium">Email:</span> {selectedParent.email || '—'}</div>
                      <div><span className="text-emerald-600 font-medium">Phone:</span> {selectedParent.phone || '—'}</div>
                    </div>
                  </div>
                )}

                {/* No parent prompt */}
                {!selectedParent && parentQuery.length >= 2 && !parentSearching && parentResults.length === 0 && (
                  <div className="text-center py-6 text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
                    No parent found.{' '}
                    <button className="text-blue-600 underline font-medium" onClick={() => navigate('/admin/parents/add')}>
                      Add parent first
                    </button>
                  </div>
                )}

                {/* Relationship */}
                <div>
                  <label className={lbl}>Relationship <span className="text-rose-500">*</span></label>
                  <select className={sel} value={form.relationship} onChange={e => set('relationship', e.target.value)}>
                    <option value="">Select relationship</option>
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Guardian">Guardian</option>
                    <option value="Sponsor">Sponsor</option>
                  </select>
                </div>
              </div>
            )}

            {/* ── Errors ───────────────────────────────────────────────────── */}
            {stepErrors.length > 0 && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <ul className="text-xs text-rose-700 space-y-0.5">
                  {stepErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* ── Footer nav ───────────────────────────────────────────────────── */}
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
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 rounded-lg transition-colors shadow-sm">
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                ) : (
                  <><Check className="w-4 h-4" /> Save Student</>
                )}
              </button>
            )}
          </div>
        </div>

        {/* ── Step progress text ────────────────────────────────────────────── */}
        <p className="text-center text-xs text-slate-400 mt-3">
          Step {step} of {STEPS.length} — {STEPS[step - 1].label}
        </p>
      </div>

      {/* ── Credentials Modal ────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-md w-full">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Account Created</h3>
            <p className="text-xs text-slate-500 mb-5">Copy and securely share these credentials. Passwords should be changed on first login.</p>

            {/* Student */}
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Student Account</div>
              <CredRow label="Username" value={modal.studentUsername} />
              <CredRow label="Password" value={modal.studentPassword} />
            </div>

            {/* Parent — only if new parent was created */}
            {modal.parentUsername && (
              <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Parent Account</div>
                <CredRow label="Username" value={modal.parentUsername} />
                <CredRow label="Password" value={modal.parentPassword} />
              </div>
            )}

            <button onClick={() => setModal(null)}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors mt-2">
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Small cred row ───────────────────────────────────────────────────────────

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

export default AddStudentForm;