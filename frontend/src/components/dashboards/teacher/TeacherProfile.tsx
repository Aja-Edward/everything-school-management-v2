import React, { useState, useEffect, useCallback } from "react";
import { User, Award, GraduationCap, Edit, BookOpen, Users, Camera, Save, X, CheckCircle, AlertCircle, Briefcase, FileText, Share2, Star, MessageSquare, ThumbsUp, Shield, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { TeacherUserData } from "@/types/types";
import TeacherService from "@/services/TeacherService";
import AssignmentManagement from "./AssignmentManagement";
import SignatureRemarksManagement from "./SignatureRemarksManagement";
import PerformanceService, {
  PerformanceAppraisal, StaffNote, NoteType, AppraisalStatus,
  ProfessionalDevelopment, PDType, CreatePDPayload, PDSummary,
} from "@/services/PerformanceService";
import { toast } from "react-toastify";

// ── Performance tab types & helpers ──────────────────────────────────────────

const APPRAISAL_STATUS_CFG: Record<AppraisalStatus, { label: string; color: string }> = {
  draft:        { label: 'Draft',                 color: 'bg-slate-100 text-slate-600' },
  submitted:    { label: 'Pending Acknowledgment', color: 'bg-amber-100 text-amber-700' },
  acknowledged: { label: 'Acknowledged',           color: 'bg-emerald-100 text-emerald-700' },
};

const NOTE_TYPE_CFG: Record<NoteType, { label: string; positive: boolean; color: string; borderColor: string; icon: React.ElementType }> = {
  commendation:    { label: 'Commendation',           positive: true,  color: 'bg-emerald-50 text-emerald-800', borderColor: 'border-l-emerald-400', icon: Star },
  appreciation:    { label: 'Letter of Appreciation', positive: true,  color: 'bg-blue-50 text-blue-800',       borderColor: 'border-l-blue-400',    icon: ThumbsUp },
  query:           { label: 'Query',                  positive: false, color: 'bg-amber-50 text-amber-800',     borderColor: 'border-l-amber-400',   icon: MessageSquare },
  warning:         { label: 'Written Warning',        positive: false, color: 'bg-orange-50 text-orange-800',   borderColor: 'border-l-orange-400',  icon: AlertCircle },
  caution:         { label: 'Caution',                positive: false, color: 'bg-red-50 text-red-800',         borderColor: 'border-l-red-400',     icon: Shield },
  improvement_plan:{ label: 'Improvement Plan',       positive: false, color: 'bg-purple-50 text-purple-800',   borderColor: 'border-l-purple-400',  icon: CheckCircle },
};

const GRADE_COLORS: Record<string, string> = {
  Excellent: 'text-emerald-700 bg-emerald-100',
  'Very Good': 'text-blue-700 bg-blue-100',
  Good: 'text-violet-700 bg-violet-100',
  Average: 'text-amber-700 bg-amber-100',
  'Below Average': 'text-orange-700 bg-orange-100',
  Poor: 'text-red-700 bg-red-100',
};

function StarDisplay({ score, max }: { score: number; max: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < score ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
      ))}
      <span className="ml-1 text-xs text-slate-500">{score}/{max}</span>
    </div>
  );
}

// ── Appraisal detail modal ────────────────────────────────────────────────────

function AppraisalModal({ appraisal, onClose, onAcknowledged }: {
  appraisal: PerformanceAppraisal; onClose: () => void;
  onAcknowledged: (a: PerformanceAppraisal) => void;
}) {
  const [response, setResponse] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAcknowledge = async () => {
    setSaving(true);
    try {
      const updated = await PerformanceService.acknowledgeAppraisal(appraisal.id, response);
      toast.success('Appraisal acknowledged');
      onAcknowledged(updated);
      onClose();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-5 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Performance Appraisal</h3>
            <p className="text-xs text-slate-500 mt-0.5">{appraisal.period_display} {appraisal.academic_year} · {appraisal.appraiser_role_display}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {appraisal.overall_score != null && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-violet-50 dark:bg-violet-900/30 rounded-xl p-4">
                <p className="text-xs text-violet-600 dark:text-violet-400 font-semibold uppercase tracking-wider">Overall Score</p>
                <p className="text-3xl font-bold text-violet-900 dark:text-violet-100 mt-1">{appraisal.overall_score}%</p>
              </div>
              <div className={`rounded-xl p-4 flex items-center justify-center ${GRADE_COLORS[appraisal.overall_grade] || 'bg-slate-50 text-slate-600'}`}>
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Grade</p>
                  <p className="text-xl font-bold mt-1">{appraisal.overall_grade}</p>
                </div>
              </div>
            </div>
          )}
          {appraisal.scores.length > 0 && (
            <div className="space-y-2">
              {appraisal.scores.map(s => (
                <div key={s.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                  <p className="flex-1 text-xs text-slate-800 dark:text-slate-200">{s.criteria_name}</p>
                  <StarDisplay score={s.score} max={s.max_score} />
                </div>
              ))}
            </div>
          )}
          {appraisal.overall_comment && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Appraiser's Comment</p>
              <p className="text-sm text-blue-900 dark:text-blue-200">{appraisal.overall_comment}</p>
            </div>
          )}
          {appraisal.recommendation && (
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 mb-1">Recommendations</p>
              <p className="text-sm text-violet-900 dark:text-violet-200">{appraisal.recommendation}</p>
            </div>
          )}
          {appraisal.status === 'submitted' && (
            <div className="border border-amber-200 dark:border-amber-700 rounded-xl p-4 bg-amber-50 dark:bg-amber-900/20 space-y-3">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Please acknowledge this appraisal</p>
              <textarea rows={2} value={response} onChange={e => setResponse(e.target.value)}
                placeholder="Optional response…"
                className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-amber-400 outline-none bg-white dark:bg-slate-800 dark:text-white dark:border-amber-600" />
              <button onClick={handleAcknowledge} disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle className="w-4 h-4" /> {saving ? 'Acknowledging…' : 'Acknowledge'}
              </button>
            </div>
          )}
          {appraisal.status === 'acknowledged' && appraisal.teacher_response && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Your Response</p>
              <p className="text-sm text-emerald-900 dark:text-emerald-200">{appraisal.teacher_response}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Staff note detail modal ───────────────────────────────────────────────────

function NoteModal({ note, onClose, onAcknowledged }: {
  note: StaffNote; onClose: () => void;
  onAcknowledged: (n: StaffNote) => void;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const cfg = NOTE_TYPE_CFG[note.note_type] ?? NOTE_TYPE_CFG.query;

  const handleAcknowledge = async () => {
    setSaving(true);
    try {
      const updated = await PerformanceService.acknowledgeNote(note.id, comment);
      toast.success('Note acknowledged');
      onAcknowledged(updated);
      onClose();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-5 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">{note.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">From: {note.issued_by_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`rounded-xl p-4 ${cfg.positive ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
            <p className={`text-xs font-semibold uppercase tracking-wider opacity-60 mb-2 ${cfg.positive ? 'text-emerald-700' : 'text-amber-700'}`}>{note.note_type_display} · {note.category_display}</p>
            <p className={`text-sm whitespace-pre-line ${cfg.positive ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'}`}>{note.content}</p>
          </div>
          {!note.is_acknowledged && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Acknowledge receipt</p>
              <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Optional comment…"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-400 outline-none bg-white dark:bg-slate-800 dark:text-white" />
              <button onClick={handleAcknowledge} disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                <CheckCircle className="w-4 h-4" /> {saving ? 'Confirming…' : 'I Acknowledge Receipt'}
              </button>
            </div>
          )}
          {note.is_acknowledged && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">✓ Acknowledged · {new Date(note.acknowledged_at!).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              {note.teacher_comment && <p className="text-sm text-emerald-900 dark:text-emerald-200 italic">"{note.teacher_comment}"</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TeacherProfileProps {
  onRefresh?: () => void;
}

interface ProfileTab {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
}

const TeacherProfile: React.FC<TeacherProfileProps> = ({ onRefresh }) => {
  const { user } = useAuth();
  const teacher = user as TeacherUserData;
  const teacherData = teacher?.teacher_data;

  const [activeTab, setActiveTab] = useState("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [showBioModal, setShowBioModal] = useState(false);

  // ── Performance tab state ──
  const [appraisals, setAppraisals] = useState<PerformanceAppraisal[]>([]);
  const [staffNotes, setStaffNotes] = useState<StaffNote[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfTab, setPerfTab] = useState<'appraisals' | 'notes'>('appraisals');
  const [viewAppraisal, setViewAppraisal] = useState<PerformanceAppraisal | null>(null);
  const [viewNote, setViewNote] = useState<StaffNote | null>(null);

  const loadPerformanceData = useCallback(async () => {
    setPerfLoading(true);
    try {
      const [aData, nData] = await Promise.all([
        PerformanceService.getAppraisals(),
        PerformanceService.getNotes(),
      ]);
      setAppraisals(Array.isArray(aData) ? aData : (aData as any).results ?? []);
      setStaffNotes(Array.isArray(nData) ? nData : (nData as any).results ?? []);
    } catch { /* silently fail — not critical */ }
    finally { setPerfLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'performance') loadPerformanceData();
  }, [activeTab, loadPerformanceData]);

  // ── Professional Development state ──
  const [pdRecords, setPdRecords] = useState<ProfessionalDevelopment[]>([]);
  const [pdSummary, setPdSummary] = useState<PDSummary | null>(null);
  const [pdLoading, setPdLoading] = useState(false);
  const [showPdForm, setShowPdForm] = useState(false);
  const [editPd, setEditPd] = useState<ProfessionalDevelopment | null>(null);
  const [pdFormData, setPdFormData] = useState<CreatePDPayload>({
    title: '', dev_type: 'training', provider: '',
    date_completed: '', date_expires: '', duration_hours: undefined,
    certificate_url: '', description: '',
  });
  const [pdSaving, setPdSaving] = useState(false);

  const loadPdData = useCallback(async () => {
    setPdLoading(true);
    try {
      const [records, summary] = await Promise.all([
        PerformanceService.getPDRecords(),
        PerformanceService.getPDSummary(),
      ]);
      setPdRecords(Array.isArray(records) ? records : (records as any).results ?? []);
      setPdSummary(summary);
    } catch { /* non-critical */ }
    finally { setPdLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'professional') loadPdData();
  }, [activeTab, loadPdData]);

  const openPdForm = (record?: ProfessionalDevelopment) => {
    if (record) {
      setEditPd(record);
      setPdFormData({
        title: record.title,
        dev_type: record.dev_type,
        provider: record.provider,
        date_completed: record.date_completed,
        date_expires: record.date_expires ?? '',
        duration_hours: record.duration_hours ? parseFloat(record.duration_hours) : undefined,
        certificate_url: record.certificate_url ?? '',
        description: record.description,
      });
    } else {
      setEditPd(null);
      setPdFormData({ title: '', dev_type: 'training', provider: '', date_completed: '', date_expires: '', duration_hours: undefined, certificate_url: '', description: '' });
    }
    setShowPdForm(true);
  };

  const handlePdSave = async () => {
    if (!pdFormData.title.trim()) { toast.error('Enter a title'); return; }
    if (!pdFormData.date_completed) { toast.error('Enter the completion date'); return; }
    setPdSaving(true);
    try {
      const payload: CreatePDPayload = {
        ...pdFormData,
        duration_hours: pdFormData.duration_hours || undefined,
        date_expires: pdFormData.date_expires || undefined,
        certificate_url: pdFormData.certificate_url || undefined,
      };
      const saved = editPd
        ? await PerformanceService.updatePDRecord(editPd.id, payload)
        : await PerformanceService.createPDRecord(payload);
      setPdRecords(prev => editPd
        ? prev.map(r => r.id === saved.id ? saved : r)
        : [saved, ...prev]);
      toast.success(editPd ? 'Record updated' : 'Record added');
      setShowPdForm(false);
      setEditPd(null);
      loadPdData();   // refresh summary counts
    } catch (e: any) {
      const msg = e?.response?.data ? Object.values(e.response.data).flat().join(' ') : (e?.message || 'Failed');
      toast.error(msg);
    } finally { setPdSaving(false); }
  };

  const handlePdDelete = async (id: number) => {
    if (!confirm('Delete this professional development record?')) return;
    try {
      await PerformanceService.deletePDRecord(id);
      setPdRecords(prev => prev.filter(r => r.id !== id));
      toast.success('Deleted');
      loadPdData();
    } catch { toast.error('Failed to delete'); }
  };
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    address: "",
    qualification: "",
    specialization: "",
    bio: "",
    date_of_birth: ""
  });

  const tabs: ProfileTab[] = [
    { id: "overview", name: "Overview", icon: User },
    { id: "personal", name: "Personal", icon: User },
    { id: "professional", name: "Professional", icon: Briefcase },
    { id: "assignments", name: "Assignments", icon: GraduationCap },
    { id: "signature-remarks", name: "Signature & Remarks", icon: FileText },
    { id: "performance", name: "Performance", icon: Award },
    { id: "documents", name: "Documents", icon: FileText },
  ];

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🔍 Looking for teacher ID...');
      console.log('User object:', user);
      console.log('Teacher data:', teacherData);

      let teacherId = null;

      // Check various possible locations for teacher ID
      if ((user as any)?.teacher_data?.id) {
        teacherId = (user as any).teacher_data.id;
        console.log('✅ Found teacher ID in user.teacher_data:', teacherId);
      } else if ((user as any)?.profile?.teacher_data?.id) {
        teacherId = (user as any).profile.teacher_data.id;
        console.log('✅ Found teacher ID in user.profile.teacher_data:', teacherId);
      } else if (teacherData?.id) {
        teacherId = teacherData.id;
        console.log('✅ Found teacher ID in teacherData:', teacherId);
      } else if (user?.id) {
        console.log('🔎 Searching for teacher by user ID/email...');
        try {
          const teachersResponse = await TeacherService.getTeachers({
            user: user.id
          } as any);

          console.log('Teachers response:', teachersResponse);

          if (teachersResponse.results && teachersResponse.results.length > 0) {
            const teacher = teachersResponse.results.find((t: any) =>
              t.user?.id === user.id || t.user === user.id || t.user?.email === user.email
            );

            if (teacher) {
              teacherId = teacher.id;
              console.log('✅ Found teacher ID via search:', teacherId);
            } else {
              // If no exact match, use the first result
              teacherId = teachersResponse.results[0].id;
              console.log('✅ Using first teacher result:', teacherId);
            }
          }
        } catch (error) {
          console.warn('Failed to find teacher by user lookup:', error);
        }
      }

      if (!teacherId) {
        console.error('❌ Teacher ID not found');
        console.log('Available user data:', JSON.stringify(user, null, 2));
        throw new Error("Teacher ID not found. Please ensure your teacher profile is properly set up.");
      }

      const response = await TeacherService.getTeacher(teacherId);
      setProfileData(response);
      
      const responseData = response as any;
      setFormData({
        first_name: responseData.user?.first_name || responseData.first_name || "",
        last_name: responseData.user?.last_name || responseData.last_name || "",
        email: responseData.user?.email || responseData.email || "",
        phone_number: responseData.phone_number || "",
        address: responseData.address || "",
        qualification: responseData.qualification || "",
        specialization: responseData.specialization || "",
        bio: responseData.bio || responseData.user?.bio || "",
        date_of_birth: responseData.date_of_birth || ""
      });
    } catch (error) {
      console.error("Error loading profile data:", error);
      setError(error instanceof Error ? error.message : "Failed to load profile data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      let teacherId = null;
      if ((user as any)?.teacher_data?.id) {
        teacherId = (user as any).teacher_data.id;
      } else if (teacherData?.id) {
        teacherId = teacherData.id;
      } else if (profileData?.id) {
        teacherId = profileData.id;
      }

      if (!teacherId) {
        throw new Error("Teacher ID not found");
      }

      const updateData = {
        user: {
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          bio: formData.bio
        },
        bio: formData.bio,
        phone_number: formData.phone_number,
        address: formData.address,
        qualification: formData.qualification,
        specialization: formData.specialization,
        date_of_birth: formData.date_of_birth,
      };

      const response = await TeacherService.updateTeacher(teacherId, updateData);
      setSuccessMessage("Profile updated successfully!");
      setIsEditing(false);
      setProfileData(response);
      
      const responseData = response as any;
      setFormData({
        first_name: responseData.user?.first_name || responseData.first_name || "",
        last_name: responseData.user?.last_name || responseData.last_name || "",
        email: responseData.user?.email || responseData.email || "",
        phone_number: responseData.phone_number || "",
        address: responseData.address || "",
        qualification: responseData.qualification || "",
        specialization: responseData.specialization || "",
        bio: responseData.bio || responseData.user?.bio || "",
        date_of_birth: responseData.date_of_birth || "",
      });

      if (onRefresh) {
        onRefresh();
      }
      
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Error updating profile:", error);
      setError(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    setSuccessMessage(null);
    
    if (profileData) {
      const profileDataAny = profileData as any;
      setFormData({
        first_name: profileDataAny.user?.first_name || profileDataAny.first_name || "",
        last_name: profileDataAny.user?.last_name || profileDataAny.last_name || "",
        email: profileDataAny.user?.email || profileDataAny.email || "",
        phone_number: profileDataAny.phone_number || "",
        address: profileDataAny.address || "",
        qualification: profileDataAny.qualification || "",
        specialization: profileDataAny.specialization || "",
        bio: profileDataAny.bio || profileDataAny.user?.bio || "",
        date_of_birth: profileDataAny.date_of_birth || "",
      });
    }
  };

  const getProfilePicture = () => {
    return (profileData as any)?.photo || (teacherData as any)?.photo || null;
  };

  const getYearsOfService = () => {
    if (!profileData?.hire_date) return 0;
    const hireDate = new Date(profileData.hire_date);
    const currentDate = new Date();
    return Math.floor((currentDate.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
  };

  const truncateBio = (text: string, maxWords: number = 15) => {
    if (!text) return "";
    const words = text.split(" ");
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(" ") + "...";
  };

  const getBio = () => {
    return profileData?.bio || profileData?.user?.bio || "";
  };

  if (isLoading && !profileData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-slate-600 dark:text-slate-400 text-sm">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error && !profileData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 max-w-md mx-4">
          <div className="flex items-center space-x-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">Error Loading Profile</h3>
          </div>
          <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={loadProfileData}
              className="px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-3 bg-slate-600 text-white rounded-xl hover:bg-slate-700 transition-colors font-medium"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 overflow-x-hidden">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-900 dark:to-slate-950">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-slate-700/50 flex items-center justify-center overflow-hidden">
                {getProfilePicture() ? (
                  <img src={getProfilePicture()} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-bold text-slate-300">
                    {user?.first_name?.charAt(0)}{user?.last_name?.charAt(0)}
                  </span>
                )}
              </div>
              {isEditing && (
                <button className="absolute -bottom-2 -right-2 w-10 h-10 bg-slate-700 text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-slate-600 transition-colors">
                  <Camera className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="flex-1 min-w-0 w-full sm:w-auto">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-2 break-words">
                {profileData?.user?.first_name || user?.first_name} {profileData?.user?.last_name || user?.last_name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-slate-400">
                <span className="truncate">{profileData?.staff_type || "Teaching Staff"}</span>
                <span>•</span>
                <span className="truncate">ID: {profileData?.employee_id || "N/A"}</span>
              </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto flex-shrink-0">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-medium text-sm"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-white text-slate-800 rounded-lg hover:bg-slate-100 transition-colors font-medium disabled:opacity-50 text-sm"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isLoading ? "Saving..." : "Save"}</span>
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-medium text-sm"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-green-800 dark:text-green-200 font-medium text-sm sm:text-base break-words">{successMessage}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-800 dark:text-red-200 font-medium text-sm sm:text-base break-words">{error}</p>
          </div>
        </div>
      )}

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-2 shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide -mx-2 px-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl font-medium text-xs sm:text-sm transition-all whitespace-nowrap flex-shrink-0 ${
                      activeTab === tab.id
                        ? "bg-blue-600 text-white shadow-md"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="hidden sm:inline">{tab.name}</span>
                    <span className="sm:hidden">{tab.name.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Profile Summary</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-3 sm:space-y-4">
                      <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Full Name</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">
                          {profileData?.user?.first_name} {profileData?.user?.last_name}
                        </p>
                      </div>
                      <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base break-all">{profileData?.user?.email}</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.phone_number || "Not provided"}</p>
                      </div>
                    </div>
                    <div className="space-y-3 sm:space-y-4">
                      <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Qualification</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.qualification || "Not provided"}</p>
                      </div>
                      <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Specialization</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.specialization || "Not provided"}</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Years of Service</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{getYearsOfService()} years</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4">Quick Stats</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-slate-700 dark:text-slate-300 font-medium text-sm">Subjects</span>
                      </div>
                      <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {profileData?.assigned_subjects?.length || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <GraduationCap className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-slate-700 dark:text-slate-300 font-medium text-sm">Classes</span>
                      </div>
                      <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {profileData?.classroom_assignments?.length || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-slate-700 dark:text-slate-300 font-medium text-sm">Students</span>
                      </div>
                      
                      <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                            {profileData?.total_students || 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-4">Bio</h3>
                  {getBio() ? (
                    <div>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
                        {truncateBio(getBio())}
                      </p>
                      {getBio().split(" ").length > 15 && (
                        <button
                          onClick={() => setShowBioModal(true)}
                          className="mt-3 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-semibold transition-colors active:scale-95"
                        >
                          Read More →
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400 text-sm italic">
                      No bio provided. Click "Edit Profile" to add your bio.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "personal" && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Personal Information</h2>
              
              {isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">First Name</label>
                    <input
                      type="text"
                      value={formData.first_name}
                      onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Last Name</label>
                    <input
                      type="text"
                      value={formData.last_name}
                      onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Phone Number</label>
                    <input
                      type="tel"
                      value={formData.phone_number}
                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Date of Birth</label>
                    <input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      rows={3}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Bio</label>
                    <textarea
                      value={formData.bio}
                      onChange={(e) => setFormData({...formData, bio: e.target.value})}
                      rows={5}
                      placeholder="Tell us about yourself, your teaching philosophy, and experience..."
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Full Name</label>
                    <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">
                      {profileData?.user?.first_name} {profileData?.user?.last_name}
                    </p>
                  </div>
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</label>
                    <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base break-all">{profileData?.user?.email}</p>
                  </div>
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone Number</label>
                    <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.phone_number || "Not provided"}</p>
                  </div>
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date of Birth</label>
                    <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">
                      {profileData?.date_of_birth ? new Date(profileData.date_of_birth).toLocaleDateString() : "Not provided"}
                    </p>
                  </div>
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Address</label>
                    <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.address || "Not provided"}</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bio</label>
                    {getBio() ? (
                      <div>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed mt-2 text-sm">
                          {truncateBio(getBio(), 20)}
                        </p>
                        {getBio().split(" ").length > 20 && (
                          <button
                            onClick={() => setShowBioModal(true)}
                            className="mt-3 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-semibold transition-colors"
                          >
                            Read More →
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-500 dark:text-slate-400 italic mt-2 text-sm">
                        No bio provided. Click "Edit Profile" to add your bio.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "professional" && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Professional Information</h2>
                
                {isEditing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Qualification</label>
                      <input
                        type="text"
                        value={formData.qualification}
                        onChange={(e) => setFormData({...formData, qualification: e.target.value})}
                        placeholder="e.g., B.Sc Education, M.Ed"
                        className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Specialization</label>
                      <input
                        type="text"
                        value={formData.specialization}
                        onChange={(e) => setFormData({...formData, specialization: e.target.value})}
                        placeholder="e.g., Mathematics, English Literature"
                        className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Qualification</label>
                      <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.qualification || "Not provided"}</p>
                    </div>
                    <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Specialization</label>
                      <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.specialization || "Not provided"}</p>
                    </div>
                    <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hire Date</label>
                      <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">
                        {profileData?.hire_date ? new Date(profileData.hire_date).toLocaleDateString() : "Not available"}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Years of Service</label>
                      <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{getYearsOfService()} years</p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Professional Development (real data) ── */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Professional Development</h3>
                  <button onClick={() => openPdForm()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                    + Add Record
                  </button>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
                  {[
                    { label: 'CPD Hours', value: pdSummary ? (pdSummary.total_hours > 0 ? pdSummary.total_hours.toFixed(0) : '0') : '—' },
                    { label: 'Certifications', value: pdSummary?.certifications ?? '—' },
                    { label: 'Workshops / Events', value: pdSummary?.workshops ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                      <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">{value}</div>
                      <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Records list */}
                {pdLoading ? (
                  <div className="flex justify-center py-8"><div className="w-7 h-7 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
                ) : pdRecords.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">
                    No records yet. Click "+ Add Record" to log your first training, workshop, or certification.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pdRecords.map(r => {
                      const TYPE_COLORS: Record<string, string> = {
                        training: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                        workshop: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
                        certification: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                        seminar: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                        conference: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
                        course: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
                        degree: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
                        other: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                      };
                      return (
                        <div key={r.id} className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl border-l-4 ${
                          r.approval_status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-900/10 border-l-emerald-400' :
                          r.approval_status === 'rejected' ? 'bg-red-50 dark:bg-red-900/10 border-l-red-400' :
                          'bg-slate-50 dark:bg-slate-700/50 border-l-amber-400'
                        }`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[r.dev_type] ?? TYPE_COLORS.other}`}>
                                {r.dev_type_display}
                              </span>
                              {/* Approval status badge */}
                              {r.approval_status === 'approved' && (
                                <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" /> Approved
                                </span>
                              )}
                              {r.approval_status === 'pending' && (
                                <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
                                  ⏳ Pending Approval
                                </span>
                              )}
                              {r.approval_status === 'rejected' && (
                                <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full font-medium">
                                  ✗ Rejected
                                </span>
                              )}
                              {r.is_expired && (
                                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Expired</span>
                              )}
                            </div>
                            <p className="font-semibold text-slate-900 dark:text-white text-sm mt-1">{r.title}</p>
                            {r.provider && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.provider}</p>}
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {new Date(r.date_completed).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                              {r.duration_hours && (
                                <span className="text-xs text-slate-500 dark:text-slate-400">{r.duration_hours} hrs</span>
                              )}
                              {r.certificate_url && (
                                <a href={r.certificate_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline">View Certificate</a>
                              )}
                            </div>
                            {/* Show rejection reason to teacher */}
                            {r.approval_status === 'rejected' && r.rejection_reason && (
                              <p className="text-xs text-red-700 dark:text-red-400 mt-1.5 italic bg-red-100 dark:bg-red-900/20 px-2 py-1 rounded">
                                Reason: {r.rejection_reason}
                              </p>
                            )}
                            {r.approval_status === 'rejected' && (
                              <p className="text-xs text-slate-500 mt-1">Edit the record to resubmit for approval.</p>
                            )}
                          </div>
                          {/* Edit/delete only for pending or rejected records */}
                          {r.approval_status !== 'approved' && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => openPdForm(r)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Edit">
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handlePdDelete(r.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Delete">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── PD Add/Edit Form Modal ── */}
              {showPdForm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
                  <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
                    <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-5 py-4 flex items-center justify-between rounded-t-2xl">
                      <h3 className="font-bold text-slate-900 dark:text-white">{editPd ? 'Edit Record' : 'Add Development Record'}</h3>
                      <button onClick={() => { setShowPdForm(false); setEditPd(null); }}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Title / Name *</label>
                          <input type="text" value={pdFormData.title}
                            onChange={e => setPdFormData(f => ({ ...f, title: e.target.value }))}
                            placeholder="e.g. Child Psychology Workshop"
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:bg-slate-800 dark:text-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Type *</label>
                          <select value={pdFormData.dev_type}
                            onChange={e => setPdFormData(f => ({ ...f, dev_type: e.target.value as PDType }))}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:bg-slate-800 dark:text-white">
                            {([
                              ['training','Training'], ['workshop','Workshop'], ['certification','Certification'],
                              ['seminar','Seminar'], ['conference','Conference'], ['course','Online / Self-Study Course'],
                              ['degree','Academic Degree / Upgrade'], ['other','Other'],
                            ] as const).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Provider / Institution</label>
                          <input type="text" value={pdFormData.provider ?? ''}
                            onChange={e => setPdFormData(f => ({ ...f, provider: e.target.value }))}
                            placeholder="e.g. TRCN, Coursera, State Ministry"
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:bg-slate-800 dark:text-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Date Completed *</label>
                          <input type="date" value={pdFormData.date_completed}
                            onChange={e => setPdFormData(f => ({ ...f, date_completed: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:bg-slate-800 dark:text-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Expiry Date <span className="font-normal text-slate-400">(certs only)</span></label>
                          <input type="date" value={pdFormData.date_expires ?? ''}
                            onChange={e => setPdFormData(f => ({ ...f, date_expires: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:bg-slate-800 dark:text-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Duration (hours)</label>
                          <input type="number" min={0} step={0.5} value={pdFormData.duration_hours ?? ''}
                            onChange={e => setPdFormData(f => ({ ...f, duration_hours: e.target.value ? parseFloat(e.target.value) : undefined }))}
                            placeholder="e.g. 8"
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:bg-slate-800 dark:text-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Certificate URL</label>
                          <input type="url" value={pdFormData.certificate_url ?? ''}
                            onChange={e => setPdFormData(f => ({ ...f, certificate_url: e.target.value }))}
                            placeholder="https://…"
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none dark:bg-slate-800 dark:text-white" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Description / Key Takeaways</label>
                          <textarea rows={3} value={pdFormData.description ?? ''}
                            onChange={e => setPdFormData(f => ({ ...f, description: e.target.value }))}
                            placeholder="Skills gained, what was covered…"
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none resize-none dark:bg-slate-800 dark:text-white" />
                        </div>
                      </div>
                      <div className="flex gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <button onClick={() => { setShowPdForm(false); setEditPd(null); }}
                          className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                          Cancel
                        </button>
                        <button onClick={handlePdSave} disabled={pdSaving}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                          <Save className="w-4 h-4" /> {pdSaving ? 'Saving…' : editPd ? 'Update' : 'Add Record'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Service Summary (derived from real hire_date + education levels) ── */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4">Service Summary</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">Hire Date</span>
                    <span className="font-semibold text-slate-900 dark:text-white text-xs sm:text-sm">
                      {profileData?.hire_date ? new Date(profileData.hire_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">Years of Service</span>
                    <span className="font-semibold text-slate-900 dark:text-white text-xs sm:text-sm">{getYearsOfService()} yrs</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">Staff Type</span>
                    <span className="font-semibold text-slate-900 dark:text-white text-xs sm:text-sm capitalize">
                      {profileData?.staff_type ?? '—'}
                    </span>
                  </div>
                  {profileData?.education_levels_detail?.length > 0 && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mb-2">Education Levels</p>
                      <div className="flex flex-wrap gap-1.5">
                        {profileData.education_levels_detail.map((el: any) => (
                          <span key={el.id} className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                            {el.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "performance" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Summary cards */}
              {(() => {
                const pendingA = appraisals.filter(a => a.status === 'submitted').length;
                const pendingN = staffNotes.filter(n => !n.is_acknowledged).length;
                const pending = pendingA + pendingN;
                const latest = [...appraisals].filter(a => a.overall_score != null && a.status === 'acknowledged')
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 text-center border border-slate-200 dark:border-slate-700 shadow-sm">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{appraisals.length}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Appraisals</p>
                      </div>
                      <div className={`rounded-2xl p-4 text-center border shadow-sm ${latest ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                        <p className={`text-2xl font-bold ${latest ? 'text-blue-900 dark:text-blue-100' : 'text-slate-400'}`}>{latest ? `${latest.overall_score}%` : '—'}</p>
                        <p className={`text-xs mt-0.5 ${latest ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>Latest Score</p>
                      </div>
                      <div className={`rounded-2xl p-4 text-center border shadow-sm ${pending > 0 ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                        <p className={`text-2xl font-bold ${pending > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400'}`}>{pending}</p>
                        <p className={`text-xs mt-0.5 ${pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>Action Needed</p>
                      </div>
                    </div>
                    {pending > 0 && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800 dark:text-amber-300">
                          {pendingA > 0 && `${pendingA} appraisal(s) need acknowledgment. `}
                          {pendingN > 0 && `${pendingN} staff note(s) need acknowledgment.`}
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Sub-tabs */}
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                {([
                  { id: 'appraisals', label: 'Appraisals', icon: Award, count: appraisals.filter(a => a.status === 'submitted').length },
                  { id: 'notes',      label: 'Staff Notes', icon: MessageSquare, count: staffNotes.filter(n => !n.is_acknowledged).length },
                ] as const).map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} onClick={() => setPerfTab(t.id as any)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${perfTab === t.id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                      <Icon className="w-4 h-4" />
                      {t.label}
                      {t.count > 0 && <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{t.count}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Appraisals */}
              {perfTab === 'appraisals' && (
                <div className="space-y-3">
                  {perfLoading ? (
                    <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
                  ) : appraisals.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 py-12 text-center shadow-sm">
                      <Award className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 dark:text-slate-400 text-sm">No appraisals yet. Your head teacher or proprietress will create one for you.</p>
                    </div>
                  ) : appraisals.map(a => (
                    <button key={a.id} onClick={() => setViewAppraisal(a)}
                      className={`w-full text-left bg-white dark:bg-slate-800 rounded-xl border p-4 hover:border-blue-300 transition-colors flex items-center gap-3 shadow-sm ${a.status === 'submitted' ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200 dark:border-slate-700'}`}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-100 dark:bg-blue-900/30">
                        <Star className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-slate-900 dark:text-white text-sm">{a.period_display} {a.academic_year}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${APPRAISAL_STATUS_CFG[a.status]?.color ?? 'bg-slate-100 text-slate-600'}`}>{APPRAISAL_STATUS_CFG[a.status]?.label}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">By: {a.appraiser_role_display}</p>
                        {a.overall_score != null && (
                          <p className="text-xs mt-1 font-medium text-slate-700 dark:text-slate-300">Score: {a.overall_score}% — {a.overall_grade}</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* Staff Notes */}
              {perfTab === 'notes' && (
                <div className="space-y-3">
                  {perfLoading ? (
                    <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
                  ) : staffNotes.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 py-12 text-center shadow-sm">
                      <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 dark:text-slate-400 text-sm">No staff notes yet.</p>
                    </div>
                  ) : staffNotes.map(note => {
                    const cfg = NOTE_TYPE_CFG[note.note_type] ?? NOTE_TYPE_CFG.query;
                    const Icon = cfg.icon;
                    return (
                      <button key={note.id} onClick={() => setViewNote(note)}
                        className={`w-full text-left bg-white dark:bg-slate-800 rounded-xl border-l-4 border border-slate-200 dark:border-slate-700 p-4 hover:border-blue-300 transition-colors flex items-start gap-3 shadow-sm ${cfg.borderColor} ${!note.is_acknowledged ? 'ring-1 ring-amber-200' : ''}`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.positive ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                          <Icon className={`w-4 h-4 ${cfg.positive ? 'text-emerald-600' : 'text-orange-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-slate-900 dark:text-white text-sm">{note.title}</p>
                            {!note.is_acknowledged && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Acknowledge</span>}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{note.note_type_display} · {note.category_display}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{new Date(note.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Modals */}
              {viewAppraisal && (
                <AppraisalModal appraisal={viewAppraisal} onClose={() => setViewAppraisal(null)}
                  onAcknowledged={a => { setAppraisals(prev => prev.map(x => x.id === a.id ? a : x)); setViewAppraisal(null); }} />
              )}
              {viewNote && (
                <NoteModal note={viewNote} onClose={() => setViewNote(null)}
                  onAcknowledged={n => { setStaffNotes(prev => prev.map(x => x.id === n.id ? n : x)); setViewNote(null); }} />
              )}
            </div>
          )}

          {activeTab === "assignments" && (
            <AssignmentManagement
              teacherId={profileData?.id || 0}
              profileData={profileData}
              onRefresh={loadProfileData}
            />
          )}
          {activeTab === "signature-remarks" && (
          <SignatureRemarksManagement
            teacherId={profileData?.id || 0}
            profileData={profileData}
          />
          )}

          {activeTab === "documents" && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Documents</h2>
              <div className="text-center py-8 sm:py-12">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Document management will be available here.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showBioModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800">
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">Teacher Bio</h2>
              <button
                onClick={() => setShowBioModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-all active:scale-95"
              >
                <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>
            <div className="p-4 sm:p-6 lg:p-8">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">
                  About {profileData?.user?.first_name} {profileData?.user?.last_name}
                </h3>
                <div className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {getBio()}
                </div>
              </div>
              <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={async () => {
                    try {
                      const url = `${window.location.origin}/teacher/bio/${profileData?.id}`;
                      await navigator.clipboard.writeText(url);
                      setSuccessMessage("Shared link copied to clipboard!");
                      setShowBioModal(false);
                    } catch (error) {
                      console.error("Failed to copy link:", error);
                      setError("Failed to copy link. Please try again.");
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium shadow-lg active:scale-95"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share Bio</span>
                </button>
                <button
                  onClick={() => setShowBioModal(false)}
                  className="flex-1 px-5 py-3 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-all font-medium active:scale-95"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherProfile;